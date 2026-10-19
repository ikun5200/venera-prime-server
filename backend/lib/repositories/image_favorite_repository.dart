import 'dart:convert';

import '../db/database.dart';
import '../db/rows.dart';
import '../util/errors.dart';

class ImageFavoriteRepository {
  final Db db;
  ImageFavoriteRepository(this.db);

  Map<String, Object?> list(
    int userId, {
    String? query,
    String sort = 'Title',
    String? timeFilter,
    int minCount = 0,
  }) {
    final where = <String>['f.user_id = ?'];
    final params = <Object?>[userId];
    if (query != null && query.trim().isNotEmpty) {
      where.add('(f.title LIKE ? OR f.author LIKE ? OR f.tags_json LIKE ?)');
      final like = '%${query.trim()}%';
      params.addAll([like, like, like]);
    }
    if (minCount > 0) {
      where.add('(SELECT COUNT(*) FROM image_favorite_pages p WHERE '
          'p.user_id=f.user_id AND p.comic_id=f.comic_id AND p.source_key=f.source_key) >= ?');
      params.add(minCount);
    }
    if (timeFilter != null && timeFilter.isNotEmpty) {
      final now = DateTime.now();
      final Duration? span = switch (timeFilter) {
        'lastWeek' => const Duration(days: 7),
        'lastMonth' => const Duration(days: 30),
        'lastHalfYear' => const Duration(days: 182),
        'lastYear' => const Duration(days: 365),
        _ => null,
      };
      if (span != null) {
        where.add('f.favorited_at >= ?');
        params.add(now.subtract(span).millisecondsSinceEpoch);
      }
    }
    final order = switch (sort) {
      'Time Asc' => 'f.favorited_at ASC',
      'Time Desc' => 'f.favorited_at DESC',
      'Favorite Num' || 'Favorite Num Compare Comic Pages' =>
        '(SELECT COUNT(*) FROM image_favorite_pages p WHERE p.user_id=f.user_id '
            'AND p.comic_id=f.comic_id AND p.source_key=f.source_key) DESC',
      _ => 'f.title COLLATE NOCASE ASC',
    };
    final rows = db.select(
        'SELECT f.* FROM image_favorites f WHERE ${where.join(' AND ')} ORDER BY $order',
        params);
    final items = <Map<String, Object?>>[];
    for (final row in rows) {
      final comicId = row['comic_id'] as String;
      final sourceKey = row['source_key'] as String;
      final chapters = db.select(
        'SELECT * FROM image_favorite_chapters WHERE user_id=? AND comic_id=? AND source_key=? '
        'ORDER BY ep',
        [userId, comicId, sourceKey],
      );
      final chapterList = <Map<String, Object?>>[];
      var totalPages = 0;
      for (final chapter in chapters) {
        final pages = db.select(
          'SELECT * FROM image_favorite_pages WHERE user_id=? AND comic_id=? '
          'AND source_key=? AND eid=? ORDER BY page',
          [userId, comicId, sourceKey, chapter['eid']],
        );
        totalPages += pages.length;
        chapterList.add({
          'eid': chapter['eid'],
          'ep': chapter['ep'],
          'epName': chapter['ep_name'],
          'maxPage': chapter['max_page'],
          'images': pages
              .map((p) => {
                    'page': p['page'],
                    'imageKey': p['image_key'],
                    if (p['is_auto_favorite'] != null)
                      'isAutoFavorite': asBool(p['is_auto_favorite']),
                  })
              .toList(),
        });
      }
      if (totalPages == 0) continue;
      Object? tags;
      Object? translated;
      try {
        tags = jsonDecode(row['tags_json'] as String);
      } catch (_) {
        tags = const [];
      }
      try {
        translated = jsonDecode(row['translated_tags_json'] as String);
      } catch (_) {
        translated = const [];
      }
      items.add({
        'id': comicId,
        'sourceKey': sourceKey,
        'title': row['title'],
        'subtitle': row['sub_title'],
        'author': row['author'],
        'tags': tags,
        'translatedTags': translated,
        'cover': _coverFor(userId, comicId, sourceKey),
        'time': row['favorited_at'],
        'maxPage': row['max_page'],
        'count': totalPages,
        'chapters': chapterList,
      });
    }
    return {'items': items, 'total': items.length};
  }

  String _coverFor(int userId, String comicId, String sourceKey) {
    final first = db.select(
      'SELECT image_key,page FROM image_favorite_pages WHERE user_id=? AND comic_id=? '
      'AND source_key=? ORDER BY page LIMIT 1',
      [userId, comicId, sourceKey],
    );
    if (first.isEmpty) return '';
    return first.first['image_key'] as String;
  }

