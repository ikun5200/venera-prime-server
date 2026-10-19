# Blockers and conservative decisions

This file records every item that could not be implemented exactly, the
conservative choice made, and its user-visible impact. The autonomous mode rule
is: record, choose the most conservative/complete option, continue.

## B-001 — Interactive `UI.*` dialogs in source scripts
- Issue: some sources use `UI.showDialog`, `showInputDialog` or
  `showSelectDialog` for captcha/2FA/login flows. A headless sidecar cannot
  block on a browser dialog.
- Conservative choice: return "cancelled" (null) and log the request. Credential
  login (`account.login`) and cookie login (`account.loginWithCookies`) are
  fully supported, which covers the shipped MangaDex source.
- Impact: sources whose only login path is an interactive dialog cannot log in.
  They can still be used anonymously.
- Follow-up: a future version can implement a server-sent event channel and a
  client dialog bridge.

## B-002 — `modifyImage` scripts
- Issue: the original can run a user JS function against decoded image pixels
  (crop/split double-page spreads). Implementing RGBA manipulation in the
  sidecar plus decoding/re-encoding in Dart is possible but not required by any
  shipped source and risks large memory spikes.
- Conservative choice: serve images unmodified; keep the setting and editor in
  the UI with a clear note that it is applied client-side only if a browser
  implementation exists. `docs/js-source-compat.md` marks it ✗.
- Impact: custom image processing does not change server-returned images.

## B-003 — WebView login / captcha
- Issue: the original opens an embedded webview to log in and copies cookies.
- Conservative choice: provide a "paste cookies" login (cookie fields) and a
  manual cookie import. WebView login is not available in a server deployment.
- Impact: MangaDex login can be completed by pasting the forum session cookie.

## B-004 — Native OS integrations
- Issue: "Open folder", biometric lock, share sheet, volume keys, device
  rotation, QR camera scan.
- Conservative choice: show the server-side path (copyable), use browser
  fullscreen and keyboard shortcuts, provide a password-confirmation lock
  instead of biometrics, and render QR codes for WebDAV config instead of
  scanning (manual entry remains). Volume keys map to PageUp/PageDown.
- Impact: platform-specific affordances differ; the underlying capability
  (open path, lock, share, rotate, scan) has a web equivalent.

## B-005 — App self-update
- Issue: the Flutter app downloads and installs new binaries. A server image is
  updated by pulling a new container.
- Conservative choice: the About page checks the server version and links to the
  GitHub release/container instructions instead of self-updating.
- Impact: updates are an operator action, documented in README.

## B-006 — PicaData import
- Issue: the legacy `.picadata` format is a proprietary archive with an old
  schema.
- Conservative choice: accept the documented JSON/zip shape and map favorites,
  history and image favorites; reject unknown manifests with a clear error.
- Impact: some legacy variants may need manual conversion.

## B-007 — Source library catalogs
- Issue: the upstream catalog format may change.
- Conservative choice: support the documented `index.json` shape (`name`, `url`
  or `filename`, `version`, `description`) and surface fetch/parse errors
  without blocking source management.
- Impact: none for installed sources.

## B-008 — 7z archives
- Issue: the Dart `archive` package handles zip/cbz but not 7z/cb7.
- Conservative choice: accept zip/cbz natively; for 7z/cb7 return a clear
  "unsupported on this build" error. The Rust stage does not add a 7z decoder
  because no shipped source or test depends on it.
- Impact: 7z import is unavailable; zip/cbz (the common formats) work.

## B-009 — Proxy, DNS overrides and certificate settings are not enforced
- Issue: the settings are stored and validated, but the Rust source HTTP client
  (`ureq`) uses the system resolver and rustls defaults. The proxy/DNS/ignore-
  certificate options are not wired into it.
- Conservative choice: keep the settings for parity and document the gap; the
  server itself should be deployed with a working system proxy/DNS. Image proxy
  requests use Dart `http`, which likewise uses the system network.
- Impact: per-user proxy/DNS overrides and disabling TLS verification have no
  effect on source requests.

## B-010 — Linked network-folder sync / network→local import
- Issue: the original can link a local favorite folder to a network favorite
  folder and import network favorites into the local library.
- Conservative choice: local favorites and network favorites work
  independently; users can add network comics to local folders manually. The
  link columns exist in the schema but no sync worker is implemented.
- Impact: automatic two-way folder sync is unavailable.

## B-011 — Catalog version check / update availability
- Issue: the original compares installed source versions with a catalog and
  shows "new version" badges before updating.
- Conservative choice: per-source and "Update all" download the current script
  from the source URL and re-parse it. Catalog entries can be installed or
  switched, but no background version comparison is shown.
- Impact: no proactive update badge; updating is explicit.

## B-012 — Cache retention and size limit
- Issue: `cacheRetentionDays` and `cacheSize` are stored but the image proxy
  uses a fixed 7-day TTL and does not enforce the MB limit.
- Conservative choice: fixed TTL plus per-user cache directory; "Clear Cache"
  works. A full LRU implementation is deferred.
- Impact: cache may exceed the configured limit on very large libraries.

## B-015 — End-of-chapter comments page
- Issue: the original can render a masonry comments page after the last image
  in horizontal gallery modes.
- Conservative choice: chapter comments are available in the reader top-bar
  drawer, including pagination and posting. The inline end page is not rendered.
- Impact: one navigation difference; the data and actions are present.

## B-016 — Web-specific gesture/behavior gaps
- Issue: mouse scroll speed, double-tap/long-press zoom with an anchor,
  volume-key paging, device orientation lock, the favorite folder title action,
  move-favorite-after-reading, and traditional→simplified text conversion are
  either browser-native or not applicable.
- Conservative choice: keyboard arrows/PageUp/PageDown, browser zoom/fullscreen,
  the collect button plus double-tap/swipe quick collect, and the folder rail
  cover the same tasks. Settings remain visible and are stored.
- Impact: some device-specific affordances differ from the Flutter client.
