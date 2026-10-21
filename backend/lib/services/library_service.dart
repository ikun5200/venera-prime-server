import 'dart:async';
import 'dart:convert';
import 'dart:math' as math;

import '../db/database.dart';
import '../repositories/image_favorite_repository.dart';
import '../repositories/library_repository.dart';
import '../repositories/source_repository.dart';
import '../util/comic.dart';
import '../util/errors.dart';
import '../util/log.dart';
import 'comic_service.dart';
import 'source_service.dart';
import 'task_service.dart';

class FavoriteService {
  final FavoriteRepository favorites;
  final SourceRepository sources;
  final SourceService sourceService;
  final ComicService comics;
  final TaskService tasks;
  final HistoryRepository history;
  final Db db;

  /// Network favorites are source calls; caching them for a few minutes keeps
  /// the favorites tab fast without touching the chapter list.
  final Map<String, ({Object? value, int expiresAt})> _networkCache = {};
  static const _networkCacheTtlMs = 5 * 60 * 1000;

  FavoriteService({
    required this.favorites,
    required this.sources,
    required this.sourceService,
    required this.comics,
    required this.tasks,
    required this.history,
    required this.db,
  });

  Object? _networkCached(String key, bool refresh) {
    if (refresh) return null;
    final entry = _networkCache[key];
    if (entry == null) return null;
    if (entry.expiresAt <= DateTime.now().millisecondsSinceEpoch) {
      _networkCache.remove(key);
      return null;
    }
    return entry.value;
  }

  void _storeNetwork(String key, Object? value) {
    final now = DateTime.now().millisecondsSinceEpoch;
    _networkCache[key] = (value: value, expiresAt: now + _networkCacheTtlMs);
    if (_networkCache.length > 500) {
      _networkCache.removeWhere((_, entry) => entry.expiresAt <= now);
      if (_networkCache.length > 500) _networkCache.clear();
    }
  }

  void _invalidateNetwork(int userId, String sourceKey) {
    final prefix = '$userId|$sourceKey|';
    _networkCache.removeWhere((key, _) => key.startsWith(prefix));
  }

  final Set<String> _coverPrefetching = {};

  /// Warms favorite covers in the background, three at a time. Covers are
  /// keyed by comic identity, so a later list load serves them from disk even
  /// if the source rotated the signed URL.
  void _prefetchCovers(int userId, List<Map<String, Object?>> items) {
    final pending = <Map<String, Object?>>[];
    for (final item in items) {
      if (pending.length >= 30) break;
      final sourceKey = (item['sourceKey'] ?? '').toString();
      final comicId = (item['id'] ?? '').toString();
      final cover = (item['cover'] ?? '').toString();
      if (sourceKey.isEmpty || comicId.isEmpty || cover.isEmpty) continue;
      final token = '$userId|$sourceKey|$comicId';
      if (_coverPrefetching.contains(token)) continue;
      if (comics.hasCoverCache(userId, sourceKey, comicId)) continue;
      _coverPrefetching.add(token);
      pending.add({
        'sourceKey': sourceKey,
        'comicId': comicId,
        'cover': cover,
        'token': token,
      });
    }
    if (pending.isEmpty) return;
    unawaited(() async {
      for (var offset = 0; offset < pending.length; offset += 3) {
        final chunk = pending.sublist(
            offset, math.min(offset + 3, pending.length));
        await Future.wait(chunk.map((item) async {
          try {
            await comics.cover(
              userId,
              item['cover'] as String,
              sourceKey: item['sourceKey'] as String,
              comicId: item['comicId'] as String,
            );
          } catch (error) {
            Log.warning('Favorite cover prefetch failed',
                userId: userId,
                extra: {
                  'source': item['sourceKey'],
                  'comic': item['comicId'],
                  'error': '$error',
                });
          } finally {
            _coverPrefetching.remove(item['token'] as String);
          }
        }));
      }
    }());
  }

  List<Map<String, Object?>> folders(int userId) => favorites.folders(userId);

