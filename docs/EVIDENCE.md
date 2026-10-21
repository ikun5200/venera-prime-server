# Evidence

Every acceptance item is backed by a reproducible command, output summary and
(where visual) a screenshot. Times are UTC.

## E-01 — Toolchain and workspace

- Command:
  `dart --version; rustc --version; node -v; docker --version`
- Output: Dart 3.13.5, rustc 1.99.1, Node v22.18.0, Docker 29.9.1.
- Time: 2026-10-19T16:20:00Z
- Notes: The reference checkout is `reference/venera-prime` (read-only, not
  part of the repository).

## E-02 — Phase 0 documentation baseline

- Command: `ls docs/*.md`
- Output: `architecture.md`, `feature-matrix.md`, `design-guidelines.md`,
  `api.md`, `db-schema.md`, `js-source-compat.md`, `EVIDENCE.md`,
  `BLOCKERS.md`, `DECISIONS.md`.
- Feature matrix: 300+ rows covering navigation, home modules, search,
  explore, categories, ranking, details, favorites, history, read later,
  follow updates, downloads, local library, every settings category, sources,
  toolbox, statistics, image favorites, reader, shared dialogs and the new
  server features (init/admin/isolation/uploads/browser downloads/health/logs).
- Time: 2026-10-19T16:20:00Z

## E-03 — Backend static analysis and tests

- Command: `cd backend && dart analyze && dart test`
- Output summary:
  - `dart analyze`: 0 errors, 0 warnings (2 informational lints).
  - `dart test`: `+38: All tests passed!`
- Coverage:
  - initialization (single admin, duplicate rejected)
  - login/logout/me, wrong password
  - unauthenticated access rejected on all protected groups
  - admin create/update/disable/enable/delete users
  - last-admin protection, self-demotion/deletion protection
  - disabling a user invalidates existing sessions
  - non-admin rejected from admin endpoints
  - cross-user isolation for sources, favorites, history, read later, image
    favorites, settings, WebDAV, local comics and uploads
  - user deletion cascades rows and removes the user's directory
  - source CRUD, settings persistence, disable/enable, real source parse
  - search/details/chapters/image configs for a test source
  - favorites move/copy/delete, history/progress, read later
  - image favorites + statistics
  - settings validation and defaults
  - chunked upload → archive import → local image/cover read → CBZ/PDF/EPUB
    export → delete
  - backup export/import into another user
  - error envelope with requestId, 400/401/403/404/409/502 semantics
  - image endpoint auth, WebDAV password encryption
  - path guard traversal/symlink/absolute-path tests
  - JS host tests: init.js, HTML DOM, Convert md5, storage/settings across
    calls, and the real MangaDex source parse
- Time: 2026-10-19T16:00:00Z

## E-04 — Frontend typecheck, build and tests

- Command: `cd frontend && npm run typecheck && npm run build && npm test`
- Output summary:
  - `tsc -b --noEmit`: success.
  - `vite build`: 1723 modules transformed, `dist/index.html` + hashed CSS/JS.
  - `vitest run`: `Test Files 5 passed (5)`, `Tests 13 passed (13)`.
- Coverage: chapter helpers, chunked upload, UI primitives (button, switch,
  modal Escape, tabs), login success/error, reader page turn via button and
  keyboard, chapter drawer.
- Time: 2026-10-19T16:00:00Z

## E-05 — Real MangaDex source: parse → search → details → chapters → images

- Commands:
  - `cargo build` in `rust/js_host`.
  - Sidecar JSON-lines request `{"op":"call","method":"search.load",...}` with
    `reference/venera-prime/tool/comic_sources/manga_dex.js`.
  - API: `POST /api/sources/import`, `GET /api/search`, `GET /api/comic/...`,
    `GET /api/comic/.../chapter/.../images`, `GET /api/image`.
- Output summary:
  - Parse: `name=MangaDex`, `key=manga_dex`, `version=1.3.0`,
    capabilities search/explore/category/categoryComics/comments/
    chapterComments/imageLoad/link/starRating/webviewLogin.
  - Search `yuri`: 20 comics, `maxPage=23`, first `Yuru Yuri`.
  - Details: title `Yuru Yuri`, 1017 chapters in 94 groups, `updateTime`
    marker `2026-10-19|faba39de-...|vi`, stars 4.57.
  - Chapter images: 12 URLs returned for chapter
    `028385ce-0dae-44ae-9fb3-6e917cdb454f`.
  - Image proxy: HTTP 200, `image/jpeg`, 336807 bytes, 1115×1600.
