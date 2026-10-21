import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../db/database.dart';
import '../db/rows.dart';
import '../repositories/user_repository.dart';

/// One persisted cache record. `payload` is the JSON object that was produced
/// by the source before any per-user state (progress, favorites) was merged.
class CacheEntry {
  final Map<String, Object?> payload;
  final int fetchedAt;
  final int expiresAt;

  CacheEntry({
    required this.payload,
    required this.fetchedAt,
    required this.expiresAt,
  });

  bool get stale => expiresAt <= nowMs();
}

/// Persistent, user-scoped cache for source metadata.
///
/// The server is the only client, so every list/detail/chapter response can be
/// reused across tabs, reloads, restarts and users of the same account. Rows
/// are small JSON documents; image bytes live in the per-user image cache and
/// are indexed here so the UI can report real cache usage.
class ContentCacheService {
  final Db db;
  final SettingsRepository settings;

  final Map<int, int> _writes = {};

  static const int maxRowsPerUser = 6000;
  static const int hardRetentionMs = 30 * 24 * 60 * 60 * 1000;

  ContentCacheService({required this.db, required this.settings});

  bool enabled(int userId) {
    final stored = settings.get(userId, 'serverCacheEnabled');
    return stored is bool ? stored : true;
  }

  int ttlMs(int userId, String kind) {
    final values = settings.all(userId);
    int minutes(String key, int fallback) {
      final raw = values[key];
      if (raw is num && raw >= 0) return raw.toInt();
      return fallback;
    }

    switch (kind) {
      case 'comic':
        return Duration(minutes: minutes('serverCacheComicMinutes', 60))
            .inMilliseconds;
      case 'chapter':
        final raw = values['serverCacheChapterDays'];
        final days = raw is num && raw >= 0 ? raw.toInt() : 7;
        return Duration(days: days).inMilliseconds;
      case 'categories':
        return const Duration(hours: 24).inMilliseconds;
      case 'comments':
      case 'chapterComments':
        return const Duration(minutes: 2).inMilliseconds;
      case 'explore':
      case 'search':
      case 'category':
      case 'ranking':
      case 'thumbnails':
      default:
        return Duration(minutes: minutes('serverCacheListMinutes', 10))
            .inMilliseconds;
    }
  }

  /// Stable key for composite parameters. Hashing keeps keys short and avoids
  /// surprising collisions with separator characters in user input.
  String compositeKey(List<Object?> parts) =>
      sha256.convert(utf8.encode(jsonEncode(parts))).toString();

  CacheEntry? read(
    int userId,
    String sourceKey,
    String kind,
    String key,
  ) {
    final rows = db.select(
      'SELECT payload_json,created_at,expires_at FROM content_cache '
      'WHERE user_id=? AND source_key=? AND kind=? AND cache_key=?',
      [userId, sourceKey, kind, key],
    );
    if (rows.isEmpty) return null;
    final row = rows.first;
    final createdAt = row['created_at'] as int;
    final expiresAt = row['expires_at'] as int;
    final now = nowMs();
    if (now - createdAt > hardRetentionMs) {
      db.execute(
        'DELETE FROM content_cache WHERE user_id=? AND source_key=? '
        'AND kind=? AND cache_key=?',
        [userId, sourceKey, kind, key],
      );
      return null;
    }
    try {
      final decoded = jsonDecode(row['payload_json'] as String);
      if (decoded is! Map) return null;
      return CacheEntry(
        payload: decoded.map((k, v) => MapEntry(k.toString(), v)),
        fetchedAt: createdAt,
        expiresAt: expiresAt,
      );
    } catch (_) {
      return null;
    }
  }