  int createFolder(int userId, String name) =>
      favorites.createFolder(userId, name);

  void renameFolder(int userId, int id, String name) =>
      favorites.renameFolder(userId, id, name);

  void deleteFolder(int userId, int id) => favorites.deleteFolder(userId, id);

  void sortFolders(int userId, List<int> ids) =>
      favorites.sortFolders(userId, ids);

  Map<String, Object?> list(
    int userId, {
    int? folderId,
    String? query,
    String? status,
    int page = 1,
    int pageSize = 60,
  }) {
    final result = favorites.listFavorites(userId,
        folderId: folderId,
        query: query,
        status: status,
        page: page,
        pageSize: pageSize);
    final items =
        (result['items'] as List).whereType<Map<String, Object?>>().map((item) {
      final type = (item['comicType'] as int?) ?? 0;
      item['sourceKey'] = _sourceKeyForType(userId, type) ?? '';
      return item;
    }).toList();
    result['items'] = items;
    _prefetchCovers(userId, items);
    return result;
  }

  void add(int userId, int folderId, Map<String, Object?> comic,
      {bool atStart = false}) {
    final sourceKey = (comic['sourceKey'] ?? '').toString();
    final comicType = comic['comicType'] is int
        ? comic['comicType'] as int
        : comicTypeForSource(sourceKey);
    favorites.addFavorite(
      userId,
      folderId,
      {...comic, 'comicType': comicType},
      atStart: atStart,
    );
  }

  void remove(int userId, int folderId, String comicId, int comicType) =>
      favorites.removeFavorite(userId, folderId, comicId, comicType);

  void removeFromAll(int userId, String comicId, int comicType) =>
      favorites.removeFromAll(userId, comicId, comicType);

  void moveOrCopy(
          int userId, int from, int to, List<Map<String, Object?>> items,
          {required bool move}) =>
      favorites.moveOrCopy(
          userId: userId,
          fromFolder: from,
          toFolder: to,
          comics: items,
          move: move);

  void batchDelete(int userId, List<Map<String, Object?>> items) =>
      favorites.batchDelete(userId, items);

  Map<String, Object?> exportFolder(int userId, int folderId) {
    final folder = favorites.folder(userId, folderId);
    if (folder == null) throw ApiException.notFound('未找到文件夹');
    final items = favorites.allInFolder(userId, folderId);
    return {
      'info': {
        'format': 1,
        'name': folder['name'],
        'sourceKey': folder['sourceKey'],
        'sourceFolder': folder['sourceFolder'],
      },
      'name': folder['name'],
      'comics': items
          .map((f) => {
                ...f.toJson(),
                'sourceKey': _sourceKeyForType(userId, f.comicType) ?? '',
              })
          .toList(),
    };
  }

  Map<String, Object?> importFolder(int userId, Map<String, Object?> data) {
    final name = (data['name'] ??
            (data['info'] is Map ? (data['info'] as Map)['name'] : null) ??
            '')
        .toString();
    if (name.trim().isEmpty) throw ApiException.badRequest('缺少文件夹名称');
    var folderName = name;
    var index = 1;
    while (favorites.folders(userId).any((f) => f['name'] == folderName)) {
      folderName = '$name($index)';
      index++;
    }
    final folderId = favorites.createFolder(userId, folderName);
    final comics = data['comics'];
    if (comics is List) {
      for (final raw in comics.take(10000)) {
        if (raw is! Map) continue;
        final map = raw.map((k, v) => MapEntry(k.toString(), v));
        final comicType = (map['comicType'] as int?) ??
            comicTypeForSource((map['sourceKey'] ?? '').toString());
        favorites.addFavorite(userId, folderId, {
          'id': map['id'] ?? map['comicId'],
          'comicType': comicType,
          'title': map['title'] ?? map['name'],
          'subtitle': map['subtitle'] ?? map['author'],
          'cover': map['cover'] ?? map['coverPath'],
          'tags': map['tags'],
        });
      }
    }
    return favorites.folder(userId, folderId)!;
  }

