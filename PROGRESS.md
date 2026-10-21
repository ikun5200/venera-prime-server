# Progress

Updated: 2026-10-21T12:40Z

## Current phase

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
  tap scrolling and mouse speed, backward preloading, slide transitions,
  long-press panning, and panel-first Escape handling.
- Tests now 45 backend / 18 frontend; Playwright verified the NAS reader flow
  at 1280×800 and the 375 px layout (zero horizontal overflow).

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
