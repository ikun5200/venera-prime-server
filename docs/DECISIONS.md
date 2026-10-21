# Decisions

## D-001 — Backend framework: shelf + shelf_router
- Date: 2026-10-19
- Choice: `shelf` + `shelf_router`.
- Alternatives: `dart_frog` (recommended by the brief).
- Reason: this server has a large middleware chain (request id, logging, auth,
  CORS, CSRF, rate limit, error envelope, static SPA fallback). With shelf these
  are ordinary composable handlers and are unit-testable by constructing a
  `Request`; dart_frog requires code generation and its dev/prod runtime split
  adds build complexity without capability. The layering rule (routes → services
  → repositories) is enforced by directory structure and review, not by the
  framework.
- Impact: none on the API contract.

## D-002 — JS engine: Rust sidecar with rquickjs
- Date: 2026-10-19
- Choice: a separate `rust/js_host` process using `rquickjs`, communicating over
  JSON lines on stdin/stdout.
- Alternatives considered:
  - Dart FFI to QuickJS: a native crash or infinite loop kills the API isolate;
    per-call memory accounting and hard interrupts are harder; adds a native
    build to the Dart image.
  - Node.js `quickjs-emscripten`: viable, but adds a second runtime and does not
    reuse the original project's Rust QuickJS lineage. The task also requires a
    Rust build stage.
- Reason: matches `flutter_qjs` (QuickJS), gives process isolation, 30 s
  interrupt-based timeouts, 256 MiB per-runtime memory limits, and a crash
  cannot take down the API. `init.js` is reused verbatim.
- Impact: one extra process supervised by the backend; `UI` dialogs and
  `modifyImage` are not available (documented in `js-source-compat.md`).

## D-003 — Source data and cookies persisted in SQLite, passed per call
- Choice: the backend owns per-user source data and cookies; each sidecar call
  receives a snapshot and returns mutations.
- Reason: the sidecar is stateless, so a crash loses nothing; multi-user
  isolation is enforced by the database; no shared cookie jar between users.
- Impact: a slightly larger request/response payload per call.

## D-004 — Single database, one table per concept
- Choice: normalize the original's per-folder SQLite tables and JSON files into
  one schema with `user_id` on every row.
- Reason: required multi-user isolation, foreign keys, and simple migrations.
- Impact: folder names are no longer SQL identifiers (removes an injection and
  quoting class of bugs); `comic_type` integer hashes from the original are kept
  only as opaque values.

## D-005 — Downloads run server-side and land in the local library
- Choice: a download job writes images under
  `data/users/<id>/downloads/<job>/` and, on completion, upserts a
  `local_comics` row so the comic is readable and exportable.
- Reason: matches the original "download to device, then read offline" semantics
  with the server as the device; browser download is a separate zip endpoint.
- Impact: disk usage lives on the server; deletion semantics mirror the original
  (`managed_by_app`).

## D-006 — WebDAV backup format adapted to the server DB
- Choice: backups are a zip containing a JSON export of settings, sources,
  favorites, history, read later, statistics, image favorites and source data.
- Reason: the original backs up SQLite files; the server DB is shared across
  users, so exporting whole files would leak other users' data. A per-user JSON
  export preserves the round-trip semantics with correct isolation.
- Impact: backups are not binary-compatible with the Flutter app's `.venera`
  archives; a `format: 2` marker is included. Import of the original format is
  supported for the tables it can map (history, favorites, read later,
  appdata settings, sources).

## D-007 — Image proxy with per-user disk cache
- Choice: the browser never loads source images directly. `/api/image` fetches
  with the source's headers/cookies, follows `onLoadFailed`, and caches under
  the user's directory.
- Reason: hotlink protection, cookie isolation, no CORS problems, and the
  original image hooks (`onImageLoad`, `onThumbnailLoad`) keep working.
- Impact: server bandwidth; mitigated by cache and `Cache-Control: private`.