  Map<String, Object?> linkFolder(
    int userId,
    int folderId, {
    String? sourceKey,
    String? sourceFolder,
  }) {
    if (sourceKey != null && sourceKey.isNotEmpty) {
      sourceService.require(userId, sourceKey);
    }
    favorites.linkFolder(
      userId,
      folderId,
      sourceKey: sourceKey?.isEmpty == true ? null : sourceKey,
      sourceFolder: sourceFolder?.isEmpty == true ? null : sourceFolder,
    );
    return favorites.folder(userId, folderId)!;
  }

  /// Imports a network favorite folder into a local folder and records the
  /// link used by the "Update" action. Mirrors the original import flow.
  Future<Map<String, Object?>> importNetworkFolder(
    int userId, {
    required String sourceKey,
    String? networkFolder,
    String? name,
    int pages = 20,
  }) async {
    final source = sourceService.require(userId, sourceKey);
    final folderName =
        name != null && name.trim().isNotEmpty ? name.trim() : source.name;
    final matches = favorites
        .folders(userId)
        .where((item) => item['name'] == folderName)
        .toList();
    Map<String, Object?>? folder = matches.isEmpty ? null : matches.first;
    final int folderId;
    if (folder != null) {
      final linkedSource = folder['sourceKey']?.toString() ?? '';
      final linkedFolder = folder['sourceFolder']?.toString() ?? '';
      if (linkedSource != sourceKey || linkedFolder != (networkFolder ?? '')) {
        throw ApiException.conflict('文件夹已存在');
      }
      folderId = folder['id'] as int;
    } else {
      folderId = favorites.createFolder(userId, folderName);
      favorites.linkFolder(userId, folderId,
          sourceKey: sourceKey, sourceFolder: networkFolder ?? '');
    }
    final imported = await syncNetworkFolder(userId, folderId, pages: pages);
    return {
      'folder': favorites.folder(userId, folderId),
      ...imported,
    };
  }

  /// Refreshes a linked local folder from its network folder. Existing local
  /// favorites are preserved; new comics are appended.
  Future<Map<String, Object?>> syncNetworkFolder(
    int userId,
    int folderId, {
    int pages = 20,
  }) async {
    final folder = favorites.folder(userId, folderId);
    if (folder == null) throw ApiException.notFound('未找到文件夹');
    final sourceKey = folder['sourceKey']?.toString() ?? '';
    if (sourceKey.isEmpty) {
      throw ApiException.badRequest('文件夹未关联网络源');
    }
    final networkFolder = folder['sourceFolder']?.toString() ?? '';
    final limit = pages.clamp(1, 10000);
    final existing = favorites
        .allInFolder(userId, folderId)
        .map((item) => '${item.comicType}:${item.comicId}')
        .toSet();
    var received = 0;
    var imported = 0;
    var loadedPages = 0;
    for (var page = 1; page <= limit; page++) {
      final result = await networkComics(
        userId,
        sourceKey,
        networkFolder.isEmpty ? null : networkFolder,
        page,
      );
      final list = (result['comics'] as List).whereType<Map>().toList();
      received += list.length;
      loadedPages++;
      for (final raw in list) {
        final comic = raw.map((key, value) => MapEntry(key.toString(), value));
        final identity =
            '${comic['comicType'] ?? comicTypeForSource(sourceKey)}:${comic['id']}';
        if (!existing.add(identity)) continue;
        add(userId, folderId, comic);
        imported++;
      }
      final maxPage = result['maxPage'];
      if (list.isEmpty || (maxPage is int && maxPage > 0 && page >= maxPage)) {
        break;
      }
    }
    return {
      'imported': imported,
      'received': received,
      'pages': loadedPages,
    };
  }

