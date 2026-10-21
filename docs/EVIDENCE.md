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

## E-22 — Reference-style full-page slide and drag-follow reader (2026-10-21) — PASS

- User report: the page-turn effect felt wrong; the original app's full-page
  slide should be reproduced.
- Reference behaviour: `reference/venera-prime/lib/pages/reader/images.dart`
  uses `PhotoViewGallery.builder` (`PageView`) with every image page in one
  scrollable track; `reverse: reader.mode == galleryRightToLeft` and
  `Axis.vertical` for top-to-bottom. The page follows the finger, snaps with
  PageScrollPhysics, and the comments page is the last item in the same track.
- Implemented in `frontend/src/routes/ReaderPage.tsx`:
  - One flex track holds all pages (`flex-row`, `flex-row-reverse` for RTL,
    `flex-col` for TTB) and translates by `page * 100%`.
  - Pointer drag writes the translation directly to the track (no per-move
    React render of every page), follows the finger 1:1, applies 0.35 edge
    resistance, and snaps with `220ms cubic-bezier(0.215,0.61,0.355,1)`;
    `enablePageAnimation = false` snaps instantly.
  - RTL advances on a rightward drag and TTB on an upward drag, matching
    Flutter's `reverse` sign handling (`ScrollDragController._reversed`).
  - The comments page is reachable by swiping and can be swiped back; taps on
    it do not open the toolbar or select images.
  - Interactive controls (`input/textarea/select/button/a`) never start a
    page drag.
  - Tap-to-turn disabled now opens the toolbar for side taps, as in the
    reference `onTap`; the URL `page` parameter is applied on first render and
    no longer reset by the empty-image clamp.
- Local Playwright (1280×800, local comic, 2 pages):
  - LTR drag left 240 px → `2 / 2`, transform `-1280 px`; drag right → `1 / 2`.
  - 40 px short drag snaps back to `1 / 2`.
  - RTL drag right → `2 / 2`, transform `+1280 px`; drag left → `1 / 2`.
  - TTB drag up → `2 / 2`, transform `-800 px`; drag down → `1 / 2`.
  - Mid-drag: LTR finger 160 px → transform `-160 px` with `transition: none`;
    RTL finger +160 px → `+160 px`.
  - 375×812: drag turns 1→2; side tap with tap-to-turn off keeps the page and
    opens the bottom toolbar (`translate-y-full` → `translate-y-0`).
  - MangaDex chapter (`Yuru Yuri`, 12 pages): opening `?page=12` shows
    `12 / 12`; `End` opens the Chinese comments page at `-15360 px`; swiping
    back returns to `-14080 px`; swiping forward returns to the comments page.
- NAS (`http://192.168.31.88:8082`, image recreated, `Up (healthy)`):
  - `copy_manga / 徹夜之歌 樂園篇 / 第01話` (22 pages), RTL (the account's
    saved mode): drag right → `2 / 22` (`+1280 px`), drag left → `1 / 22`.
  - `End` → comments page `22 / 22` at `+28160 px` with “章节评论” rendered;
    drag left → last image at `+26880 px`. Settings restored afterwards.
  - Served bundle `index-B23Bj4dD.js` contains
    `transform 220ms cubic-bezier(0.215, 0.61, 0.355, 1)` and the track
    `translate3d` strings.
- Tests:
  - `frontend/src/routes/ReaderPage.test.tsx` adds “opens at the page requested
    in the URL” and “slides the whole page track in each reading direction”
    (LTR `-100%`, RTL `+100%`, TTB `translate3d(0, -100%, 0)`), and cleans up
    between tests.
  - `cd frontend && npm run typecheck && npm test && npm run build` → clean,
    **20/20**, production build succeeds.
  - `cd backend && dart analyze && dart test` → 0 errors (2 pre-existing
    info-level lints), **49/49**.
