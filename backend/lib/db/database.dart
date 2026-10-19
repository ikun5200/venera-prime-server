import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:sqlite3/sqlite3.dart';

import 'migrations.dart';

/// Thin wrapper around sqlite3 with WAL, foreign keys and ordered migrations.
class Db {
  final Database raw;
  final String path;

  Db._(this.raw, this.path);

  static Db open(String path) {
    final file = File(path);
    file.parent.createSync(recursive: true);
    final db = sqlite3.open(path);
    db.execute('PRAGMA journal_mode=WAL;');
    db.execute('PRAGMA synchronous=NORMAL;');
    db.execute('PRAGMA foreign_keys=ON;');
    db.execute('PRAGMA busy_timeout=5000;');
    final wrapper = Db._(db, path);
    wrapper._migrate();
    return wrapper;
  }

  static Db memory() {
    final db = sqlite3.openInMemory();
    db.execute('PRAGMA foreign_keys=ON;');
    final wrapper = Db._(db, ':memory:');
    wrapper._migrate();
    return wrapper;
  }

  void _migrate() {
    final current = raw.select('PRAGMA user_version;').first.values.first as int;
    if (current >= migrations.length) return;
    for (var version = current; version < migrations.length; version++) {
      raw.execute('BEGIN;');
      try {
        raw.execute(migrations[version]);
        raw.execute('PRAGMA user_version = ${version + 1};');
        raw.execute('COMMIT;');
      } catch (_) {
        raw.execute('ROLLBACK;');
        rethrow;
      }
    }
  }

  int get userVersion =>
      raw.select('PRAGMA user_version;').first.values.first as int;

  ResultSet select(String sql, [List<Object?> params = const []]) =>
      raw.select(sql, params);

  void execute(String sql, [List<Object?> params = const []]) =>
      raw.execute(sql, params);

  int insert(String sql, [List<Object?> params = const []]) {
    raw.execute(sql, params);
    return raw.lastInsertRowId;
  }

  T transaction<T>(T Function() action) {
    raw.execute('BEGIN IMMEDIATE;');
    try {
      final result = action();
      raw.execute('COMMIT;');
      return result;
    } catch (_) {
      raw.execute('ROLLBACK;');
      rethrow;
    }
  }

  void close() => raw.dispose();

  /// Deletes expired sessions and old request logs. Called on startup and
  /// periodically by the server.
  void housekeeping() {
    final now = DateTime.now().millisecondsSinceEpoch;
    execute('DELETE FROM sessions WHERE expires_at < ?', [now]);
    execute('DELETE FROM request_logs WHERE ts < ?',
        [now - const Duration(days: 7).inMilliseconds]);
  }

  String? get dbDirectory => p.dirname(path);
}