  void updateInfo(int userId, {int? folderId}) {
    final folderIds = folderId != null
        ? [folderId]
        : favorites.folders(userId).map((f) => f['id'] as int).toList();
    final allItems = {
      for (final id in folderIds) id: favorites.allInFolder(userId, id),
    };
    final total =
        allItems.values.fold<int>(0, (sum, list) => sum + list.length);
    tasks.run(userId, 'favorites_update_info', '更新漫画信息', (task) async {
      var done = 0;
      final errors = <String>[];
      for (final entry in allItems.entries) {
        final id = entry.key;
        final items = entry.value;
        for (final item in items) {
          if (task.cancelRequested) return null;
          final sourceKey = _sourceKeyForType(userId, item.comicType);
          if (sourceKey == null) {
            done++;
            continue;
          }
          try {
            final info = await comics
                .comicInfo(userId, sourceKey, item.comicId)
                .timeout(const Duration(seconds: 30));
            favorites.updateFavoriteInfo(
              userId,
              id,
              item.comicId,
              item.comicType,
              title: (info['title'] ?? item.name).toString(),
              author: (info['subtitle'] ?? item.author).toString(),
              cover: (info['cover'] ?? item.coverPath).toString(),
              description: (info['description'] ?? '').toString(),
              lastUpdateTime: info['updateTime']?.toString(),
            );
            comics.clearCoverCache(userId, sourceKey, item.comicId);
          } catch (error) {
            errors.add('${item.name}: $error');
          }
          done++;
          tasks.update(task.id,
              progress: done / (total == 0 ? 1 : total),
              message: '$done/$total');
        }
      }
      return {'updated': done, 'errors': errors};
    });
  }

  Map<String, Object?> deleteUnavailable(int userId) {
    final sourceTypes = <int>{
      for (final source in sources.list(userId)) comicTypeForSource(source.key),
    };
    var removed = 0;
    for (final folder in favorites.folders(userId)) {
      final folderId = folder['id'] as int;
      for (final item in favorites.allInFolder(userId, folderId)) {
        var unavailable = false;
        if (item.comicType == 0) {
          final rows = db.select(
            'SELECT 1 FROM local_comics WHERE user_id=? AND '
            '(comic_id_ext=? OR CAST(id AS TEXT)=?)',
            [userId, item.comicId, item.comicId],
          );
          unavailable = rows.isEmpty;
        } else {
          unavailable = !sourceTypes.contains(item.comicType);
        }
        if (unavailable) {
          favorites.removeFavorite(
              userId, folderId, item.comicId, item.comicType);
          removed++;
        }
      }
    }
    return {'removed': removed};
  }

  String? _sourceKeyForType(int userId, int comicType) {
    if (comicType == 0) return null;
    for (final source in sources.list(userId)) {
      if (comicTypeForSource(source.key) == comicType) return source.key;
    }
    return null;
  }

  // ---- network favorites ------------------------------------------------

  Future<Map<String, Object?>> networkFolders(int userId, String sourceKey,
      {String? comicId, bool refresh = false}) async {
    final cacheKey = '$userId|$sourceKey|folders|${comicId ?? ''}';
    final cached = _networkCached(cacheKey, refresh);
    if (cached is Map<String, Object?>) return cached;
    final source = sourceService.require(userId, sourceKey);
    if (source.capabilities['favorites'] != true) {
      throw ApiException.badRequest('此源不支持收藏');
    }
    final result = await sourceService
        .callValue(userId, sourceKey, 'favorites.loadFolders', [comicId]);
    final map = result is Map ? result : const {};
    final response = <String, Object?>{
      'folders': map['folders'] ?? const {},
      'favorited': map['favorited'] ?? const [],
    };
    _storeNetwork(cacheKey, response);
    return response;
  }

