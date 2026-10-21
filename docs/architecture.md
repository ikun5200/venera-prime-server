# Venera Prime Server — Architecture

## 1. Goal

Turn the Flutter client `venera-prime` into a multi-user, browser-based comic
site. The browser is the only client. All state that used to live on the device
(local library, favorites, progress, sources, cookies, WebDAV config, downloads)
now lives on the server and is scoped by `user_id`.

## 2. System diagram

```
┌──────────────────────────── Browser (React + TS + Tailwind) ────────────────────────────┐
│  Router / TanStack Query / Zustand / design-system components / reader (gallery+scroll)  │
└───────────────────────────────────┬──────────────────────────────────────────────────────┘
                                    │ HTTPS, Cookie session, JSON
┌───────────────────────────────────▼──────────────────────────────────────────────────────┐
│                              Dart backend (shelf + shelf_router)                         │
│                                                                                          │
│  routes/  ── HTTP only: parse, validate, call service, shape response                   │
│  middleware/  request-id, structured logging, auth, CORS, rate-limit, error envelope     │
│  services/  business rules: auth, sources, comics, favorites, history, downloads,        │
│             local library, webdav, uploads, statistics, tasks                            │
│  repositories/  parameterized SQL only; no HTTP types                                   │
│  db/  sqlite3 (WAL), migrations via PRAGMA user_version                                  │
│                                                                                          │
│  JsEngineService ──stdio JSON-lines JSON-RPC──▶ rust/js_host (rquickjs)                  │
│  StaticFiles ── serves frontend/dist (single image, no nginx)                            │
└───────────────────────────────┬──────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼─────────────────────────┐
        ▼                       ▼                         ▼
  SQLite (WAL)           data/users/<id>/            rust/js_host
  data/venera.db         uploads/ downloads/         QuickJS runtime per request,
                         covers/ cache/              blocking host bridge,
                                                     memory + time limits
```

## 3. Technology choices

| Area | Choice | Why |
|---|---|---|
| HTTP framework | `shelf` + `shelf_router` | Explicit middleware pipeline, no codegen, easy to unit-test handlers with `shelf` `Request` objects, stable. dart_frog adds codegen/build steps without adding capability for this project. |
| Database | `sqlite3` package, WAL | Required by the task; synchronous API is safe behind a single Dart isolate plus a small write queue. |
| Password hashing | Argon2id via `package:cryptography` | Pure-Dart, no native toolchain in runtime image. Parameters: memory 64 MiB, iterations 3, parallelism 2, salt 16 B, hash 32 B. |
| Sessions | 32-byte random token, SHA-256 stored, HttpOnly cookie | Token never stored in plaintext. 30-day sliding expiry. |
| JS engine | Rust sidecar with `rquickjs` (QuickJS) | Matches the original runtime (`flutter_qjs` is QuickJS). A separate process gives hard isolation: one runtime per call, memory limit, interrupt-based 30 s timeout, crash of the sidecar cannot take down the API. The original `assets/init.js` is reused verbatim. |
| HTML parsing | Rust `scraper` (html5ever + css-selectors) | Equivalent DOM/CSS behavior to Dart `package:html` used by the original. |
| HTTP from sources | Rust `ureq` (rustls) with an explicit per-user cookie jar | Blocking calls inside a per-request worker thread keep `init.js`'s Promise-based API working without an async executor. |
| Frontend | React 18 + TypeScript + Vite + Tailwind 3 | Required stack; Vite output is copied into the Dart image. |
| Server state | TanStack Query | Cache, retries, loading/error states for every endpoint. |
| Local UI state | Zustand | Auth/user, toasts, reader preferences, sidebar state. |
| i18n | Small locale dictionary (`en`, `zh-CN`, `zh-TW`) mirroring the original `.tl` keys | The original uses English strings as translation keys; we preserve the same labels. |

## 4. Module responsibilities

### routes
Only HTTP concerns: path/query/body parsing, auth guard, calling a service,
serializing JSON, status codes. No SQL, no business rules.

### services
Own business rules and cross-repository transactions:
- `AuthService` — init, login, logout, session validation, sliding renewal.
- `AdminService` — user CRUD, deletion cascade.
- `SourceService` — script validation/parse via sidecar, CRUD, per-user data and
  settings, account login/logout, source libraries.