  void add({
    required int userId,
    required Map<String, Object?> comic,
    required int ep,
    required String eid,
    required String epName,
    required int page,
    required String imageKey,
    required bool auto,
    required String sourceKey,
  }) {
    final comicId = (comic['id'] ?? '').toString();
    if (comicId.isEmpty || eid.isEmpty || page <= 0 || ep <= 0) {
      throw ApiException.badRequest('Invalid image favorite');
    }
    final now = nowMs();
    db.transaction(() {
      db.execute(
        'INSERT INTO image_favorites (user_id,comic_id,source_key,title,sub_title,'
        'author,tags_json,translated_tags_json,favorited_at,max_page,other_json) '
        'VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,comic_id,source_key) '
        'DO UPDATE SET title=excluded.title,sub_title=excluded.sub_title,'
        'author=excluded.author,tags_json=excluded.tags_json,'
        'translated_tags_json=excluded.translated_tags_json,favorited_at=excluded.favorited_at',
        [
          userId,
          comicId,
          sourceKey,
          (comic['title'] ?? '').toString(),
          (comic['subtitle'] ?? '').toString(),
          (comic['subtitle'] ?? '').toString(),
          jsonEncode(comic['tags'] is List ? comic['tags'] : const []),
          jsonEncode(
              comic['translatedTags'] is List ? comic['translatedTags'] : const []),
          now,
          (comic['maxPage'] as int?) ?? 0,
          '{}',
        ],
      );
      db.execute(
        'INSERT INTO image_favorite_chapters (user_id,comic_id,source_key,eid,ep,'
        'ep_name,max_page) VALUES (?,?,?,?,?,?,?) '
        'ON CONFLICT(user_id,comic_id,source_key,eid) DO UPDATE SET '
        'ep=excluded.ep,ep_name=excluded.ep_name,max_page=excluded.max_page',
        [userId, comicId, sourceKey, eid, ep, epName, (comic['maxPage'] as int?) ?? 0],
      );
      db.execute(
        'INSERT INTO image_favorite_pages (user_id,comic_id,source_key,eid,page,'
        'image_key,is_auto_favorite) VALUES (?,?,?,?,?,?,?) '
        'ON CONFLICT(user_id,comic_id,source_key,eid,page) DO UPDATE SET '
        'image_key=excluded.image_key,is_auto_favorite=excluded.is_auto_favorite',
        [userId, comicId, sourceKey, eid, page, imageKey, auto ? 1 : 0],
      );
    });
  }

  void removeComic(int userId, String comicId, String sourceKey) {
    db.transaction(() {
      db.execute(
          'DELETE FROM image_favorite_pages WHERE user_id=? AND comic_id=? AND source_key=?',
          [userId, comicId, sourceKey]);
      db.execute(
          'DELETE FROM image_favorite_chapters WHERE user_id=? AND comic_id=? AND source_key=?',
          [userId, comicId, sourceKey]);
      db.execute(
          'DELETE FROM image_favorites WHERE user_id=? AND comic_id=? AND source_key=?',
          [userId, comicId, sourceKey]);
    });
  }

  void removePage(
      int userId, String comicId, String sourceKey, String eid, int page) {
    db.transaction(() {
      db.execute(
        'DELETE FROM image_favorite_pages WHERE user_id=? AND comic_id=? AND source_key=? '
        'AND eid=? AND page=?',
        [userId, comicId, sourceKey, eid, page],
      );
      final remaining = db.select(
        'SELECT COUNT(*) AS c FROM image_favorite_pages WHERE user_id=? AND comic_id=? '
        'AND source_key=? AND eid=?',
        [userId, comicId, sourceKey, eid],
      ).first['c'] as int;
      if (remaining == 0) {
        db.execute(
          'DELETE FROM image_favorite_chapters WHERE user_id=? AND comic_id=? '
          'AND source_key=? AND eid=?',
          [userId, comicId, sourceKey, eid],
        );
      }
      final total = db.select(
        'SELECT COUNT(*) AS c FROM image_favorite_pages WHERE user_id=? AND comic_id=? AND source_key=?',
        [userId, comicId, sourceKey],
      ).first['c'] as int;
      if (total == 0) {
        db.execute(
          'DELETE FROM image_favorites WHERE user_id=? AND comic_id=? AND source_key=?',
          [userId, comicId, sourceKey],
        );
      }
    });
  }

  Map<String, Object?> stats(int userId) {
    final tags = db.select(
      'SELECT tags_json FROM image_favorites WHERE user_id=?',
      [userId],
    );
    final tagCount = <String, int>{};
    final authorCount = <String, int>{};
    final comicCount = <String, Map<String, Object?>>{};
    for (final row in tags) {
      try {
        final list = jsonDecode(row['tags_json'] as String);
        if (list is List) {
          for (final tag in list) {
            tagCount.update(tag.toString(), (v) => v + 1, ifAbsent: () => 1);
          }
        }
      } catch (_) {}
    }
    final rows = db.select(
      'SELECT f.title,f.author,f.comic_id,f.source_key,'
      '(SELECT COUNT(*) FROM image_favorite_pages p WHERE p.user_id=f.user_id '
      'AND p.comic_id=f.comic_id AND p.source_key=f.source_key) AS c '
      'FROM image_favorites f WHERE f.user_id=?',
      [userId],
    );
    for (final row in rows) {
      final author = row['author'] as String? ?? '';
      if (author.isNotEmpty) {
        authorCount.update(author, (v) => v + 1, ifAbsent: () => 1);
      }
      final title = row['title'] as String? ?? '';
      if (title.isNotEmpty) {
        comicCount[title] = {
          'title': title,
          'id': row['comic_id'],
          'sourceKey': row['source_key'],
          'count': row['c'],
        };
      }
    }
    List<Map<String, Object?>> top(Map<String, int> map) {
      final entries = map.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      return entries
          .take(10)
          .map((e) => {'label': e.key, 'count': e.value})
          .toList();
    }

    final comics = comicCount.values.toList()
      ..sort((a, b) => (b['count'] as int).compareTo(a['count'] as int));
    return {
      'tags': top(tagCount),
      'authors': top(authorCount),
      'comics': comics.take(10).toList(),
      'total': rows.length,
    };
  }
}