  Future<Map<String, Object?>> networkComics(
    int userId,
    String sourceKey,
    Object? folder,
    int page, {
    bool refresh = false,
  }) async {
    final cacheKey =
        '$userId|$sourceKey|comics|${jsonEncode(folder)}|$page';
    final cached = _networkCached(cacheKey, refresh);
    if (cached is Map<String, Object?>) return cached;
    final result = await sourceService
        .callValue(userId, sourceKey, 'favorites.loadComics', [page, folder]);
    final map = result is Map ? result : const {};
    final comics = map['comics'] is List
        ? (map['comics'] as List).whereType<Map>().map((raw) {
            final m = raw.map((k, v) => MapEntry(k.toString(), v));
            final summary = comicSummary(m, sourceKey: sourceKey);
            summary['comicType'] = comicTypeForSource(sourceKey);
            return summary;
          }).toList()
        : <Map<String, Object?>>[];
    final response = <String, Object?>{
      'comics': comics,
      'maxPage': map['maxPage'] ?? 1,
      'next': map['next'],
      'page': page,
    };
    _storeNetwork(cacheKey, response);
    _prefetchCovers(userId, comics);
    return response;
  }

  Future<Object?> networkToggle(
    int userId,
    String sourceKey,
    String comicId,
    Object? folderId,
    bool add, {
    Object? favoriteId,
  }) {
    _invalidateNetwork(userId, sourceKey);
    return sourceService.callValue(
      userId,
      sourceKey,
      'favorites.addOrDelFavorite',
      [comicId, folderId, add, favoriteId],
    );
  }

  Future<Object?> networkAddFolder(int userId, String sourceKey, String name) {
    _invalidateNetwork(userId, sourceKey);
    return sourceService
        .callValue(userId, sourceKey, 'favorites.addFolder', [name]);
  }

  Future<Object?> networkDeleteFolder(
      int userId, String sourceKey, Object? folderId) {
    _invalidateNetwork(userId, sourceKey);
    return sourceService
        .callValue(userId, sourceKey, 'favorites.deleteFolder', [folderId]);
  }
}

class HistoryService {
  final HistoryRepository repository;
  final ComicService comics;
  final TaskService tasks;
  final FavoriteRepository favorites;

  HistoryService({
    required this.repository,
    required this.comics,
    required this.tasks,
    required this.favorites,
  });

  Map<String, Object?> list(int userId,
          {String? query, int page = 1, int pageSize = 60}) =>
      repository.list(userId, query: query, page: page, pageSize: pageSize);

  Map<String, Object?> recent(int userId) => {
        'items': repository.recent(userId, 20).map((h) => h.toJson()).toList(),
      };

  Map<String, Object?> progress(int userId, String sourceKey, String comicId) {
    final record =
        repository.progress(userId, comicId, comicTypeForSource(sourceKey));
    return record?.toJson() ?? const {};
  }

  void upsert(int userId, Map<String, Object?> body) {
    final comic = body['comic'];
    final comicMap =
        comic is Map ? comic.map((k, v) => MapEntry(k.toString(), v)) : body;
    final sourceKey =
        (body['sourceKey'] ?? comicMap['sourceKey'] ?? '').toString();
    final comicId = (body['comicId'] ?? comicMap['id'] ?? '').toString();
    if (comicId.isEmpty) throw ApiException.badRequest('缺少漫画 ID');
    repository.upsert(
      userId: userId,
      comicId: comicId,
      comicType: (body['comicType'] as int?) ?? comicTypeForSource(sourceKey),
      sourceKey: sourceKey,
      title: (body['title'] ?? comicMap['title'] ?? '').toString(),
      subtitle: (body['subtitle'] ?? comicMap['subtitle'] ?? '').toString(),
      cover: (body['cover'] ?? comicMap['cover'] ?? '').toString(),
      ep: (body['ep'] as int?) ?? 1,
      page: (body['page'] as int?) ?? 1,
      chapterGroup: body['chapterGroup'] as int?,
      readEpisode:
          body['readEpisode'] is List ? body['readEpisode'] as List : const [],
      maxPage: body['maxPage'] as int?,
    );
  }

  void delete(int userId, String comicId, int comicType) =>
      repository.delete(userId, comicId, comicType);

