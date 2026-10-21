# REST API

Base: `/api`. No `/v1` prefix: this is a single-deployment application, the
frontend and backend ship together, and version negotiation adds no value.
All responses are JSON unless stated. All authenticated routes require the
session cookie.

## Conventions

- Auth cookie: `venera_session`, `HttpOnly`, `SameSite=Lax`, `Secure` when
  `COOKIE_SECURE=true`.
- Error envelope:
  ```json
  {"error":{"code":"NOT_FOUND","message":"...","requestId":"..."}}
  ```
  Codes: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`,
  `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `TIMEOUT`,
  `SOURCE_ERROR`, `INTERNAL`.
- Pagination: `?page=1&pageSize=20` → `{items,total,page,pageSize}`.
- Cross-user resources always answer `404`.
- State-changing requests require `Origin`/`Referer` matching `PUBLIC_ORIGIN`
  (or the request host) and header `X-Requested-With: venera-web`.
- `requestId` is echoed in `X-Request-Id` and in errors.
- Path parameters must be percent-encoded (`encodeURIComponent`). Comic and
  chapter ids are opaque source strings and may contain `/`, `?`, spaces or
  full URLs; the router decodes each parameter exactly once before calling the
  service, so `/api/comic/ykmh/https%3A%2F%2F...` reaches the source with the
  original id.

## Public

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/health` | — | `{status:"ok",version,uptime,initialized}` |
| GET | `/api/init/status` | — | `{initialized:boolean}` |
| POST | `/api/init` | `{username,password}` | `{user}`; 409 if initialized |
| POST | `/api/auth/login` | `{username,password}` | `{user}` + Set-Cookie |
| POST | `/api/auth/logout` | — | `{ok:true}`, clears cookie |
| GET | `/api/auth/me` | — | `{user}` or 401 |

## Admin (role=admin)

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/api/admin/users` | — | `{items:[user]}` |
| POST | `/api/admin/users` | `{username,password,role?}` | `{user}` |
| PATCH | `/api/admin/users/:id` | `{password?,role?,disabled?}` | `{user}` |
| DELETE | `/api/admin/users/:id` | — | `{ok:true}` (cannot delete self / last admin) |
| GET | `/api/admin/audit` | `?page=&pageSize=` | paged audit logs |

## Settings and state

| Method | Path | Notes |
|---|---|---|
| GET | `/api/settings` | all settings merged with defaults |
| PATCH | `/api/settings` | `{key:value,...}`; validates known keys |
| GET | `/api/settings/search-history` | `{items:[{keyword,createdAt}]}` |
| POST | `/api/settings/search-history` | `{keyword}` |
| DELETE | `/api/settings/search-history` | clears all |
| GET | `/api/tasks` | in-memory background tasks |
| DELETE | `/api/tasks` | clear finished |
| GET | `/api/logs` | `?level=&page=` request/audit logs (admin) |

## Sources

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/api/sources` | — | `{items:[source]}` without scripts |
| POST | `/api/sources` | `{script}` | parse, validate, store |
| POST | `/api/sources/url` | `{url}` | download then import |
| POST | `/api/sources/import` | `{name,script}` or multipart | import `.js` |
| GET | `/api/sources/:key` | — | includes `script`, `data`, `settings` |
| PUT | `/api/sources/:key` | `{script}` | replace; key must stay the same |
| DELETE | `/api/sources/:key` | — | |
| PATCH | `/api/sources/:key` | `{enabled?,sortOrder?}` | |
| POST | `/api/sources/reorder` | `{keys:[...]}` | |
| GET | `/api/sources/:key/settings` | — | descriptors + values |
| PUT | `/api/sources/:key/settings` | `{values:{...}}` | |
| POST | `/api/sources/:key/login` | `{username,password}` | credential login |
| POST | `/api/sources/:key/login-cookies` | `{values:{...}}` | cookie-field login |
| POST | `/api/sources/:key/logout` | — | |
| GET | `/api/sources/:key/check` | `?comicId=` | readability check result |
| GET | `/api/source-libraries` | — | |
| POST | `/api/source-libraries` | `{name,url}` | |
| PATCH | `/api/source-libraries/:id` | `{name?,enabled?}` | |
| DELETE | `/api/source-libraries/:id` | — | |
| GET | `/api/source-libraries/:id/catalog` | — | fetched catalog |
| POST | `/api/source-libraries/:id/install` | `{entryId}` | install variant |

Source object:
```json
{"key":"manga_dex","name":"MangaDex","version":"1.3.0","url":"...",
 "enabled":true,"sortOrder":0,"capabilities":{"search":true,"explore":true,
 "categories":true,"favorites":false,"comments":true,"login":true,
 "archive":false},"account":{"loggedIn":false,"kind":"webview"}}