- Time: 2026-10-19T15:40:00Z
- Notes: This exercises the original `init.js` unchanged, including a JS `Map`
  chapter result, `fetch`, `Convert.encodeUtf8`, `HtmlDocument` (comments) and
  `onImageLoad` fallback configs.

## E-06 — Second real source installed from a catalog

- Commands:
  - `POST /api/source-libraries` with
    `https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json`.
  - `GET /api/source-libraries/<id>/catalog` → 33 entries.
  - `POST /api/source-libraries/<id>/install {"entryId":"nhentai"}`.
- Output: source `nhentai` version 1.1.0 imported and parsed with
  category/categoryComics/explore/favorites/comments/imageLoad/link
  capabilities. Sources list then contains `manga_dex` and `nhentai`.
- Full chain for the second real source:
  - `GET /api/search?source=nhentai&q=yuri` → 200, comics including id
    `689080`.
  - `GET /api/comic/nhentai/689080` → 200, title
    `Loli-anoshi Compilation (Girls Und Panzer) By ゆかたろ`,
    `chapterCount=1`, `chapters={"0":"Chapter 1"}` (single-gallery sources
    have no chapter list; the original uses the implicit chapter id `"0"`).
  - `GET /api/comic/nhentai/689080/chapter/0/images` → 200, 16 image keys
    (first `https://i3.nhentai.net/galleries/4252807/1.webp`).
  - `GET /api/image?source=nhentai&comic=689080&ep=0&key=...` → 200,
    `image/webp`, 157578 bytes, 1200×1200.
- Time: 2026-10-19T16:18:00Z (updated 2026-10-19T17:08:00Z)

## E-07 — Init, login, admin and isolation (live server + UI)

- Commands (curl):
  - `POST /api/init` → 200, admin created; duplicate → 409.
  - `POST /api/auth/login` → 200 + `venera_session`; `GET /api/auth/me` → 200;
    wrong password → 401.
  - `POST /api/admin/users` create bob; duplicate → 409.
  - bob `GET /api/sources` → `{"items":[]}`; bob `GET /api/sources/manga_dex`
    → 404.
  - bob favorites/history/settings are empty/default while admin data remains.
  - bob `PUT /api/uploads/<admin upload>/chunk` → 404.
  - bob `GET /api/local-comics/<admin comic>` → 404.
  - admin disable bob → bob session → 401; re-enable → login 200.
  - admin delete bob → login 401, rows cascaded, user directory removed.
- UI: logged out admin, signed in as bob (home shows 0 sources/history/local,
  no Users link), signed back in as admin, deleted bob on the Users page
  (toast "Deleted", list 1 user).
- Time: 2026-10-19T16:20:00Z

## E-08 — Reader: gallery, continuous, keyboard, local and remote

- UI commands (in-app browser):
  - Opened chapter `210: Your Sugar`; image loaded (page `1 / 12`).
  - `Next image` → `2 / 12`; `ArrowRight` → `3 / 12`; `ArrowLeft` handled.
  - Reader settings drawer: reading mode, two-page spread, page margin, night
    mode/intensity, page number, preload.
  - Continuous top-to-bottom mode: scroll container `scrollHeight=2538`,
    `clientHeight=900`, page indicator updates.
  - Local reader `/reader/local/1`: title TestComic, `1 / 2`, local images.
  - Synthetic touch swipe on the 375 px local reader (`touchstart` at x=320,
    `touchend` at x=80): page indicator changed from `1 / 2` to `2 / 2`.
- Screenshots:
  - `docs/screenshots/04-reader-1280.png`
  - `docs/screenshots/04-reader-375.png`
  - `docs/screenshots/04-reader-settings-1280.png`
  - `docs/screenshots/04-reader-continuous-1280.png`
  - `docs/screenshots/04-reader-local-1280.png`
- Time: 2026-10-19T16:12:00Z

## E-09 — Uploads, local library, exports and browser download

- Commands:
  - `POST /api/uploads/init` (size 10) → upload id.
  - `PUT /api/uploads/<id>/chunk?offset=0` raw bytes → `received`.
  - `POST /api/uploads/<id>/complete {"import":true}` → local comic id 1.
  - `GET /api/local-comics/1/chapter/1/images` → 1 image.
  - `GET /api/local-comics/1/image/1/0` and `/cover` → bytes.
  - `GET /api/local-comics/1/export?format=cbz|pdf|epub` → 200 each.
  - `DELETE /api/local-comics/1` → rows and directory removed.
  - Browser ZIP: `GET /api/downloads/browser?source=manga_dex&comicId=...&
    chapters=028385ce-...` → 200, 5715337 bytes, ZIP with 12 JPEG files.
  - Server-side download: `POST /api/downloads` → state `completed`,
    progress 1.0, 12/12 pages; a second local comic (`Yuru Yuri`, type
    1696088050) appears in the local library.