  void clear(int userId, {bool unfavoritedOnly = false}) =>
      repository.clear(userId, unfavoritedOnly: unfavoritedOnly);

  void refresh(int userId, {List<Map<String, Object?>>? ids}) {
    final items =
        ids ?? repository.recent(userId, 500).map((h) => h.toJson()).toList();
    tasks.run(userId, 'history_refresh', '刷新所有历史', (task) async {
      var success = 0;
      var failed = 0;
      var skipped = 0;
      for (var i = 0; i < items.length; i++) {
        if (task.cancelRequested) return null;
        final item = items[i];
        final sourceKey = (item['sourceKey'] ?? '').toString();
        if (sourceKey.isEmpty) {
          skipped++;
          continue;
        }
        try {
          final info = await comics
              .comicInfo(userId, sourceKey, (item['id'] ?? '').toString())
              .timeout(const Duration(seconds: 30));
          repository.updateMeta(
            userId,
            (item['id'] ?? '').toString(),
            (item['comicType'] as int?) ?? comicTypeForSource(sourceKey),
            title: info['title']?.toString(),
            subtitle: info['subtitle']?.toString(),
            cover: info['cover']?.toString(),
          );
          success++;
        } catch (_) {
          failed++;
        }
        tasks.update(task.id,
            progress: (i + 1) / items.length,
            message: '$success ok, $failed failed');
      }
      return {'success': success, 'failed': failed, 'skipped': skipped};
    });
  }
}

class ReadLaterService {
  final ReadLaterRepository repository;
  ReadLaterService(this.repository);

  List<Map<String, Object?>> list(int userId, {String? query}) =>
      repository.list(userId, query: query).map((r) => r.toJson()).toList();

  bool add(int userId, Map<String, Object?> comic) => repository.add(userId, {
        ...comic,
        'comicType': comic['comicType'] ??
            comicTypeForSource((comic['sourceKey'] ?? '').toString()),
      });

  void remove(int userId, String comicId, int comicType) =>
      repository.remove(userId, comicId, comicType);

  void batchDelete(int userId, List<Map<String, Object?>> items) =>
      repository.batchDelete(userId, items);

  void restore(int userId, List<Map<String, Object?>> items) =>
      repository.restore(userId, items);

  void clear(int userId) => repository.clear(userId);

  int count(int userId) => repository.count(userId);
}

class ImageFavoriteService {
  final ImageFavoriteRepository repository;
  ImageFavoriteService(this.repository);

  Map<String, Object?> list(
    int userId, {
    String? query,
    String sort = 'Title',
    String? timeFilter,
    int minCount = 0,
  }) =>
      repository.list(userId,
          query: query, sort: sort, timeFilter: timeFilter, minCount: minCount);

  Map<String, Object?> stats(int userId) => repository.stats(userId);

  void add(int userId, Map<String, Object?> body) {
    final comic = body['comic'];
    final comicMap = comic is Map
        ? comic.map((k, v) => MapEntry(k.toString(), v))
        : <String, Object?>{};
    final sourceKey =
        (body['sourceKey'] ?? comicMap['sourceKey'] ?? '').toString();
    if (sourceKey.isEmpty) throw ApiException.badRequest('缺少源 key');
    repository.add(
      userId: userId,
      comic: comicMap,
      ep: (body['ep'] as int?) ?? 1,
      eid: (body['eid'] ?? '').toString(),
      epName: (body['epName'] ?? '').toString(),
      page: (body['page'] as int?) ?? 1,
      imageKey: (body['imageKey'] ?? '').toString(),
      auto: body['auto'] == true,
      sourceKey: sourceKey,
    );
  }

  void removeComic(int userId, String comicId, String sourceKey) =>
      repository.removeComic(userId, comicId, sourceKey);

  void removePage(int userId, Map<String, Object?> body) =>
      repository.removePage(
        userId,
        (body['comicId'] ?? '').toString(),
        (body['sourceKey'] ?? '').toString(),
        (body['eid'] ?? '').toString(),
        (body['page'] as int?) ?? 0,
      );
}

