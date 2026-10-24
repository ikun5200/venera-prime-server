# Progress

Updated: 2026-10-21T22:45Z

## Current phase

Baozi compatibility round (E-27) completed: source select options without a
`text` field now show their value, `baozi` defaults to the reachable
`webmota.com` mirror, chapters load from the main site instead of the
Cloudflare-challenged app host, false signin results are rejected, readability
checks fail on zero images, and invalid register links are hidden.

Rate-limit fix (E-26) completed: chapter image bursts and idle polling no
longer consume the general API budget, 429 responses now carry `Retry-After`
and are recorded in `request_logs`, login/init actually enforce their
10/minute limit, and the web client no longer retries 4xx responses or polling
storms while idle. NAS is redeployed with `RATE_LIMIT_PER_MINUTE=600`.

Server-cache and usability round (E-25) completed: source metadata (comic
details, chapter lists, explore/search/categories/ranking/thumbnails/comments)
is now persisted in SQLite with per-kind TTLs, single-flight coalescing,
stale-while-revalidate and offline fallback; the image cache is indexed for
stats and scoped clearing; the reader uses downloaded local chapters before
the source; BUG-17 (explore `sourceKey`) and BUG-18 (capability/role labels)
from the usability report are fixed with regression tests.

Favorites caching round (E-21) completed: source-backed favorite lists are
cached for 5 minutes, covers are cached by comic identity and prewarmed in the
background, and local favorites store a description snapshot. Chapter lists
remain uncached and live.

Reader performance and interaction round (E-20) completed: opening a chapter
now warms the server disk cache in the background (whole chapter by default,
configurable), image configs are batched per chapter, and cached images serve
in ~0.03 s instead of 0.5–1.4 s. Reader gestures now follow the reference:
toolbar starts hidden, TTB top/bottom tap zones, direction-aware keys,
continuous-mode scrolling, slide transitions and long-press panning.

Third-party source runtime fix (E-19) completed: concurrent JS-host calls no
longer collide on the stdin sink, sources using `APP.version` load details,
opaque comic ids containing `/` or full URLs open in details and the reader,
and the NAS instance now has all 33 sources from the venera-configs catalog.

Source-catalog import fix + second localization sweep (E-18) completed:
catalog URLs are auto-detected as source libraries, the real
meaninglesslyy catalog installs and searches, and the home-layout page and
all remaining status/task strings are Chinese.

Localization round (E-17) completed: the site is Chinese-first, all UI and
API messages are localized, and the NAS deployment was updated.

Phase 8 audit complete; a gap-closing round (E-16) added CI test jobs,
implemented previously-flagged rows (reader zoom, end-of-chapter comments,
per-comic/device settings, cache policy, network-folder sync, suggestions,
explore mixed/viewMore, reader context menu/rotate/select/hints, archives,
storage path, release check, follow-updates scheduler, swipe photo view, logs
clear, route aliases) and updated the matrix (342 DONE / 30 BLOCKED), plus
BLOCKERS (B-010/B-012/B-015 RESOLVED), DECISIONS (D-016..D-018) and EVIDENCE
(E-16).

## Completed

- **Phase 0** — reference cloned (read-only), docs baseline written:
  architecture, feature matrix (300+ rows), design guidelines, API, DB schema,
  JS compatibility, blockers, decisions, evidence.
- **Phase 1** — Dart `shelf` backend, SQLite WAL + migrations, Argon2id,
  sessions, init/login/logout/me, admin user CRUD, middleware (request id,
  structured logs, auth, CORS, CSRF, rate limit, error envelope), 38 backend
  tests green, `dart analyze` clean.
- **Phase 2** — Rust `rquickjs` sidecar implementing the original `init.js`
  bridge (HTTP, 21 HTML functions, Convert incl. AES/RSA/HMAC/GBK, cookies,
  storage, settings, locale, UUID, random, delay, UI stubs, compute). Real
  MangaDex source validated end-to-end: search → details → chapters → images →
  image proxy. Source data/cookies persisted per user and encrypted account
  passwords.