```

## Search / discovery

| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/search` | `source,q,page,options` | `{comics,maxPage,page}` |
| GET | `/api/search/aggregated` | `q` | `{sections:[{source,comics,error,maxPage}]}` |
| GET | `/api/search/suggestions` | `source,q` | `{items:[{type,label,value}]}` |
| GET | `/api/explore` | `source,page` | source-defined page payload |
| GET | `/api/explore/next` | `source,next` | |
| GET | `/api/categories` | `source` | category descriptor |
| GET | `/api/category-comics` | `source,category,param,page,options` | `{comics,maxPage}` |
| GET | `/api/ranking` | `source,option,page` | `{comics,maxPage}` |

Comic summary: `{id,title,subtitle,cover,tags,description,sourceKey,maxPage,language,stars}`.

## Comic

| Method | Path | Notes |
|---|---|---|
| GET | `/api/comic/:source/:id` | full `ComicDetails` + `favorite` + `progress` |
| GET | `/api/comic/:source/:id/chapter/:ep/images` | `{images:[key],total}` |
| POST | `/api/comic/:source/:id/chapter/:ep/prefetch` | `{from?,limit?}` → `{enabled,running,limit}`; warms the server disk cache in the background |
| GET | `/api/comic/:source/:id/thumbnails` | `?next=` |
| GET | `/api/comic/:source/:id/comments` | `?page=&subId=` |
| POST | `/api/comic/:source/:id/comments` | `{content,subId?,replyTo?}` |
| GET | `/api/comic/:source/:id/chapter/:ep/comments` | `?page=&replyTo=` |
| POST | `/api/comic/:source/:id/chapter/:ep/comments` | `{content,replyTo?}` |
| POST | `/api/comic/:source/:id/like` | `{like:boolean}` |
| POST | `/api/comic/:source/:id/rating` | `{rating:1..5}` (mapped to 0–10) |
| POST | `/api/comic/:source/:id/comment-like` | `{commentId,like}` |
| POST | `/api/comic/:source/:id/comment-vote` | `{commentId,up,cancel}` |
| GET | `/api/comic/:source/:id/archives` | source archive list |
| GET | `/api/image` | `?source=&comic=&ep=&key=` → image bytes (proxy) |
| GET | `/api/image/thumb` | `?source=&key=` → thumbnail bytes |

The image proxy calls the source's `comic.onImageLoad`, applies returned
headers/cookies, follows `onLoadFailed` up to 5 times, and caches per user
(7 days, 2 GiB cap by default). Response includes `Content-Type`, `Cache-Control:
private, max-age=86400`.

`POST .../prefetch` is fire-and-forget: it returns immediately and downloads
the chapter into the same per-user cache, starting at `from` (1-based image
index) and wrapping around. The number of images is controlled by the
`serverPrefetchImageCount` setting (`0` = off, positive = count, `-1` = whole
chapter); an explicit `limit` in the body overrides it for per-comic/device
overrides. The reader also preloads `preloadImageCount` images around the
current page in the browser.

## Favorites

| Method | Path | Notes |
|---|---|---|
| GET | `/api/favorites/folders` | folders + counts + linked source |
| POST | `/api/favorites/folders` | `{name}` |
| PATCH | `/api/favorites/folders/:id` | `{name?,sortOrder?}` |
| DELETE | `/api/favorites/folders/:id` | deletes folder + memberships |
| GET | `/api/favorites` | `?folderId=&q=&status=` paged |
| POST | `/api/favorites` | `{folderId,comic}` |
| DELETE | `/api/favorites/:folderId/:comicType/:comicId` | |
| POST | `/api/favorites/move` | `{ids:[...],from,to}` |
| POST | `/api/favorites/copy` | `{ids:[...],to}` |
| POST | `/api/favorites/batch-delete` | `{ids:[...]}` |
| POST | `/api/favorites/update-info` | `{folderId?}` background task |
| GET | `/api/favorites/export` | `?folderId=` JSON download |
| POST | `/api/favorites/import` | `{data}` |
| GET | `/api/favorites/network/:source` | remote folders |
| GET | `/api/favorites/network/:source/:folder` | remote comics |
| POST | `/api/favorites/network/:source` | add/remove `{comicId,folderId,add}` |
| POST | `/api/favorites/network/:source/folder` | `{name}` |
| DELETE | `/api/favorites/network/:source/folder/:id` | |

## History / progress / read later

