import 'dart:convert';

import '../db/database.dart';
import '../db/rows.dart';
import '../util/errors.dart';

class UserRecord {
  final int id;
  final String username;
  final String passwordHash;
  final String role;
  final int createdAt;
  final bool disabled;

  UserRecord({
    required this.id,
    required this.username,
    required this.passwordHash,
    required this.role,
    required this.createdAt,
    required this.disabled,
  });

  bool get isAdmin => role == 'admin';

  Map<String, Object?> toJson({bool includeHash = false}) => {
        'id': id,
        'username': username,
        if (includeHash) 'passwordHash': passwordHash,
        'role': role,
        'createdAt': createdAt,
        'disabled': disabled,
      };

  factory UserRecord.fromRow(Map<String, Object?> row) => UserRecord(
        id: row['id'] as int,
        username: row['username'] as String,
        passwordHash: row['password_hash'] as String,
        role: row['role'] as String,
        createdAt: row['created_at'] as int,
        disabled: asBool(row['disabled']),
      );
}

class UserRepository {
  final Db db;
  UserRepository(this.db);

  int count() =>
      db.select('SELECT COUNT(*) AS c FROM users').first['c'] as int;

  UserRecord? byUsername(String username) {
    final rows = db.select(
        'SELECT * FROM users WHERE username = ? COLLATE BINARY', [username]);
    if (rows.isEmpty) return null;
    return UserRecord.fromRow(rows.first);
  }

  UserRecord? byId(int id) {
    final rows = db.select('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.isEmpty) return null;
    return UserRecord.fromRow(rows.first);
  }

  List<UserRecord> all() => db
      .select('SELECT * FROM users ORDER BY id')
      .map((r) => UserRecord.fromRow(r))
      .toList();

  UserRecord create({
    required String username,
    required String passwordHash,
    String role = 'user',
  }) {
    final id = db.insert(
      'INSERT INTO users (username,password_hash,role,created_at,disabled) '
      'VALUES (?,?,?,?,0)',
      [username, passwordHash, role, nowMs()],
    );
    return byId(id)!;
  }

  void update(int id,
      {String? passwordHash, String? role, bool? disabled}) {
    final sets = <String>[];
    final params = <Object?>[];
    if (passwordHash != null) {
      sets.add('password_hash = ?');
      params.add(passwordHash);
    }
    if (role != null) {
      sets.add('role = ?');
      params.add(role);
    }
    if (disabled != null) {
      sets.add('disabled = ?');
      params.add(disabled ? 1 : 0);
    }
    if (sets.isEmpty) return;
    params.add(id);
    db.execute('UPDATE users SET ${sets.join(', ')} WHERE id = ?', params);
  }

  void delete(int id) => db.execute('DELETE FROM users WHERE id = ?', [id]);

  int adminCount() => db.select(
          "SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND disabled = 0")
      .first['c'] as int;
}

class SessionRecord {
  final int id;
  final int userId;
  final String tokenHash;
  final int createdAt;
  final int expiresAt;

  SessionRecord({
    required this.id,
    required this.userId,
    required this.tokenHash,
    required this.createdAt,
    required this.expiresAt,
  });

  factory SessionRecord.fromRow(Map<String, Object?> row) => SessionRecord(
        id: row['id'] as int,
        userId: row['user_id'] as int,
        tokenHash: row['token_hash'] as String,
        createdAt: row['created_at'] as int,
        expiresAt: row['expires_at'] as int,
      );
}

class SessionRepository {
  final Db db;
  SessionRepository(this.db);

  void create({
    required int userId,
    required String tokenHash,
    required int expiresAt,
    String? userAgent,
    String? ip,
  }) {
    final now = nowMs();
    db.execute(
      'INSERT INTO sessions (user_id,token_hash,created_at,expires_at,'
      'last_seen_at,user_agent,ip) VALUES (?,?,?,?,?,?,?)',
      [userId, tokenHash, now, expiresAt, now, userAgent, ip],
    );
  }

  SessionRecord? byHash(String hash) {
    final rows =
        db.select('SELECT * FROM sessions WHERE token_hash = ?', [hash]);
    if (rows.isEmpty) return null;
    final record = SessionRecord.fromRow(rows.first);
    if (record.expiresAt < nowMs()) {
      deleteById(record.id);
      return null;
    }
    return record;
  }

