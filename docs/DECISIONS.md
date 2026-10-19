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
