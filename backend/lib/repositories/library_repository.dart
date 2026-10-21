import 'dart:convert';

import '../db/database.dart';
import '../db/rows.dart';
import '../util/errors.dart';

class FavoriteRecord {
  final int folderId;
  final String comicId;
  final int comicType;
  final String name;
  final String author;
  final List<Object?> tags;
  final List<Object?> translatedTags;
  final String coverPath;
  final String description;
  final String favoritedAt;
  final int displayOrder;
  final String? lastUpdateTime;
  final bool hasNewUpdate;
  final int? lastCheckTime;
  final int? lastAttemptTime;
  final List<Object?>? lastUpdateChapters;

  FavoriteRecord({
    required this.folderId,
    required this.comicId,
    required this.comicType,
    required this.name,
    required this.author,
    required this.tags,
    required this.translatedTags,
    required this.coverPath,
    required this.description,
    required this.favoritedAt,
    required this.displayOrder,
    required this.lastUpdateTime,
    required this.hasNewUpdate,
    required this.lastCheckTime,
    required this.lastAttemptTime,
    required this.lastUpdateChapters,
  });

  factory FavoriteRecord.fromRow(Map<String, Object?> row) {
    List<Object?> list(Object? raw) {
      try {
        final value = jsonDecode(raw as String);
        return value is List ? value : const [];
      } catch (_) {
        return const [];
      }
    }

    List<Object?>? nullableList(Object? raw) {
      if (raw == null) return null;
      return list(raw);
    }

    return FavoriteRecord(
      folderId: row['folder_id'] as int,
      comicId: row['comic_id'] as String,
      comicType: row['comic_type'] as int,
      name: row['name'] as String,
      author: row['author'] as String? ?? '',
      tags: list(row['tags_json']),
      translatedTags: list(row['translated_tags_json']),
      coverPath: row['cover_path'] as String? ?? '',
      description: row['description'] as String? ?? '',
      favoritedAt: row['favorited_at'] as String,
      displayOrder: row['display_order'] as int,
      lastUpdateTime: row['last_update_time'] as String?,
      hasNewUpdate: asBool(row['has_new_update']),
      lastCheckTime: row['last_check_time'] as int?,
      lastAttemptTime: row['last_attempt_time'] as int?,
      lastUpdateChapters: nullableList(row['last_update_chapters_json']),
    );
  }

  Map<String, Object?> toJson() => {
        'id': comicId,
        'comicType': comicType,
        'title': name,
        'subtitle': author,
        'cover': coverPath,
        'description': description,
        'tags': tags,
        'translatedTags': translatedTags,
        'folderId': folderId,
        'favoritedAt': favoritedAt,
        'displayOrder': displayOrder,
        'lastUpdateTime': lastUpdateTime,
        'hasNewUpdate': hasNewUpdate,
        'lastCheckTime': lastCheckTime,
        'lastAttemptTime': lastAttemptTime,
      };
}

class FavoriteRepository {
  final Db db;
  FavoriteRepository(this.db);

  List<Map<String, Object?>> folders(int userId) {
    final rows = db.select(
      'SELECT f.*, (SELECT COUNT(*) FROM favorites x WHERE x.folder_id = f.id) AS count '
      'FROM favorite_folders f WHERE f.user_id = ? ORDER BY f.sort_order, f.id',
      [userId],
    );
    return rows
        .map((r) => {
              'id': r['id'],
              'name': r['name'],
              'sortOrder': r['sort_order'],
              'count': r['count'],
              'sourceKey': r['source_key'],
              'sourceFolder': r['source_folder'],
              'createdAt': r['created_at'],
            })
        .toList();
  }

  Map<String, Object?>? folder(int userId, int id) {
    final rows = db.select(
        'SELECT * FROM favorite_folders WHERE user_id = ? AND id = ?',
        [userId, id]);
    if (rows.isEmpty) return null;
    final r = rows.first;
    return {
      'id': r['id'],
      'name': r['name'],
      'sortOrder': r['sort_order'],
      'sourceKey': r['source_key'],
      'sourceFolder': r['source_folder'],
      'createdAt': r['created_at'],
    };
  }