  void write({
    required int userId,
    required String sourceKey,
    required String kind,
    required String key,
    required String scope,
    required Map<String, Object?> payload,
    required int ttlMs,
  }) {
    if (ttlMs <= 0) return;
    final now = nowMs();
    db.execute(
      'INSERT INTO content_cache '
      '(user_id,source_key,kind,cache_key,scope,payload_json,created_at,expires_at) '
      'VALUES (?,?,?,?,?,?,?,?) '
      'ON CONFLICT(user_id,source_key,kind,cache_key) DO UPDATE SET '
      'scope=excluded.scope,payload_json=excluded.payload_json,'
      'created_at=excluded.created_at,expires_at=excluded.expires_at',
      [
        userId,
        sourceKey,
        kind,
        key,
        scope,
        jsonEncode(payload),
        now,
        now + ttlMs,
      ],
    );
    final count = (_writes[userId] ?? 0) + 1;
    _writes[userId] = count;
    if (count % 64 == 0) prune(userId);
  }

  int invalidate(
    int userId, {
    String? sourceKey,
    String? kind,
    String? scope,
  }) {
    final where = <String>['user_id=?'];
    final params = <Object?>[userId];
    if (sourceKey != null) {
      where.add('source_key=?');
      params.add(sourceKey);
    }
    if (kind != null) {
      where.add('kind=?');
      params.add(kind);
    }
    if (scope != null) {
      where.add('scope=?');
      params.add(scope);
    }
    final rows = db.select(
        'SELECT COUNT(*) AS n FROM content_cache WHERE ${where.join(' AND ')}',
        params);
    db.execute(
        'DELETE FROM content_cache WHERE ${where.join(' AND ')}', params);
    return (rows.first['n'] as int?) ?? 0;
  }

  int clear(int userId) => invalidate(userId);

  /// Removes records that expired more than [hardRetentionMs] ago and enforces
  /// a per-user row budget (oldest access first).
  int prune(int userId) {
    final now = nowMs();
    db.execute(
      'DELETE FROM content_cache WHERE user_id=? AND created_at < ?',
      [userId, now - hardRetentionMs],
    );
    final count = db.select(
        'SELECT COUNT(*) AS n FROM content_cache WHERE user_id=?', [userId]);
    final total = (count.first['n'] as int?) ?? 0;
    if (total <= maxRowsPerUser) return 0;
    final remove = total - maxRowsPerUser;
    db.execute(
      'DELETE FROM content_cache WHERE rowid IN ('
      'SELECT rowid FROM content_cache WHERE user_id=? '
      'ORDER BY created_at ASC LIMIT ?)',
      [userId, remove],
    );
    return remove;
  }

  int pruneAll() {
    final now = nowMs();
    final rows = db.select(
      'SELECT COUNT(*) AS n FROM content_cache WHERE created_at < ?',
      [now - hardRetentionMs],
    );
    db.execute('DELETE FROM content_cache WHERE created_at < ?',
        [now - hardRetentionMs]);
    db.execute(
      'DELETE FROM image_cache WHERE user_id NOT IN (SELECT id FROM users)',
    );
    return (rows.first['n'] as int?) ?? 0;
  }

  // ---- image index -------------------------------------------------------

  void indexImage({
    required int userId,
    required String cacheKey,
    required String sourceKey,
    required String comicId,
    required String epId,
    required String imageKey,
    required String mime,
    required int size,
  }) {
    final now = nowMs();
    db.execute(
      'INSERT INTO image_cache '
      '(user_id,cache_key,source_key,comic_id,ep_id,image_key,mime,size,created_at,accessed_at) '
      'VALUES (?,?,?,?,?,?,?,?,?,?) '
      'ON CONFLICT(user_id,cache_key) DO UPDATE SET '
      'source_key=excluded.source_key,comic_id=excluded.comic_id,'
      'ep_id=excluded.ep_id,image_key=excluded.image_key,mime=excluded.mime,'
      'size=excluded.size,accessed_at=excluded.accessed_at',
      [
        userId,
        cacheKey,
        sourceKey,
        comicId,
        epId,
        imageKey,
        mime,
        size,
        now,
        now,
      ],
    );
  }

  void removeImage(int userId, String cacheKey) => db.execute(
      'DELETE FROM image_cache WHERE user_id=? AND cache_key=?',
      [userId, cacheKey]);