## D-008 — `innerHtml` alias
- Choice: expose both `innerHTML` and `innerHtml` on `HtmlElement`.
- Reason: `manga_dex.js` uses `innerHtml` while `init.js` defines `innerHTML`;
  the original silently returns `undefined` (comment bodies empty). The alias
  fixes a real user-visible bug without breaking any source.
- Impact: strictly additive.

## D-009 — Frontend uses npm (not pnpm)
- Choice: npm with committed `package-lock.json`.
- Reason: npm is available in every Node image and CI runner; the lockfile is
  deterministic. The brief allows either.
- Impact: none.

## D-010 — Statistics store `source_key`
- Choice: migration 2 adds `reading_statistics.source_key`; recording includes
  it and the recent-comics API returns it.
- Reason: the statistics page must navigate back to the comic. The original
  uses a local `comic_type` hash that cannot be reversed; storing the source key
  makes navigation reliable without a source lookup.
- Impact: one additive migration; old rows get an empty key and are displayed
  without a navigation target.

## D-011 — Catalog entry `fileName`
- Choice: accept `url`, `fileName` and `filename` when resolving catalog
  entries.
- Reason: the upstream `venera-configs/index.json` uses `fileName`. The first
  implementation only accepted `filename`, so catalog URLs resolved to null.
  This was found during live verification and fixed.
- Impact: catalogs in either spelling work.

## D-012 — Dedicated browser ZIP route
- Choice: `GET /api/downloads/browser` is registered before
  `GET /api/downloads/<id>`.
- Reason: shelf_router matches in registration order; otherwise `browser` is
  treated as a job id and returns 404. A direct ZIP endpoint is also the
  correct mapping for the original "download to device" feature on the web.
- Impact: one or many chapters can be downloaded without creating a server
  job; the server queue remains for offline reading.

## D-013 — Search option defaults
- Choice: when a source option list has no explicit default, the first option
  value is preselected (for select/dropdown types).
- Reason: MangaDex expects `order[0] != "any"` etc.; sending no value produced
  invalid query strings during live testing.
- Impact: search and category filters behave like the original UI.

## D-014 — Schema-driven settings UI
- Choice: one `SettingsCategoryPage` renders all setting groups from a typed
  schema (switches, selects, sliders, numbers, text, links, actions).
- Reason: the original has ~100 settings; a schema keeps labels, defaults and
  validation consistent, and makes the per-user settings API the single source
  of truth.
- Impact: adding a setting is a one-line schema entry plus a backend default.

## D-015 — Docker build resilience
- Choice: the Rust stage copies the whole `rust/js_host` directory and uses
  vendor/`--offline` when a local `vendor/` exists; CI builds without it and
  fetches crates with retries (`CARGO_NET_RETRY=10`,
  `CARGO_HTTP_TIMEOUT=120`, multiplexing disabled).
- Reason: the local Colima VM intermittently dropped crates.io TLS
  connections. Vendoring makes local builds deterministic without committing a
  156 MB vendor tree. `libsqlite3-dev` provides the `libsqlite3.so` symlink the
  Dart FFI loader expects; `mkdir -p /out` fixes the Dart AOT output path.
- Impact: local Docker builds are offline for Rust; GitHub Actions uses the
  normal crates.io path.

## D-016 — Reader gesture implementation on the web
- Choice: long-press and double-tap zoom are implemented with pointer events
  and a CSS transform on the image container (scale 1.75/2, anchor at press
  point or center per `longPressZoomPosition`); tap zones and wheel speed read
  `enableTapToTurnPages`, `reverseTapToTurnPages` and `readerScrollSpeed`.
- Reason: browser zoom is not page-coherent in the reader; an in-layer transform
  preserves tile navigation and page state while honoring the original
  settings.
- Impact: pinch is still browser-native; long-press/double-tap match the
  original gestures.