  int createFolder(int userId, String name) {
    if (name.trim().isEmpty) throw ApiException.badRequest('文件夹名称不能为空');
    if (name.length > 64) throw ApiException.badRequest('文件夹名称过长');
    final exists = db.select(
        'SELECT 1 FROM favorite_folders WHERE user_id = ? AND name = ?',
        [userId, name]);
    if (exists.isNotEmpty) throw ApiException.conflict('文件夹已存在');
    final order = db.select(
        'SELECT COALESCE(MAX(sort_order),-1)+1 AS n FROM favorite_folders WHERE user_id = ?',
        [userId]).first['n'] as int;
    return db.insert(
      'INSERT INTO favorite_folders (user_id,name,sort_order,created_at) VALUES (?,?,?,?)',
      [userId, name, order, nowMs()],
    );
  }

  void linkFolder(int userId, int id,
      {String? sourceKey, String? sourceFolder}) {
    if (folder(userId, id) == null) throw ApiException.notFound('未找到文件夹');
    db.execute(
      'UPDATE favorite_folders SET source_key = ?, source_folder = ? '
      'WHERE user_id = ? AND id = ?',
      [sourceKey, sourceFolder, userId, id],
    );
  }

  void renameFolder(int userId, int id, String name) {
    if (name.trim().isEmpty) throw ApiException.badRequest('文件夹名称不能为空');
    final clash = db.select(
        'SELECT 1 FROM favorite_folders WHERE user_id = ? AND name = ? AND id <> ?',
        [userId, name, id]);
    if (clash.isNotEmpty) throw ApiException.conflict('文件夹已存在');
    db.execute(
        'UPDATE favorite_folders SET name = ? WHERE user_id = ? AND id = ?',
        [name, userId, id]);
  }

  void deleteFolder(int userId, int id) {
    db.execute('DELETE FROM favorite_folders WHERE user_id = ? AND id = ?',
        [userId, id]);
  }

  void sortFolders(int userId, List<int> ids) {
    db.transaction(() {
      for (var i = 0; i < ids.length; i++) {
        db.execute(
            'UPDATE favorite_folders SET sort_order = ? WHERE user_id = ? AND id = ?',
            [i, userId, ids[i]]);
      }
    });
  }

  Map<String, Object?> listFavorites(
    int userId, {
    int? folderId,
    String? query,
    String? status,
    int page = 1,
    int pageSize = 60,
  }) {
    final where = <String>['f.user_id = ?'];
    final params = <Object?>[userId];
    if (folderId != null) {
      where.add('f.folder_id = ?');
      params.add(folderId);
    }
    if (query != null && query.trim().isNotEmpty) {
      where.add('(f.name LIKE ? OR f.author LIKE ? OR f.tags_json LIKE ?)');
      final like = '%${query.trim()}%';
      params.addAll([like, like, like]);
    }
    if (status == 'completed') {
      where.add('EXISTS (SELECT 1 FROM history h WHERE h.user_id = f.user_id '
          'AND h.comic_id = f.comic_id AND h.comic_type = f.comic_type '
          'AND h.max_page IS NOT NULL AND h.page >= h.max_page)');
    } else if (status == 'uncompleted') {
      where.add(
          'NOT EXISTS (SELECT 1 FROM history h WHERE h.user_id = f.user_id '
          'AND h.comic_id = f.comic_id AND h.comic_type = f.comic_type '
          'AND h.max_page IS NOT NULL AND h.page >= h.max_page)');
    }
    final whereSql = where.join(' AND ');
    final total = db
        .select('SELECT COUNT(*) AS c FROM favorites f WHERE $whereSql', params)
        .first['c'] as int;
    final rows = db.select(
      'SELECT f.* FROM favorites f WHERE $whereSql '
      'ORDER BY f.display_order, f.favorited_at DESC LIMIT ? OFFSET ?',
      [...params, pageSize, (page - 1) * pageSize],
    );
    return {
      'items': rows.map((r) => FavoriteRecord.fromRow(r).toJson()).toList(),
      'total': total,
      'page': page,
      'pageSize': pageSize,
    };
  }

  List<FavoriteRecord> allInFolder(int userId, int folderId) => db
      .select(
          'SELECT * FROM favorites WHERE user_id = ? AND folder_id = ? '
          'ORDER BY display_order, favorited_at DESC',
          [userId, folderId])
      .map((r) => FavoriteRecord.fromRow(r))
      .toList();

  List<int> folderIdsForComic(int userId, String comicId, int comicType) => db
      .select(
          'SELECT folder_id FROM favorites WHERE user_id=? AND comic_id=? AND comic_type=?',
          [userId, comicId, comicType])
      .map((r) => r['folder_id'] as int)
      .toList();

