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
  `ghcr.io/ikun5200/venera-prime-server@sha256:4d0f958ab3f0e72df8d8c454892731e88257f1e333ea68f1f9c727679113df2d`
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