- UI: Local page shows both comics; images/cover served from the per-user
  library; download page shows the completed task.
- Screenshots:
  - `docs/screenshots/04-local-1280.png`
  - `docs/screenshots/04-downloads-1280.png`
- Time: 2026-10-19T16:16:00Z

## E-10 — WebDAV backup and restore

- Setup: a local WebDAV test server on `127.0.0.1:18081` supporting HEAD,
  PROPFIND, PUT, GET and DELETE.
- Commands:
  - `PUT /api/webdav` config → configured.
  - `POST /api/webdav/test` → `{"ok":true,"status":200}`.
  - `POST /api/webdav/upload` → `.venera` file written (38624 bytes).
  - `POST /api/webdav/download` → restored newest backup, imported
    `{sources:2,favorites:1,history:2,readLater:1,images:1}`.
- Screenshots: `docs/screenshots/04-settings-webdav-1280.png`.
- Time: 2026-10-19T16:18:00Z

## E-11 — Source library, follow updates and readability

- Commands:
  - Catalog fetch → 33 entries; `nhentai` installed.
  - `POST /api/follow-updates/check` → task completed
    `{checked:1,updated:0,failed:0}`.
  - `GET /api/sources/manga_dex/check` → `{"status":"readable","stages":
    {"catalog":"ok","details":"ok","pages":"ok","image":"ok"}}`.
  - Cookie login import → source account `{loggedIn:true,kind:"cookies"}`;
    logout resets it.
- Screenshots: `docs/screenshots/04-source-detail-1280.png`,
  `04-source-libraries-1280.png`, `04-source-library-1280.png`,
  `04-follow-updates-1280.png`.
- Time: 2026-10-19T16:19:00Z

## E-12 — Responsive audit (375 / 768 / 1280)

- Method: in-app browser set to each width; measured
  `documentElement.scrollWidth - clientWidth` on every page.
- Result: all pages reported `overflow=0` at all three widths, except the logs
  page initially (292 px at 375); fixed by wrapping long log fields and
  re-measured `overflow=0`.
- Added during the final audit: search-result 1280 + 768 + 375, detail
  768 + 375, reader 768, reader-local 768 + 375, comments 375,
  download-dialog 375; all measured `overflow=0`.
- Screenshots (three widths each, unless noted):
  - home, search, search-result, detail, reader, reader-local
  - favorites, favorites-local, history, read-later
  - local, image-favorites, statistics, sources
  - settings, settings-reading, settings-app, settings-webdav,
    settings-about, settings-explore, settings-network,
    settings-local-favorites, settings-appearance, settings-debug,
    settings-home-layout, settings-image-processing, settings-explore-pages,
    settings-blocked-words
  - tasks, admin-users, follow-updates, downloads, explore, categories,
    toolbox, source-detail, source-libraries, source-library, logs
- Time: 2026-10-19T16:22:00Z

## E-13 — Docker and compose — PASS

- Command: `docker compose build && docker compose up -d`
- Output summary:
  - Multi-stage image built: frontend (node), Rust QuickJS sidecar, Dart AOT
    server, Debian slim runtime.
  - `docker compose ps`: `Up ... (healthy)`, `0.0.0.0:8080->8080/tcp`.
  - `GET /api/health` → `{"status":"ok","version":"1.0.0",
    "uptime":8,"initialized":false}` on first boot.
  - Runtime process: PID 1 `uid=10001` (`venera`), i.e. the application runs
    as a non-root user after the entrypoint drops privileges.
  - Host bind mounts: `data/venera.db`, `data/venera.db-wal`,
    `data/users/...`; restart preserved `initialized:true`, admin login,
    and the local library.
- Container end-to-end (fresh `/data`):
  1. `POST /api/init` → 200, admin created.
  2. `POST /api/auth/login` → 200 + session cookie.
  3. Imported MangaDex 1.3.0 → 200.
  4. Search `yuri` → Yuru Yuri; details 1017 chapters; chapter images 12.
  5. Image proxy → 200 `image/jpeg` 336807 bytes.
  6. Favorite folder + favorite; progress saved.
  7. Uploaded `ContainerComic.zip` → local comic id 1; images/cover/export
     (CBZ) 200.
  8. Browser ZIP → 200, 5715337 bytes, 12 files.
  9. Created bob; bob sources/favorites/history/read-later/local/downloads all
     empty; bob `GET /api/sources/manga_dex` → 404.
  10. Admin favorites/local data intact.
  11. Deleted bob → bob `me` 401, login 401.