  bool isFavorite(int userId, String comicId, int comicType) => db.select(
      'SELECT 1 FROM favorites WHERE user_id=? AND comic_id=? AND comic_type=? LIMIT 1',
      [userId, comicId, comicType]).isNotEmpty;

  void addFavorite(
    int userId,
    int folderId,
    Map<String, Object?> comic, {
    bool atStart = false,
  }) {
    final folder = this.folder(userId, folderId);
    if (folder == null) throw ApiException.notFound('未找到文件夹');
    final comicId = (comic['id'] ?? '').toString();
    if (comicId.isEmpty) throw ApiException.badRequest('缺少漫画 ID');
    final comicType = (comic['comicType'] as int?) ?? 0;
    final existing = db.select(
        'SELECT 1 FROM favorites WHERE folder_id=? AND comic_id=? AND comic_type=?',
        [folderId, comicId, comicType]);
    if (existing.isNotEmpty) return;
    final order = db.select(
      'SELECT ${atStart ? 'COALESCE(MIN(display_order),1)-1' : 'COALESCE(MAX(display_order),-1)+1'} AS n '
      'FROM favorites WHERE folder_id = ?',
      [folderId],
    ).first['n'] as int;
    final tags = comic['tags'];
    final translated = comic['translatedTags'];
    db.execute(
      'INSERT INTO favorites (user_id,folder_id,comic_id,comic_type,name,author,'
      'tags_json,translated_tags_json,cover_path,description,favorited_at,display_order) '
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [
        userId,
        folderId,
        comicId,
        comicType,
        (comic['title'] ?? comic['name'] ?? '').toString(),
        (comic['subtitle'] ?? comic['author'] ?? '').toString(),
        jsonEncode(tags is List ? tags : const []),
        jsonEncode(translated is List ? translated : const []),
        (comic['cover'] ?? comic['coverPath'] ?? '').toString(),
        (comic['description'] ?? '').toString(),
        DateTime.now()
            .toIso8601String()
            .replaceFirst('T', ' ')
            .substring(0, 19),
        order,
      ],
    );
  }

  void removeFavorite(int userId, int folderId, String comicId, int comicType) {
    db.execute(
      'DELETE FROM favorites WHERE user_id=? AND folder_id=? AND comic_id=? AND comic_type=?',
      [userId, folderId, comicId, comicType],
    );
  }

  void removeFromAll(int userId, String comicId, int comicType) {
    db.execute(
      'DELETE FROM favorites WHERE user_id=? AND comic_id=? AND comic_type=?',
      [userId, comicId, comicType],
    );
  }

