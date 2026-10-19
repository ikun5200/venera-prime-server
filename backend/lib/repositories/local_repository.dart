import 'dart:convert';

import '../db/database.dart';
import '../db/rows.dart';
import '../util/errors.dart';

class LocalComicRecord {
  final int id;
  final int userId;
  final String title;
  final String subtitle;
  final String description;
  final List<Object?> tags;
  final String directory;
  final Map<String, Object?> chapters;
  final String cover;
  final int comicType;
  final List<Object?> downloadedChapters;
  final int createdAt;
  final bool managedByApp;
  final String? sourceKey;
  final String? comicIdExt;

  LocalComicRecord({
    required this.id,
    required this.userId,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.tags,
    required this.directory,
    required this.chapters,
    required this.cover,
    required this.comicType,
    required this.downloadedChapters,
    required this.createdAt,
    required this.managedByApp,
    required this.sourceKey,
    required this.comicIdExt,
  });

  factory LocalComicRecord.fromRow(Map<String, Object?> row) {
    Object? parse(String? raw, Object fallback) {
      try {
        return jsonDecode(raw ?? '');
      } catch (_) {
        return fallback;
      }
    }

    return LocalComicRecord(
      id: row['id'] as int,
      userId: row['user_id'] as int,
      title: row['title'] as String,
      subtitle: row['subtitle'] as String? ?? '',
      description: row['description'] as String? ?? '',
      tags: parse(row['tags_json'] as String?, const []) as List<Object?>,
      directory: row['directory'] as String,
      chapters: (parse(row['chapters_json'] as String?, const {}) as Map)
          .map((k, v) => MapEntry(k.toString(), v)),
      cover: row['cover'] as String? ?? '',
      comicType: row['comic_type'] as int,
      downloadedChapters:
          parse(row['downloaded_chapters_json'] as String?, const [])
              as List<Object?>,
      createdAt: row['created_at'] as int,
      managedByApp: asBool(row['managed_by_app']),
      sourceKey: row['source_key'] as String?,
      comicIdExt: row['comic_id_ext'] as String?,
    );
  }

  Map<String, Object?> toJson() => {
        'id': id,
        'title': title,
        'subtitle': subtitle,
        'description': description,
        'tags': tags,
        'directory': directory,
        'chapters': chapters,
        'cover': cover,
        'comicType': comicType,
        'downloadedChapters': downloadedChapters,
        'createdAt': createdAt,
        'managedByApp': managedByApp,
        'sourceKey': sourceKey,
        'comicId': comicIdExt,
      };
}

class LocalRepository {
  final Db db;
  LocalRepository(this.db);

  List<LocalComicRecord> list(int userId,
      {String? query, String sort = 'name'}) {
    final where = <String>['user_id = ?'];
    final params = <Object?>[userId];
    if (query != null && query.trim().isNotEmpty) {
      where.add('(title LIKE ? OR subtitle LIKE ?)');
      params.addAll(['%${query.trim()}%', '%${query.trim()}%']);
    }
    final order = switch (sort) {
      'time_asc' => 'created_at ASC',
      'time_desc' => 'created_at DESC',
      _ => 'title COLLATE NOCASE ASC',
    };
    return db
        .select('SELECT * FROM local_comics WHERE ${where.join(' AND ')} ORDER BY $order',
            params)
        .map((r) => LocalComicRecord.fromRow(r))
        .toList();
  }

  LocalComicRecord? get(int userId, int id) {
    final rows = db.select(
        'SELECT * FROM local_comics WHERE user_id=? AND id=?', [userId, id]);
    if (rows.isEmpty) return null;
    return LocalComicRecord.fromRow(rows.first);
  }

  LocalComicRecord? findByExt(int userId, int comicType, String comicIdExt) {
    final rows = db.select(
        'SELECT * FROM local_comics WHERE user_id=? AND comic_type=? AND comic_id_ext=?',
        [userId, comicType, comicIdExt]);
    if (rows.isEmpty) return null;
    return LocalComicRecord.fromRow(rows.first);
  }

  LocalComicRecord? findByTitle(int userId, String title) {
    final rows = db.select(
        'SELECT * FROM local_comics WHERE user_id=? AND title=? LIMIT 1',
        [userId, title]);
    if (rows.isEmpty) return null;
    return LocalComicRecord.fromRow(rows.first);
  }

