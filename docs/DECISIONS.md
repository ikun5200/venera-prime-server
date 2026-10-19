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