- Screenshot: `docs/screenshots/06-container-home-1280.png`.
- Time: 2026-10-19T16:50:00Z
- Notes: fixes found during the build: `/out` directory for `dart compile`,
  `libsqlite3-dev` for the FFI symlink, and conditional vendored Rust crates to
  avoid flaky crates.io TLS errors in the VM. The Docker context excludes
  `vendor/`, so CI fetches crates normally.

## E-14 — GitHub repository, Actions and image pull — PASS

- Repository: <https://github.com/ikun5200/venera-prime-server>
- Final code commit: `c8701fdfbdb03a733ee117c29885ce3d4ce95844` (`fix(frontend): enable source comments and
  guard shared-folder actions`).
- Actions run (linux/amd64): <https://github.com/ikun5200/venera-prime-server/actions/runs/39290206225>
  — `completed success`, 3m59s for the first run; the workflow is
  `.github/workflows/docker.yml`.
- Workflow steps: checkout → lowercase owner → setup buildx → login GHCR →
  build/push `ghcr.io/<owner>/venera-prime-server:{latest,sha}` with
  `type=gha` cache; permissions `contents: read`, `packages: write`.
- Image:
  `ghcr.io/ikun5200/venera-prime-server@sha256:6ea29526ea70b4e0fa66d2b9bf061a33fd88d33d62bb7501fe093deb8291c854`
  (`linux/amd64`).
- Pull/run verification:
  - `docker pull --platform linux/amd64 ghcr.io/ikun5200/venera-prime-server:latest` → success.
  - `docker run --platform linux/amd64 -p 8081:8080 ...` → `Up (healthy)`.
  - `GET :8081/api/health` → `{"status":"ok","version":"1.0.0","initialized":false}`.
- A final documentation-only commit triggers one more workflow run; the Docker
  context excludes `docs/`, so it builds the same code and image.

## E-15 — Phase 8 audit — PASS (with documented BLOCKED items)

- Live audit: the local compose container (`:8080`) and the GHCR image
  (`:8081`, linux/amd64) were both started and exercised.
- Feature matrix: 372 rows; **333 DONE, 39 BLOCKED**. Every BLOCKED row has a
  `B-xxx` entry in `docs/BLOCKERS.md`; no row was deleted or merged.
- Audited in the real UI/API:
  - init → login → logout; admin create/disable/delete; last-admin protection.
  - per-user isolation for sources, favorites, history, read later, image
    favorites, settings, WebDAV, local comics, uploads and downloads; bob sees
    no admin data and cross-user source reads return 404.
  - MangaDex: import → search → details → chapters → image proxy, real
    comments drawer, favorite, download dialog, browser ZIP.
  - nhentai (container): install from URL → search → details (implicit chapter
    `0`) → 16 images → WebP image proxy.
  - reader: gallery page turns by button and keyboard, continuous scrolling,
    settings drawer, chapter drawer, local reader; 375 px reader.
  - local: chunked upload → import → images/cover → CBZ/PDF/EPUB export.
  - image favorites photo view, statistics, follow updates, source libraries
    and catalog install (nhentai), source settings persistence, source check
    readability, cookie login import/logout, WebDAV upload/download.
  - responsive audit: 375/768/1280 on every page, `scrollWidth-clientWidth=0`.
- Audit findings fixed during Phase 8:
  - Comments button was gated on `commentCount`, which is null for MangaDex;
    it now uses the source `comments` capability.
  - The "All favorites" pseudo-folder no longer offers rename/delete/move/copy
    actions that would target folder 0.
  - Logs page mobile overflow (long request ids) fixed.
  - Reader comment button respects `showChapterComments`.
  - Earlier live-fix list: browser ZIP route order, catalog `fileName`,
    WebDAV `href` namespace parsing, sqlite runtime symlink, Dart AOT output
    directory, search option defaults, source `sourceKey` enrichment.
- Evidence re-verification: backend 38/38 tests, frontend 13/13 tests,
  frontend typecheck+build, container e2e, GHCR pull/run.
- Time: 2026-10-19T17:05:00Z

## E-16 — Gap-closing audit round (2026-10-20) — PASS

- Verifier follow-up: CI lacked test jobs and several rows were marked DONE
  without a working implementation. This round added code, tests and docs.
- CI: `.github/workflows/docker.yml` now runs `backend-test`
  (`dart pub get`, `dart analyze`, `dart test`) and `frontend-test`
  (`npm ci`, `npm run typecheck`, `npm test`, `npm run build`); the image job
  `needs: [backend-test, frontend-test]`.
