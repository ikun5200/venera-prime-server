# Database Schema

SQLite 3, WAL mode, `foreign_keys=ON`, `busy_timeout=5000`. File:
`$DB_PATH` (default `data/venera.db`). All timestamps are Unix milliseconds
unless stated otherwise. Every user-owned row carries `user_id` and is deleted
with `ON DELETE CASCADE` when the user is removed.

Migrations are ordered SQL scripts applied in a transaction; the applied
version is stored in `PRAGMA user_version`. Migration 1 creates the schema
below. New migrations are append-only and never edit earlier files.

## Tables

### users
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| username | TEXT NOT NULL UNIQUE | case-sensitive, 1–64 chars |
| password_hash | TEXT NOT NULL | Argon2id encoded string |
| role | TEXT NOT NULL | `admin` \| `user` |
| created_at | INTEGER NOT NULL | |
| disabled | INTEGER NOT NULL DEFAULT 0 | 1 blocks login and invalidates sessions |

Index: `UNIQUE(username)`.

### sessions
| Column | Type | Notes |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| user_id | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | |
| token_hash | TEXT NOT NULL UNIQUE | SHA-256 hex of the cookie token |
| created_at | INTEGER NOT NULL | |
| expires_at | INTEGER NOT NULL | sliding 30 days |
| last_seen_at | INTEGER NOT NULL | |
| user_agent | TEXT | |
| ip | TEXT | |

Indexes: `UNIQUE(token_hash)`, `(user_id)`, `(expires_at)`.

### settings
`(user_id, key)` PK, `value_json TEXT NOT NULL`, `updated_at`. Stores every
per-user setting from the original `appdata.json` (see
`docs/feature-matrix.md` settings rows). Defaults live in
`lib/util/settings_defaults.dart`; missing keys fall back to defaults.

### search_history
`(user_id, keyword)` PK, `created_at`. Max 50 entries, newest first.

### sources
| Column | Type | Notes |
|---|---|---|
| user_id | INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE | |
| source_key | TEXT NOT NULL | `^[A-Za-z0-9_]+$`, unique per user |
| name, version, url, min_app_version | TEXT | parsed metadata |
| script | TEXT NOT NULL | original JS |
| data_json | TEXT NOT NULL DEFAULT '{}' | account/settings/arbitrary source data |
| settings_json | TEXT NOT NULL DEFAULT '{}' | settings descriptors |
| translation_json | TEXT NOT NULL DEFAULT '{}' | |
| capabilities_json | TEXT NOT NULL DEFAULT '{}' | presence flags for optional APIs |
| enabled | INTEGER NOT NULL DEFAULT 1 | |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |
| created_at, updated_at | INTEGER NOT NULL | |

PK `(user_id, source_key)`. Index `(user_id, sort_order)`.

### source_libraries
`(user_id, library_id)` PK, `name`, `url`, `enabled`, `priority`,
`last_checked`. Provenance table: `(user_id, source_key)` PK,
`library_ids_json`, `origin_id`, `update_library_id`, `source_file_name`.

### cookies
`(user_id, name, domain, path)` PK, `value`, `expires` (nullable),
`secure`, `http_only`, `host_only`. Index `(user_id, domain)`. Never returned
by any API.

### favorite_folders
`id INTEGER PK`, `user_id`, `name`, `sort_order`, `source_key` (nullable link),
`source_folder` (nullable), `created_at`. `UNIQUE(user_id, name)`.

### favorites
PK `(folder_id, comic_id, comic_type)`, `user_id`, `name`, `author`,
`tags_json`, `translated_tags_json`, `cover_path`, `description` (snapshot for
instant list rendering, migration 4), `favorited_at` (TEXT
`YYYY-MM-DD HH:MM:SS`), `display_order` (signed), `last_update_time`,
`has_new_update`, `last_check_time`, `last_attempt_time`,
`last_update_chapters_json`. Indexes `(user_id, folder_id, display_order)`,
`(user_id, comic_id, comic_type)`, `(user_id, has_new_update)`.

### history
PK `(user_id, comic_id, comic_type)`, `title`, `subtitle`, `cover`,
`last_read_at`, `ep` (1-based), `page` (1-based), `chapter_group` (nullable),
`read_episode_json`, `max_page`. Index `(user_id, last_read_at DESC)`.

