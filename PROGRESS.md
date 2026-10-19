# Progress

Updated: 2026-10-19T16:52Z

## Current phase

Phase 7 — GitHub delivery. The multi-stage image builds, compose starts
healthy, and the container end-to-end flow passes (init, source, search,
details, reader image, favorite, upload/local read, browser ZIP, user
isolation and deletion, restart persistence).

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

## In progress

- Commit the container fixes, create the GitHub repository, push `main`, wait
  for the Actions image build, pull the GHCR image and start it.

## Next

- Phase 8: feature-matrix audit against the live container, evidence
  re-verification, final report.

## Known blockers (see `docs/BLOCKERS.md`)

- Interactive `UI.*` dialogs in sources (use credential/cookie login).
- `modifyImage` scripts stored but not executed.
- WebView/captcha login (cookie paste instead).
- Biometric lock, camera QR scan, OS folder picker, app self-update.
- 7z/CB7 import (ZIP/CBZ supported).
- Proxy/DNS/certificate settings are persisted but not enforced by the Rust
  HTTP client yet.
