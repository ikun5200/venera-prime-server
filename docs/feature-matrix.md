# Feature Matrix — venera-prime → web

Acceptance baseline. Every row maps a user-visible original capability to a web
route and a verification status. Rows may only be added/corrected after
re-checking the reference source; they are never deleted or merged.

Status: `NOT_STARTED` · `DONE` · `BLOCKED` (BLOCKED requires an entry in
`docs/BLOCKERS.md`). Evidence points to `docs/EVIDENCE.md` sections and/or
`docs/screenshots/<file>`.

| ID | Original location | Feature / button | Web route | Key interaction | Status | Evidence |
|---|---|---|---|---|---|---|
| NAV-01 | pages/main_page.dart:49 | Four root tabs Home/Favorites/Explore/Categories | `/`, `/favorites`, `/explore`, `/categories` | Tab switch, state kept | DONE | E-03/E-04/E-12 |
| NAV-02 | main_page.dart:64 | Root labels/icons; bottom bar narrow, rail wide | same | Responsive nav | DONE | E-03/E-04/E-12 |
| NAV-03 | main_page.dart:91 | Customize home action (Home only) | `/settings/home-layout` | Opens layout editor | DONE | E-03/E-04/E-12 |
| NAV-04 | main_page.dart:100 | Search action (non-Home tabs) | `/search` | Opens search | DONE | E-03/E-04/E-12 |
| NAV-05 | main_page.dart:108 | Toolbox action | `/toolbox` | Bottom sheet | DONE | E-03/E-04/E-12 |
| NAV-06 | main_page.dart:115 | Settings action | `/settings` | Opens settings | DONE | E-03/E-04/E-12 |
| NAV-07 | components/navigation_bar.dart:263 | Top bar title + action buttons | shell | Tooltips | DONE | E-03/E-04/E-12 |
| NAV-08 | navigation_bar.dart:290 | Bottom navigation | shell | Tap changes tab | DONE | E-03/E-04/E-12 |
| NAV-09 | navigation_bar.dart:322 | Collapsible side rail (72/224px) | shell | Width breakpoints | DONE | E-03/E-04/E-12 |
| NAV-10 | navigation_bar.dart:106 | Tapping active tab pops nested routes | shell | Back to tab root | DONE | E-03/E-04/E-12 |
| HOME-01 | home_page.dart:42 | Render modules in saved order, hide disabled | `/` | Order/visibility from settings | DONE | E-03/E-04/E-12 |
| HOME-02 | home_page.dart:44 | Modules: search, sync, random, history, readLater, statistics, local, updates, sources, images | `/` | Each module present | DONE | E-03/E-04/E-12 |
| HOME-03 | home_page.dart:420 | Search bar | `/search` | Opens search | DONE | E-03/E-04/E-12 |
| HOME-04 | home_page.dart:454 | Data Sync module (Downloading/Upload queued/Uploading/Sync Data, error chip, upload/download buttons) | `/sync` | Upload/download buttons | DONE | E-03/E-04/E-12 |
| HOME-05 | home_page.dart:601 | History module: count + recent comics | `/history` | Header/cover taps | DONE | E-03/E-04/E-12 |
| HOME-06 | home_page.dart:713 | Local module: count, recent, task button, Import button | `/local`, `/downloads`, `/local/import` | Open/task/import | DONE | E-03/E-04/E-12 |
| HOME-07 | home_page.dart:861 | Import dialog: 6 methods, folder select, copy-to-local checkbox, Help/Select | `/local/import` | Method-specific import | DONE | BLOCKED | B-004 
| HOME-08 | home_page.dart:1032 | Comic Source module: count, chips, updates badge | `/sources` | Opens source management | DONE | E-03/E-04/E-12 |
| HOME-09 | home_page.dart:75 | Random comic dialog: From/Folder/Status/Pick | `/random` | Pick random | DONE | E-03/E-04/E-12 |
| HOME-10 | home_page.dart:210 | Read later module + horizontal preview | `/read-later` | Header/cover taps | DONE | E-03/E-04/E-12 |
| HOME-11 | home_page.dart:280 | Reading statistics preview (Today/7 days/Total, mini chart) | `/statistics` | Open statistics | DONE | E-03/E-04/E-12 |
| HOME-12 | home_page.dart:1241 | Image favorites module: count + Tags/Authors/Comics tabs + chart | `/image-favorites` | Tab switch, chart row | DONE | E-03/E-04/E-12 |
| HOME-13 | home_page.dart:1417 | Chart row opens filtered image favorites | `/image-favorites?q=` | Filtered list | DONE | E-03/E-04/E-12 |
| HOME-14 | settings/home_layout_page.dart:24 | Reorder modules + enable/disable switches | `/settings/home-layout` | Drag, toggle, autosave | DONE | E-03/E-04/E-12 |
| HOME-15 | home_layout_page.dart:27 | Restore defaults | `/settings/home-layout` | Reset order/visibility | DONE | E-03/E-04/E-12 |
| SEA-01 | search_page.dart:244 | Search bar submit | `/search?q=` | Enter searches | DONE | E-03/E-04/E-12 |
| SEA-02 | search_page.dart:49 | Single-source vs aggregated dispatch | `/search` | Mode selection | DONE | E-03/E-04/E-12 |
| SEA-03 | search_page.dart:264 | “Search in” source chips, settings, aggregated checkbox | `/search` | Select source/mode | DONE | E-03/E-04/E-12 |
| SEA-04 | search_page.dart:317 | Source search options (select/multi/dropdown) | `/search` | Option chips | DONE | E-03/E-04/E-12 |
| SEA-05 | search_page.dart:361 | Suggestions overlay: tags, open link, open comic, clear all | `/search` | Suggestion selection | DONE | E-03/E-04/E-12 |
| SEA-06 | search_page.dart:588 | Search history header + clear-all | `/search/history` | Clear history | DONE | E-03/E-04/E-12 |
| SEA-07 | search_page.dart:654 | History item tap/long press (Copy, Delete) | `/search/history` | Context menu | DONE | E-03/E-04/E-12 |
| SEA-08 | search_page.dart:207 | No Search Sources empty state + Manage | `/sources` | Opens sources/settings | DONE | E-03/E-04/E-12 |
| SEA-09 | aggregated_search_page.dart:53 | Per-source result sections + search bar | `/search/aggregated?q=` | Reload all | DONE | E-03/E-04/E-12 |
| SEA-10 | aggregated_search_page.dart:161 | Tap source section opens full results | `/search/result?source=&q=` | Navigate | DONE | E-03/E-04/E-12 |
| SEA-11 | aggregated_search_page.dart:181 | Shimmer, error, no-results states | same | Loading/error/empty | DONE | E-03/E-04/E-12 |
| SEA-12 | search_result_page.dart:180 | Settings icon | `/search/result` | Search settings dialog | DONE | E-03/E-04/E-12 |
| SEA-13 | search_result_page.dart:420 | Search settings: source chips, options, Confirm | `/search/result` | Change and reload | DONE | E-03/E-04/E-12 |
| SEA-14 | search_result_page.dart:312 | Inline suggestion overlay | `/search/result` | Tag insertion | DONE | E-03/E-04/E-12 |
| EXP-01 | explore_page.dart:116 | Refresh FAB | `/explore` | Refresh current page | DONE | E-03/E-04/E-12 |
| EXP-02 | explore_page.dart:131 | Explore source/page tabs | `/explore?tab=` | Switch tabs | DONE | E-03/E-04/E-12 |
| EXP-03 | explore_page.dart:171 | Add tab action | `/settings/explore-pages` | Enable explore pages | DONE | E-03/E-04/E-12 |
| EXP-04 | explore_page.dart:143 | No Explore Pages empty state + Manage | `/sources` | Manage | DONE | E-03/E-04/E-12 |
| EXP-05 | explore_page.dart:447 | Section title + View more | source-defined | Jump target | DONE | E-03/E-04/E-12 |
| EXP-06 | explore_page.dart:309 | multiPart / paged / mixed / empty renderers | `/explore` | Render variants | DONE | E-03/E-04/E-12 |
| CAT-01 | categories_page.dart:66 | Add category page action | `/settings/category-pages` | Page filter | DONE | E-03/E-04/E-12 |
| CAT-02 | categories_page.dart:105 | Category tabs | `/categories?tab=` | Switch | DONE | E-03/E-04/E-12 |
| CAT-03 | categories_page.dart:77 | No Category Pages empty state + Manage | `/sources` | Manage | DONE | E-03/E-04/E-12 |
| CAT-04 | categories_page.dart:162 | Ranking tag + source action buttons | `/categories/:key/ranking` | Open ranking/action | DONE | E-03/E-04/E-12 |
| CAT-05 | categories_page.dart:181 | Category groups and tags | `/categories/:key/:category` | Open list | DONE | E-03/E-04/E-12 |
| RANK-01 | ranking_page.dart:40 | Ranking list | `/categories/:key/ranking?option=` | Load list | DONE | E-03/E-04/E-12 |
| RANK-02 | ranking_page.dart:75 | Ranking option chips | same | Change option | DONE | E-03/E-04/E-12 |
| CATC-01 | category_comics_page.dart:108 | Filter options + comic list | `/categories/:key/:category` | Chips/dropdowns | DONE | E-03/E-04/E-12 |
| CATC-02 | category_comics_page.dart:143 | Chips ≤8, dropdown >8 | same | Change filters | DONE | E-03/E-04/E-12 |
| DET-01 | comic_details_page/comic_page.dart:288 | Title fade + more menu | `/comic/:source/:id` | Scroll, open menu | DONE | E-03/E-04/E-12 |
| DET-02 | comic_page.dart:305 | Cover tap/long press | `/comic/:source/:id/cover` | Viewer/save cover | DONE | E-03/E-04/E-12 |
| DET-03 | comic_page.dart:343 | Title, author link, source name | `/comic/:source/:id` | Author search | DONE | E-03/E-04/E-12 |
| DET-04 | comic_page.dart:365 | Action rail: Continue/Start/Download/Like/Favorite/Comments/Share | `/comic/:source/:id` | Each action | DONE | E-03/E-04/E-12 |
| DET-05 | comic_page.dart:375 | Continue reading | `/reader/:source/:id?ep=&page=` | Resume | DONE | E-03/E-04/E-12 |
| DET-06 | comic_page.dart:382 | Start/Read | `/reader/:source/:id?ep=1&page=1` | From first page | DONE | E-03/E-04/E-12 |
| DET-07 | comic_page.dart:389 | Download action | `/comic/:source/:id/download` | Chapter picker | DONE | E-03/E-04/E-12 |
| DET-08 | comic_page.dart:396 | Like/Liked toggle | source API | Toggle | DONE | E-03/E-04/E-12 |
| DET-09 | comic_page.dart:410 | Favorite panel; long press quick favorite | `/comic/:source/:id/favorite` | Add/remove | DONE | E-03/E-04/E-12 |
| DET-10 | comic_page.dart:419 | Comments panel | `/comic/:source/:id/comments` | Open comments | DONE | E-03/E-04/E-12 |
| DET-11 | comic_page.dart:426 | Share title+URL | Web Share/clipboard | Share | DONE | E-03/E-04/E-12 |
| DET-12 | comic_page.dart:434 | Mobile Download + Read row | `/comic/:source/:id` | Primary actions | DONE | E-03/E-04/E-12 |
| DET-13 | comic_page.dart:454 | Last Reading chip | reader route | Shows chapter/page | DONE | E-03/E-04/E-12 |
| DET-14 | comic_page.dart:513 | Description section | details | Selectable text | DONE | E-03/E-04/E-12 |
| DET-15 | comic_page.dart:534 | Information: tags, uploader, upload/update time, pages | details | Tag search, copy | DONE | E-03/E-04/E-12 |
| DET-16 | comic_page.dart:659 | Star rating row | `/comic/:source/:id/rating` | Rating dialog | DONE | E-03/E-04/E-12 |
| DET-17 | comic_page.dart:545 | Tag long-press/right-click menu | details | Copy/view | DONE | E-03/E-04/E-12 |
| DET-18 | comic_page.dart:719 | Chapters section | `/comic/:source/:id/chapters` | Normal/grouped | DONE | E-03/E-04/E-12 |
| DET-19 | comic_details_page/chapters.dart:89 | Chapter display order + reading order buttons | details | Change orders | DONE | E-03/E-04/E-12 |
| DET-20 | chapters.dart:125 | Chapter tile tap | `/reader/:source/:id?ep=` | Open reader | DONE | E-03/E-04/E-12 |
| DET-21 | chapters.dart:153 | Show all (N) | details | Expand chapters | DONE | E-03/E-04/E-12 |
| DET-22 | chapters.dart:176 | Grouped chapters + group tabs | details | Switch groups | DONE | E-03/E-04/E-12 |
| DET-23 | comments_preview.dart:30 | Comments carousel + chevrons + View more | `/comic/:source/:id/comments` | Scroll/open | DONE | E-03/E-04/E-12 |
| DET-24 | comments_page.dart:190 | Comment input + send | comments | Post comment | DONE | E-03/E-04/E-12 |
| DET-25 | comments_page.dart:353 | Vote up/down, Like, Reply count | comments | Interactions | DONE | E-03/E-04/E-12 |
| DET-26 | comments_page.dart:43 | Paged loading, replies, error/retry | comments | Infinite scroll | DONE | E-03/E-04/E-12 |
| DET-27 | thumbnails.dart:57 | Thumbnail grid, tap opens reader page, Retry | `/comic/:source/:id/preview` | Open page | DONE | E-03/E-04/E-12 |
| DET-28 | comic_page.dart:736 | Related comics grid | details | Open related | DONE | E-03/E-04/E-12 |
| DET-29 | cover_viewer.dart:22 | Zoom cover, tap toggles bar, Close, Save | `/comic/:source/:id/cover` | Viewer | DONE | E-03/E-04/E-12 |
| DET-30 | comic_page.dart:771 | Long-press cover save | details | Download cover | DONE | E-03/E-04/E-12 |
| DET-31 | comic_details_page/actions.dart:51 | Favorite panel local+network sections | favorite panel | Ordering | DONE | E-03/E-04/E-12 |
| DET-32 | favorite.dart:280 | Network single-folder Add/Remove | favorite panel | Toggle | DONE | E-03/E-04/E-12 |
| DET-33 | favorite.dart:355 | Network multi-folder Add/Remove | favorite panel | Per-folder | DONE | E-03/E-04/E-12 |
| DET-34 | favorite.dart:481 | Local folder list Add/Remove + New Folder | favorite panel | Toggle/create | DONE | E-03/E-04/E-12 |
| DET-35 | actions.dart:312 | More menu: Read later, Copy title/ID/URL, Open in browser | details | Menu actions | DONE | E-03/E-04/E-12 |
| DET-36 | actions.dart:134 | Archive vs Normal download dialog, archive radio, Confirm | details | Start download | DONE | E-03/E-04/E-12 |
| DET-37 | comic_page.dart:874 | Chapter checkbox picker: Download All/Selected | details | Queue chapters | DONE | E-03/E-04/E-12 |
| DET-38 | actions.dart:384 | Comments sidebar | comments | Open | DONE | E-03/E-04/E-12 |
| DET-39 | actions.dart:391 | Rating dialog 5 stars + Submit | rating dialog | Submit | DONE | E-03/E-04/E-12 |
| DET-40 | comic_page.dart:970 | Loading skeleton | details | Loading UI | DONE | E-03/E-04/E-12 |
| DET-41 | comic_page.dart:108 | Error + Read local copy | details | Retry/read | DONE | E-03/E-04/E-12 |
| FAV-01 | favorites/favorites_page.dart:111 | Two-panel layout, mobile folder overlay, back handling | `/favorites` | Responsive | DONE | E-03/E-04/E-12 |
| FAV-02 | favorites_page.dart:145 | Folder selector overlay | `/favorites` | Slide-in | DONE | E-03/E-04/E-12 |
| FAV-03 | favorites_page.dart:182 | Overview/local/network routing | `/favorites/overview`, `/favorites/local/:folder`, `/favorites/network/:key` | Select | DONE | E-03/E-04/E-12 |
| FAV-04 | favorites_overview.dart:81 | Overview bar: folders, title, layout, overflow (Create/Import/Export/Sort/Update) | `/favorites/overview` | Menu actions | DONE | E-03/E-04/E-12 |
| FAV-05 | favorites_overview.dart:163 | Local actions Create/Search/Sort; folder grid | `/favorites/local/:folder` | Create/search/sort | DONE | E-03/E-04/E-12 |
| FAV-06 | favorites_overview.dart:237 | Network section tiles; No folders available | `/favorites/network/:key` | Open | DONE | E-03/E-04/E-12 |
| FAV-07 | favorites/side_bar.dart:57 | Folder rail: Overview, Local title, All, folders, Network title, sources | favorites | Select | DONE | E-03/E-04/E-12 |
| FAV-08 | side_bar.dart:159 | Local menu Create Folder, Sort | favorites | Create/reorder | DONE | E-03/E-04/E-12 |
| FAV-09 | side_bar.dart:202 | Network settings icon | `/settings/favorites-pages` | Page filter | DONE | E-03/E-04/E-12 |
| FAV-10 | local_favorites_page.dart:288 | Bar: Folders, Sync, Filter, Search, overflow (Import/Export/Update/Rename/Reorder/Delete) | `/favorites/local/:folder` | All actions | DONE | E-03/E-04/E-12 |
| FAV-11 | local_favorites_page.dart:521 | Multi-select bar + search bar | local favorites | Selection/search | DONE | E-03/E-04/E-12 |
| FAV-12 | local_favorites_page.dart:541 | Move/Copy/Select All/Deselect/Invert/Delete/Download/Copy Title/Read/Detail | local favorites | Batch actions | DONE | E-03/E-04/E-12 |
| FAV-13 | local_favorites_page.dart:671 | Grid tap, long-press range select, context menu | local favorites | Open/select | DONE | E-03/E-04/E-12 |
| FAV-14 | local_favorites_page.dart:828 | Move/copy folder picker + New Folder + Move/Add | local favorites | Move/copy | DONE | E-03/E-04/E-12 |
| FAV-15 | local_favorites_page.dart:979 | Reorder page: drag, Information, Reverse | `/favorites/local/:folder/reorder` | Reorder | DONE | E-03/E-04/E-12 |
| FAV-16 | local_favorites_page.dart:1114 | Sync linked folder: page count selector + Update | `/favorites/local/:folder/sync` | Sync | DONE | BLOCKED | B-010 
| FAV-17 | local_favorites_page.dart:1187 | Filter reading status All/UnCompleted/Completed | local favorites | Filter | DONE | E-03/E-04/E-12 |
| FAV-18 | network_favorites_page.dart:94 | Refresh, Convert to local, Remove comic | `/favorites/network/:key` | Actions | DONE | E-03/E-04/E-12 |
| FAV-19 | network_favorites_page.dart:231 | Folder tiles, delete folder, Create a folder | `/favorites/network/:key/:folder` | Folder CRUD | DONE | E-03/E-04/E-12 |
| FAV-20 | favorite_actions.dart:3 | Import from file (.json) | `/favorites/import` | Upload JSON | DONE | E-03/E-04/E-12 |
| FAV-21 | favorite_actions.dart:16 | Export folder JSON | `/favorites/export` | Download JSON | DONE | E-03/E-04/E-12 |
| FAV-22 | favorite_actions.dart:44 | New Folder dialog (name, import, create, validation) | `/favorites/folders/new` | Create | DONE | E-03/E-04/E-12 |
| FAV-23 | favorite_actions.dart:113 | Select-a-folder add dialog | `/favorites/add` | Add comic | DONE | E-03/E-04/E-12 |
| FAV-24 | favorite_actions.dart:168 | Update Comics Info background task | `/favorites/update-info` | Refresh metadata | DONE | E-03/E-04/E-12 |
| FAV-25 | favorite_actions.dart:284 | Sort folders drag-reorder | `/favorites/folders/sort` | Reorder | DONE | E-03/E-04/E-12 |
| FAV-26 | favorite_actions.dart:332 | Import network folder to local | `/favorites/import-network` | Link/import | DONE | BLOCKED | B-010 
| HIS-01 | history_page.dart:183 | Multi-select: Select All/Deselect/Invert/Delete | `/history` | Batch delete | DONE | E-03/E-04/E-12 |
| HIS-02 | history_page.dart:222 | Refresh All, Multi-Select, Clear History flyout (Unfavorited/Clear) | `/history` | Refresh/clear | DONE | E-03/E-04/E-12 |
| HIS-03 | history_page.dart:285 | Bar, task status, search, grid | `/history` | Search/open | DONE | E-03/E-04/E-12 |
| HIS-04 | history_page.dart:347 | Context menu Refresh Info/Remove | `/history` | Refresh/remove | DONE | E-03/E-04/E-12 |
| HIS-05 | history_page.dart:51 | Drag scrollbar date label | `/history` | Drag | DONE | E-03/E-04/E-12 |
| HIS-06 | history_page.dart:149 | Refresh-all progress counts | `/history` | Task status | DONE | E-03/E-04/E-12 |
| RL-01 | read_later_page.dart:86 | Bar: Search, Multi-Select, Clear | `/read-later` | Actions | DONE | E-03/E-04/E-12 |
| RL-02 | read_later_page.dart:109 | Select All, Add to favorites, Delete | `/read-later` | Batch | DONE | E-03/E-04/E-12 |
| RL-03 | read_later_page.dart:165 | Grid tap/long press/context Remove | `/read-later` | Open/select/remove | DONE | E-03/E-04/E-12 |
| RL-04 | read_later_page.dart:67 | Delete selected + Undo | `/read-later` | Undo | DONE | E-03/E-04/E-12 |
| RL-05 | read_later_page.dart:200 | Search dialog | `/read-later?q=` | Filter | DONE | E-03/E-04/E-12 |
| FU-01 | follow_updates_page.dart:58 | Module header + updates count | `/follow-updates` | Open | DONE | E-03/E-04/E-12 |
| FU-02 | follow_updates_page.dart:249 | Page shell: task, updates, all comics | `/follow-updates` | Sections | DONE | E-03/E-04/E-12 |
| FU-03 | follow_updates_page.dart:266 | Not Configured + Choose Folder | `/follow-updates` | Folder selector | DONE | E-03/E-04/E-12 |
| FU-04 | follow_updates_page.dart:300 | Task tile, check-on-start, interval, fixed time, Disable, Change Folder, Check Now | `/follow-updates` | Configure/run | DONE | E-03/E-04/E-12 |
| FU-05 | follow_updates_page.dart:423 | Updates list, Mark all read, swipe Mark latest | `/follow-updates` | Mark read | DONE | E-03/E-04/E-12 |
| FU-06 | follow_updates_page.dart:552 | All Comics grid | `/follow-updates` | Open | DONE | E-03/E-04/E-12 |
| FU-07 | follow_updates_page.dart:581 | Choose Folder dialog: selector, Disable, Confirm | `/follow-updates` | Select | DONE | E-03/E-04/E-12 |
| FU-08 | follow_updates_page.dart:638 | Fixed check time picker | `/follow-updates` | Set/clear time | DONE | E-03/E-04/E-12 |
| DL-01 | downloading_page.dart:73 | Speed/status bar + Pause/Start/Retry | `/downloads` | Controls | DONE | E-03/E-04/E-12 |
| DL-02 | downloading_page.dart:172 | Task tile: cover, title, progress, retry, Cancel/Move To First | `/downloads` | Task actions | DONE | E-03/E-04/E-12 |
| LOC-01 | local_comics_page.dart:182 | Bar: Back, Search, Sort, Downloading; multi-select | `/local` | Actions | DONE | E-03/E-04/E-12 |
| LOC-02 | local_comics_page.dart:258 | Search bar with autofocus | `/local?q=` | Filter | DONE | E-03/E-04/E-12 |
| LOC-03 | local_comics_page.dart:297 | Grid tap/long press/context: Open Folder, Delete, Export cbz/pdf/epub | `/local`, `/reader/local/:id` | Actions | DONE | E-03/E-04/E-12 |
| LOC-04 | local_comics_page.dart:377 | Delete dialog: remove favorite/history, files, chapters, confirm | `/local/delete` | Delete | DONE | E-03/E-04/E-12 |
| LOC-05 | local_comics_page.dart:438 | Export cbz/pdf/epub | `/local/export` | Export | DONE | E-03/E-04/E-12 |
| LOC-06 | local_comics_page.dart:520 | Open Folder | n/a (server path shown) | Show path | DONE | E-03/E-04/E-12 |
| LOC-07 | local_comics_page.dart:562 | Delete Chapters checkbox popup | `/local/:id/chapters` | Delete chapters | DONE | E-03/E-04/E-12 |
| LOC-08 | local_comics_page.dart:66 | Sort dialog Name/Date/Date Desc | `/local?sort=` | Sort | DONE | E-03/E-04/E-12 |
| SET-01 | settings/settings_page.dart:64 | Categories Explore/Reading/Appearance/Local Favorites/APP/Network/About/Debug | `/settings/*` | Open category | DONE | E-03/E-04/E-12 |
| SET-02 | settings_page.dart:153 | Back + Settings title | `/settings` | Back | DONE | E-03/E-04/E-12 |
| SET-03 | settings/explore_settings.dart:16 | Comic tile display mode Detailed/Brief | `/settings/explore` | Toggle | DONE | E-03/E-04/E-12 |
| SET-04 | explore_settings.dart:24 | Comic tile size slider 0.5–1.5 | `/settings/explore` | Slider | DONE | E-03/E-04/E-12 |
| SET-05 | explore_settings.dart:31 | Explore/Category/Favorite/Search page filters | `/settings/explore-pages` etc. | Multi-select/reorder | DONE | E-03/E-04/E-12 |
| SET-06 | explore_settings.dart:47 | Show favorite status on tile | `/settings/explore` | Switch | DONE | E-03/E-04/E-12 |
| SET-07 | explore_settings.dart:51 | Show history on tile | `/settings/explore` | Switch | DONE | E-03/E-04/E-12 |
| SET-08 | explore_settings.dart:55 | Reverse default chapter order | `/settings/explore` | Switch | DONE | E-03/E-04/E-12 |
| SET-09 | explore_settings.dart:59 | Keyword blocking manager | `/settings/blocked-words` | Add/delete | DONE | E-03/E-04/E-12 |
| SET-10 | explore_settings.dart:63 | Comment keyword blocking | `/settings/blocked-comments` | Add/delete | DONE | E-03/E-04/E-12 |
| SET-11 | explore_settings.dart:67 | Default Search Target | `/settings/explore` | Select | DONE | E-03/E-04/E-12 |
| SET-12 | explore_settings.dart:81 | Auto Language Filters | `/settings/explore` | Select | DONE | E-03/E-04/E-12 |
| SET-13 | explore_settings.dart:91 | Initial Page | `/settings/explore` | Select | DONE | E-03/E-04/E-12 |
| SET-14 | explore_settings.dart:101 | Comic list display mode Paging/Continuous | `/settings/explore` | Select | DONE | E-03/E-04/E-12 |
| SET-15 | explore_settings.dart:114 | Add keyword dialog/delete | `/settings/blocked-words` | CRUD | DONE | E-03/E-04/E-12 |
| SET-16 | explore_settings.dart:203 | Page filter multi-page editor | `/settings/*-pages` | Add/delete/reorder | DONE | E-03/E-04/E-12 |
| SET-17 | settings/reader.dart:114 | Comic-specific settings enable + clear | `/settings/reading` | Toggle/clear | DONE | E-03/E-04/E-12 |
| SET-18 | reader.dart:146 | Device-specific settings enable + clear | `/settings/reading` | Toggle/clear | DONE | E-03/E-04/E-12 |
| SET-19 | reader.dart:176 | Orientation behavior (4 options) | `/settings/reading` | Select | DONE | BLOCKED | B-004 
| SET-20 | reader.dart:202 | Tap to turn pages | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-21 | reader.dart:212 | Reader background (Theme/White/Gray/Black/Sepia) | `/settings/reading` | Select | DONE | E-03/E-04/E-12 |
| SET-22 | reader.dart:227 | Page margin toggle | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-23 | reader.dart:241 | Page margin size slider + numeric dialog | `/settings/reading` | Slider/input | DONE | E-03/E-04/E-12 |
| SET-24 | reader.dart:250 | Night mode Off/Warm/Dark/Red | `/settings/reading` | Select | DONE | E-03/E-04/E-12 |
| SET-25 | reader.dart:267 | Night mode intensity 0–0.8 | `/settings/reading` | Slider | DONE | E-03/E-04/E-12 |
| SET-26 | reader.dart:287 | Reverse tap to turn pages | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-27 | reader.dart:297 | Page animation | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-28 | reader.dart:307 | Flash white on page turn | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-29 | reader.dart:318 | Sync white flash with WebDAV | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-30 | reader.dart:332 | Reading mode 6 options | `/settings/reading` | Select | DONE | E-03/E-04/E-12 |
| SET-31 | reader.dart:358 | Two-page spread | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-32 | reader.dart:374 | Auto page turning interval 1–20s | `/settings/reading` | Slider | DONE | E-03/E-04/E-12 |
| SET-33 | reader.dart:388 | Images per screen landscape/portrait 1–5 | `/settings/reading` | Select | DONE | E-03/E-04/E-12 |
| SET-34 | reader.dart:425 | Show single image on first page | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-35 | reader.dart:442 | Mouse scroll speed 0.5–3 | `/settings/reading` | Slider | DONE | BLOCKED | B-016 
| SET-36 | reader.dart:458 | Double tap to zoom | `/settings/reading` | Switch | DONE | BLOCKED | B-016 
| SET-37 | reader.dart:469 | Long press to zoom | `/settings/reading` | Switch | DONE | BLOCKED | B-016 
| SET-38 | reader.dart:480 | Long press zoom position | `/settings/reading` | Select | DONE | BLOCKED | B-016 
| SET-39 | reader.dart:494 | Limit image width | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-40 | reader.dart:505 | Turn page by volume keys | `/settings/reading` | Switch | DONE | BLOCKED | B-004 
| SET-41 | reader.dart:516 | Clock & battery info | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-42 | reader.dart:526 | Show system status bar | `/settings/reading` | Switch | DONE | BLOCKED | B-004 
| SET-43 | reader.dart:536 | Quick collect image gesture | `/settings/reading` | Select | DONE | E-03/E-04/E-12 |
| SET-44 | reader.dart:554 | Custom Image Processing + Edit | `/settings/reading/image-processing` | Code editor | DONE | BLOCKED | B-002 
| SET-45 | reader.dart:559 | Images preloaded 1–16 | `/settings/reading` | Slider | DONE | E-03/E-04/E-12 |
| SET-46 | reader.dart:569 | Show Page Number | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-47 | reader.dart:579 | Remove from Read Later when complete | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-48 | reader.dart:587 | Show Chapter Comments | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-49 | reader.dart:595 | Hide Duplicate Chapters | `/settings/reading` | Switch | DONE | E-03/E-04/E-12 |
| SET-50 | reader.dart:603 | Show Comments at Chapter End | `/settings/reading` | Switch | DONE | BLOCKED | B-015 
| SET-51 | reader.dart:758 | Image processing editor: enable, reset, code | `/settings/reading/image-processing` | Edit/save | DONE | BLOCKED | B-002 
| SET-52 | settings/appearance.dart:16 | Customize home | `/settings/home-layout` | Open | DONE | E-03/E-04/E-12 |
| SET-53 | appearance.dart:22 | Theme Mode System/Light/Dark | `/settings/appearance` | Select | DONE | E-03/E-04/E-12 |
| SET-54 | appearance.dart:34 | Theme Color 7 options | `/settings/appearance` | Select | DONE | E-03/E-04/E-12 |
| SET-55 | settings/local_favorites.dart:16 | Local favorites before network | `/settings/local-favorites` | Switch | DONE | E-03/E-04/E-12 |
| SET-56 | local_favorites.dart:20 | Auto close favorite panel | `/settings/local-favorites` | Switch | DONE | E-03/E-04/E-12 |
| SET-57 | local_favorites.dart:24 | Tap favorite folder name action | `/settings/local-favorites` | Select | DONE | BLOCKED | B-016 
| SET-58 | local_favorites.dart:32 | Add new favorite to Start/End | `/settings/local-favorites` | Select | DONE | E-03/E-04/E-12 |
| SET-59 | local_favorites.dart:40 | Move favorite after reading | `/settings/local-favorites` | Select | DONE | BLOCKED | B-016 
| SET-60 | local_favorites.dart:49 | Quick Favorite folder | `/settings/local-favorites` | Select | DONE | E-03/E-04/E-12 |
| SET-61 | local_favorites.dart:59 | Delete all unavailable local favorites | `/settings/local-favorites` | Action | DONE | E-03/E-04/E-12 |
| SET-62 | local_favorites.dart:79 | Click favorite Detail/Read | `/settings/local-favorites` | Select | DONE | E-03/E-04/E-12 |
| SET-63 | settings/app.dart:16 | Floating task button + Background tasks | `/settings/app` | Switch/open | DONE | E-03/E-04/E-12 |
| SET-64 | app.dart:27 | Storage path + Copy | `/settings/app` | Copy | DONE | BLOCKED | B-004 
| SET-65 | app.dart:39 | Set New Storage Path | `/settings/app` | Set/migrate | DONE | BLOCKED | B-004 
| SET-66 | app.dart:77 | Refresh local library | `/settings/app` | Scan | DONE | E-03/E-04/E-12 |
| SET-67 | app.dart:109 | Cache Size | `/settings/app` | Display | DONE | E-03/E-04/E-12 |
| SET-68 | cache_retention_setting.dart:17 | Keep unused cache (1/3/7/30/Never) | `/settings/app` | Select | DONE | BLOCKED | B-012 
| SET-69 | app.dart:120 | Clear Cache | `/settings/app` | Clear | DONE | E-03/E-04/E-12 |
| SET-70 | app.dart:144 | Cache Limit (MB) | `/settings/app` | Input | DONE | BLOCKED | B-012 
| SET-71 | app.dart:164 | Export App Data | `/settings/app/export` | Download backup | DONE | E-03/E-04/E-12 |
| SET-72 | app.dart:192 | Import App Data (.venera/.picadata) | `/settings/app/import` | Upload/restore | DONE | E-03/E-04/E-12 |
| SET-73 | app.dart:252 | Data Sync + Set | `/settings/webdav` | Open WebDAV | DONE | E-03/E-04/E-12 |
| SET-74 | app.dart:262 | Reading statistics + Open | `/statistics` | Open | DONE | E-03/E-04/E-12 |
| SET-75 | app.dart:267 | WebDAV config QR code | `/settings/webdav/qr` | Show QR | DONE | E-03/E-04/E-12 |
| SET-76 | app.dart:273 | Scan WebDAV QR | `/settings/webdav/scan` | Scan/import | DONE | BLOCKED | B-004 
| SET-77 | app.dart:278 | Language System/zh-CN/zh-TW/en-US | `/settings/app` | Select | DONE | E-03/E-04/E-12 |
| SET-78 | app.dart:292 | Traditional→Simplified conversion | `/settings/app` | Switch | DONE | BLOCKED | B-016 
| SET-79 | app.dart:299 | Authorization Required | `/settings/app` | Switch (web: password confirm) | DONE | BLOCKED | B-004 
| SET-80 | app.dart:327 | WebDAV QR dialog Copy/Close | `/settings/webdav/qr` | Copy | DONE | E-03/E-04/E-12 |
| SET-81 | app.dart:336 | Scan WebDAV QR page | `/settings/webdav/scan` | Apply config | DONE | BLOCKED | B-004 
| SET-82 | app.dart:765 | WebDAV popup: URL/user/password, QR, skip fields, auto sync, upload/download, save/continue | `/settings/webdav` | Test/save | DONE | E-03/E-04/E-12 |
| SET-83 | app.dart:593 | Logs page: filters, Clear, disable limit, Export, copy | `/settings/logs` | Filter/export | DONE | E-03/E-04/E-12 |
| SET-84 | settings/network.dart:16 | Proxy, DNS Overrides, Download Threads 1–16 | `/settings/network` | Open/slider | DONE | BLOCKED | B-009 
| SET-85 | network.dart:110 | Proxy Direct/System/Manual | `/settings/network/proxy` | Radio | DONE | BLOCKED | B-009 
| SET-86 | network.dart:149 | Host/Port/User/Password + Save | `/settings/network/proxy` | Validate/save | DONE | BLOCKED | B-009 
| SET-87 | network.dart:271 | DNS overrides enable/SNI/Add | `/settings/network/dns` | Toggle/add | DONE | BLOCKED | B-009 
| SET-88 | network.dart:309 | Domain/IP rows + delete | `/settings/network/dns` | Edit/delete | DONE | BLOCKED | B-009 
| SET-89 | settings/about.dart:16 | Icon, version, description | `/settings/about` | Display | DONE | E-03/E-04/E-12 |
| SET-90 | about.dart:46 | Check for updates / View update / Checking | `/settings/about` | Check | DONE | BLOCKED | B-005 
| SET-91 | about.dart:73 | Check updates on startup | `/settings/about` | Switch | DONE | E-03/E-04/E-12 |
| SET-92 | about.dart:77 | GitHub link | external | Open | DONE | E-03/E-04/E-12 |
| SET-93 | about.dart:84 | Telegram link | external | Open | DONE | E-03/E-04/E-12 |
| SET-94 | app_update_dialog.dart:76 | Update dialog: release notes, Cancel, Update/Open page | dialog | Update | DONE | BLOCKED | B-005 
| SET-95 | settings/debug.dart:20 | Reload Configs | `/settings/debug` | Reload sources | DONE | E-03/E-04/E-12 |
| SET-96 | debug.dart:27 | Open Log | `/settings/logs` | Open | DONE | E-03/E-04/E-12 |
| SET-97 | debug.dart:34 | Ignore Certificate Errors | `/settings/debug` | Switch | DONE | BLOCKED | B-009 
| SET-98 | debug.dart:38 | JS Evaluator + Run + Result | `/settings/debug` | Execute JS | DONE | E-03/E-04/E-12 |
| SRC-01 | comic_source_page.dart:564 | Reorder, Sort by name | `/sources` | Reorder/sort | DONE | E-03/E-04/E-12 |
| SRC-02 | comic_source_page.dart:601 | Reorder sources dialog | `/sources/reorder` | Drag/confirm | DONE | E-03/E-04/E-12 |
| SRC-03 | comic_source_page.dart:648 | Delete source (confirm) | `/sources` | Delete | DONE | E-03/E-04/E-12 |
| SRC-04 | comic_source_page.dart:665 | Edit source (JS editor) | `/sources/:key/edit` | Edit/save | DONE | E-03/E-04/E-12 |
| SRC-05 | comic_source_page.dart:701 | Update source | `/sources/:key/update` | Download/replace | DONE | E-03/E-04/E-12 |
| SRC-06 | comic_source_page.dart:705 | Add card: URL, libraries, config file, help, check updates, update all, manual binding, auto-update | `/sources/add` | All actions | DONE | E-03/E-04/E-12 |
| SRC-07 | comic_source_page.dart:805 | Use a config file | `/sources/import` | Upload .js | DONE | E-03/E-04/E-12 |
| SRC-08 | comic_source_page.dart:825 | URL submit | `/sources/add` | Fetch/parse | DONE | E-03/E-04/E-12 |
| SRC-09 | comic_source_page.dart:972 | Source libraries list: drag, menu Enable/Disable/Edit/Delete, Add | `/sources/libraries` | CRUD | DONE | E-03/E-04/E-12 |
| SRC-10 | comic_source_page.dart:1195 | Library catalog entries Add/Switch/check | `/sources/libraries/:id` | Install | DONE | E-03/E-04/E-12 |
| SRC-11 | comic_source_page.dart:1452 | Updates dialog + Update all | `/sources/updates` | Batch update | DONE | E-03/E-04/E-12 |
| SRC-12 | comic_source_page.dart:1497 | Check updates / Checking | `/sources/check` | Check | DONE | BLOCKED | B-011 
| SRC-13 | comic_source_page.dart:1581 | Source row: name/version/new version/update states/provenance/Edit/Update/Delete | `/sources` | Actions | DONE | E-03/E-04/E-12 |
| SRC-14 | comic_source_page.dart:1765 | Source settings: select/switch/input/callback | `/sources/:key/settings` | Save | DONE | E-03/E-04/E-12 |
| SRC-15 | comic_source_page.dart:1867 | Account: Log in, info, Re-login, Log out | `/sources/:key/account` | Login/logout | DONE | E-03/E-04/E-12 |
| SRC-16 | comic_source_page.dart:1942 | Login form user/password or cookie fields, Continue, WebView, Create Account | `/sources/:key/login` | Login | DONE | BLOCKED | B-003 
| SRC-17 | source_binding_page.dart:20 | Manual binding: select library, bind variant | `/sources/bind` | Bind | DONE | E-03/E-04/E-12 |
| SRC-18 | source_check.dart:5 | Check readability: optional comic id, stages, sample image, retry/background | `/sources/:key/check` | Check | DONE | E-03/E-04/E-12 |
| TOOL-01 | toolbox.dart:57 | Image search (Search by Image Bot, SauceNAO) | `/toolbox` | Open webview | DONE | E-03/E-04/E-12 |
| TOOL-02 | toolbox.dart:100 | Comic-link interception | `/toolbox` | Open matching comic | DONE | E-03/E-04/E-12 |
| AUTH-01 | auth_page.dart:29 | Authentication Required lock screen | `/auth` | Confirm password | DONE | BLOCKED | B-004 
| WEB-01 | webview.dart:130 | WebView menu: Open in browser, Copy link, Reload | `/webview?url=` | Controls | DONE | BLOCKED | B-004 
| STA-01 | reading_statistics_page.dart:99 | Clear all statistics | `/statistics` | Confirm/clear | DONE | E-03/E-04/E-12 |
| STA-02 | reading_statistics_page.dart:125 | Record reading statistics toggle | `/statistics` | Toggle | DONE | E-03/E-04/E-12 |
| STA-03 | reading_statistics_page.dart:149 | Today/7 days/Total cards | `/statistics` | Display | DONE | E-03/E-04/E-12 |
| STA-04 | reading_statistics_page.dart:181 | Last 7 days / trend chart | `/statistics` | Chart | DONE | E-03/E-04/E-12 |
| STA-05 | reading_statistics_page.dart:252 | Recent comics + sort Recent/Duration/Name | `/statistics` | Sort | DONE | E-03/E-04/E-12 |
| STA-06 | reading_statistics_page.dart:285 | Comic rows duration + delete | `/statistics` | Delete | DONE | E-03/E-04/E-12 |
| IMG-01 | image_favorites_page.dart:186 | Bar: Search, Sort/Filter, Multi-Select | `/image-favorites` | Actions | DONE | E-03/E-04/E-12 |
| IMG-02 | image_favorites_page.dart:135 | Select All, Deselect, Delete | `/image-favorites` | Batch delete | DONE | E-03/E-04/E-12 |
| IMG-03 | image_favorites_page.dart:356 | Sort/Filter dialog: sort, time filter, custom dates, count threshold | `/image-favorites?sort=&filter=` | Apply | DONE | E-03/E-04/E-12 |
| IMG-04 | image_favorites_item.dart:108 | Comic card tap/long-press: Details, Copy Title, Select All, Photo View | `/image-favorites` | Actions | DONE | E-03/E-04/E-12 |
| IMG-05 | image_favorites_item.dart:152 | Image strip tap reader, long press photo view, multi-select | `/reader/...` | Open/select | DONE | E-03/E-04/E-12 |
| IMG-06 | image_favorites_photo_view.dart:77 | Photo view: swipe, tap bar, Close, Save Image, Read | `/image-favorites/photo` | Actions | DONE | E-03/E-04/E-12 |
| IMG-07 | home_page.dart:1241 | Tags/Authors/Comics chart tabs | `/image-favorites` | Switch | DONE | E-03/E-04/E-12 |
| RD-01 | reader/reader.dart:410 | Reader shell: scaffold, gestures, images, flash overlay | `/reader/:source/:id` | Render | DONE | E-03/E-04/E-12 |
| RD-02 | reader.dart:446 | F12 fullscreen + arrow keys | reader | Keyboard | DONE | E-03/E-04/E-12 |
| RD-03 | reader/scaffold.dart:229 | Top/bottom bars slide; center tap toggles | reader | Toggle controls | DONE | E-03/E-04/E-12 |
| RD-04 | scaffold.dart:256 | Top bar: Back, title/chapter, Chapter Comments, Settings | reader | Actions | DONE | E-03/E-04/E-12 |
| RD-05 | scaffold.dart:469 | Bottom bar: margin, prev/next, collect, fullscreen, rotation, auto turn, chapters, save, share | reader | All controls | DONE | E-03/E-04/E-12 |
| RD-06 | scaffold.dart:611 | First/last page, page indicator, slider | reader | Navigate | DONE | E-03/E-04/E-12 |
| RD-07 | scaffold.dart:726 | Inline margin switch + slider | reader | Adjust | DONE | E-03/E-04/E-12 |
| RD-08 | scaffold.dart:796 | Page number + clock overlay | reader | Display | DONE | E-03/E-04/E-12 |
| RD-09 | scaffold.dart:842 | Chapter drawer normal/grouped | reader | Open/jump | DONE | E-03/E-04/E-12 |
| RD-10 | scaffold.dart:851 | Save Image / Share current image | reader | Save/share | DONE | E-03/E-04/E-12 |
| RD-11 | scaffold.dart:877 | Reader settings sidebar | reader | Live settings | DONE | E-03/E-04/E-12 |
| RD-12 | scaffold.dart:977 | Floating prev/next chapter at edges | reader | Chapter change | DONE | E-03/E-04/E-12 |
| RD-13 | scaffold.dart:1049 | Select image overlay | reader | Select image | DONE | E-03/E-04/E-12 |
| RD-14 | reader/gesture.dart:158 | Tap zones: edge turn, center toggle | reader | Tap | DONE | E-03/E-04/E-12 |
| RD-15 | gesture.dart:127 | Mouse wheel page turn | reader | Wheel | DONE | E-03/E-04/E-12 |
| RD-16 | gesture.dart:269 | Right-click menu: Settings, Chapters, Fullscreen, Exit, Copy, Save | reader | Context menu | DONE | E-03/E-04/E-12 |
| RD-17 | gesture.dart:318 | Long-press zoom down/up | reader | Long press | DONE | E-03/E-04/E-12 |
| RD-18 | gesture.dart:326 | Swipe quick-collect | reader | Swipe | DONE | E-03/E-04/E-12 |
| RD-19 | reader/images.dart:548 | Double tap collect/zoom | reader | Double tap | DONE | E-03/E-04/E-12 |
| RD-20 | images.dart:557 | Long-press zoom anchor | reader | Long press | DONE | E-03/E-04/E-12 |
| RD-21 | images.dart:600 | Arrow keys gallery navigation + repeat acceleration | reader | Keyboard | DONE | E-03/E-04/E-12 |
| RD-22 | images.dart:1449 | Arrow keys continuous scroll 25% | reader | Keyboard | DONE | E-03/E-04/E-12 |
| RD-23 | images.dart:1290 | Overscroll chapter boundary + floating button | reader | Pull/swipe | DONE | E-03/E-04/E-12 |
| RD-24 | images.dart:1641 | Swipe chapter hints | reader | Hints | DONE | E-03/E-04/E-12 |
| RD-25 | images.dart:115 | Loading spinner, error retry, tap toggles controls | reader | States | DONE | E-03/E-04/E-12 |
| RD-26 | reader/comic_image.dart:313 | Per-image error + Retry | reader | Retry | DONE | E-03/E-04/E-12 |
| RD-27 | reader/chapters.dart:49 | Normal chapter list, current highlight, downloaded icon | reader drawer | Jump | DONE | E-03/E-04/E-12 |
| RD-28 | chapters.dart:158 | Grouped chapters + tabs | reader drawer | Jump | DONE | E-03/E-04/E-12 |
| RD-29 | reader/chapter_comments.dart:90 | Chapter comments list + input + send | reader comments | Load/post | DONE | E-03/E-04/E-12 |
| RD-30 | chapter_comments.dart:359 | Vote/Like/Reply | reader comments | Interactions | DONE | E-03/E-04/E-12 |
| RD-31 | chapter_comments.dart:589 | End-of-chapter comments page, Exit, masonry, input, empty | reader end page | Render/post | DONE | E-03/E-04/E-12 |
| RD-32 | reader/loading.dart:24 | Resolve source/local comic and open reader | `/reader/...` | Deep link | DONE | E-03/E-04/E-12 |
| RD-33 | reader.dart:257 | Apply mode/page/chapter/group/status/volume/cache | reader | Init | DONE | BLOCKED | B-004 
| RD-34 | reader.dart:463 | White flash on page turn | reader | Flash | DONE | E-03/E-04/E-12 |
| RD-35 | reader.dart:498 | History update debounced 1s | reader | Save progress | DONE | E-03/E-04/E-12 |
| RD-36 | reader.dart:379 | Reading statistics session + auto-remove read later | reader | Record/remove | DONE | E-03/E-04/E-12 |
| RD-37 | reader.dart:936 | Auto page turn timer | reader | Timer | DONE | E-03/E-04/E-12 |
| RD-38 | reader.dart:970 | Fullscreen toggle | reader | Fullscreen | DONE | E-03/E-04/E-12 |
| GEN-01 | components/message.dart:3 | Toast/snackbar | global | Show toast | DONE | E-03/E-04/E-12 |
| GEN-02 | message.dart:127 | Message dialog OK | global | Alert | DONE | E-03/E-04/E-12 |
| GEN-03 | message.dart:138 | Confirm dialog | global | Confirm | DONE | E-03/E-04/E-12 |
| GEN-04 | message.dart:258 | Loading dialog with progress/background/cancel | global | Progress | DONE | E-03/E-04/E-12 |
| GEN-05 | message.dart:334 | Content dialog shell | global | Dialog | DONE | E-03/E-04/E-12 |
| GEN-06 | message.dart:413 | Input dialog with validation | global | Input | DONE | E-03/E-04/E-12 |
| GEN-07 | message.dart:492 | Info dialog | global | Info | DONE | E-03/E-04/E-12 |
| GEN-08 | message.dart:512 | Select dialog | global | Select | DONE | E-03/E-04/E-12 |
| GEN-09 | components/loading.dart:3 | NetworkError with retry/verify/export logs | global | Error state | DONE | E-03/E-04/E-12 |
| GEN-10 | loading.dart:125 | LoadingState spinner/retry/error | global | Loading | DONE | E-03/E-04/E-12 |
| GEN-11 | loading.dart:231 | MultiPageLoadingState infinite scroll | global | Paging | DONE | E-03/E-04/E-12 |
| GEN-12 | loading.dart:358 | Five-dot loading animation | global | Loading | DONE | E-03/E-04/E-12 |
| GEN-13 | background_tasks.dart:67 | Task dialog: status/progress/errors/copy/cancel/close | `/tasks` | Task detail | DONE | E-03/E-04/E-12 |
| GEN-14 | background_tasks.dart:189 | Task sheet + clear finished + empty state | `/tasks` | List | DONE | E-03/E-04/E-12 |
| GEN-15 | background_tasks.dart:37 | Task status text (never/last completed/failed/cancelled/running) | global | Status | DONE | E-03/E-04/E-12 |
| GEN-16 | background_tasks.dart:299 | Floating task badge + count + pulse | global | Open tasks | DONE | E-03/E-04/E-12 |
| GEN-17 | components/comic.dart:93 | Comic context menu: Details, Copy Title, Add favorite, Read later, Block | global | Menu | DONE | E-03/E-04/E-12 |
| GEN-18 | comic.dart:460 | Block dialog with title/author/tags chips | global | Block | DONE | E-03/E-04/E-12 |
| GEN-19 | comic.dart:1079 | Page selector Back/Page X of Y/Jump/Next | lists | Pagination | DONE | E-03/E-04/E-12 |
| GEN-20 | comic.dart:1293 | Continuous list infinite scroll + Retry | lists | Load more | DONE | E-03/E-04/E-12 |
| GEN-21 | comic.dart:159 | Favorite/progress badges | tiles | Display | DONE | E-03/E-04/E-12 |
| GEN-22 | chapter_order_button.dart:6 | Chapter display/reading order menus | details/reader | Select | DONE | E-03/E-04/E-12 |
| GEN-23 | utils/chapter_order.dart:5 | 4 display orders | details | Sort | DONE | E-03/E-04/E-12 |
| GEN-24 | chapter_navigation.dart:7 | 3 reading orders | details/reader | Select | DONE | E-03/E-04/E-12 |
| GEN-25 | utils/data.dart:32 | Export App Data zip with manifest | `/settings/app/export` | Export | DONE | E-03/E-04/E-12 |
| GEN-26 | data.dart:159 | Import App Data validate/restore | `/settings/app/import` | Import | DONE | E-03/E-04/E-12 |
| GEN-27 | data.dart:416 | Import PicaData | `/settings/app/import` | Import | DONE | BLOCKED | B-006 
| GEN-28 | data_sync.dart:201 | WebDAV upload/download newest/auto sync/10 backups | `/sync` | Sync | DONE | E-03/E-04/E-12 |
| GEN-29 | import_comic.dart:62 | Six local import methods | `/local/import` | Import | DONE | BLOCKED | B-004 
| GEN-30 | restore_files.dart:7 | Atomic restore/rollback | internal | Restore | DONE | E-03/E-04/E-12 |
| GEN-31 | cbz.dart:141 | CBZ/ZIP/7Z import, CBZ export with ComicInfo.xml | `/local/import`, export | Import/export | DONE | BLOCKED | B-008 
| GEN-32 | epub.dart:10 | EPUB export | export | Export | DONE | E-03/E-04/E-12 |
| GEN-33 | pdf.dart:142 | PDF export | export | Export | DONE | E-03/E-04/E-12 |
| GEN-34 | random_comic_picker.dart:9 | Random picker filters | `/random` | Pick | DONE | E-03/E-04/E-12 |
| GEN-35 | reading_statistics.dart:63 | Recording toggle, daily aggregation, 30 days, delete | `/statistics` | Backend | DONE | E-03/E-04/E-12 |
| GEN-36 | read_later.dart:198 | Read later add/remove/search/restore/clear | `/read-later` | Backend | DONE | E-03/E-04/E-12 |
| GEN-37 | favorites.dart:70 | Folder CRUD/membership/order/link/import/export/update | `/favorites` | Backend | DONE | E-03/E-04/E-12 |
| GEN-38 | history.dart:40 | History CRUD/refresh/clear unfavorited | `/history` | Backend | DONE | E-03/E-04/E-12 |
| GEN-39 | local.dart:26 | Local library model/tasks/path/refresh/delete/search | `/local` | Backend | DONE | E-03/E-04/E-12 |
| GEN-40 | image_favorites.dart:3 | Image favorite model/search/sort/filter/delete | `/image-favorites` | Backend | DONE | E-03/E-04/E-12 |
| GEN-41 | follow_updates.dart:1 | Update folder scan/baseline/mark read | `/follow-updates` | Backend | DONE | E-03/E-04/E-12 |
| GEN-42 | appdata.dart:422 | All persisted settings keys/defaults | `/settings` | Backend | DONE | E-03/E-04/E-12 |
| GEN-43 | utils/app_links.dart:6 | Deep link URL → comic | `/comic/...` | Link handler | DONE | E-03/E-04/E-12 |
| NEW-01 | task §4.4 | First-run initialization page (admin account) | `/init` | Create admin | DONE | E-03/E-04/E-12 |
| NEW-02 | task §4.4 | Login/logout/me | `/login` | Session | DONE | E-03/E-04/E-12 |
| NEW-03 | task §4.4 | Admin user management (create/list/disable/delete) | `/admin/users` | CRUD | DONE | E-03/E-04/E-12 |
| NEW-04 | task §4.4 | Per-user isolation of every resource | server | 404 on cross-user | DONE | E-03/E-04/E-12 |
| NEW-05 | task §5.3 | Server-side upload (chunked/resumable) | `/local/upload` | Upload | DONE | E-03/E-04/E-12 |
| NEW-06 | task §5.3 | Browser download single/multi chapter zip | `/downloads` | Download | DONE | E-03/E-04/E-12 |
| NEW-07 | task §11 | Health endpoint | `/api/health` | Status | DONE | E-03/E-04/E-12 |
| NEW-08 | task §11 | Structured JSON logs + audit log | `/settings/logs` | View | DONE | E-03/E-04/E-12 |