  void moveOrCopy({
    required int userId,
    required int fromFolder,
    required int toFolder,
    required List<Map<String, Object?>> comics,
    required bool move,
  }) {
    if (folder(userId, toFolder) == null) throw ApiException.notFound('未找到文件夹');
    db.transaction(() {
      var order = db.select(
          'SELECT COALESCE(MAX(display_order),-1)+1 AS n FROM favorites WHERE folder_id=?',
          [toFolder]).first['n'] as int;
      for (final comic in comics) {
        final id = (comic['comicId'] ?? comic['id'] ?? '').toString();
        final type = (comic['comicType'] as int?) ?? 0;
        final rows = db.select(
          'SELECT * FROM favorites WHERE user_id=? AND folder_id=? AND comic_id=? AND comic_type=?',
          [userId, fromFolder, id, type],
        );
        if (rows.isEmpty) continue;
        final r = rows.first;
        final exists = db.select(
          'SELECT 1 FROM favorites WHERE folder_id=? AND comic_id=? AND comic_type=?',
          [toFolder, id, type],
        );
        if (exists.isEmpty) {
          db.execute(
            'INSERT INTO favorites (user_id,folder_id,comic_id,comic_type,name,author,'
            'tags_json,translated_tags_json,cover_path,favorited_at,display_order,'
            'last_update_time,has_new_update,last_check_time,last_attempt_time,'
            'last_update_chapters_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
              userId,
              toFolder,
              id,
              type,
              r['name'],
              r['author'],
              r['tags_json'],
              r['translated_tags_json'],
              r['cover_path'],
              r['favorited_at'],
              order++,
              r['last_update_time'],
              r['has_new_update'],
              r['last_check_time'],
              r['last_attempt_time'],
              r['last_update_chapters_json'],
            ],
          );
        }
        if (move) {
          db.execute(
            'DELETE FROM favorites WHERE user_id=? AND folder_id=? AND comic_id=? AND comic_type=?',
            [userId, fromFolder, id, type],
          );
        }
      }
    });
  }

  void batchDelete(int userId, List<Map<String, Object?>> comics) {
    db.transaction(() {
      for (final comic in comics) {
        final id = (comic['comicId'] ?? comic['id'] ?? '').toString();
        final type = (comic['comicType'] as int?) ?? 0;
        final folderId = comic['folderId'] as int?;
        if (folderId != null) {
          removeFavorite(userId, folderId, id, type);
        } else {
          removeFromAll(userId, id, type);
        }
      }
    });
  }

  void updateFavoriteInfo(
    int userId,
    int folderId,
    String comicId,
    int comicType, {
    String? title,
    String? author,
    String? cover,
    String? description,
    List<Object?>? tags,
    String? lastUpdateTime,
    bool? hasNewUpdate,
    int? lastCheckTime,
    int? lastAttemptTime,
    List<Object?>? lastUpdateChapters,
  }) {
    final sets = <String>[];
    final params = <Object?>[];
    void set(String col, Object? value) {
      if (value == null) return;
      sets.add('$col = ?');
      params.add(value);
    }

    set('name', title);
    set('author', author);
    set('cover_path', cover);
    set('description', description);
    if (tags != null) set('tags_json', jsonEncode(tags));
    set('last_update_time', lastUpdateTime);
    if (hasNewUpdate != null) set('has_new_update', hasNewUpdate ? 1 : 0);
    set('last_check_time', lastCheckTime);
    set('last_attempt_time', lastAttemptTime);
    if (lastUpdateChapters != null) {
      set('last_update_chapters_json', jsonEncode(lastUpdateChapters));
    }
    if (sets.isEmpty) return;
    params.addAll([userId, folderId, comicId, comicType]);
    db.execute(
      'UPDATE favorites SET ${sets.join(', ')} WHERE user_id=? AND folder_id=? '
      'AND comic_id=? AND comic_type=?',
      params,
    );
  }

  void setUpdateState({
    required int userId,
    required int folderId,
    required String comicId,
    required int comicType,
    required String? lastUpdateTime,
    required bool hasNewUpdate,
    required int checkTime,
    required List<Object?> chapters,
  }) {
    db.execute(
      'UPDATE favorites SET last_update_time=?,has_new_update=?,last_check_time=?,'
      'last_attempt_time=NULL,last_update_chapters_json=? '
      'WHERE user_id=? AND folder_id=? AND comic_id=? AND comic_type=?',
      [
        lastUpdateTime,
        hasNewUpdate ? 1 : 0,
        checkTime,
        jsonEncode(chapters),
        userId,
        folderId,
        comicId,
        comicType,
      ],
    );
  }

  void markAttempt({
    required int userId,
    required int folderId,
    required String comicId,
    required int comicType,
    required int attemptTime,
  }) {
    db.execute(
      'UPDATE favorites SET last_attempt_time=? WHERE user_id=? AND folder_id=? '
      'AND comic_id=? AND comic_type=?',
      [attemptTime, userId, folderId, comicId, comicType],
    );
  }

  void markAllRead(int userId, {int? folderId}) {
    if (folderId != null) {
      db.execute(
          'UPDATE favorites SET has_new_update=0 WHERE user_id=? AND folder_id=?',
          [userId, folderId]);
    } else {
      db.execute(
          'UPDATE favorites SET has_new_update=0 WHERE user_id=?', [userId]);
    }
  }

  int updateCount(int userId, {int? folderId}) => db.select(
      'SELECT COUNT(*) AS c FROM favorites WHERE user_id=? AND has_new_update=1'
      '${folderId != null ? ' AND folder_id=?' : ''}',
      [userId, if (folderId != null) folderId]).first['c'] as int;
}

class HistoryRecord {
  final String comicId;
  final int comicType;
  final String sourceKey;
  final String title;
  final String subtitle;
  final String cover;
  final int lastReadAt;
  final int ep;
  final int page;
  final int? chapterGroup;
  final List<Object?> readEpisode;
  final int? maxPage;

  HistoryRecord({
    required this.comicId,
    required this.comicType,
    required this.sourceKey,
    required this.title,
    required this.subtitle,
    required this.cover,
    required this.lastReadAt,
    required this.ep,
    required this.page,
    required this.chapterGroup,
    required this.readEpisode,
    required this.maxPage,
  });