- CI: [39555010119](https://github.com/ikun5200/venera-prime-server/actions/runs/39555010119)
  succeeded (backend-test + frontend-test + image build/push).
- Screenshots: `docs/screenshots/21-reader-rtl-1280.png`,
  `docs/screenshots/21-reader-comments-1280.png`.
- Time: 2026-10-21T14:30:00Z

## E-23 — NAS end-to-end usability test (2026-10-21)

- Target: `http://192.168.31.88:8082` (server `1.0.0`, `initialized:true`),
  account `admin`; real browser interactions at 1280×720 plus 375/768 widths.
- Coverage: auth, home modules and layout, search (single/aggregated/options/
  history), explore, categories, comic details, reader, favorites, history,
  read later, follow updates, local/downloads, sources (settings/login/edit/
  check/libraries), all settings pages, admin users, toolbox, tasks, 404 and
  invalid routes.
- Report: `docs/usage-test-report-2026-10-21.md` (18 findings with repro;
  BUG-01…BUG-16 fixed by E-24, BUG-17/18 re-checked on the final bundle).
- Key findings:
  - Explore comic cards navigate to `/comic/undefined/:id`: 51/51
    copy_manga and 20/20 zaimanhua summaries lack `sourceKey`; only the
    `mixed` path (nhentai) is normalized. 32/33 explore sources affected;
    `comic_service.explore()` returns raw source JSON for non-mixed types.
    Re-checked on final bundle `index-BQUtyec5.js`: still reproduces.
  - Saving source settings with the rendered-empty `API地址` persisted
    `base_url:""`, breaking `copy_manga` (DNS `api`). Restored
    `api.copy2000.online`; search returned 30 results again.
  - Favorite-folder removal and admin user creation did not refresh the open
    view until reload; server state was correct.
  - Rankings failed for `copy_manga` (`Invalid status code: 210`) and
    `zaimanhua` (`at load (eval_script:215:30)`).
  - Aggregated search `恋爱` took ~38.9 s across 33 sources.
  - Invalid chapter renders `0 / 0` with no error; bootstrap during a 429
    briefly showed the `/init` create-admin page.
  - i18n gaps: English plurals (`1 comics`/`2 folders`/`1 users`), `Run`,
    `Export`, `Multi-Select`, `completed`, `Every N hours`, About/WebDAV/
    Toolbox English paragraphs, en-US/ISO dates. Fixed by E-24; remaining
    on the final bundle: source capability chips (`search · explore · …`)
    and role labels (`admin`/`user`).
- Screenshots: `docs/screenshots/usage-2026-10-21-home-375.png`,
  `docs/screenshots/usage-2026-10-21-home-1280.png`.
- Test data restored: base_url, image quality 800, RTL reading, double-page
  off, language/theme system, random module off, follow updates disabled,
  test folder/users (uitest, uitest2)/image-favorite/read-later removed,
  proxy `system`.
- Note: the NAS image was redeployed during the test window (E-22 reader,
  then E-24 usability fixes); reader and fixed-feature checks passed before
  and after each redeploy. BUG-17 (explore `sourceKey`) and BUG-18
  (capability/role labels) remained open at this point; both were fixed in
  E-25.
- Time: 2026-10-21T14:45:00Z

## E-24 — Usability report fixes (BUG-01…BUG-16) (2026-10-21) — PASS

- Source: `docs/usage-test-report-2026-10-21.md` (16 reproducible findings,
  1 high / 6 medium / 9 low). All 16 were addressed in code.
- BUG-01 (source settings):
  - `GET /api/sources/:key/settings` now merges each definition's `default`
    into `values`; `PUT` with an empty input falls back to the non-empty
    default and runs the definition's `validator`.
  - NAS API: initial `base_url=api.copy2000.online`, after saving only
    `image_quality=1200` the base_url stayed `api.copy2000.online`, and an
    empty `base_url` PUT returned `api.copy2000.online`. The settings page
    input renders `api.copy2000.online`. Original image quality restored.
- BUG-02 (favorite panel): local favorite add/remove now updates the comic
  cache and network-favorite cache immediately, then invalidates. A simulated
  failing comic refetch (502) still changed the open drawer row from
  `Reading / 已添加` to `Reading / 0`.
- BUG-03 (admin users): create/update/delete write the mutation result into the
  `admin-users` cache before invalidation. Playwright created `uitest_fix`
  and the row appeared without a reload (“创建于 2026年10月20日 00:45”);
  the user was deleted through the API afterwards.
- BUG-04 (ranking): `copy_manga` exposes ranking as a category, so the ranking
  page redirects to `/categories/copy_manga/排行?param="ranking"`. Unlabeled
  option groups now use index-based keys, producing
  `...ranking&options=male,day` → **200** with 30 covers and `页 1 / 10`
  (screenshot `22-ranking-1280.png`). Source failures are shortened to
  “源站返回异常（HTTP n）/漫画源暂时不可用”. `zaimanhua` 日排行
  (`/categories/zaimanhua/日排行?param="0"`) now returns real covers and
  `页 1 / 10` with no `eval_script` (screenshot
  `22-zaimanhua-ranking-1280.png`).
- BUG-05 (aggregated search): the page now fans out one request per configured
  source and renders each section as it finishes, with a 15 s per-source
  abort. It also honors the saved `searchSources` setting. With two sources,
  the first section appeared at **2.0 s** and the run completed at **6.5 s**;
  failures show “漫画源暂时不可用，请稍后重试”, never `eval_script` or
  `Invalid status code`. The backend aggregate endpoint timeout is 15 s.
- BUG-06 (invalid chapter): an empty image list or a failed image query now
  shows “章节加载失败 / 章节不存在或没有可用图片” with Retry/Back
  (`22-reader-empty-chapter-1280.png`). Verified with a fulfilled
  `{images:[],total:0}` response.
- BUG-07 (rate limit): bootstrap distinguishes 401 (not logged in) from 429
  and network errors; the latter show “无法连接服务器 / 请求过于频繁” with
  Retry instead of the create-admin page. Verified both by mocking
  `/api/init/status` 429 and by a real NAS 429 during the test burst.
- BUG-08 (duplicate network sources): removed the duplicated `networkSources`
  map; the sidebar renders each network source once (14 unique names,
  `22-favorites-sidebar-1280.png`).
- BUG-09 (network title): the network favorites heading uses the source
  display name; `copy_manga` renders “拷贝漫画”.
- BUG-10 (category filters): `showWhen`/`notShowWhen` are filtered against the
  current category label. On `copy_manga/愛情`, “男频” and “上升最快” are
  absent while “日漫” remains (`22-category-filter-1280.png`).
- BUG-11 (invalid source URL): `abc` returns
  `400 {"error":{"message":"请输入合法的 HTTP(S) 地址"}}`; non-HTTP schemes and
  empty hosts are rejected before the HTTP client.
- BUG-12 (update check): GitHub 404/403 map to “暂无发布版本” /
  “更新服务繁忙，请稍后重试”; About no longer shows `GitHub API returned`.
- BUG-13 (cold loading): comic details show a cover/description/chapter
  skeleton plus “正在加载漫画详情…”; the reader shows a spinner with
  “正在加载章节…” (`22-detail-skeleton-1280.png`,
  `22-reader-loading-1280.png`). A source refetch failure no longer discards
  already-rendered details.
- BUG-14 (pagination): search/category/ranking pages keep the last `maxPage`
  while the next page loads. NAS copy_manga search showed `页 1 / 2`,
  `页 2 / 2` during the request, `页 2 / 2` after.
- BUG-15 (dates): `formatDate`/`formatDay` use the selected Chinese locale
  (`zh-CN`/`zh-TW`) with 24-hour time; logs convert ISO timestamps to local
  time. NAS admin text contains “年”; logs contain no `T06:` ISO fragment.
- BUG-16 (i18n): plural helpers (`@count comics/folders/users/images/
  selected/running/tasks`), multi-select labels, task statuses, About/
  WebDAV/Toolbox/Source login/readability/delete-user text, `Run`/`Export`/
  `Import`, and the Traditional Chinese theme names are localized. NAS
  samples: “2 部漫画”, “1 个任务”, “运行中”, About “多用户 Web 漫画阅读器 /
  运行时间”, no English webview/WebDAV paragraphs; backend task messages are
  Chinese (“成功 n 个，失败 n 个”, “已检查 n 部，更新 n 部”).
- Tests:
  - `cd backend && dart analyze && dart test` → 0 errors (2 pre-existing
    info lints), **51/51**.
  - `cd frontend && npm run typecheck && npm test && npm run build` → clean,
    **22/22**, production build succeeds.
- CI: [39587132822](https://github.com/ikun5200/venera-prime-server/actions/runs/39587132822)
  (initial fixes), [39588640355](https://github.com/ikun5200/venera-prime-server/actions/runs/39588640355)
  (searchSources/filter groups) and [39589400343](https://github.com/ikun5200/venera-prime-server/actions/runs/39589400343)
  (count labels) succeeded.
- NAS: image recreated, `Up (healthy)`, `/api/health` ok, served bundle
  `index-BQUtyec5.js`. Screenshots `docs/screenshots/22-*.png`.
- Time: 2026-10-21T19:10:00Z

## E-25 — Persistent server cache, local-first reader and BUG-17/18 (2026-10-21) — PASS

- Scope: turn the server into the content cache instead of re-querying the
  comic sources for every view.
- Backend:
  - Migration 5 adds `content_cache` (user/source/kind/key, scope, JSON,
    created/expires) and `image_cache` (user, cache key, source, comic,
    chapter, image key, mime, size, timestamps).
  - `ContentCacheService` implements per-kind TTLs, single-flight coalescing,
    stale-while-revalidate, offline fallback, invalidation, pruning and cache
    statistics.
  - `ComicService` now serves details, chapter image lists, explore, search,
    categories, category comics, ranking, thumbnails, comments and chapter
    comments cache-first. `refresh=1` bypasses the cache.
  - Source settings/script updates, login/logout and deletion invalidate that
    source; sending a comment invalidates the comic's comment caches.
  - `explore()` recursively normalizes every renderer type and stamps
    `sourceKey`/`comicType` on each comic (BUG-17 root cause).
  - Image cache rows are indexed for stats; downloads use
    `persistCache:false` so local-library files are not duplicated in the
    image cache.
- Frontend:
  - Explore falls back to the active tab's source when a payload lacks
    `sourceKey`; `ComicCard` uses the same fallback for cover proxying.
  - Reader uses downloaded local chapter images first (`local-comics/...`)
    and falls back to the source if the local query fails; source prefetch is
    skipped for local chapters.
  - Settings → APP shows server-cache toggles/TTLs, image + metadata cache
    size, and “clear cache”/“clear metadata cache”.
  - Source capability chips render 搜索/发现/分类/收藏/评论/图片加载/登录 and
    roles render 管理员/普通用户 (BUG-18); remaining backend user-facing
    messages were localized.
- Automated regression:
  - `backend: dart analyze && dart test` → 0 errors, **54/54 passed**
    (new tests: explore all four renderer types carry `sourceKey`; cache
    hit/refresh/invalidation/offline fallback; image cache index/stats).
  - `frontend: npm run typecheck && npm test && npm run build` → clean,
    **24/24 passed**, production build succeeds (new tests: ExplorePage
    missing-sourceKey fallback; reader local-first image selection).
- Real-browser verification (local server, 1280×720):
  - Explore page rendered all four page types; clicking P1 navigated to
    `/comic/explore_source/p1` (not `/comic/undefined/...`).
  - `/sources` showed “explore_source · 发现”; `/admin/users` showed
    “管理员”.
  - After downloading chapter 1, the reader requested only
    `/api/local-comics/1/image/1/{0,1,2}`; local images loaded
    (`naturalWidth > 0`).
  - Settings → APP showed “服务端缓存”, “图片缓存 0 B · 元数据缓存 1.5 KB”.
  - API: first detail response `cache.hit=false`, second `true`; cache stats
    listed `explore` and `comic` entries.
- Migration:
  - Existing database copy migrated to `user_version=5` with both tables.
  - NAS database also reports `user_version=5` and both tables after deploy.
- Container:
  - `docker build -t venera-prime-server:local .` succeeds (215 MB).
  - Container smoke test: init/login/import source/explore/detail twice →
    explore comic `sourceKey=s`, detail `cache.hit:false → true`, stats
    `['explore','comic']`.
- CI: run `39624849976` (commit `e454b06`) succeeded (backend-test,
  frontend-test, Docker build/push).
- NAS: pulled `ghcr.io/ikun5200/venera-prime-server:latest` (digest
  `sha256:7dcf8df…acaf09fd`), recreated `venera-prime-server` with the same
  `/data` and `/config` mounts, `Up (healthy)`, `/api/health` ok, served
  bundle `index-BBI1Rup3.js` containing “无可用功能”, “服务端缓存”,
  “已缓存”, `reader-local-images` and `fallbackSourceKey`.
- Time: 2026-10-21T15:25:00Z
