import 'dart:convert';

import '../db/database.dart';
import '../db/rows.dart';

class SourceRecord {
  final int userId;
  final String key;
  final String name;
  final String version;
  final String url;
  final String minAppVersion;
  final String script;
  final Map<String, Object?> data;
  final Map<String, Object?> settings;
  final Map<String, Object?> translation;
  final Map<String, Object?> capabilities;
  final bool enabled;
  final int sortOrder;
  final int createdAt;
  final int updatedAt;

  SourceRecord({
    required this.userId,
    required this.key,
    required this.name,
    required this.version,
    required this.url,
    required this.minAppVersion,
    required this.script,
    required this.data,
    required this.settings,
    required this.translation,
    required this.capabilities,
    required this.enabled,
    required this.sortOrder,
    required this.createdAt,
    required this.updatedAt,
  });

  factory SourceRecord.fromRow(Map<String, Object?> row) {
    Map<String, Object?> parse(Object? raw) {
      if (raw is! String || raw.isEmpty) return {};
      try {
        final value = jsonDecode(raw);
        if (value is Map) {
          return value.map((k, v) => MapEntry(k.toString(), v));
        }
      } catch (_) {}
      return {};
    }

    return SourceRecord(
      userId: row['user_id'] as int,
      key: row['source_key'] as String,
      name: row['name'] as String,
      version: row['version'] as String? ?? '',
      url: row['url'] as String? ?? '',
      minAppVersion: row['min_app_version'] as String? ?? '',
      script: row['script'] as String,
      data: parse(row['data_json']),
      settings: parse(row['settings_json']),
      translation: parse(row['translation_json']),
      capabilities: parse(row['capabilities_json']),
      enabled: asBool(row['enabled']),
      sortOrder: row['sort_order'] as int,
      createdAt: row['created_at'] as int,
      updatedAt: row['updated_at'] as int,
    );
  }

  bool get loggedIn => data['account'] != null;

  Map<String, Object?> toJson({bool includeScript = false}) => {
        'key': key,
        'name': name,
        'version': version,
        'url': url,
        'minAppVersion': minAppVersion,
        'enabled': enabled,
        'sortOrder': sortOrder,
        'capabilities': capabilities,
        'account': {
          'loggedIn': loggedIn,
          'kind': data['account'] is List
              ? 'password'
              : (loggedIn ? 'cookies' : null),
        },
        'createdAt': createdAt,
        'updatedAt': updatedAt,
        if (includeScript) 'script': script,
        if (includeScript) 'data': data,
        if (includeScript) 'settings': settings,
        if (includeScript) 'translation': translation,
      };
}

class SourceRepository {
  final Db db;
  SourceRepository(this.db);

  List<SourceRecord> list(int userId, {bool enabledOnly = false}) {
    final rows = db.select(
      'SELECT * FROM sources WHERE user_id = ?'
      '${enabledOnly ? ' AND enabled = 1' : ''} ORDER BY sort_order, name COLLATE NOCASE',
      [userId],
    );
    return rows.map((r) => SourceRecord.fromRow(r)).toList();
  }

  SourceRecord? get(int userId, String key) {
    final rows = db.select(
        'SELECT * FROM sources WHERE user_id = ? AND source_key = ?',
        [userId, key]);
    if (rows.isEmpty) return null;
    return SourceRecord.fromRow(rows.first);
  }