  void touch(int id, int expiresAt) {
    db.execute(
        'UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?',
        [nowMs(), expiresAt, id]);
  }

  void deleteById(int id) =>
      db.execute('DELETE FROM sessions WHERE id = ?', [id]);

  void deleteByHash(String hash) =>
      db.execute('DELETE FROM sessions WHERE token_hash = ?', [hash]);

  void deleteForUser(int userId) =>
      db.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);

  void deleteExpired() => db.execute(
      'DELETE FROM sessions WHERE expires_at < ?', [nowMs()]);
}

class SettingsRepository {
  final Db db;
  SettingsRepository(this.db);

  Map<String, Object?> all(int userId) {
    final rows = db.select(
        'SELECT key,value_json FROM settings WHERE user_id = ?', [userId]);
    final result = <String, Object?>{};
    for (final row in rows) {
      try {
        result[row['key'] as String] = jsonDecode(row['value_json'] as String);
      } catch (_) {
        result[row['key'] as String] = null;
      }
    }
    return result;
  }

  Object? get(int userId, String key) => all(userId)[key];

  void setMany(int userId, Map<String, Object?> values) {
    final now = nowMs();
    db.transaction(() {
      for (final entry in values.entries) {
        db.execute(
          'INSERT INTO settings (user_id,key,value_json,updated_at) '
          'VALUES (?,?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET '
          'value_json = excluded.value_json, updated_at = excluded.updated_at',
          [userId, entry.key, jsonEncode(entry.value), now],
        );
      }
    });
  }

  void delete(int userId, String key) =>
      db.execute('DELETE FROM settings WHERE user_id = ? AND key = ?',
          [userId, key]);

  List<Map<String, Object?>> searchHistory(int userId, {int limit = 50}) => db
      .select(
          'SELECT keyword,created_at FROM search_history WHERE user_id = ? '
          'ORDER BY created_at DESC LIMIT ?',
          [userId, limit])
      .map((r) => {
            'keyword': r['keyword'],
            'createdAt': r['created_at'],
          })
      .toList();

  void addSearchHistory(int userId, String keyword) {
    final trimmed = keyword.trim();
    if (trimmed.isEmpty) return;
    db.transaction(() {
      db.execute(
        'INSERT INTO search_history (user_id,keyword,created_at) VALUES (?,?,?) '
        'ON CONFLICT(user_id,keyword) DO UPDATE SET created_at = excluded.created_at',
        [userId, trimmed.substring(0, trimmed.length.clamp(0, 4096)), nowMs()],
      );
      db.execute(
        'DELETE FROM search_history WHERE user_id = ? AND keyword NOT IN ('
        'SELECT keyword FROM search_history WHERE user_id = ? '
        'ORDER BY created_at DESC LIMIT 50)',
        [userId, userId],
      );
    });
  }

  void clearSearchHistory(int userId) =>
      db.execute('DELETE FROM search_history WHERE user_id = ?', [userId]);
}

class AuditRepository {
  final Db db;
  AuditRepository(this.db);

  void log(String action,
      {int? userId, Map<String, Object?> detail = const {}, String? ip}) {
    db.execute(
      'INSERT INTO audit_logs (user_id,action,detail_json,ip,created_at) '
      'VALUES (?,?,?,?,?)',
      [userId, action, jsonEncode(detail), ip, nowMs()],
    );
  }

  Map<String, Object?> page(int page, int pageSize) {
    final total =
        db.select('SELECT COUNT(*) AS c FROM audit_logs').first['c'] as int;
    final rows = db.select(
      'SELECT * FROM audit_logs ORDER BY id DESC LIMIT ? OFFSET ?',
      [pageSize, (page - 1) * pageSize],
    );
    return {
      'items': rows.map((r) {
        Object? detail;
        try {
          detail = jsonDecode(r['detail_json'] as String);
        } catch (_) {
          detail = null;
        }
        return {
          'id': r['id'],
          'userId': r['user_id'],
          'action': r['action'],
          'detail': detail,
          'ip': r['ip'],
          'createdAt': r['created_at'],
        };
      }).toList(),
      'total': total,
      'page': page,
      'pageSize': pageSize,
    };
  }
}

void requireUser(int? userId) {
  if (userId == null) throw ApiException.unauthorized();
}