  factory HistoryRecord.fromRow(Map<String, Object?> row) {
    List<Object?> readEpisode;
    try {
      final value = jsonDecode(row['read_episode_json'] as String? ?? '[]');
      readEpisode = value is List ? value : const [];
    } catch (_) {
      readEpisode = const [];
    }
    return HistoryRecord(
      comicId: row['comic_id'] as String,
      comicType: row['comic_type'] as int,
      sourceKey: row['source_key'] as String? ?? '',
      title: row['title'] as String,
      subtitle: row['subtitle'] as String? ?? '',
      cover: row['cover'] as String? ?? '',
      lastReadAt: row['last_read_at'] as int,
      ep: row['ep'] as int,
      page: row['page'] as int,
      chapterGroup: row['chapter_group'] as int?,
      readEpisode: readEpisode,
      maxPage: row['max_page'] as int?,
    );
  }

  Map<String, Object?> toJson() => {
        'id': comicId,
        'comicType': comicType,
        'sourceKey': sourceKey,
        'title': title,
        'subtitle': subtitle,
        'cover': cover,
        'time': lastReadAt,
        'ep': ep,
        'page': page,
        'chapterGroup': chapterGroup,
        'readEpisode': readEpisode,
        'maxPage': maxPage,
      };
}

class HistoryRepository {
  final Db db;
  HistoryRepository(this.db);

  void upsert({
    required int userId,
    required String comicId,
    required int comicType,
    required String sourceKey,
    required String title,
    required String subtitle,
    required String cover,
    required int ep,
    required int page,
    int? chapterGroup,
    List<Object?> readEpisode = const [],
    int? maxPage,
  }) {
    db.execute(
      'INSERT INTO history (user_id,comic_id,comic_type,source_key,title,subtitle,'
      'cover,last_read_at,ep,page,chapter_group,read_episode_json,max_page) '
      'VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,comic_id,comic_type) '
      'DO UPDATE SET source_key=excluded.source_key,title=excluded.title,'
      'subtitle=excluded.subtitle,cover=excluded.cover,last_read_at=excluded.last_read_at,'
      'ep=excluded.ep,page=excluded.page,chapter_group=excluded.chapter_group,'
      'read_episode_json=excluded.read_episode_json,max_page=excluded.max_page',
      [
        userId,
        comicId,
        comicType,
        sourceKey,
        title,
        subtitle,
        cover,
        nowMs(),
        ep,
        page,
        chapterGroup,
        jsonEncode(readEpisode),
        maxPage,
      ],
    );
  }

  Map<String, Object?> list(int userId,
      {String? query, int page = 1, int pageSize = 60}) {
    final where = <String>['user_id = ?'];
    final params = <Object?>[userId];
    if (query != null && query.trim().isNotEmpty) {
      where.add('(title LIKE ? OR subtitle LIKE ? OR comic_id LIKE ?)');
      final like = '%${query.trim()}%';
      params.addAll([like, like, like]);
    }
    final whereSql = where.join(' AND ');
    final total = db
        .select('SELECT COUNT(*) AS c FROM history WHERE $whereSql', params)
        .first['c'] as int;
    final rows = db.select(
      'SELECT * FROM history WHERE $whereSql ORDER BY last_read_at DESC LIMIT ? OFFSET ?',
      [...params, pageSize, (page - 1) * pageSize],
    );
    return {
      'items': rows.map((r) => HistoryRecord.fromRow(r).toJson()).toList(),
      'total': total,
      'page': page,
      'pageSize': pageSize,
    };
  }

  List<HistoryRecord> recent(int userId, [int limit = 20]) => db
      .select(
          'SELECT * FROM history WHERE user_id=? ORDER BY last_read_at DESC LIMIT ?',
          [userId, limit])
      .map((r) => HistoryRecord.fromRow(r))
      .toList();

  HistoryRecord? progress(int userId, String comicId, int comicType) {
    final rows = db.select(
        'SELECT * FROM history WHERE user_id=? AND comic_id=? AND comic_type=?',
        [userId, comicId, comicType]);
    if (rows.isEmpty) return null;
    return HistoryRecord.fromRow(rows.first);
  }

  void delete(int userId, String comicId, int comicType) => db.execute(
      'DELETE FROM history WHERE user_id=? AND comic_id=? AND comic_type=?',
      [userId, comicId, comicType]);