- **Phase 2/3** — business services and full REST API: sources, source
  libraries/catalog, search/aggregated/explore/categories/ranking, details,
  comments, likes, ratings, favorites (local + network), history/progress, read
  later, follow updates, downloads (server queue + browser ZIP), uploads, local
  library, CBZ/PDF/EPUB export, WebDAV, backups, statistics, image favorites,
  tasks, maintenance, debug. Isolation tests cover every resource.
- **Phase 4** — React/TS/Tailwind frontend: design system, responsive shell,
  init/login, home modules, search/aggregated, explore/categories/ranking,
  comic details with all actions/drawers, reader (gallery + continuous,
  keyboard/touch, progress, chapter drawer, comments, settings), favorites
  overview/local/network, history, read later, follow updates, downloads,
  local library/import/export, image favorites/photo view, statistics, sources
  (list/add/import/URL/libraries/catalog/edit/settings/account/check/bind),
  settings categories, home layout, page filters, blocked words, WebDAV, logs,
  admin users, tasks, toolbox, about, random picker, 404. Frontend tests 13/13.
  Three-width screenshots captured for every page; all overflow checks 0.
- **Phase 5** — chunked uploads, archive import, local reading, exports,
  browser ZIP download, path traversal/symlink tests, per-user directories.

## Completed in Phase 7/8

- GitHub repository <https://github.com/ikun5200/venera-prime-server> with
  Conventional Commit history and a clean working tree before the docs commit.
- GitHub Actions builds and pushes
  `ghcr.io/ikun5200/venera-prime-server:{latest,sha}` (linux/amd64) with GHA
  cache. The image pulls and starts healthy on `:8081`.
- Feature matrix: 333 DONE, 39 BLOCKED with blockers documented.
- Full live audit on the compose container: auth/admin/isolation, real
  MangaDex chain and comments, gallery/continuous reader, favorites,
  downloads/browser ZIP, upload/local read/export, image favorites,
  statistics, follow updates, source libraries/settings/check, WebDAV,
  responsive 375/768/1280 with zero horizontal overflow.

## Completed in 2026-10-21

- Installed all 33 sources from
  `https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json`
  into the NAS account (existing 12 kept, 21 added) and kept the catalog
  library entry.
- Fixed `Bad state: StreamSink is bound to a stream` under concurrent
  aggregated searches by serializing writes/flushes to the JS host stdin.
- Fixed sources that read `APP.version` (copy_manga, hot_manga) by injecting
  the engine `appVersion` global.
- Fixed "cover opens nothing" for sources whose comic ids contain `/` or are
  full URLs (ykmh, goda, comick): frontend links now encode ids, the API
  decodes path parameters once, and the reader links use the same encoding.
- Improved source readability checks for `singlePageWithMultiPart` explore
  payloads.
- Regression tests: concurrent JS calls, encoded comic/chapter ids,
  `APP.version`, and frontend comic/reader link builders (44 backend tests,
  17 frontend tests).
- Added server-side chapter prefetch with a batched `onImageLoad` op, a
  short-lived config cache, throttled cache enforcement, and the
  `serverPrefetchImageCount` setting (off/count/whole chapter). NAS cold
  images were 0.5–1.4 s; prefetched images serve in 0.03–0.04 s.
- Aligned reader interactions with the reference: toolbar starts hidden and
  closes on tap, TTB top/bottom tap zones, direction-aware keys, continuous
  tap scrolling and mouse speed, backward preloading, long-press panning, and
  panel-first Escape handling.
- Tests now 45 backend / 18 frontend; Playwright verified the NAS reader flow
  at 1280×800 and the 375 px layout (zero horizontal overflow).
