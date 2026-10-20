# JS Source Compatibility

The original runs comic sources in QuickJS through `flutter_qjs`. Sources use
`assets/init.js` (reused verbatim) and a global `sendMessage` bridge injected by
the host. This server implements the same bridge inside a Rust sidecar
(`rust/js_host`, `rquickjs`), one QuickJS runtime per call.

## Execution model

1. The backend stores each user's source script in `sources.script`.
2. A call sends `{op,script,method,args,context}` to the sidecar over stdin.
3. The sidecar sets `globalThis.appVersion` from `context.appVersion`
   (currently `2.6.3`), evaluates `assets/init.js`, then the user script,
   instantiates the `class ... extends ComicSource`, registers it under its key,
   resolves the method path (e.g. `search.load`) and invokes it with the JSON
   args. `APP.version` therefore matches the version reported by the API, which
   sources use in `isAppVersionAfter()`.
4. `sendMessage` returns values synchronously for sync methods and
   already-resolved Promises for async methods (`http`, `delay`, `UI`,
   clipboard, `compute`). The sidecar drains the QuickJS job queue until the
   returned Promise settles. The sidecar runs requests on separate threads, but
   the Dart client writes request lines through a single future chain because
   `IOSink.flush()` binds the process stdin sink; this keeps concurrent
   aggregated searches safe.
5. Timeout: 30 s interrupt handler. Memory: 256 MiB runtime limit. A failed
   call returns a structured error and never crashes the API.

## Host bridge methods

Legend: ✅ implemented and verified · ◐ implemented with a documented
difference · ✗ not implemented.

| Method | Status | Notes |
|---|---|---|
| `log` | ✅ | Collects `{level,title,content}` into the response; backend writes structured logs. |
| `load_data` | ✅ | Reads the per-source `data_json` object supplied in the context. |
| `save_data` | ✅ | Mutates the object; returned to the backend and persisted. `data_key == "setting"` is rejected, matching the original. |
| `delete_data` | ✅ | |
| `http` | ✅ | Method/URL/headers/data/bytes; default web UA; per-user cookie jar; follows redirects; returns `{status,headers,body,error}`. `http_client: dart:io` is ignored (same transport). |
| `html` (all 21 sub-functions) | ✅ | `parse`, `querySelector(All)`, `getElementById`, `getText`, `getAttributes`, `dom_querySelector(All)`, `getChildren`, `getNodes`, `getInnerHTML`, `getParent`, `getClassNames`, `getId`, `getLocalName`, `getPreviousSibling`, `getNextSibling`, `node_text`, `node_type`, `node_toElement`, `dispose`. 8-document eviction. |
| `convert` utf8/gbk/base64/md5/sha1/sha256/sha512/hmac | ✅ | |
| `convert` aes-ecb/cbc/cfb/ofb | ✅ | No padding added/removed, exactly like the original. CFB/OFB implement the full 128-bit segment; `blockSize` values other than 128 use CFB-8/OFB-8 and are documented. |
| `convert` rsa | ✅ | PKCS#8 private key, PKCS#1 v1.5 decryption, block-wise. `isEncode:true` returns null. |
| `random` | ✅ | `int` truncates; `double` raw. |
| `cookie` set/get/delete | ✅ | Per-user cookie jar persisted in SQLite and passed in/out per call. |
| `uuid` | ✅ | UUID v1. |
| `load_setting` | ✅ | saved value → descriptor default → null. |
| `isLogged` | ✅ | `data.account != null`. |
| `delay` | ✅ | Blocking sleep on the worker thread, returned as a resolved Promise. |
| `UI.showMessage` | ◐ | Logged; no UI channel in the headless runtime. |
| `UI.showDialog` | ◐ | Returns without invoking callbacks; login flows that require a dialog must use credential/cookie login. |
| `UI.launchUrl` | ◐ | Returns the URL to the backend log; the web client can open it. |
| `UI.showLoading` / `cancelLoading` | ◐ | No-op, returns id 0. |
| `UI.showInputDialog` | ◐ | Returns null (cancelled). |
| `UI.showSelectDialog` | ◐ | Returns null (cancelled). |
| `getLocale` | ✅ | From the user's language setting (`en_US`, `zh_CN`, `zh_TW`). |
| `getPlatform` | ✅ | `linux` (server). |
| `setClipboard` / `getClipboard` | ◐ | In-memory per call; no system clipboard. |
| `compute` | ◐ | Executes the function string in the same QuickJS context instead of a separate isolate pool. Semantically equivalent for pure functions. |
| `image` (modifyImage) | ✗ | Custom image-processing scripts are not executed server-side. See BLOCKERS. |

## JS-visible API from init.js