  int create({
    required int userId,
    required String title,
    String subtitle = '',
    String description = '',
    List<Object?> tags = const [],
    required String directory,
    Map<String, Object?> chapters = const {},
    String cover = '',
    int comicType = 1,
    List<Object?> downloadedChapters = const [],
    bool managedByApp = true,
    String? sourceKey,
    String? comicIdExt,
  }) {
    return db.insert(
      'INSERT INTO local_comics (user_id,title,subtitle,description,tags_json,'
      'directory,chapters_json,cover,comic_type,downloaded_chapters_json,'
      'created_at,managed_by_app,source_key,comic_id_ext) '
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        userId,
        title,
        subtitle,
        description,
        jsonEncode(tags),
        directory,
        jsonEncode(chapters),
        cover,
        comicType,
        jsonEncode(downloadedChapters),
        nowMs(),
        managedByApp ? 1 : 0,
        sourceKey,
        comicIdExt,
      ],
    );
  }

  void updateMeta(int userId, int id,
      {String? title,
      String? subtitle,
      String? description,
      List<Object?>? tags,
      String? cover}) {
    final sets = <String>[];
    final params = <Object?>[];
    if (title != null) {
      sets.add('title=?');
      params.add(title);
    }
    if (subtitle != null) {
      sets.add('subtitle=?');
      params.add(subtitle);
    }
    if (description != null) {
      sets.add('description=?');
      params.add(description);
    }
    if (tags != null) {
      sets.add('tags_json=?');
      params.add(jsonEncode(tags));
    }
    if (cover != null) {
      sets.add('cover=?');
      params.add(cover);
    }
    if (sets.isEmpty) return;
    params.addAll([userId, id]);
    db.execute(
        'UPDATE local_comics SET ${sets.join(',')} WHERE user_id=? AND id=?', params);
  }

  void updateChapters(int userId, int id,
      {Map<String, Object?>? chapters,
      List<Object?>? downloadedChapters,
      String? directory,
      String? cover}) {
    final sets = <String>[];
    final params = <Object?>[];
    if (chapters != null) {
      sets.add('chapters_json=?');
      params.add(jsonEncode(chapters));
    }
    if (downloadedChapters != null) {
      sets.add('downloaded_chapters_json=?');
      params.add(jsonEncode(downloadedChapters));
    }
    if (directory != null) {
      sets.add('directory=?');
      params.add(directory);
    }
    if (cover != null) {
      sets.add('cover=?');
      params.add(cover);
    }
    if (sets.isEmpty) return;
    params.addAll([userId, id]);
    db.execute(
        'UPDATE local_comics SET ${sets.join(',')} WHERE user_id=? AND id=?', params);
  }

  void delete(int userId, int id) => db.execute(
      'DELETE FROM local_comics WHERE user_id=? AND id=?', [userId, id]);

  int count(int userId) => db
      .select('SELECT COUNT(*) AS c FROM local_comics WHERE user_id=?', [userId])
      .first['c'] as int;

  // ---- download jobs ---------------------------------------------------

  Map<String, Object?>? job(int userId, String id) {
    final rows = db.select(
        'SELECT * FROM download_jobs WHERE user_id=? AND id=?', [userId, id]);
    if (rows.isEmpty) return null;
    return _jobToJson(rows.first);
  }

  Map<String, Object?> _jobToJson(Map<String, Object?> row) {
    Map<String, Object?> payload;
    try {
      final decoded = jsonDecode(row['payload_json'] as String? ?? '{}');
      payload = decoded is Map
          ? decoded.map((k, v) => MapEntry(k.toString(), v))
          : {};
    } catch (_) {
      payload = {};
    }
    final chapters = db.select(
      'SELECT * FROM download_chapters WHERE job_id=? ORDER BY rowid',
      [row['id']],
    );
    return {
      'id': row['id'],
      'kind': row['kind'],
      'sourceKey': row['source_key'],
      'comicId': row['comic_id'],
      'comicType': row['comic_type'],
      'title': row['title'],
      'cover': row['cover'],
      'state': row['state'],
      'progress': row['progress'],
      'total': row['total'],
      'error': row['error'],
      'createdAt': row['created_at'],
      'updatedAt': row['updated_at'],
      'payload': payload,
      'chapters': chapters
          .map((c) => {
                'id': c['chapter_id'],
                'name': c['chapter_name'],
                'status': c['status'],
                'totalPages': c['total_pages'],
                'downloadedPages': c['downloaded_pages'],
              })
          .toList(),
    };
  }

  List<Map<String, Object?>> jobs(int userId) => db
      .select(
          'SELECT * FROM download_jobs WHERE user_id=? ORDER BY created_at DESC',
          [userId])
      .map((r) => _jobToJson(r))
      .toList();

  String createJob({
    required int userId,
    required String kind,
    required String sourceKey,
    required String comicId,
    required int comicType,
    required String title,
    required String cover,
    required Map<String, Object?> payload,
    required List<Map<String, Object?>> chapters,
    required int total,
  }) {
    final id = 'job_${nowMs()}_${(payload.hashCode & 0xffffff).toRadixString(16)}';
    final now = nowMs();
    db.transaction(() {
      db.execute(
        'INSERT INTO download_jobs (id,user_id,kind,source_key,comic_id,comic_type,'
        'title,cover,state,progress,total,payload_json,created_at,updated_at) '
        'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          id,
          userId,
          kind,
          sourceKey,
          comicId,
          comicType,
          title,
          cover,
          'queued',
          0.0,
          total,
          jsonEncode(payload),
          now,
          now,
        ],
      );
      for (final chapter in chapters) {
        db.execute(
          'INSERT INTO download_chapters (user_id,job_id,chapter_id,chapter_name,'
          'status,total_pages,downloaded_pages) VALUES (?,?,?,?,?,?,?)',
          [
            userId,
            id,
            chapter['id'],
            chapter['name'] ?? '',
            'pending',
            chapter['totalPages'] ?? 0,
            0,
          ],
        );
      }
    });
    return id;
  }

  void updateJob(String id,
      {String? state, double? progress, int? total, String? error}) {
    final sets = <String>['updated_at = ?'];
    final params = <Object?>[nowMs()];
    if (state != null) {
      sets.add('state = ?');
      params.add(state);
    }
    if (progress != null) {
      sets.add('progress = ?');
      params.add(progress);
    }
    if (total != null) {
      sets.add('total = ?');
      params.add(total);
    }
    if (error != null) {
      sets.add('error = ?');
      params.add(error);
    }
    params.add(id);
    db.execute('UPDATE download_jobs SET ${sets.join(',')} WHERE id = ?', params);
  }

  void updateChapter(String jobId, String chapterId,
      {String? status, int? totalPages, int? downloadedPages}) {
    final sets = <String>[];
    final params = <Object?>[];
    if (status != null) {
      sets.add('status=?');
      params.add(status);
    }
    if (totalPages != null) {
      sets.add('total_pages=?');
      params.add(totalPages);
    }
    if (downloadedPages != null) {
      sets.add('downloaded_pages=?');
      params.add(downloadedPages);
    }
    if (sets.isEmpty) return;
    params.addAll([jobId, chapterId]);
    db.execute(
        'UPDATE download_chapters SET ${sets.join(',')} WHERE job_id=? AND chapter_id=?',
        params);
  }

  void setPage(String jobId, String chapterId, int index, String url,
      {String status = 'pending', String? error}) {
    db.execute(
      'INSERT INTO download_pages (user_id,job_id,chapter_id,page_index,image_url,'
      'status,error) VALUES ((SELECT user_id FROM download_jobs WHERE id=?),?,?,?,?,?,?) '
      'ON CONFLICT(job_id,chapter_id,page_index) DO UPDATE SET '
      'image_url=excluded.image_url,status=excluded.status,error=excluded.error',
      [jobId, jobId, chapterId, index, url, status, error],
    );
  }

  void deleteJob(int userId, String id) => db.execute(
      'DELETE FROM download_jobs WHERE user_id=? AND id=?', [userId, id]);

  String? nextQueuedJob(int userId) {
    final rows = db.select(
      "SELECT id FROM download_jobs WHERE user_id=? AND state='queued' "
      'ORDER BY created_at ASC LIMIT 1',
      [userId],
    );
    return rows.isEmpty ? null : rows.first['id'] as String;
  }

  // ---- uploads ---------------------------------------------------------

  Map<String, Object?>? upload(int userId, String id) {
    final rows = db.select(
        'SELECT * FROM uploads WHERE user_id=? AND id=?', [userId, id]);
    if (rows.isEmpty) return null;
    final r = rows.first;
    return {
      'id': r['id'],
      'name': r['name'],
      'path': r['path'],
      'size': r['size'],
      'mime': r['mime'],
      'received': r['received'],
      'completed': asBool(r['completed']),
      'createdAt': r['created_at'],
    };
  }

  void createUpload({
    required String id,
    required int userId,
    required String name,
    required String path,
    required int size,
    required String mime,
  }) {
    db.execute(
      'INSERT INTO uploads (id,user_id,name,path,size,mime,received,completed,created_at) '
      'VALUES (?,?,?,?,?,?,0,0,?)',
      [id, userId, name, path, size, mime, nowMs()],
    );
  }

  void updateUpload(String id, {int? received, bool? completed}) {
    final sets = <String>[];
    final params = <Object?>[];
    if (received != null) {
      sets.add('received=?');
      params.add(received);
    }
    if (completed != null) {
      sets.add('completed=?');
      params.add(completed ? 1 : 0);
    }
    if (sets.isEmpty) return;
    params.add(id);
    db.execute('UPDATE uploads SET ${sets.join(',')} WHERE id=?', params);
  }

  void deleteUpload(int userId, String id) =>
      db.execute('DELETE FROM uploads WHERE user_id=? AND id=?', [userId, id]);

  List<Map<String, Object?>> uploads(int userId) => db
      .select('SELECT * FROM uploads WHERE user_id=? ORDER BY created_at DESC',
          [userId])
      .map((r) => {
            'id': r['id'],
            'name': r['name'],
            'size': r['size'],
            'mime': r['mime'],
            'received': r['received'],
            'completed': asBool(r['completed']),
            'createdAt': r['created_at'],
          })
      .toList();

  // ---- webdav ----------------------------------------------------------

  Map<String, Object?>? webdav(int userId) {
    final rows =
        db.select('SELECT * FROM webdav_config WHERE user_id=?', [userId]);
    if (rows.isEmpty) return null;
    final r = rows.first;
    return {
      'url': r['url'],
      'username': r['username'],
      'passwordEnc': r['password_enc'],
      'path': r['path'],
      'autoSync': asBool(r['auto_sync']),
      'dataVersion': r['data_version'],
      'lastBackupName': r['last_backup_name'],
      'lastBackupIdentity': r['last_backup_identity'],
      'updatedAt': r['updated_at'],
    };
  }

  void saveWebdav(int userId,
      {required String url,
      required String username,
      String? passwordEnc,
      String path = '/',
      bool autoSync = false,
      int? dataVersion,
      String? lastBackupName,
      String? lastBackupIdentity}) {
    final existing = webdav(userId);
    db.execute(
      'INSERT INTO webdav_config (user_id,url,username,password_enc,path,auto_sync,'
      'data_version,last_backup_name,last_backup_identity,updated_at) '
      'VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET '
      'url=excluded.url,username=excluded.username,'
      'password_enc=COALESCE(excluded.password_enc,password_enc),'
      'path=excluded.path,auto_sync=excluded.auto_sync,'
      'data_version=COALESCE(excluded.data_version,data_version),'
      'last_backup_name=COALESCE(excluded.last_backup_name,last_backup_name),'
      'last_backup_identity=COALESCE(excluded.last_backup_identity,last_backup_identity),'
      'updated_at=excluded.updated_at',
      [
        userId,
        url,
        username,
        passwordEnc,
        path,
        autoSync ? 1 : 0,
        dataVersion ?? existing?['dataVersion'] ?? 0,
        lastBackupName,
        lastBackupIdentity,
        nowMs(),
      ],
    );
  }

  void deleteWebdav(int userId) =>
      db.execute('DELETE FROM webdav_config WHERE user_id=?', [userId]);
}

void requireOwned(bool condition) {
  if (!condition) throw ApiException.notFound();
}