class StatisticsService {
  final StatisticsRepository repository;
  StatisticsService(this.repository);

  Map<String, Object?> summary(int userId, {int days = 30}) =>
      repository.summary(userId, days: days);

  void record(int userId, Map<String, Object?> body) {
    repository.record(
      userId: userId,
      comicId: (body['comicId'] ?? body['id'] ?? '').toString(),
      comicType: (body['comicType'] as int?) ?? 0,
      title: (body['title'] ?? '').toString(),
      author: (body['author'] ?? body['subtitle'] ?? '').toString(),
      cover: (body['cover'] ?? '').toString(),
      seconds: (body['seconds'] as int?) ?? 0,
      sourceKey: (body['sourceKey'] ?? '').toString(),
    );
  }

  void clear(int userId) => repository.clear(userId);

  void deleteComic(int userId, String comicId, int comicType) =>
      repository.deleteComic(userId, comicId, comicType);
}

class FollowUpdateService {
  final FollowUpdateRepository repository;
  final FavoriteRepository favorites;
  final ComicService comics;
  final SourceRepository sources;
  final TaskService tasks;

  FollowUpdateService({
    required this.repository,
    required this.favorites,
    required this.comics,
    required this.sources,
    required this.tasks,
  });

  FollowUpdateConfig config(int userId) => repository.config(userId);

  void saveConfig(int userId, Map<String, Object?> body) {
    final current = repository.config(userId);
    repository.saveConfig(
      userId,
      FollowUpdateConfig(
        folderId: body.containsKey('folderId')
            ? body['folderId'] as int?
            : current.folderId,
        checkOnStart: body['checkOnStart'] is bool
            ? body['checkOnStart'] as bool
            : current.checkOnStart,
        intervalHours: (body['intervalHours'] as int?) ?? current.intervalHours,
        fixedTime: body.containsKey('fixedTime')
            ? (body['fixedTime'] ?? '').toString()
            : current.fixedTime,
      ),
    );
  }

  Map<String, Object?> overview(int userId) {
    final config = repository.config(userId);
    if (config.folderId == null) {
      return {
        'configured': false,
        'config': config.toJson(),
        'updates': const [],
        'comics': const [],
        'count': 0,
      };
    }
    final all = favorites.allInFolder(userId, config.folderId!);
    final updates = all.where((f) => f.hasNewUpdate).toList();
    Map<String, Object?> enrich(FavoriteRecord f) => {
          ...f.toJson(),
          'sourceKey': _sourceKeyForType(userId, f.comicType) ?? '',
        };
    return {
      'configured': true,
      'config': config.toJson(),
      'folder': favorites.folder(userId, config.folderId!),
      'updates': updates.map(enrich).toList(),
      'comics': all.map(enrich).toList(),
      'count': updates.length,
    };
  }

  void markRead(int userId, {List<Map<String, Object?>>? ids}) {
    if (ids == null) {
      final config = repository.config(userId);
      favorites.markAllRead(userId, folderId: config.folderId);
      return;
    }
    for (final item in ids) {
      final folderId = item['folderId'] as int?;
      final comicId = (item['id'] ?? item['comicId'] ?? '').toString();
      final comicType = (item['comicType'] as int?) ?? 0;
      if (folderId == null) continue;
      favorites.updateFavoriteInfo(userId, folderId, comicId, comicType,
          hasNewUpdate: false);
    }
  }