All of `Convert`, `Network`/`fetch`, `Cookie`, `HtmlDocument`/`HtmlElement`/
`HtmlNode`, `log`/`console`, `Comic`, `ComicDetails`, `Comment`,
`ImageLoadingConfig`, `ComicSource`, `UI`, `APP`, `setTimeout`, `setInterval`,
`createUuid`, `randomInt`, `randomDouble`, `setClipboard`, `getClipboard` and
`compute` is provided unchanged by the original `init.js`.

Compatibility additions:
- `HtmlElement.innerHTML` is exposed as in the original, and an `innerHtml`
  alias is added because `manga_dex.js:774` uses the lower-case spelling
  (a latent bug in the original where the property was `undefined`). The alias
  makes comment bodies actually render.
- `HtmlElement.getElementById` is provided as a helper (documented in
  `doc/js_api.md` but absent from the original `init.js`).
- ES2022 features used by real sources (`Array.prototype.at`,
  `String.prototype.replaceAll`, optional chaining, nullish coalescing) are
  supported by the bundled QuickJS.

## Source lifecycle

- Metadata is read by evaluating the class: `name`, `key`, `version`,
  `minAppVersion`, `url`, `settings`, `translation`, `account`, `explore`,
  `category`, `categoryComics`, `search`, `comic`, `favorites`.
- Key validation `^[a-zA-Z0-9_]+$`, unique per user.
- Capability flags are inferred from the presence of each property.
- `init()` is called after registration; errors are captured.
- Per-source data (`account`, `settings`, `_localStorage`, arbitrary keys) is
  stored in `sources.data_json`.
- `isLogged` is `account != null`; credential login stores `[username,password]`
  (encrypted at rest), cookie/webview login stores `"ok"`.

## Method surface invoked by the backend

| Path | Args | Result |
|---|---|---|
| `search.load` | `(keyword, options, page)` | `{comics,maxPage}` |
| `search.loadNext` | `(keyword, options, next)` | `{comics,next}` |
| `explore[i].load` | `(page)` | source-defined page |
| `explore[i].loadNext` | `(next)` | source-defined page |
| `categoryComics.load` | `(category,param,options,page)` | `{comics,maxPage}` |
| `categoryComics.optionList` / `optionLoader` | — | option descriptors |
| `categoryComics.ranking.load` / `loadWithNext` | `(option,page/next)` | `{comics,maxPage/next}` |
| `comic.loadInfo` | `(id)` | `ComicDetails` |
| `comic.loadEp` | `(comicId,epId)` | `{images:[...]}` |
| `comic.loadThumbnails` | `(id,next)` | `{thumbnails,next}` |
| `comic.loadComments` | `(comicId,subId,page,replyTo)` | `{comments,maxPage}` |
| `comic.sendComment` | `(comicId,subId,content,replyTo)` | any |
| `comic.loadChapterComments` | `(comicId,epId,page,replyTo)` | `{comments,maxPage}` |
| `comic.sendChapterComment` | `(comicId,epId,content,replyTo)` | any |
| `comic.likeComic` | `(id,isLiking)` | any |
| `comic.likeComment` | `(comicId,subId,commentId,isLiking)` | number |
| `comic.voteComment` | `(comicId,subId,commentId,isUp,isCancel)` | number |
| `comic.onImageLoad` | `(imageKey,comicId,epId)` | image config |
| `comic.onThumbnailLoad` | `(imageKey)` | image config |
| `comic.starRating` | `(id,rating)` | any |
| `comic.onClickTag` | `(namespace,tag)` | page target |
| `comic.link.linkToId` | `(url)` | id or null |
| `comic.archive.getArchives` / `getDownloadUrl` | `(cid[,aid])` | archive info / URL |
| `account.login` | `(username,password)` | success |
| `account.loginWithCookies.validate` | `(values)` | boolean |
| `account.logout` | `()` | |
| `favorites.*` | see `docs/architecture.md` | |

## Verification

Real source: `reference/venera-prime/tool/comic_sources/manga_dex.js`
(MangaDex, 971 lines). It exercises `fetch`/`Network.fetchBytes`,
`APP.locale`, `Network.deleteCookies`, `HtmlDocument`/`HtmlElement`,
`Convert.encodeUtf8`, `loadSetting`, `comic.onImageLoad`,
`comic.loadComments`, `comic.sendComment`, `comic.onClickTag`,
`comic.link.linkToId`, `comic.starRating` and grouped chapter maps.

The end-to-end check (search → details → chapters → images) and its output are
recorded in `docs/EVIDENCE.md`. A second source (a static HTML source shipped
with the repository tests) exercises HTML parsing, `Convert`, `Cookie` and
`loadData`/`saveData`.

Known differences:
- `UI.*` cannot open interactive dialogs; sources requiring captcha/WebView
  login cannot complete that flow server-side. Credential and cookie login work.
- `modifyImage` scripts are not executed; images are returned unmodified.
- `http_client: dart:io` is accepted but ignored.