| Method | Path | Notes |
|---|---|---|
| GET | `/api/history` | `?q=&page=` |
| PUT | `/api/history` | `{comic,ep,page,chapterGroup,maxPage,readEpisode}` upsert |
| DELETE | `/api/history/:comicType/:comicId` | |
| POST | `/api/history/clear` | `{unfavoritedOnly?:true}` |
| POST | `/api/history/refresh` | `{ids?}` background task |
| GET | `/api/progress/:source/:id` | `{ep,page,chapterGroup,maxPage}` |
| GET | `/api/read-later` | `?q=` |
| POST | `/api/read-later` | `{comic}` |
| DELETE | `/api/read-later/:comicType/:comicId` | |
| POST | `/api/read-later/batch-delete` | `{ids:[...]}` |
| POST | `/api/read-later/restore` | `{items:[...]}` |
| DELETE | `/api/read-later` | clear all |

## Follow updates

| Method | Path | Notes |
|---|---|---|
| GET | `/api/follow-updates/config` | |
| PUT | `/api/follow-updates/config` | `{folderId?,checkOnStart?,intervalHours?,fixedTime?}` |
| GET | `/api/follow-updates` | `{updates:[...],comics:[...],count}` |
| POST | `/api/follow-updates/check` | background task |
| POST | `/api/follow-updates/mark-read` | `{ids?}` all or selected |

## Downloads

| Method | Path | Notes |
|---|---|---|
| GET | `/api/downloads` | jobs |
| POST | `/api/downloads` | `{source,comicId,chapters?:[id],archiveId?}` |
| POST | `/api/downloads/:id/pause` | |
| POST | `/api/downloads/:id/resume` | |
| POST | `/api/downloads/:id/retry` | |
| POST | `/api/downloads/:id/cancel` | |
| POST | `/api/downloads/:id/first` | move to front |
| GET | `/api/downloads/:id` | progress detail |
| GET | `/api/downloads/:id/archive` | zip of downloaded chapters (browser download) |
| GET | `/api/downloads/browser` | `?source=&comicId=&chapters=` → zip on the fly |

## Local library

| Method | Path | Notes |
|---|---|---|
| GET | `/api/local-comics` | `?q=&sort=` |
| GET | `/api/local-comics/:id` | details + chapters |
| DELETE | `/api/local-comics/:id` | `{removeFiles?,removeFavorites?}` |
| DELETE | `/api/local-comics/:id/chapters` | `{chapters:[...]}` |
| GET | `/api/local-comics/:id/chapter/:index/images` | image list |
| GET | `/api/local-comics/:id/image/:chapter/:page` | bytes |
| GET | `/api/local-comics/:id/cover` | bytes |
| GET | `/api/local-comics/:id/export` | `?format=cbz|pdf|epub` |
| POST | `/api/uploads/init` | `{name,size,mime}` → `{uploadId,offset}` |
| PUT | `/api/uploads/:id/chunk` | raw bytes, `?offset=` |
| POST | `/api/uploads/:id/complete` | `{import?:true,title?}` |
| DELETE | `/api/uploads/:id` | cancel |
| POST | `/api/local-comics/import` | multipart archive (cbz/zip/7z/cb7) |

## WebDAV / backup

| Method | Path | Notes |
|---|---|---|
| GET | `/api/webdav` | config without password |
| PUT | `/api/webdav` | `{url,username,password?,path?,autoSync?}` |
| POST | `/api/webdav/test` | connectivity check |
| POST | `/api/webdav/upload` | background task |
| POST | `/api/webdav/download` | background task; restores newest |
| GET | `/api/webdav/status` | last backup, identity, version |
| GET | `/api/backup/export` | full `.venera` JSON/zip |
| POST | `/api/backup/import` | restore uploaded backup |

## Statistics / image favorites

| Method | Path | Notes |
|---|---|---|
| GET | `/api/statistics` | `?days=30` summary + recent |
| POST | `/api/statistics` | `{comicId,comicType,title,author,cover,seconds}` |
| DELETE | `/api/statistics` | clear all |
| DELETE | `/api/statistics/:comicType/:comicId` | |
| GET | `/api/image-favorites` | `?q=&sort=&filter=&minCount=` |
| POST | `/api/image-favorites` | `{comic,ep,eid,epName,page,imageKey,auto}` |
| DELETE | `/api/image-favorites/:comicId/:sourceKey` | |
| DELETE | `/api/image-favorites/pages` | `{comicId,sourceKey,eid,page}` |
| GET | `/api/image-favorites/stats` | top tags/authors/comics |

## Debug

| Method | Path | Notes |
|---|---|---|
| POST | `/api/debug/eval` | `{code}` executes in the JS sidecar (admin) |
| POST | `/api/debug/reload` | reload all sources |

## Static

`GET /` and any non-`/api` path serve `frontend/dist`; unknown paths fall back
to `index.html` (SPA). Hashed assets get `Cache-Control: immutable`.