- Cached source-backed favorite folders/pages for 5 minutes with mutation
  invalidation and `refresh=1`; keyed covers by user+source+comic and prewarmed
  up to 30 list covers (3 concurrent); added a `description` snapshot
  (migration 4). NAS: favorite list 0.043 s, prewarmed cover 1.0 s, changed
  signed URL served in 0.029 s. Chapter lists remain uncached. Tests now
  49 backend / 18 frontend.
- Replaced the per-page fade/slide with a full-page track that follows the
  finger and snaps like the reference `PageView`: 220 ms ease-out, RTL
  advances on a rightward drag, TTB on an upward drag, edge resistance, and
  the comments page participates in the same track and swipes both ways.
  Fixed `?page=` being reset before images loaded and side taps with
  tap-to-turn disabled not opening the toolbar. Playwright covered LTR, RTL,
  TTB, 375 px, and a 22-page NAS chapter (RTL + comments). Tests now
  49 backend / 20 frontend.
- Fixed all 16 findings from `docs/usage-test-report-2026-10-21.md`:
  source-setting defaults/validation, optimistic favorite and admin-user
  refresh, ranking-category routing, progressive aggregated search with a
  15 s per-source cap, explicit chapter/loading/error states, rate-limit
  bootstrap handling, duplicate network sources, display names, category
  `showWhen` filtering, invalid-URL 400, update-check messages, last-page
  retention, Chinese dates and a broad i18n/plural pass. Added regression
  tests for source defaults/URL validation and date/error formatting.
  Verified on NAS: ranking now returns 30 covers (`male,day`), two-source
  aggregation renders its first section in 2.0 s and finishes in 6.5 s,
  favorites/users refresh immediately, and no raw source stacks remain.
  Tests now 51 backend / 22 frontend. See E-24.

- Server-cache redesign (E-25): added migration 5 (`content_cache`,
  `image_cache`) and `ContentCacheService`; all detail/chapter/list/comment
  reads now use cache-first with TTL, single-flight, background refresh and
  stale fallback. Settings gained `serverCacheEnabled`,
  `serverCacheListMinutes`, `serverCacheComicMinutes`,
  `serverCacheChapterDays` and `serverCacheOfflineFallback`. The image cache
  is indexed for per-source/chapter stats and scoped clearing. The reader
  prefers downloaded local chapters and falls back to the source if local
  files are missing. Explore normalizes every renderer type and stamps
  `sourceKey` (BUG-17), and source/role labels are localized (BUG-18).
  Verified in a real browser: `/comic/explore_source/p1` (not `undefined`),
  “发现”/“管理员” labels, and local image URLs
  `/api/local-comics/1/image/1/*`. Tests: 54 backend / 24 frontend.

- Rate-limit fix (E-26): classified API paths into general/content/poll
  buckets, raised the default general budget to 300/min, added `Retry-After`
  and 429 request-log rows, fixed the login/init path comparison so the
  10/minute auth limit applies, stopped React Query retrying 4xx, added a
  5-second bootstrap auto-retry for 429, and slowed idle task/download polling
  to 60 s/15 s. Regression test loads 20 images and polls 20 times with a
  6/min general limit, then confirms the API 429, header and log row. Tests:
  55 backend / 25 frontend.

- Baozi compatibility (E-27): fixed blank select labels (options with only
  `value`), added a runtime `SourcePatches` layer (reachable default domain,
  main-site chapter URLs, both image layouts, signin result validation),
  made readability checks fail on zero images, and hid invalid
  register/webview URLs. Verified against the live site: settings show all
  domain values, check is `readable`, chapter 0 returns 50 images, image proxy
  returns a WebP, and wrong credentials show “用户名或密码错误”.
  Tests: 57 backend / 25 frontend.