### read_later
PK `(user_id, comic_id, comic_type)`, `source_key`, `title`, `subtitle`,
`description`, `tags_json`, `cover`, `added_at`. Index `(user_id, added_at)`.

### image_favorites
PK `(user_id, comic_id, source_key)`, `title`, `sub_title`, `author`,
`tags_json`, `translated_tags_json`, `favorited_at`, `max_page`, `other_json`.
Child tables:
- `image_favorite_chapters(user_id, comic_id, source_key, eid, ep, ep_name,
  max_page)` PK `(user_id, comic_id, source_key, eid)`.
- `image_favorite_pages(user_id, comic_id, source_key, eid, page, image_key,
  is_auto_favorite)` PK `(..., eid, page)`.

### reading_statistics
PK `(user_id, day, comic_id, comic_type)`, `title`, `author`, `cover`,
`duration_seconds`, `last_read_at`. `day` is `YYYY-MM-DD` local. Index
`(user_id, day)`.

### local_comics
`id INTEGER PK AUTOINCREMENT`, `user_id`, `title`, `subtitle`, `description`,
`tags_json`, `directory` (relative to the user's library root), `chapters_json`
(map or grouped map), `cover` (relative path), `comic_type` (0 local, 1
uploaded/imported, or source hash), `downloaded_chapters_json`, `created_at`,
`managed_by_app`, `source_key`, `comic_id_ext`. Index `(user_id, created_at)`,
`(user_id, title)`. `UNIQUE(user_id, comic_type, comic_id_ext)`.

### download_jobs
`id TEXT PK` (UUID), `user_id`, `kind` (`images` \| `archive`), `source_key`,
`comic_id`, `comic_type`, `title`, `cover`, `state`
(`queued|running|paused|error|completed|cancelled`), `progress`, `total`,
`payload_json`, `error`, `created_at`, `updated_at`. Index
`(user_id, state, created_at)`. `download_chapters` and `download_pages` child
tables track per-chapter/per-page status (PKs include `user_id`).

### uploads
`id TEXT PK`, `user_id`, `name`, `path` (relative), `size`, `mime`,
`created_at`. Used for resumable chunked uploads; `path` is always inside
`data/users/<userId>/uploads`.

### webdav_config
`user_id PK`, `url`, `username`, `password_enc` (AES-256-GCM with
`SESSION_SECRET`-derived key), `path`, `auto_sync`, `data_version`,
`last_backup_name`, `last_backup_identity`, `updated_at`.

### follow_update_config
`user_id PK`, `folder_id` (nullable), `check_on_start`, `interval_hours`,
`fixed_time` (`''` or `HH:mm`).

### comic_preferences
PK `(user_id, comic_id, source_key)`, `chapter_order`,
`chapter_reading_order`, `orientation_mode`, `detected_reading_order`.

### audit_logs
`id INTEGER PK`, `user_id`, `action`, `detail_json`, `ip`, `created_at`.
Actions: `init`, `login`, `login_failed`, `logout`, `user_create`,
`user_update`, `user_delete`, `source_import`, `source_delete`,
`webdav_upload`, `webdav_download`, `backup_export`, `backup_import`.

### request_logs
`id INTEGER PK`, `ts`, `level`, `request_id`, `user_id`, `route`, `method`,
`status`, `duration_ms`, `message`. Index `(ts)`. Retention 7 days.

## Argon2id parameters

`m = 65536 KiB`, `t = 3`, `p = 2`, salt 16 bytes, output 32 bytes, encoded
PHC string stored. Verified with the same library; rehash on login if
parameters change.

## Session token

32 random bytes from `Random.secure()`, base64url. Cookie value is the raw
token; DB stores `sha256(token)` hex. Session lookup by hash. Sliding renewal
when remaining lifetime < 25 days.

## Deletion semantics

- Deleting a user cascades every table above and removes
  `data/users/<id>/` recursively.
- Deleting a local comic removes its directory only when `managed_by_app=1`
  and the path stays inside the user's root.
- Deleting a source removes its data and cookies for that source's domains are
  left intact (matching the original, which keeps the global cookie jar).
