# Venera Prime Server

A multi-user, browser-based comic reader built from
[Venera Prime](https://github.com/venera-app/venera-prime). The original
Flutter client is replaced by a server that runs the same JavaScript comic
sources and a responsive React web app. Users sign in from any browser; all
favorites, progress, sources, uploads and downloads live on the server and are
isolated per account.

## Features

- **Same comic sources** — the original `assets/init.js` runs unchanged in a
  Rust QuickJS sidecar. Sources are imported as `.js`, fetched from a URL, or
  installed from a source library catalog.
- **Search & discovery** — single-source and aggregated search, explore pages,
  categories, ranking, source tags and options.
- **Server-side cache** — comic details, chapter lists, explore/search/
  categories/ranking/thumbnails/comments are persisted in SQLite with
  per-kind TTLs, single-flight coalescing and stale-while-revalidate. Cached
  pages and images survive restarts; if a source is temporarily unavailable
  the last good payload is served and marked as cached. Settings → APP
  reports image/metadata cache size and can clear one source, metadata only,
  or everything.
- **Local-first reading** — downloaded chapters are read from the server's
  local library without contacting the comic source; the reader falls back to
  the source automatically if local files are missing.
- **Comic details** — metadata, tags, chapters (flat or grouped), star rating,
  like, comments, related comics, downloads and cover viewer.
- **Reader** — gallery LTR/RTL/TTB and continuous LTR/RTL/TTB, two-page spread,
  page margins, night mode, auto page turning, keyboard and touch navigation,
  progress memory, chapter drawer, chapter comments and image collection.
  Chapter lists default to newest first (numeric title comparison, even when a
  source returns a disordered list), finished chapters are greyed out, and
  next/previous chapter follows numeric chronology instead of raw source order.
  The reader switches the iOS status area to pure black; add the site to the
  Home Screen for standalone viewing without Safari's address bar.
- **Library** — local favorite folders, network favorites, history, read later,
  image favorites, follow updates and reading statistics.
- **Local comics** — chunked upload/import (CBZ/ZIP), server-side reading,
  chapter deletion, and CBZ/PDF/EPUB export.
- **Downloads** — durable server-side chapter queue that survives restarts,
  reorder (`up/down/first/last`), pause/resume, whole-job or per-chapter retry,
  automatic download of new chapters for followed comics, plus a direct
  "download to browser" ZIP for one or many chapters.
- **Data sync** — WebDAV backup/restore with scheduled backups (interval, time,
  configurable retention, selectable history/statistics/settings), plus local
  backup export/import.
- **Live updates** — a per-user SSE stream (`/api/events`) pushes task,
  download and cache changes to the web app; no polling.
- **OPDS / OPDS-PSE** — read favorites, history and the local library from
  OPDS clients, with page-image streaming and ZIP acquisition.
- **Image conversion** — optional on-demand WebP conversion with quality and
  max-width settings plus a disk cache; original bytes remain cached.
- **API tokens & permissions** — hashed Bearer/Basic tokens (also usable as an
  OPDS password) and per-account `download`, `manage_sources`, `clear_cache`
  and `nsfw` permissions.
- **Accounts** — first-run admin creation, admin user CRUD, Argon2id passwords,
  HttpOnly sessions, per-user isolation on every resource.

## Architecture

```
Browser (React + TypeScript + Tailwind)
        │  Cookie session, JSON + SSE
Dart backend (shelf) ── SQLite (WAL) + data/users/<id>/
        │  stdio JSON lines
Rust sidecar (rquickjs/QuickJS) ── original init.js + user source scripts
```

- Backend: `shelf` + `shelf_router`, layered into routes → services →
  repositories → db. Static frontend files are served by the same process.
- JS runtime: one QuickJS runtime per call, 30 s interrupt timeout, 256 MiB
  memory cap, blocking host bridge for HTTP/HTML/crypto/cookies.
- Storage: SQLite with `PRAGMA user_version` migrations; per-user directories
  under `data/users/<userId>/`.
- Details: [docs/architecture.md](docs/architecture.md).

## Quick start (Docker)

```bash
git clone https://github.com/<owner>/venera-prime-server.git
cd venera-prime-server

cp .env.example .env
# Edit .env: set SESSION_SECRET to a long random string.

docker compose up --build -d
curl -fsS http://localhost:8080/api/health
```

Open <http://localhost:8080>. On first visit you are asked to create the
administrator account. After that, sign in and add a comic source from
**Settings → Comic Source** (paste a script, use a URL, or add a source library).

The image is also published by CI:

```bash
docker pull ghcr.io/<owner>/venera-prime-server:latest
docker run -d --name venera -p 8080:8080 \
  -e SESSION_SECRET='change-me-to-a-long-random-string' \
  -e PUBLIC_ORIGIN='http://localhost:8080' \
  -v "$PWD/data:/data" -v "$PWD/config:/config" \
  ghcr.io/<owner>/venera-prime-server:latest
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | Listening port |
| `HOST` | `0.0.0.0` | Bind address |
| `DATA_DIR` | `./data` (image: `/data`) | User files and cache |
| `DB_PATH` | `<DATA_DIR>/venera.db` | SQLite database |
| `STATIC_DIR` | `./frontend/dist` (image: `/app/frontend/dist`) | Built web app |
| `SESSION_SECRET` | dev fallback | Required in production; ≥ 32 chars; encrypts WebDAV passwords and source-account passwords |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `PUBLIC_ORIGIN` | `http://localhost:8080` | CSRF/CORS origin |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warning`, `error` |
| `JS_HOST_BIN` | `rust/js_host/target/release/venera_js_host` (image: `/app/venera_js_host`) | QuickJS sidecar binary |
| `JS_TIMEOUT_MS` | `30000` | Per source call timeout |
| `JS_CONCURRENCY` | `8` | Concurrent sidecar calls |
| `FLARESOLVERR_URL` | empty | Optional FlareSolverr `/v1` endpoint used when a source request hits 403/429/503 or a Cloudflare interstitial |
| `HTTP_RATE_LIMIT_PER_SECOND` | `10` | Per-host request spacing in the JS HTTP bridge (`0` disables) |
| `HTTP_429_RETRIES` | `2` | Retries for 429 responses, honoring `Retry-After`, before the FlareSolverr fallback |
| `RATE_LIMIT_PER_MINUTE` | `300` | General API limit per user/IP; image proxies and polling endpoints use separate, larger buckets |
| `MAX_UPLOAD_BYTES` | `536870912` | Upload cap (512 MiB) |
| `APP_VERSION` | `1.0.0` | Reported by `/api/health` |

`config/.env` is read at startup if present, so the `./config` volume can hold
deployment configuration.

## Initial setup

1. `GET /api/init/status` reports `initialized: false`.
2. The web app shows the initialization page; `POST /api/init` creates the first
   administrator. This endpoint is disabled after the first account exists.
3. Sign in with that account. Admins can create ordinary users at
   **Settings → Users**. Disabling or deleting a user invalidates sessions and
   cascades all of their data (files included).

## Development

Requirements: Dart 3.6+, Rust 1.75+, Node 20+, and (for containers) Docker.

```bash
# JS sidecar
cd rust/js_host
cargo build --release

# Backend
cd backend
dart pub get
DATA_DIR=../data DB_PATH=../data/venera.db \
  JS_HOST_BIN=../rust/js_host/target/release/venera_js_host \
  STATIC_DIR=../frontend/dist \
  dart run bin/server.dart

# Frontend (separate terminal; proxies /api to :8080)
cd frontend
npm ci
npm run dev
```

Checks:

```bash
cd backend && dart analyze && dart test
cd frontend && npm run typecheck && npm run build && npm test
```

The backend test suite covers initialization, login/logout, admin user CRUD,
last-admin protection, disabled sessions, cross-user isolation for every
resource, uploads, local comics, backups, WebDAV encryption, source/navigation
and the real MangaDex source parser. The frontend suite covers login, reader
paging (buttons + keyboard), chunked upload, and UI primitives.

## Comic sources

Sources are ordinary JavaScript classes extending `ComicSource`, exactly as in
the original project. See the original
[comic source documentation](https://github.com/venera-app/venera-prime/blob/main/doc/comic_source.md).
The original `assets/init.js` is embedded in the sidecar and provides
`Network`, `HtmlDocument`, `Convert`, `Cookie`, `Comic`, `ComicDetails`,
`Comment`, `UI`, `APP`, storage and settings APIs.

Compatibility notes: [docs/js-source-compat.md](docs/js-source-compat.md).
`UI.*` dialogs cannot block on a browser; credential and cookie login work.
`modifyImage` scripts are stored but not executed server-side.

## Storage layout

```
data/
  venera.db
  users/<userId>/
    library/     local comics (uploads, imports, downloads)
    uploads/     resumable upload chunks
    cache/       image proxy cache
config/
  .env           optional deployment env
```

`data/` and `config/` are ignored by git. The container entrypoint prepares the
mounts and then runs the application as the unprivileged `venera` user.

## Security

- Argon2id password hashes (`m=65536`, `t=3`, `p=2`), session tokens stored as
  SHA-256, 30-day sliding HttpOnly cookies.
- Every business table carries `user_id`; cross-user reads return `404`.
- Parameterized SQL, path traversal and symlink checks, archive bomb limits,
  upload type/size limits, CSRF origin checks and rate limiting.
- WebDAV and source-account passwords are encrypted with AES-256-GCM using a key
  derived from `SESSION_SECRET`.
- Logs redact passwords, tokens, cookies and authorization headers.

Set a strong `SESSION_SECRET`, put the server behind HTTPS, and set
`COOKIE_SECURE=true` in production.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `JS runtime unavailable` | Build the sidecar (`cargo build --release`) or check `JS_HOST_BIN`. |
| Source import fails with a parse error | The class must start at column 0 and `key` must match `[A-Za-z0-9_]+`. |
| Images fail to load | Some sources require login; log in under **Comic Source → Account**. |
| WebDAV upload fails | Test the URL in **Settings → Data Sync**; the server must support PUT and PROPFIND. |
| 401 after an admin change | Disabling a user invalidates sessions; sign in again. |
| Login loops behind a proxy | Set `PUBLIC_ORIGIN` and `COOKIE_SECURE` to match the external URL. |

## License

GPL-3.0, following the original Venera Prime project. See [LICENSE](LICENSE).
The original project and its JavaScript sources remain the work of their
respective authors.