- `ComicService` — search, details, chapters, images, explore, categories,
  ranking, comments, likes/ratings, image proxy config.
- `FavoriteService` — folders, local favorites, network favorites, move/copy,
  import/export, follow-update markers.
- `HistoryService` — progress, history refresh, clear.
- `ReadLaterService`, `ImageFavoriteService`, `StatisticsService`.
- `DownloadService` — server-side queue, worker, retries, local library upsert.
- `LocalLibraryService` — uploads/import, directory scan, metadata, delete,
  export (cbz/pdf/epub).
- `WebDavService` — backup archive build/restore, upload/download, retention.
- `TaskService` — in-memory + persisted background task status.

### repositories
Parameterized SQL, row mapping. Every user-owned query includes `user_id` in the
WHERE clause; cross-user reads return `null` so routes answer 404 (no enumeration).

### db
`Database` opens the file, sets `journal_mode=WAL`, `foreign_keys=ON`,
`busy_timeout=5000`, then applies ordered migrations keyed by `user_version`.
Migration 1 creates the whole schema; later migrations are additive.

## 5. JS engine protocol

The sidecar is a long-lived process. Dart writes one JSON object per line to its
stdin and reads one JSON line per request from stdout (stderr is used for logs).

Request:
```json
{
  "id": "uuid",
  "op": "parse" | "call" | "run",
  "script": "<source js>",
  "className": "MangaDex",
  "method": "search.load",
  "args": ["keyword", [], 1],
  "context": {
    "sourceKey": "manga_dex",
    "appVersion": "2.6.3",
    "locale": "en_US",
    "platform": "linux",
    "data": {"settings": {}, "account": null},
    "settings": {"image_quality": {"type": "select", "default": "Original"}},
    "cookies": [{"name": "...", "value": "...", "domain": ".mangadex.org", "path": "/"}]
  },
  "timeoutMs": 30000
}
```

Response:
```json
{
  "id": "uuid",
  "ok": true,
  "result": {},
  "data": {"settings": {}, "account": null},
  "cookies": [],
  "logs": [{"level": "info", "title": "JS Console", "content": "..."}]
}
```
Errors are `{"ok": false, "error": {"code": "TIMEOUT|JS_ERROR|PARSE_ERROR", "message": "..."}}`.

Per call the sidecar:
1. Creates a QuickJS runtime, sets memory limit (256 MiB) and an interrupt
   handler bound to the deadline.
2. Evaluates `assets/init.js` (embedded in the binary) with an injected
   `sendMessage` wrapper. Sync host methods return values directly; `http`,
   `delay`, `UI`, clipboard and `compute` return already-resolved Promises.
3. Evaluates the user script, locates the `class ... extends ComicSource`
   declaration, instantiates it and registers it under its key.
4. Invokes the requested method path with JSON args and drains the QuickJS job
   queue until the returned Promise settles.
5. Returns the value as JSON plus mutated source data/cookies and collected logs.
6. Destroys the runtime. A crash or timeout affects only that call.

Why not in-process Dart FFI: a native QuickJS crash or infinite loop would take
down the API isolate; FFI bindings also make per-call memory accounting and hard
timeouts harder. A separate process gives both and matches the required Rust
component in the multi-stage image.

## 6. Storage layout

```
data/
  venera.db                SQLite (WAL, per-install)
  users/<userId>/
    uploads/               original uploaded archives/files
    downloads/<job>/       downloaded chapter images
    covers/                cached covers
    cache/images/          image proxy cache (per user)
  tmp/                     staging for uploads/imports
```

All user paths are built from validated integer ids. Every request path is
normalized with `p.normalize`/`p.absolute` and must remain inside the user's
root (`PathGuard`), rejecting `..`, absolute paths, symlinks.

## 7. Frontend architecture

```
src/
  lib/api/        typed fetch client + endpoint modules
  lib/            auth store, toasts, i18n, reader prefs, utils
  components/ui/  Button, Input, Modal, Toast, Tabs, Drawer, Card, Skeleton,
                  Select, Switch, Slider, Menu, EmptyState, Spinner
  components/     AppShell, ComicCard, ComicGrid, ChapterList, Reader*, ...
  routes/         one file per page; feature-matrix maps each item to a route
  styles/         Tailwind theme tokens
```