## D-017 — Per-comic and per-device reader settings
- Choice: `comicSpecificSettings` and `deviceSpecificSettings` are stored in the
  per-user settings table. A `deviceId` persists in `localStorage` (UUID) and
  overrides apply with comic-specific > device-specific > global precedence,
  mirroring `appdata.dart`.
- Reason: the original stored these in `appdata.settings` keyed by comic/device
  IDs; the server settings API already persisted maps.
- Impact: every reader setting now really applies to the reader and the
  settings page, and both "clear" actions remove the override block.

## D-018 — Gap-closing audit fixes
- Choice: implement the flagged rows with real code rather than relabeling
  them (zoom, end-of-chapter comments, per-comic/device settings, cache policy,
  network-folder sync/import, suggestions, explore mixed/viewMore, reader
  context menu/rotate/select/hints/downloaded marks, archives in download
  dialog, storage path, release-check dialog, follow-updates scheduler, image-
  favorite swipe, logs clear, route aliases).
- Reason: the Section 16 rule forbids DONE without runnable code + tests; the
  blockers B-010/B-012/B-015 were stale after implementation and were changed
  to RESOLVED.
- Impact: matrix 342 DONE / 30 BLOCKED; CI now gates the image build on the
  backend and frontend test jobs.

## D-019 — JS host stdin serialization and opaque comic ids
- Choice: serialize `Process.stdin` writes/flushes in `JsHostClient` behind a
  single future chain; decode percent-encoded path parameters once in a small
  `_DecodingRouter` wrapper; encode comic/reader ids in every frontend link via
  `comicPath`/`readerPath`.
- Reason: `IOSink.flush()` binds the sink while a flush is pending, so parallel
  aggregated searches threw `Bad state: StreamSink is bound to a stream`.
  Comic ids are opaque source strings; several catalogs use full URLs or
  `/manga/...` paths, which broke both React Router matching and the
  `shelf_router` handlers that received encoded ids.
- Impact: concurrent searches and URL-shaped comic ids work end-to-end; route
  parameters stay encoded for matching and are decoded exactly once before
  business logic. Regression tests cover both paths.

## D-020 — Server chapter prefetch and reader interaction parity
- Choice: warm the per-user disk cache when a chapter opens, with a
  fire-and-forget `POST .../prefetch` endpoint; batch `comic.onImageLoad` for up
  to 10 images in one QuickJS runtime; keep resolved configs for 2 minutes;
  throttle cache-limit enforcement; expose `serverPrefetchImageCount`
  (off/count/whole chapter) and keep `preloadImageCount` as the browser-side
  window.
- Reason: the original app reads downloaded/cached images locally, while the
  web proxy fetched every image only when the browser requested it and started
  a new QuickJS runtime per `onImageLoad`. On a real 16-image chapter this was
  0.5–1.4 s per image; after prefetch the same images serve in 0.03–0.04 s.
- Reader parity: the web reader now follows the reference's toolbar state,
  top/bottom tap zones for TTB, direction-aware keys, continuous-mode
  scrolling, slide transitions and long-press panning. Escape is panel-first.
- Impact: whole-chapter prefetch is the default (`-1`); users can cap it or
  disable it. Prefetch runs in the background with 3-way concurrency and never
  blocks the reader request.

## D-021 — Favorites metadata and cover caching, chapter lists stay live
- Choice: cache source-backed favorite folders/pages for 5 minutes; key cover
  bytes by `user|source|comic`; prewarm up to 30 list covers with 3-way
  concurrency; store a `description` snapshot on local favorite rows. Do not
  cache chapter lists.
- Reason: favorite lists are read far more often than they change, and source
  CDNs rotate cover URLs, so URL-keyed caches missed even for the same comic.
  Chapter lists must reflect source updates, so they remain uncached.
- Impact: favorites render from snapshots/disk immediately; mutations
  invalidate the list cache, and `refresh=1` provides an explicit bypass.
  Covers are re-fetched after `update-info` clears the identity entry.