  void upsert({
    required int userId,
    required String key,
    required String name,
    required String version,
    required String url,
    required String minAppVersion,
    required String script,
    required Map<String, Object?> settings,
    required Map<String, Object?> translation,
    required Map<String, Object?> capabilities,
    bool preserveData = true,
  }) {
    final now = nowMs();
    final existing = get(userId, key);
    final order = existing?.sortOrder ??
        (db.select(
            'SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM sources WHERE user_id = ?',
            [userId]).first['n'] as int);
    db.execute(
      'INSERT INTO sources (user_id,source_key,name,version,url,min_app_version,'
      'script,data_json,settings_json,translation_json,capabilities_json,'
      'enabled,sort_order,created_at,updated_at) '
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) '
      'ON CONFLICT(user_id,source_key) DO UPDATE SET '
      'name=excluded.name,version=excluded.version,url=excluded.url,'
      'min_app_version=excluded.min_app_version,script=excluded.script,'
      'settings_json=excluded.settings_json,'
      'translation_json=excluded.translation_json,'
      'capabilities_json=excluded.capabilities_json,'
      'updated_at=excluded.updated_at',
      [
        userId,
        key,
        name,
        version,
        url,
        minAppVersion,
        script,
        jsonEncode(preserveData ? (existing?.data ?? {}) : {}),
        jsonEncode(settings),
        jsonEncode(translation),
        jsonEncode(capabilities),
        existing?.enabled == false ? 0 : 1,
        order,
        existing?.createdAt ?? now,
        now,
      ],
    );
  }

  void updateMeta(int userId, String key,
      {String? name,
      String? version,
      String? url,
      Map<String, Object?>? settings,
      Map<String, Object?>? translation,
      Map<String, Object?>? capabilities}) {
    final current = get(userId, key);
    if (current == null) return;
    db.execute(
      'UPDATE sources SET name=?,version=?,url=?,settings_json=?,'
      'translation_json=?,capabilities_json=?,updated_at=? '
      'WHERE user_id=? AND source_key=?',
      [
        name ?? current.name,
        version ?? current.version,
        url ?? current.url,
        jsonEncode(settings ?? current.settings),
        jsonEncode(translation ?? current.translation),
        jsonEncode(capabilities ?? current.capabilities),
        nowMs(),
        userId,
        key,
      ],
    );
  }

  void saveData(int userId, String key, Map<String, Object?> data) {
    db.execute(
      'UPDATE sources SET data_json = ?, updated_at = ? '
      'WHERE user_id = ? AND source_key = ?',
      [jsonEncode(data), nowMs(), userId, key],
    );
  }

  void setEnabled(int userId, String key, bool enabled) => db.execute(
      'UPDATE sources SET enabled = ?, updated_at = ? '
      'WHERE user_id = ? AND source_key = ?',
      [enabled ? 1 : 0, nowMs(), userId, key]);

  void delete(int userId, String key) {
    db.execute('DELETE FROM sources WHERE user_id = ? AND source_key = ?',
        [userId, key]);
    db.execute(
        'DELETE FROM source_provenance WHERE user_id = ? AND source_key = ?',
        [userId, key]);
  }

  void reorder(int userId, List<String> keys) {
    db.transaction(() {
      for (var i = 0; i < keys.length; i++) {
        db.execute(
          'UPDATE sources SET sort_order = ? WHERE user_id = ? AND source_key = ?',
          [i, userId, keys[i]],
        );
      }
    });
  }

  // ---- libraries -------------------------------------------------------

  List<Map<String, Object?>> libraries(int userId) => db
      .select(
          'SELECT * FROM source_libraries WHERE user_id = ? '
          'ORDER BY priority, name COLLATE NOCASE',
          [userId])
      .map((r) => {
            'id': r['library_id'],
            'name': r['name'],
            'url': r['url'],
            'enabled': asBool(r['enabled']),
            'priority': r['priority'],
            'lastChecked': r['last_checked'],
          })
      .toList();

  void upsertLibrary(int userId,
      {required String id,
      required String name,
      required String url,
      bool enabled = true,
      int priority = 0,
      int? lastChecked}) {
    db.execute(
      'INSERT INTO source_libraries (user_id,library_id,name,url,enabled,priority,last_checked) '
      'VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,library_id) DO UPDATE SET '
      'name=excluded.name,url=excluded.url,enabled=excluded.enabled,'
      'priority=excluded.priority,last_checked=excluded.last_checked',
      [userId, id, name, url, enabled ? 1 : 0, priority, lastChecked],
    );
  }

  void deleteLibrary(int userId, String id) => db.execute(
      'DELETE FROM source_libraries WHERE user_id = ? AND library_id = ?',
      [userId, id]);

  void setProvenance(int userId, String sourceKey,
      {required List<String> libraryIds,
      String? originId,
      String? updateLibraryId,
      String? sourceFileName}) {
    db.execute(
      'INSERT INTO source_provenance (user_id,source_key,library_ids_json,'
      'origin_id,update_library_id,source_file_name) VALUES (?,?,?,?,?,?) '
      'ON CONFLICT(user_id,source_key) DO UPDATE SET '
      'library_ids_json=excluded.library_ids_json,origin_id=excluded.origin_id,'
      'update_library_id=excluded.update_library_id,'
      'source_file_name=excluded.source_file_name',
      [
        userId,
        sourceKey,
        jsonEncode(libraryIds),
        originId,
        updateLibraryId,
        sourceFileName,
      ],
    );
  }

  Map<String, Object?>? provenance(int userId, String sourceKey) {
    final rows = db.select(
        'SELECT * FROM source_provenance WHERE user_id=? AND source_key=?',
        [userId, sourceKey]);
    if (rows.isEmpty) return null;
    final r = rows.first;
    Object? libs;
    try {
      libs = jsonDecode(r['library_ids_json'] as String);
    } catch (_) {
      libs = <String>[];
    }
    return {
      'libraryIds': libs,
      'originId': r['origin_id'],
      'updateLibraryId': r['update_library_id'],
      'sourceFileName': r['source_file_name'],
    };
  }

  // ---- cookies ---------------------------------------------------------

  List<Map<String, Object?>> cookies(int userId) => db
      .select('SELECT * FROM cookies WHERE user_id = ?', [userId])
      .map((r) => {
            'name': r['name'],
            'value': r['value'],
            'domain': r['domain'],
            'path': r['path'],
            'expires': r['expires'],
            'secure': asBool(r['secure']),
            'httpOnly': asBool(r['http_only']),
            'hostOnly': asBool(r['host_only']),
          })
      .toList();

  void replaceCookies(int userId, List<Map<String, Object?>> cookies) {
    db.transaction(() {
      db.execute('DELETE FROM cookies WHERE user_id = ?', [userId]);
      for (final c in cookies) {
        final name = (c['name'] ?? '').toString();
        final domain = (c['domain'] ?? '').toString();
        if (name.isEmpty || domain.isEmpty) continue;
        final expires = c['expires'];
        if (expires is int && expires > 0 && expires < nowMs()) continue;
        db.execute(
          'INSERT OR REPLACE INTO cookies (user_id,name,value,domain,path,'
          'expires,secure,http_only,host_only) VALUES (?,?,?,?,?,?,?,?,?)',
          [
            userId,
            name,
            (c['value'] ?? '').toString(),
            domain,
            (c['path'] ?? '/').toString(),
            expires is int ? expires : null,
            c['secure'] == true ? 1 : 0,
            c['httpOnly'] == true ? 1 : 0,
            c['hostOnly'] == false ? 0 : 1,
          ],
        );
      }
    });
  }
}