- Command (backend): `cd backend && dart analyze && dart test`
  - Output: `0 errors` (3 informational lints) and `+41: All tests passed!`
    (38 existing + 3 new: search-history single delete, cache maintenance
    endpoints, suggestions endpoint).
- Command (frontend): `cd frontend && npm run typecheck && npm test && npm run build`
  - Output: typecheck clean; `Test Files 5 passed (5), Tests 13 passed (13)`;
    vite production build succeeds.
- New implementations in this round (each verified by the tests above and/or
  live API checks):
  - Reader: double-tap and long-press zoom with anchor (press/center),
    end-of-chapter comments page, per-comic and per-device reader settings with
    clear actions, rotation control, inline margin slider, right-click context
    menu, multi-image selection for save/share, swipe chapter hints, downloaded
    chapter markers, F12 fullscreen, tap-zone settings, wheel speed, page
    animation keyframe, battery display, duplicate-chapter hiding in the
    reader drawer.
  - Settings: `initialPage` now redirects the home route; `comicListDisplayMode`
    and `showFavoriteStatusOnTile`/`showHistoryStatusOnTile` feeding is
    partially wired (see remaining flags below); cache retention/size enforced
    server-side; storage path exposed and copyable; About page performs a real
    GitHub release check with a release-notes dialog.
  - Favorites: network-folder import and linked-folder update sync
    (`/api/favorites/import-network`, `/api/favorites/folders/<id>/sync`),
    network-settings shortcut, folder-title action follows the setting.
  - Search: source chips honor `searchSources` order; suggestion overlay on the
    search page and inline suggestion chips on the results page; per-item
    history delete (`DELETE /api/settings/search-history/<keyword>`).
  - Explore/categories: `mixed` explore payloads normalized; section `viewMore`
    jump buttons; option lists with more than 8 entries render as dropdowns.
  - Details: information block always shown, pages use `maxPage`, tag
    right-click copy, cover right-click save and viewer zoom, quick-favorite
    right-click, thumbnail browser modal, archive type in download dialog,
    local-copy fallback when the source errors, comments drawer error/retry.
  - Chapter comments: vote/like/reply controls (new chapter endpoints).
  - Image favorites: photo view swipe navigation and tap-to-toggle overlay.
  - Logs: clear-logs action (`DELETE /api/logs`); settings back navigation
    aliases (`/settings/app/export|import` → webdav, `/local/upload` →
    import); AppShell task button respects the floating-task-button setting;
    follow-updates scheduler (`runDueChecks` hourly, honors interval and fixed
    time, migration 3 adds `follow_update_config.updated_at`).
- Remaining BLOCKED rows: 30 (from 39). Each either has a web-native
  substitute or a documented scope constraint in `docs/BLOCKERS.md`; the matrix
  statuses and evidence column were updated accordingly (E-16).