  void clear(int userId, {bool unfavoritedOnly = false}) {
    if (unfavoritedOnly) {
      db.execute(
        'DELETE FROM history WHERE user_id=? AND NOT EXISTS ('
        'SELECT 1 FROM favorites f WHERE f.user_id=history.user_id '
        'AND f.comic_id=history.comic_id AND f.comic_type=history.comic_type)',
        [userId],
      );
    } else {
      db.execute('DELETE FROM history WHERE user_id=?', [userId]);
    }
  }

  int count(int userId) => db.select(
      'SELECT COUNT(*) AS c FROM history WHERE user_id=?',
      [userId]).first['c'] as int;

  void updateMeta(int userId, String comicId, int comicType,
      {String? title, String? subtitle, String? cover}) {
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
    if (cover != null) {
      sets.add('cover=?');
      params.add(cover);
    }
    if (sets.isEmpty) return;
    params.addAll([userId, comicId, comicType]);
    db.execute(
        'UPDATE history SET ${sets.join(',')} WHERE user_id=? AND comic_id=? AND comic_type=?',
        params);
  }
}

class ReadLaterRecord {
  final String comicId;
  final int comicType;
  final String sourceKey;
  final String title;
  final String subtitle;
  final String description;
  final List<Object?> tags;
  final String cover;
  final int addedAt;

  ReadLaterRecord({
    required this.comicId,
    required this.comicType,
    required this.sourceKey,
    required this.title,
    required this.subtitle,
    required this.description,
    required this.tags,
    required this.cover,
    required this.addedAt,
  });

  factory ReadLaterRecord.fromRow(Map<String, Object?> row) {
    List<Object?> tags;
    try {
      final value = jsonDecode(row['tags_json'] as String? ?? '[]');
      tags = value is List ? value : const [];
    } catch (_) {
      tags = const [];
    }
    return ReadLaterRecord(
      comicId: row['comic_id'] as String,
      comicType: row['comic_type'] as int,
      sourceKey: row['source_key'] as String,
      title: row['title'] as String,
      subtitle: row['subtitle'] as String? ?? '',
      description: row['description'] as String? ?? '',
      tags: tags,
      cover: row['cover'] as String? ?? '',
      addedAt: row['added_at'] as int,
    );
  }

  Map<String, Object?> toJson() => {
        'id': comicId,
        'comicType': comicType,
        'sourceKey': sourceKey,
        'title': title,
        'subtitle': subtitle,
        'description': description,
        'tags': tags,
        'cover': cover,
        'addedAt': addedAt,
      };
}

class ReadLaterRepository {
  final Db db;
  ReadLaterRepository(this.db);

  List<ReadLaterRecord> list(int userId, {String? query}) {
    final rows = query == null || query.trim().isEmpty
        ? db.select(
            'SELECT * FROM read_later WHERE user_id=? ORDER BY added_at DESC',
            [userId])
        : db.select(
            'SELECT * FROM read_later WHERE user_id=? AND (title LIKE ? OR subtitle LIKE ? OR tags_json LIKE ?) ORDER BY added_at DESC',
            [
              userId,
              '%${query.trim()}%',
              '%${query.trim()}%',
              '%${query.trim()}%'
            ],
          );
    return rows.map((r) => ReadLaterRecord.fromRow(r)).toList();
  }

  bool add(int userId, Map<String, Object?> comic) {
    final id = (comic['id'] ?? '').toString();
    if (id.isEmpty) throw ApiException.badRequest('缺少漫画 ID');
    final type = (comic['comicType'] as int?) ?? 0;
    final exists = db.select(
        'SELECT 1 FROM read_later WHERE user_id=? AND comic_id=? AND comic_type=?',
        [userId, id, type]);
    if (exists.isNotEmpty) return false;
    db.execute(
      'INSERT INTO read_later (user_id,comic_id,comic_type,source_key,title,'
      'subtitle,description,tags_json,cover,added_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [
        userId,
        id,
        type,
        (comic['sourceKey'] ?? '').toString(),
        (comic['title'] ?? '').toString(),
        (comic['subtitle'] ?? '').toString(),
        (comic['description'] ?? '').toString(),
        jsonEncode(comic['tags'] is List ? comic['tags'] : const []),
        (comic['cover'] ?? '').toString(),
        nowMs(),
      ],
    );
    return true;
  }

  void remove(int userId, String comicId, int comicType) => db.execute(
      'DELETE FROM read_later WHERE user_id=? AND comic_id=? AND comic_type=?',
      [userId, comicId, comicType]);

  void batchDelete(int userId, List<Map<String, Object?>> items) {
    db.transaction(() {
      for (final item in items) {
        remove(userId, (item['comicId'] ?? item['id'] ?? '').toString(),
            (item['comicType'] as int?) ?? 0);
      }
    });
  }

  void restore(int userId, List<Map<String, Object?>> items) {
    for (final item in items) {
      add(userId, item);
    }
  }

  void clear(int userId) =>
      db.execute('DELETE FROM read_later WHERE user_id=?', [userId]);

  int count(int userId) => db.select(
      'SELECT COUNT(*) AS c FROM read_later WHERE user_id=?',
      [userId]).first['c'] as int;
}