- Suwayomi-inspired server features (E-28): implemented all P0/P1 items.
  P0-1 durable queue (`queue_order`, restart recovery, up/down/first/last,
  per-chapter retry, one job per user). P0-2 auto-download of new chapters with
  limit, re-upload filtering and unread-entry exclusion. P0-3 scheduled WebDAV
  backups with interval/time/retention and selectable history/statistics/
  settings. P1-4 update filters (unread/not-started/completed), per-comic
  `always|unread|never` strategy and parallel source checks. P1-5 SSE
  `/api/events` for tasks/downloads/cache with frontend EventSource
  invalidation (polling removed). P1-6 per-host rate limiting, 429
  `Retry-After` retries and FlareSolverr fallback in the Rust HTTP bridge.
  P1-7 OPDS/OPDS-PSE feeds for favorites, history, local library and remote
  chapters. P1-8 on-demand WebP conversion with disk cache plus streamed image
  responses. P1-9 hashed API tokens (Bearer/Basic/SSE query) and
  `download`/`manage_sources`/`clear_cache`/`nsfw` permissions with admin UI
  and NSFW list filtering. New tests cover tokens, permissions, queue
  reordering/recovery, OPDS, SSE, strategy persistence, NSFW filtering, WebP
  conversion and backup content selection. Tests: 67 backend / 26 frontend.

- Chapter reading polish (E-29): chapter lists now default to **newest first**
  using a numeric comparison of chapter titles (`newest`), with source/reverse/
  title orders still selectable. The reader keeps a separate ascending
  chronological list for next/previous, so disordered sources such as
  300/200/100 no longer jump from 300 back to 200; 200 advances to 300 and the
  newest chapter has no next. Finished chapters are stored as chapter IDs
  (`history.chapter_id` + `read_episode_json`) and render grey in both the
  detail list and reader drawer; legacy numeric read indexes are resolved
  against raw source order. Migration 8 adds `history.chapter_id`. Tests: 68
  backend / 29 frontend.

## Next

- Output the final delivery report.

## Known blockers (see `docs/BLOCKERS.md`)

- Interactive `UI.*` dialogs in sources (use credential/cookie login).
- `modifyImage` scripts stored but not executed.
- WebView/captcha login (cookie paste instead).
- Biometric lock, camera QR scan, OS folder picker, app self-update.
- 7z/CB7 import (ZIP/CBZ supported).
- Proxy/DNS/certificate settings are persisted but not enforced by the Rust
  HTTP client yet.

- iOS immersive reader (E-30): the reader now forces `theme-color` to
  `#000000`, adds a `reader-immersive` root/body class with a black background
  and dark color-scheme, and restores the user's light/dark theme-color on
  exit. The mobile top bar and reader toolbar include
  `safe-area-inset-top`; bottom safe-area handling already existed. Added an
  iOS web-app manifest (`display: standalone`, black status bar), Apple
  touch icon and 192/512 PWA icons, so “Add to Home Screen” opens without
  Safari chrome. Safari inside a normal tab still cannot programmatically hide
  its own address bar (Apple limitation), but the status/toolbar area is now
  black instead of white. Frontend tests: 30.

- UI fixes round 2 (E-31): reader settings/chapter/comment drawers are body
  portals and inherited the reader's white-on-black, so text vanished on the
  white panel in light mode — `body.reader-immersive` is now applied only while
  a drawer is open (and `Drawer`/`Modal` set `text-fg` themselves). The source
  library catalog now annotates installed entries: `GET
  /api/source-libraries/:id/catalog` returns `installed`,
  `installedSourceKey`, `installedVersion` and `updateAvailable` (matched by
  provenance origin id or file name); the UI shows an "已添加" badge with a
  "重新安装" button (or "可更新"/"更新"), and installing shows 已更新. Opening a
  comic shows live server cache progress: new `GET
  /api/comic/:source/:id/chapter/:ep/prefetch` reports
  `running/cachedPages/requestedPages/downloadedPages/failedPages/
  bytesDownloaded/startedAt`, the reader toolbar renders
  "服务器缓存 X/Y 页 · N 页/秒 · N MB/s" while the prefetch runs (poll bucket),
  and the status endpoint test covers the whole cycle. Tests: 69 backend /
  30 frontend.