Responsive contract:
- `≥1280px`: fixed 240px sidebar + content + optional right panel (details/favorites).
- `768–1279px`: 72px icon rail or drawer; content fills.
- `<768px`: bottom tab bar (Home / Favorites / Explore / Categories) and
  full-screen secondary pages; reader is always full-screen.
- Tailwind breakpoints only; no UA sniffing. Touch targets ≥ 44px.

## 8. Concurrency and limits

- One HTTP isolate; SQLite writes are serialized by the synchronous driver.
- Sidecar calls are limited by a semaphore (default 8 concurrent); the queue has
  a 30 s per-call timeout and a 256 MiB per-runtime memory cap.
- Download workers: configurable 1–16 concurrent page downloads per job, one job
  active at a time per user (matching the original sequential queue).
- Image proxy: per-user disk cache (default 2 GiB / 7-day retention, both
  configurable). When a chapter opens, the reader asks the server to prefetch
  the chapter in the background: `comic.loadEp` is called once, then up to 10
  `comic.onImageLoad` calls share one QuickJS runtime and the resulting bytes
  are fetched with 3-way concurrency. Prefetch count is configurable
  (`serverPrefetchImageCount`: off, 10/20/30/50/100, or whole chapter).
  Resolved configs are kept in a short-lived in-memory map so subsequent
  on-demand image requests skip the JS host entirely. Downloaded chapters are
  written only to the local library (`persistCache: false`) so they are not
  duplicated in the image cache.
- Metadata cache: `ContentCacheService` persists normalized source payloads in
  SQLite (`content_cache`, migration 5): comic details, chapter image lists,
  explore/search/category/ranking/categories/thumbnails/comments. TTLs are
  configurable per user (`serverCacheListMinutes`, `serverCacheComicMinutes`,
  `serverCacheChapterDays`); comments use 2 minutes and categories 24 hours.
  Identical concurrent requests share one JS-host round trip (single-flight).
  Stale entries are returned immediately while one background refresh runs;
  when the source fails, the last good payload is served with
  `cache.stale=true` unless `serverCacheOfflineFallback` is disabled. Source
  script/settings/login changes and deletion invalidate that source's rows.
- Reader local-first: when a chapter of the current source/comic is present in
  `local_comics` and `downloaded_chapters`, the reader fetches
  `/api/local-comics/<id>/chapter/<ep>/images` and local image URLs instead of
  calling the source. If local files are missing, it falls back to the source
  chapter list automatically.
- Cache maintenance: `image_cache` indexes every cached image (source, comic,
  chapter, size, mime) so the settings page can report image/metadata cache
  size, per-chapter counts and clear one source, all metadata, or everything.
  Hourly housekeeping prunes expired metadata rows and orphaned image rows.
- Favorites: local favorite rows carry a metadata snapshot (including
  `description`) and the list query prewarms up to 30 covers in the background
  (3 concurrent), keyed by user + source + comic. Source-backed favorite
  folders/pages are cached in memory for 5 minutes and invalidated on
  favorite/folder mutations; `?refresh=1` bypasses.
- Startup: the server runs due follow-up checks 8 seconds after boot and then
  hourly, so the metadata cache and unread badges are current.
- Rate limit: 120 requests/minute per session/IP for API routes, 10/minute for
  login and init.

## 9. Security

- Argon2id password hashes; session tokens only as SHA-256.
- Cookie: `HttpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=true`.
- CSRF: all state-changing requests require `Origin`/`Referer` to match
  `PUBLIC_ORIGIN` (or same host); plus `X-Requested-With: venera-web`.
- SQL always parameterized.
- Cross-user access returns 404.
- Uploads: size/type limits, no SVG/HTML execution, archive extraction limits
  (20k entries, 256 MiB/file, 1 GiB total, 1000:1 ratio, no traversal/symlinks).
- Logs redact `password`, `token`, `cookie`, `authorization`, WebDAV passwords.
- Source scripts run in a separate process; they are trusted by design (no
  sandbox), but cannot crash or hang the API.