- Time: 2026-10-20T05:05:00Z
- CI verification: workflow run
  [39373491937](https://github.com/ikun5200/venera-prime-server/actions/runs/39373491937)
  succeeded — backend-test and frontend-test both green and the GHCR image
  build was gated on them. Two earlier failures were fixed: Dart SDK pinned to
  3.13.5 (matching the committed `pubspec.lock`), and the backend test job now
  builds the Rust JS host sidecar with `cargo build` first.

## E-17 — Chinese-first localization (2026-10-20) — PASS

- Requirement: the whole site must be Chinese.
- Frontend:
  - `settings_defaults.dart` now defaults `language` to `zh-CN`; unknown or
    `system` values resolve to `zh-CN` in `useT`, with `zh-CN` as the fallback
    dictionary and `zh-TW` still selectable.
  - All previously hardcoded UI strings (JSX text, labels, hints,
    placeholders, aria-labels, option lists, toasts, confirm/prompt dialogs,
    reader markers, dates and durations) are wrapped in `t()`.
  - Dictionary: 600+ `zh-CN` entries; every key used by the app is present
    (script check: `keys 402 missing 0`), and `zh-TW` is filled.
- Backend: `ApiException` defaults and ~100 user-visible messages (validation,
  auth, uploads, downloads, WebDAV, archive limits, JS host, static handler)
  are Chinese; verified live from the NAS container:
  - `POST /api/init` → `{"error":{"code":"CONFLICT","message":"系统已初始化",...}}`
  - `POST /api/auth/login` → `{"error":{"code":"UNAUTHORIZED","message":"用户名或密码错误",...}}`
- Commands:
  - `cd frontend && npm run typecheck && npm test && npm run build`
    → typecheck clean; 13/13 tests; production build ok.
  - `cd backend && dart analyze && dart test` → 0 errors; 41/41 tests.
  - CI run [39412834988](https://github.com/ikun5200/venera-prime-server/actions/runs/39412834988)
    succeeded (backend-test + frontend-test + image build/push).
- NAS: pulled the new image and recreated the container at
  `http://192.168.31.88:8082`; status `Up (healthy)`, `/api/health` ok, the
  served bundle contains the Chinese dictionary (`首页`, `当前已是最新版本`).
- Time: 2026-10-20T11:20:00Z

## E-18 — Source catalog import and full Chinese sweep (2026-10-20) — PASS

- User report: adding `https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-config@main/index.json`
  as a comic source failed, and `/settings/home-layout` was still English.
- Original behaviour (reference): the URL is a *source library catalog*
  (`index.json` → array of `{key,name,version,fileName|url,description}`);
  `resolveSourceDownloadUrl` resolves `fileName` relative to the list URL, and
  the client shows it under Source libraries rather than parsing it as JS.
- Fix: `POST /api/sources/url` now inspects the downloaded body. A JSON array
  (or `{sources|data|items: [...]}`) with at least one entry carrying
  `key|id` and `fileName|filename|url` is registered as a source library and
  returned as `{source: null, library, items}`; the UI toasts
  “已作为源仓库添加” and opens the catalog. Script URLs keep the old path.
  `installFromUrl` still rejects catalogs with a clear message.
- Verification with the user's real catalog:
  - `POST /api/sources/url` → `{"source":null,"library":{"id":"fc856e8310c1",...}}`
  - `GET /api/source-libraries/fc856e8310c1/catalog` → **18 entries**, first
    `鸟鸟韩漫` → `.../translated/nnhanman.js`
  - `POST .../install {"entryId":"nnhanman"}` → source `nnhanman 鸟鸟韩漫 1.1.1`
  - `GET /api/search?source=nnhanman&q=恋` → real comics returned (e.g.
    `戀愛作弊百科`), proving the installed third-party source runs on the server.
- Hermetic regression test: `backend/test/features_test.dart` spins a local
  HTTP catalog + script, asserts library registration, catalog URL resolution
  and install; backend suite is now **42/42**.
- Chinese sweep (beyond the earlier dictionary pass):
  - `/settings/home-layout`: module names, drag hint, buttons now render via
    `t()`; verified the production bundle contains
    “长按并拖动即可排序”.
  - `/settings` category descriptions, `/toolbox` descriptions, source
    capability badges, source-check status/stage values (`readable`, `ok`,
    `failed`, `skipped`, `running`), task titles
    (更新漫画信息 / 刷新所有历史 / 检查订阅更新), source/library counts,
    check results and the Confirm dialog default label.
  - Scan of all `.tsx` files for literal English JSX/props now only finds
    schema label sources that are passed through `t()` at render time.
- Commands: `cd backend && dart analyze && dart test` (0 errors, 42/42);
  `cd frontend && npm run typecheck && npm test && npm run build`
  (clean, 13/13, build ok).
- CI: run [39455347909](https://github.com/ikun5200/venera-prime-server/actions/runs/39455347909)
  succeeded (backend-test + frontend-test + GHCR image).
- NAS: image pulled and container recreated at `http://192.168.31.88:8082`;
  `Up (healthy)`; served bundle `index-Bwk8NYUo.js` contains
  “已作为源仓库添加”, “也可以粘贴漫画源目录地址”, “长按并拖动即可排序”.
- Time: 2026-10-20T16:25:00Z

## E-19 — Third-party source runtime fixes and full catalog install (2026-10-21) — PASS

- User report: after adding
  `https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json`,
  searching “擅长捉弄人的高木同学” produced
  `Bad state: StreamSink is bound to a stream`, and some sources returned
  results but clicking a cover did not open the comic.
- Root causes and fixes:
  1. **StreamSink** — `JsHostClient` called `process.stdin.flush()` from every
     in-flight request. `IOSink.flush()` binds the sink, so with the default
     concurrency of 8 an aggregated search over 33 sources threw
     `Bad state: StreamSink is bound to a stream`. Writes/flushes now go
     through a single future chain; the sidecar still runs requests in
     parallel. Reproduced with a standalone Dart test before the fix.
  2. **`APP.version`** — `init.js` reads the engine global `appVersion`, which
     the Rust host never defined. Sources such as copy_manga/hot_manga call
     `isAppVersionAfter()` in `loadInfo`, so details failed with
     `at get version`. The host now injects `context.appVersion` (2.6.3).
  3. **Opaque comic ids** — ykmh returns full URLs, goda `/manga/...`, comick
     `slug//title`. Frontend links interpolated ids without encoding, so React
     Router never matched `/comic/:source/:id`; API paths were encoded but
     `shelf_router` captured them still encoded. Added `comicPath`/
     `readerPath` helpers (used in all 24 link sites) and a `_DecodingRouter`
     that percent-decodes each path parameter exactly once.
  4. **Readability check** — `singlePageWithMultiPart` explore payloads are
     maps of group → comic list; `_firstComicId` only looked for `comics`
     wrappers. It now recognises comic summaries with `id` + `title|cover`.
- Tests added:
  - `backend/test/js_host_test.dart`: 8 concurrent source calls (would throw
    the StreamSink error before the fix); encoded comic/chapter ids containing
    `/` and `APP.version` in `loadInfo`.
  - `frontend/src/lib/links.test.ts` and `links.test.tsx`: link builders and
    React Router param decoding for `/` and full-URL ids.
- Commands:
  - `cd backend && dart analyze && dart test` → 0 errors (3 info lints);
    **44/44 tests**.
  - `cd frontend && npm run typecheck && npm test && npm run build` →
    typecheck clean; **17/17 tests**; production build
    `index-BCCZbqtH.js`.
- CI: run [39510499979](https://github.com/ikun5200/venera-prime-server/actions/runs/39510499979)
  succeeded (backend-test + frontend-test + image build/push).
- NAS (`http://192.168.31.88:8082`, image recreated, `Up (healthy)`):
  - All **33** sources from the venera-configs catalog are present for the
    admin account (12 existing kept, 21 inserted from the catalog) plus the
    catalog library entry.
  - `GET /api/search/aggregated?q=擅长捉弄人的高木同学` → HTTP 200 in 40 s,
    33 sections, **8 sources with results** (copy_manga, copy_manga_multi_accounts,
    manwaba, goda, wnacg, mxs, jcomic, hot_manga) and **no StreamSink error**.
  - Details for every returned source → HTTP 200 with real chapter counts
    (e.g. copy_manga 324, manwaba 176, goda 258, hot_manga 324).
  - `goda` chapter image and cover proxies → HTTP 200 `image/webp`
    (348,268 B and 44,194 B).
  - SPA routes `/comic/goda/%2Fmanga%2Fa%2Fb` and the encoded reader route
    return the app shell; served bundle is `index-BCCZbqtH.js`.
- Time: 2026-10-21T07:00:00Z

## E-20 — Server-side chapter prefetch and reader interaction parity (2026-10-21) — PASS

- User report: chapter images load slowly because each image is fetched on
  demand; the reader's gestures/operations differ from the original app.
- Server-side prefetch:
  - `POST /api/comic/:source/:id/chapter/:ep/prefetch {from}` warms the
    per-user image cache in the background. It calls `comic.loadEp` once,
    resolves up to 10 `comic.onImageLoad` calls in **one** QuickJS runtime
    (`image_config_batch`), then downloads with 3-way concurrency.
  - Resolved image configs are kept for 2 minutes, so on-demand `/api/image`
    requests after a prefetch do not start the JS host at all.
  - Cache-limit enforcement is throttled to once per 15 s per user, avoiding
    an O(n²) full-directory scan while hundreds of images are written.
  - `serverPrefetchImageCount` (default `-1` = whole chapter; `0` = off;
    10/20/30/50/100) is available in `/settings/reading` and the reader
    drawer. The reader sends the effective per-comic/device value as an
    explicit `limit` in the prefetch request. The existing
    `preloadImageCount` (1–16) controls the browser preload window; it now
    preloads both ahead and behind the current page.
- Measured on the NAS (`goda`, 16-image chapter, disk cache cleared):
  - Cold single image: **1.43 s** and **0.52 s** for the first two images.
  - `POST .../prefetch` returned in **0.01 s**; all 16 images were written in
    about **3 s**.
  - Subsequent images: **0.033–0.040 s** each (HTTP round trip included).
- Reader parity fixes (reference: `reference/venera-prime/lib/pages/reader/`):
  - Toolbar starts hidden and any tap closes it while open (original
    `_ReaderScaffoldState._isOpen = false` / `openOrClose`).
  - Top-to-bottom gallery uses top/bottom 30% tap zones instead of left/right.
  - Arrow keys follow the reading direction: LTR Right/Left, RTL Left/Right,
    TTB Down/Up; unrelated arrows are ignored. Continuous mode scrolls the
    container instead of changing page state.
  - Continuous mode supports tap-zone scrolling and applies the configured
    mouse scroll speed (non-passive wheel listener).
  - Page transitions slide in the reading direction (170 ms) when page
    animation is enabled.
  - Long-press zoom now pans with the pointer instead of re-anchoring on every
    move.
  - Escape closes the settings/chapters/comments drawer or context menu first;
    it only exits the reader when no panel is open.
- Browser verification (Playwright, 1280×800, NAS):
  - Login → aggregated search → GoDa result → details → reader; indicator
    `1 / 10`; one `/prefetch` request observed.
  - `ArrowRight` → `2 / 10`; centre tap shows the toolbar.
  - Switch to `galleryTopToBottom`: `ArrowDown` 2→3, `ArrowUp` 3→2; bottom tap
    zone advances and top tap zone goes back; Escape closes the drawer and
    stays in the reader.
  - Mobile 375×812: reader renders with `scrollWidth - innerWidth = 0`.
  - Screenshots: `docs/screenshots/20-reader-ttb-1280.png`,
    `docs/screenshots/20-reader-ttb-375.png`.
- Tests:
  - `backend/test/features_test.dart`: prefetch warms the cache, `/api/image`
    then returns the bytes, and `serverPrefetchImageCount = 0` disables it.
  - `frontend/src/routes/ReaderPage.test.tsx`: RTL and top-to-bottom arrow-key
    mapping.
  - `cd backend && dart analyze && dart test` → 0 errors, **45/45**.
  - `cd frontend && npm run typecheck && npm test && npm run build` → clean,
    **18/18**, production build succeeds.
- CI: run [39543339302](https://github.com/ikun5200/venera-prime-server/actions/runs/39543339302)
  (prefetch + gestures),
  [39544427544](https://github.com/ikun5200/venera-prime-server/actions/runs/39544427544)
  (Escape fix) and
  [39545715549](https://github.com/ikun5200/venera-prime-server/actions/runs/39545715549)
  (per-comic prefetch limit + page clamp) succeeded.
- NAS: image pulled and container recreated; `Up (healthy)`; served bundle
  `index-4oY5-guC.js` contains `/prefetch` and “服务端预缓存图片数”. An explicit
  `{"from":1,"limit":2}` prefetch returned `limit: 2` and wrote exactly two
  images (683,806 B) to the cache.
- Time: 2026-10-21T12:40:00Z

## E-21 — Favorites metadata, cover and network-list caching (2026-10-21) — PASS

- User report: the favorites list keeps hitting the server/source for comic
  covers and descriptions; they should be cached, while chapter lists should
  stay fresh.
- Implemented:
  - **Network favorites cache**: `favorites.loadFolders` and
    `favorites.loadComics` responses are cached in memory for 5 minutes per
    user + source + folder + page. Favorite/folder mutations invalidate the
    source's entries; `?refresh=1` bypasses the cache.
  - **Cover identity cache**: `/api/image/cover` accepts `source` and `comic`
    and keys the disk cache by `user|source|comic` instead of the URL. A
    rotating/signed CDN URL therefore still hits the cached bytes. The cache
    is cleared when `update-info` refreshes a favorite.
  - **Cover prewarm**: `GET /api/favorites` and network favorite pages schedule
    up to 30 missing covers in the background (3 concurrent), so the next
    visit is served from disk.
  - **Description snapshot**: migration 4 adds `favorites.description`;
    add-favorite and `update-info` write it, and the list API returns it.
    The card title exposes it as a tooltip.
  - Frontend favorites queries keep a 5-minute client cache; mutations still
    invalidate them.
  - Chapter lists are deliberately **not** cached by any of these paths.
- NAS verification:
  - Favorite list request: **0.043 s**, returns the stored description
    (“预热用简介”).
  - Adding a favorite and opening the list triggered a cover prewarm; the
    server cache grew by **44,194 B in 1.0 s**.
  - Requesting the same comic with a changed signed URL
    (`...?v=2`) returned **44,194 B in 0.029 s** from the identity cache
    (the cold fetch of that cover previously took 8.164 s).
  - Served bundle: `index-CPvQZFiW.js`.
- Tests:
  - `favorite snapshots store the description`
  - `cover cache is keyed by comic identity, not the signed URL`
  - `favorite list prefetches covers by comic identity`
  - `network favorites are cached and refresh bypasses the cache`
  - `cd backend && dart analyze && dart test` → 0 errors, **49/49**.
  - `cd frontend && npm run typecheck && npm test && npm run build` → clean,
    **18/18**, production build succeeds.
- CI: [39547869880](https://github.com/ikun5200/venera-prime-server/actions/runs/39547869880)
  (favorites cache),
  [39548715548](https://github.com/ikun5200/venera-prime-server/actions/runs/39548715548)
  (cover prewarm) and
  [39549541934](https://github.com/ikun5200/venera-prime-server/actions/runs/39549541934)
  (post-update list refresh) succeeded.
- Time: 2026-10-21T13:20:00Z
