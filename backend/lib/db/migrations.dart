/// Ordered schema migrations. Version is stored in `PRAGMA user_version`.
library;

const List<String> migrations = [
  // 1 — initial schema
  '''
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  created_at INTEGER NOT NULL,
  disabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  user_agent TEXT,
  ip TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE settings (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);

CREATE TABLE search_history (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, keyword)
);
CREATE INDEX idx_search_history_time ON search_history(user_id, created_at DESC);

CREATE TABLE sources (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  min_app_version TEXT NOT NULL DEFAULT '',
  script TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  translation_json TEXT NOT NULL DEFAULT '{}',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_key)
);
CREATE INDEX idx_sources_order ON sources(user_id, sort_order);

CREATE TABLE source_libraries (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  library_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  last_checked INTEGER,
  PRIMARY KEY (user_id, library_id)
);

CREATE TABLE source_provenance (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  library_ids_json TEXT NOT NULL DEFAULT '[]',
  origin_id TEXT,
  update_library_id TEXT,
  source_file_name TEXT,
  PRIMARY KEY (user_id, source_key)
);

CREATE TABLE cookies (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  domain TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  expires INTEGER,
  secure INTEGER NOT NULL DEFAULT 0,
  http_only INTEGER NOT NULL DEFAULT 0,
  host_only INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, name, domain, path)
);
CREATE INDEX idx_cookies_domain ON cookies(user_id, domain);

CREATE TABLE favorite_folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  source_key TEXT,
  source_folder TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, name)
);
CREATE INDEX idx_favorite_folders_order ON favorite_folders(user_id, sort_order);

CREATE TABLE favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id INTEGER NOT NULL REFERENCES favorite_folders(id) ON DELETE CASCADE,
  comic_id TEXT NOT NULL,
  comic_type INTEGER NOT NULL,
  name TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  translated_tags_json TEXT NOT NULL DEFAULT '[]',
  cover_path TEXT NOT NULL DEFAULT '',
  favorited_at TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  last_update_time TEXT,
  has_new_update INTEGER NOT NULL DEFAULT 0,
  last_check_time INTEGER,
  last_attempt_time INTEGER,
  last_update_chapters_json TEXT,
  PRIMARY KEY (folder_id, comic_id, comic_type)
);
CREATE INDEX idx_favorites_order ON favorites(user_id, folder_id, display_order);
CREATE INDEX idx_favorites_identity ON favorites(user_id, comic_id, comic_type);
CREATE INDEX idx_favorites_updates ON favorites(user_id, has_new_update);

CREATE TABLE history (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id TEXT NOT NULL,
  comic_type INTEGER NOT NULL,
  source_key TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  last_read_at INTEGER NOT NULL,
  ep INTEGER NOT NULL DEFAULT 1,
  page INTEGER NOT NULL DEFAULT 1,
  chapter_group INTEGER,
  read_episode_json TEXT NOT NULL DEFAULT '[]',
  max_page INTEGER,
  PRIMARY KEY (user_id, comic_id, comic_type)
);
CREATE INDEX idx_history_time ON history(user_id, last_read_at DESC);

CREATE TABLE read_later (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id TEXT NOT NULL,
  comic_type INTEGER NOT NULL,
  source_key TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  cover TEXT NOT NULL DEFAULT '',
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, comic_id, comic_type)
);
CREATE INDEX idx_read_later_added ON read_later(user_id, added_at DESC);

CREATE TABLE image_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  title TEXT NOT NULL,
  sub_title TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  translated_tags_json TEXT NOT NULL DEFAULT '[]',
  favorited_at INTEGER NOT NULL,
  max_page INTEGER NOT NULL DEFAULT 0,
  other_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (user_id, comic_id, source_key)
);
CREATE TABLE image_favorite_chapters (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  eid TEXT NOT NULL,
  ep INTEGER NOT NULL,
  ep_name TEXT NOT NULL DEFAULT '',
  max_page INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, comic_id, source_key, eid)
);
CREATE TABLE image_favorite_pages (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  eid TEXT NOT NULL,
  page INTEGER NOT NULL,
  image_key TEXT NOT NULL,
  is_auto_favorite INTEGER,
  PRIMARY KEY (user_id, comic_id, source_key, eid, page)
);

CREATE TABLE reading_statistics (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  comic_id TEXT NOT NULL,
  comic_type INTEGER NOT NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  cover TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  last_read_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, day, comic_id, comic_type)
);
CREATE INDEX idx_statistics_day ON reading_statistics(user_id, day);

CREATE TABLE local_comics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  directory TEXT NOT NULL,
  chapters_json TEXT NOT NULL DEFAULT '{}',
  cover TEXT NOT NULL DEFAULT '',
  comic_type INTEGER NOT NULL DEFAULT 1,
  downloaded_chapters_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  managed_by_app INTEGER NOT NULL DEFAULT 1,
  source_key TEXT,
  comic_id_ext TEXT,
  UNIQUE (user_id, comic_type, comic_id_ext)
);
CREATE INDEX idx_local_created ON local_comics(user_id, created_at DESC);
CREATE INDEX idx_local_title ON local_comics(user_id, title);

CREATE TABLE download_jobs (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'images',
  source_key TEXT NOT NULL,
  comic_id TEXT NOT NULL,
  comic_type INTEGER NOT NULL,
  title TEXT NOT NULL,
  cover TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'queued',
  progress REAL NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT NOT NULL DEFAULT '{}',
  error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_download_jobs_state ON download_jobs(user_id, state, created_at);

CREATE TABLE download_chapters (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES download_jobs(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  chapter_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  total_pages INTEGER NOT NULL DEFAULT 0,
  downloaded_pages INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, chapter_id)
);

CREATE TABLE download_pages (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id TEXT NOT NULL REFERENCES download_jobs(id) ON DELETE CASCADE,
  chapter_id TEXT NOT NULL,
  page_index INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  PRIMARY KEY (job_id, chapter_id, page_index)
);

CREATE TABLE uploads (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  mime TEXT NOT NULL DEFAULT '',
  received INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_uploads_user ON uploads(user_id, created_at);

CREATE TABLE webdav_config (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL DEFAULT '',
  username TEXT NOT NULL DEFAULT '',
  password_enc TEXT,
  path TEXT NOT NULL DEFAULT '/',
  auto_sync INTEGER NOT NULL DEFAULT 0,
  data_version INTEGER NOT NULL DEFAULT 0,
  last_backup_name TEXT,
  last_backup_identity TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE follow_update_config (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  folder_id INTEGER REFERENCES favorite_folders(id) ON DELETE SET NULL,
  check_on_start INTEGER NOT NULL DEFAULT 1,
  interval_hours INTEGER NOT NULL DEFAULT 24,
  fixed_time TEXT NOT NULL DEFAULT ''
);

CREATE TABLE comic_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comic_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  chapter_order TEXT,
  chapter_reading_order TEXT,
  orientation_mode TEXT,
  detected_reading_order INTEGER,
  PRIMARY KEY (user_id, comic_id, source_key)
);

CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_audit_time ON audit_logs(created_at DESC);

CREATE TABLE request_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  level TEXT NOT NULL,
  request_id TEXT,
  user_id INTEGER,
  route TEXT,
  method TEXT,
  status INTEGER,
  duration_ms INTEGER,
  message TEXT
);
CREATE INDEX idx_request_logs_ts ON request_logs(ts DESC);
''',
  // 2 — statistics source key for navigation
  '''
ALTER TABLE reading_statistics ADD COLUMN source_key TEXT NOT NULL DEFAULT '';
''',
  // 3 — scheduled follow-up check recorder
  '''
ALTER TABLE follow_update_config ADD COLUMN updated_at INTEGER;
''',
  // 4 — favorite description snapshot for fast list rendering
  '''
ALTER TABLE favorites ADD COLUMN description TEXT NOT NULL DEFAULT '';
''',
  // 5 — persistent source metadata cache and image cache index
  '''
CREATE TABLE content_cache (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_key, kind, cache_key)
);
CREATE INDEX idx_content_cache_expiry ON content_cache(expires_at);
CREATE INDEX idx_content_cache_scope
  ON content_cache(user_id, source_key, kind, scope);
CREATE INDEX idx_content_cache_created ON content_cache(user_id, created_at);

CREATE TABLE image_cache (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cache_key TEXT NOT NULL,
  source_key TEXT NOT NULL DEFAULT '',
  comic_id TEXT NOT NULL DEFAULT '',
  ep_id TEXT NOT NULL DEFAULT '',
  image_key TEXT NOT NULL DEFAULT '',
  mime TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  accessed_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, cache_key)
);
CREATE INDEX idx_image_cache_comic
  ON image_cache(user_id, source_key, comic_id, ep_id);
CREATE INDEX idx_image_cache_source ON image_cache(user_id, source_key);
''',
  // 6 — durable download queue order, update strategy, user permissions,
  //     API tokens and backup scheduling metadata
  '''
ALTER TABLE download_jobs ADD COLUMN queue_order INTEGER NOT NULL DEFAULT 0;
UPDATE download_jobs SET queue_order = created_at WHERE queue_order = 0;

ALTER TABLE favorites ADD COLUMN update_strategy TEXT NOT NULL DEFAULT 'always';

ALTER TABLE users ADD COLUMN permissions_json TEXT NOT NULL
  DEFAULT '["download","manage_sources","clear_cache","nsfw"]';

ALTER TABLE webdav_config ADD COLUMN last_auto_backup_at INTEGER;

CREATE TABLE api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at INTEGER
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);
''',
  // 7 — NSFW was an implicit permission before this release; keep existing
  //     accounts at parity and let administrators revoke it explicitly.
  '''
UPDATE users SET permissions_json = '["nsfw"]'
  WHERE role <> 'admin' AND permissions_json = '[]';
UPDATE users SET permissions_json = REPLACE(permissions_json, ']', ',"nsfw"]')
  WHERE role <> 'admin' AND permissions_json <> '[]'
    AND permissions_json NOT LIKE '%"nsfw"%';
''',
];