  List<String> imageKeys(int userId, {String? sourceKey}) {
    final rows = sourceKey == null
        ? db.select(
            'SELECT cache_key FROM image_cache WHERE user_id=?', [userId])
        : db.select(
            'SELECT cache_key FROM image_cache WHERE user_id=? AND source_key=?',
            [userId, sourceKey]);
    return rows.map((row) => row['cache_key'] as String).toList();
  }

  int clearImages(int userId, {String? sourceKey}) {
    final rows = sourceKey == null
        ? db.select(
            'SELECT COUNT(*) AS n FROM image_cache WHERE user_id=?', [userId])
        : db.select(
            'SELECT COUNT(*) AS n FROM image_cache WHERE user_id=? AND source_key=?',
            [userId, sourceKey]);
    if (sourceKey == null) {
      db.execute('DELETE FROM image_cache WHERE user_id=?', [userId]);
    } else {
      db.execute('DELETE FROM image_cache WHERE user_id=? AND source_key=?',
          [userId, sourceKey]);
    }
    return (rows.first['n'] as int?) ?? 0;
  }

  Map<String, Object?> imageStats(
    int userId, {
    String? sourceKey,
    String? comicId,
  }) {
    final filter = <String>['user_id=?'];
    final params = <Object?>[userId];
    if (sourceKey != null && sourceKey.isNotEmpty) {
      filter.add('source_key=?');
      params.add(sourceKey);
    }
    if (comicId != null && comicId.isNotEmpty) {
      filter.add('comic_id=?');
      params.add(comicId);
    }
    final where = filter.join(' AND ');
    final totals = db
        .select(
          'SELECT COUNT(*) AS entries, COALESCE(SUM(size),0) AS bytes '
          'FROM image_cache WHERE $where',
          params,
        )
        .first;
    final bySource = db
        .select(
          'SELECT source_key AS source, COUNT(*) AS entries, '
          'COALESCE(SUM(size),0) AS bytes FROM image_cache WHERE user_id=? '
          'GROUP BY source_key ORDER BY bytes DESC LIMIT 50',
          [userId],
        )
        .map((row) => {
              'source': row['source'],
              'entries': row['entries'],
              'bytes': row['bytes'],
            })
        .toList();
    final chapters = db
        .select(
          'SELECT ep_id AS ep, COUNT(*) AS images, COALESCE(SUM(size),0) AS bytes '
          'FROM image_cache WHERE $where GROUP BY ep_id ORDER BY ep_id',
          params,
        )
        .map((row) => {
              'ep': row['ep'],
              'images': row['images'],
              'bytes': row['bytes'],
            })
        .toList();
    return {
      'entries': totals['entries'],
      'bytes': totals['bytes'],
      'bySource': bySource,
      'chapters': chapters,
    };
  }

  Map<String, Object?> stats(int userId) {
    final totals = db.select(
      'SELECT COUNT(*) AS entries, '
      'COALESCE(SUM(LENGTH(CAST(payload_json AS BLOB))),0) AS bytes '
      'FROM content_cache WHERE user_id=?',
      [userId],
    ).first;
    final byKind = db
        .select(
          'SELECT kind, COUNT(*) AS entries, '
          'COALESCE(SUM(LENGTH(CAST(payload_json AS BLOB))),0) AS bytes '
          'FROM content_cache WHERE user_id=? GROUP BY kind ORDER BY entries DESC',
          [userId],
        )
        .map((row) => {
              'kind': row['kind'],
              'entries': row['entries'],
              'bytes': row['bytes'],
            })
        .toList();
    final bySource = db
        .select(
          'SELECT source_key AS source, COUNT(*) AS entries, '
          'COALESCE(SUM(LENGTH(CAST(payload_json AS BLOB))),0) AS bytes '
          'FROM content_cache WHERE user_id=? '
          'GROUP BY source_key ORDER BY bytes DESC LIMIT 50',
          [userId],
        )
        .map((row) => {
              'source': row['source'],
              'entries': row['entries'],
              'bytes': row['bytes'],
            })
        .toList();
    return {
      'entries': totals['entries'],
      'bytes': totals['bytes'],
      'byKind': byKind,
      'bySource': bySource,
    };
  }
}