class StatisticsRepository {
  final Db db;
  StatisticsRepository(this.db);

  void record({
    required int userId,
    required String comicId,
    required int comicType,
    required String title,
    required String author,
    required String cover,
    required int seconds,
    String sourceKey = '',
  }) {
    if (seconds <= 0) return;
    final now = DateTime.now();
    final day =
        '${now.year.toString().padLeft(4, '0')}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
    db.execute(
      'INSERT INTO reading_statistics (user_id,day,comic_id,comic_type,title,'
      'author,cover,source_key,duration_seconds,last_read_at) VALUES (?,?,?,?,?,?,?,?,?,?) '
      'ON CONFLICT(user_id,day,comic_id,comic_type) DO UPDATE SET '
      'duration_seconds=duration_seconds+excluded.duration_seconds,'
      'last_read_at=MAX(last_read_at,excluded.last_read_at),'
      'title=excluded.title,author=excluded.author,cover=excluded.cover',
      [
        userId,
        day,
        comicId,
        comicType,
        title,
        author,
        cover,
        sourceKey,
        seconds,
        nowMs()
      ],
    );
  }

  Map<String, Object?> summary(int userId, {int days = 30}) {
    final now = DateTime.now();
    String dayOf(DateTime d) =>
        '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
    final today = dayOf(now);
    final weekStart = dayOf(now.subtract(const Duration(days: 6)));
    final todaySeconds = db.select(
        'SELECT COALESCE(SUM(duration_seconds),0) AS s FROM reading_statistics '
        'WHERE user_id=? AND day=?',
        [userId, today]).first['s'] as int;
    final weekSeconds = db.select(
        'SELECT COALESCE(SUM(duration_seconds),0) AS s FROM reading_statistics '
        'WHERE user_id=? AND day>=?',
        [userId, weekStart]).first['s'] as int;
    final totalSeconds = db.select(
        'SELECT COALESCE(SUM(duration_seconds),0) AS s FROM reading_statistics WHERE user_id=?',
        [userId]).first['s'] as int;
    final daily = <Map<String, Object?>>[];
    final window = days.clamp(1, 365);
    for (var i = window - 1; i >= 0; i--) {
      final day = dayOf(now.subtract(Duration(days: i)));
      final seconds = db.select(
          'SELECT COALESCE(SUM(duration_seconds),0) AS s FROM reading_statistics '
          'WHERE user_id=? AND day=?',
          [userId, day]).first['s'] as int;
      daily.add({'day': day, 'seconds': seconds});
    }
    final recent = db.select(
      'SELECT comic_id,comic_type,title,author,cover,source_key,SUM(duration_seconds) AS seconds,'
      'MAX(last_read_at) AS last_read_at FROM reading_statistics WHERE user_id=? '
      'GROUP BY comic_id,comic_type ORDER BY last_read_at DESC LIMIT 50',
      [userId],
    );
    return {
      'todaySeconds': todaySeconds,
      'weekSeconds': weekSeconds,
      'totalSeconds': totalSeconds,
      'daily': daily,
      'recent': recent
          .map((r) => {
                'id': r['comic_id'],
                'comicType': r['comic_type'],
                'title': r['title'],
                'author': r['author'],
                'cover': r['cover'],
                'sourceKey': r['source_key'],
                'seconds': r['seconds'],
                'lastReadAt': r['last_read_at'],
              })
          .toList(),
    };
  }

  void clear(int userId) =>
      db.execute('DELETE FROM reading_statistics WHERE user_id=?', [userId]);

  void deleteComic(int userId, String comicId, int comicType) => db.execute(
      'DELETE FROM reading_statistics WHERE user_id=? AND comic_id=? AND comic_type=?',
      [userId, comicId, comicType]);
}

class FollowUpdateConfig {
  final int? folderId;
  final bool checkOnStart;
  final int intervalHours;
  final String fixedTime;