  void check(int userId) {
    final config = repository.config(userId);
    if (config.folderId == null) {
      throw ApiException.badRequest('尚未配置订阅更新文件夹');
    }
    final folderId = config.folderId!;
    final items = favorites.allInFolder(userId, folderId);
    final intervalMs = config.intervalHours * 3600 * 1000;
    tasks.run(userId, 'follow_updates', '检查订阅更新', (task) async {
      var checked = 0;
      var updated = 0;
      var failed = 0;
      final now = DateTime.now().millisecondsSinceEpoch;
      for (var i = 0; i < items.length; i++) {
        if (task.cancelRequested) return null;
        final item = items[i];
        final lastAttempt = item.lastAttemptTime ?? 0;
        final lastCheck = item.lastCheckTime ?? 0;
        if (now - (lastAttempt > lastCheck ? lastAttempt : lastCheck) <
            intervalMs) {
          continue;
        }
        final sourceKey = _sourceKeyForType(userId, item.comicType);
        if (sourceKey == null) continue;
        try {
          final info = await comics
              .comicInfo(userId, sourceKey, item.comicId)
              .timeout(const Duration(seconds: 30));
          final newUpdateTime = info['updateTime']?.toString();
          final chapters = _chapterIds(info['chapters']);
          final previous = item.lastUpdateChapters ?? const [];
          final hasPrevious = item.lastCheckTime != null;
          final newChapter = chapters.any((id) => !previous.contains(id));
          final changed = newUpdateTime != item.lastUpdateTime;
          final hasNew = hasPrevious && (changed || newChapter);
          favorites.setUpdateState(
            userId: userId,
            folderId: folderId,
            comicId: item.comicId,
            comicType: item.comicType,
            lastUpdateTime: newUpdateTime,
            hasNewUpdate: hasNew,
            checkTime: now,
            chapters: chapters,
          );
          checked++;
          if (hasNew) updated++;
        } catch (error) {
          favorites.markAttempt(
            userId: userId,
            folderId: folderId,
            comicId: item.comicId,
            comicType: item.comicType,
            attemptTime: now,
          );
          failed++;
          Log.warning('Follow update failed',
              userId: userId,
              extra: {'comic': item.comicId, 'error': '$error'});
        }
        tasks.update(task.id,
            progress: (i + 1) / items.length,
            message: '$checked checked, $updated updates');
      }
      return {'checked': checked, 'updated': updated, 'failed': failed};
    });
  }

  /// Runs the check for every user whose config has an interval or fixed time
  /// that is due. Called by the hourly server timer.
  void runDueChecks() {
    final configs = repository.allConfigs();
    final now = DateTime.now();
    for (final entry in configs) {
      final userId = entry.userId;
      final config = entry.config;
      try {
        final folder = favorites.folder(userId, config.folderId!);
        if (folder == null) continue;
        final lastRun = repository.lastRunAt(userId);
        final intervalHrs =
            config.intervalHours > 0 ? config.intervalHours : 24;
        var due = lastRun == null ||
            now.difference(DateTime.fromMillisecondsSinceEpoch(lastRun)) >=
                Duration(hours: intervalHrs);
        if (config.fixedTime.isNotEmpty) {
          final parts = config.fixedTime.split(':');
          if (parts.length >= 2) {
            final hour = int.tryParse(parts[0]) ?? 0;
            final minute = int.tryParse(parts[1]) ?? 0;
            final today = DateTime(now.year, now.month, now.day, hour, minute);
            due = now.isAfter(today) &&
                now.difference(today) < const Duration(hours: 1) &&
                (lastRun == null ||
                    now.difference(
                            DateTime.fromMillisecondsSinceEpoch(lastRun)) >=
                        const Duration(hours: 1));
          }
        }
        if (!due) continue;
        repository.recordRun(userId);
        check(userId);
      } catch (error) {
        Log.warning('Scheduled follow update check failed',
            userId: userId, extra: {'error': '$error'});
      }
    }
  }

  String? _sourceKeyForType(int userId, int comicType) {
    for (final source in sources.list(userId)) {
      if (comicTypeForSource(source.key) == comicType) return source.key;
    }
    return null;
  }

  List<Object?> _chapterIds(Object? chapters) {
    if (chapters is! Map) return const [];
    final ids = <Object?>[];
    for (final value in chapters.values) {
      if (value is Map) {
        ids.addAll(value.keys);
      }
    }
    if (ids.isEmpty) ids.addAll(chapters.keys);
    return ids;
  }
}