  FollowUpdateConfig({
    required this.folderId,
    required this.checkOnStart,
    required this.intervalHours,
    required this.fixedTime,
  });

  Map<String, Object?> toJson() => {
        'folderId': folderId,
        'checkOnStart': checkOnStart,
        'intervalHours': intervalHours,
        'fixedTime': fixedTime,
      };
}

class FollowUpdateRepository {
  final Db db;
  FollowUpdateRepository(this.db);

  FollowUpdateConfig config(int userId) {
    final rows = db
        .select('SELECT * FROM follow_update_config WHERE user_id=?', [userId]);
    if (rows.isEmpty) {
      return FollowUpdateConfig(
          folderId: null, checkOnStart: true, intervalHours: 24, fixedTime: '');
    }
    final r = rows.first;
    return FollowUpdateConfig(
      folderId: r['folder_id'] as int?,
      checkOnStart: asBool(r['check_on_start']),
      intervalHours: r['interval_hours'] as int,
      fixedTime: r['fixed_time'] as String? ?? '',
    );
  }

  void saveConfig(int userId, FollowUpdateConfig config) {
    db.execute(
      'INSERT INTO follow_update_config (user_id,folder_id,check_on_start,'
      'interval_hours,fixed_time) VALUES (?,?,?,?,?) '
      'ON CONFLICT(user_id) DO UPDATE SET folder_id=excluded.folder_id,'
      'check_on_start=excluded.check_on_start,'
      'interval_hours=excluded.interval_hours,fixed_time=excluded.fixed_time',
      [
        userId,
        config.folderId,
        config.checkOnStart ? 1 : 0,
        config.intervalHours,
        config.fixedTime,
      ],
    );
  }

  List<({int userId, FollowUpdateConfig config})> allConfigs() {
    final rows = db.select(
        'SELECT user_id,folder_id,check_on_start,interval_hours,fixed_time '
        'FROM follow_update_config WHERE folder_id IS NOT NULL');
    return rows.map((r) {
      return (
        userId: r['user_id'] as int,
        config: FollowUpdateConfig(
          folderId: r['folder_id'] as int?,
          checkOnStart: asBool(r['check_on_start']),
          intervalHours: r['interval_hours'] as int,
          fixedTime: r['fixed_time'] as String? ?? '',
        ),
      );
    }).toList();
  }

  int? lastRunAt(int userId) {
    final rows = db.select(
        'SELECT updated_at FROM follow_update_config WHERE user_id=?',
        [userId]);
    return rows.isEmpty ? null : rows.first['updated_at'] as int;
  }

  void recordRun(int userId) {
    db.execute('UPDATE follow_update_config SET updated_at=? WHERE user_id=?',
        [nowMs(), userId]);
  }

  Map<String, Object?> comicPreferences(
      int userId, String comicId, String sourceKey) {
    final rows = db.select(
        'SELECT * FROM comic_preferences WHERE user_id=? AND comic_id=? AND source_key=?',
        [userId, comicId, sourceKey]);
    if (rows.isEmpty) return {};
    final r = rows.first;
    return {
      'chapterOrder': r['chapter_order'],
      'chapterReadingOrder': r['chapter_reading_order'],
      'orientationMode': r['orientation_mode'],
      'detectedReadingOrder': r['detected_reading_order'],
    };
  }

  void saveComicPreferences(int userId, String comicId, String sourceKey,
      {String? chapterOrder,
      String? chapterReadingOrder,
      String? orientationMode,
      int? detectedReadingOrder}) {
    db.execute(
      'INSERT INTO comic_preferences (user_id,comic_id,source_key,chapter_order,'
      'chapter_reading_order,orientation_mode,detected_reading_order) '
      'VALUES (?,?,?,?,?,?,?) ON CONFLICT(user_id,comic_id,source_key) DO UPDATE SET '
      'chapter_order=COALESCE(excluded.chapter_order,chapter_order),'
      'chapter_reading_order=COALESCE(excluded.chapter_reading_order,chapter_reading_order),'
      'orientation_mode=COALESCE(excluded.orientation_mode,orientation_mode),'
      'detected_reading_order=COALESCE(excluded.detected_reading_order,detected_reading_order)',
      [
        userId,
        comicId,
        sourceKey,
        chapterOrder,
        chapterReadingOrder,
        orientationMode,
        detectedReadingOrder,
      ],
    );
  }
}
