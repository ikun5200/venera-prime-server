import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:intl/intl.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;

import '../config.dart';
import '../repositories/library_repository.dart';
import '../repositories/source_repository.dart';
import '../repositories/user_repository.dart';
import '../util/comic.dart';
import '../util/errors.dart';
import '../util/log.dart';
import '../util/path_guard.dart';
import 'source_service.dart';

class ComicService {
  final Config config;
  final SourceService sources;
  final SourceRepository sourceRepository;
  final HistoryRepository history;
  final FavoriteRepository favorites;
  final SettingsRepository settings;
  final PathGuard paths;
  final http.Client httpClient = http.Client();

  /// Image configs resolved by `comic.onImageLoad`, reused for on-demand
  /// requests after a prefetch. Configs can contain signed URLs, so keep the
  /// window short.
  final Map<String, ({List<Map<String, Object?>> configs, int expiresAt})>
      _imageConfigCache = {};
  final Set<String> _prefetching = {};
  final Map<int, int> _lastCacheEnforce = {};

  ComicService({
    required this.config,
    required this.sources,
    required this.sourceRepository,
    required this.history,
    required this.favorites,
    required this.settings,
    required this.paths,
  });

  // ---- search / discovery ----------------------------------------------

  /// Suggestions mirror the original client: URL / source id matches plus
  /// source tag translations, capped at 100 items.
  List<Map<String, Object?>> suggestions(int userId, String text,
      {String? sourceKey}) {
    final query = text.split(' ').last.trim();
    if (query.isEmpty) return const [];
    final results = <Map<String, Object?>>[];
    void add(String value, {String? namespace, String? translated}) {
      if (value.isEmpty || results.length >= 100) return;
      if (results.any(
          (item) => item['value'] == value && item['namespace'] == namespace)) {
        return;
      }
      results.add({
        'value': value,
        'namespace': namespace,
        'translated': translated,
      });
    }

    final uri = Uri.tryParse(text.trim());
    if (uri != null && uri.hasScheme && uri.host.isNotEmpty) {
      add(text.trim(), namespace: '__url__');
    } else {
      for (final source in sources.list(userId)) {
        final pattern = source.capabilities['idMatch'];
        if (pattern is String && pattern.isNotEmpty) {
          try {
            if (RegExp(pattern).hasMatch(text)) {
              add(source.key, namespace: '__source__');
            }
          } catch (_) {}
        }
      }
    }

    if (results.length >= 100) return results;
    final lower = query.toLowerCase();
    final targets = sourceKey != null && sourceKey.isNotEmpty
        ? sources.list(userId).where((source) => source.key == sourceKey)
        : sources.list(userId);
    for (final source in targets) {
      final translation = source.translation;
      for (final entry in translation.entries) {
        final values = entry.value;
        if (values is! Map) continue;
        for (final item in values.entries) {
          final key = item.key.toString();
          final value = item.value.toString();
          if (key.toLowerCase().startsWith(lower) ||
              value.toLowerCase().contains(lower)) {
            add(key, namespace: entry.key.toString(), translated: value);
          }
          if (results.length >= 100) return results;
        }
      }
    }
    return results;
  }

  Future<String> selectSuggestion(
      int userId, String sourceKey, String namespace, String tag) async {
    final source = sources.require(userId, sourceKey);
    if (source.capabilities['tagSuggestionSelect'] == true) {
      final result = await sources.callValue(userId, sourceKey,
          'search.onTagSuggestionSelected', [namespace, tag]);
      if (result is String && result.isNotEmpty) return result;
    }
    final clean = tag.contains(' ') ? "'$tag'" : tag;
    return namespace.isEmpty ? clean : '$namespace:$clean';
  }

  Future<Map<String, Object?>> search(
    int userId,
    String sourceKey,
    String keyword,
    List<String> options,
    int page,
  ) async {
    final result = await sources.callValue(
      userId,
      sourceKey,
      'search.load',
      [keyword, options, page],
    );
    final map = _map(result);
    return {
      'comics': _comics(map['comics'], sourceKey),
      'maxPage': _int(map['maxPage']) ?? 1,
      'next': map['next'],
      'page': page,
    };
  }

  Future<Map<String, Object?>> aggregatedSearch(
      int userId, String keyword) async {
    final configured = _list(await _setting(userId, 'searchSources'));
    final all = sources
        .list(userId)
        .where((s) => s.enabled && s.capabilities['search'] == true)
        .toList();
    final selected = configured.isEmpty
        ? all
        : all.where((s) => configured.contains(s.key)).toList();
    final sections = await Future.wait(selected.map((source) async {
      try {
        final result = await search(userId, source.key, keyword, const [], 1)
            .timeout(const Duration(seconds: 40));
        return {
          'source': source.key,
          'name': source.name,
          'comics': result['comics'],
          'maxPage': result['maxPage'],
          'error': null,
        };
      } catch (error) {
        return {
          'source': source.key,
          'name': source.name,
          'comics': const [],
          'maxPage': 1,
          'error': error.toString(),
        };
      }
    }));
    return {'sections': sections, 'keyword': keyword};
  }

  Future<Map<String, Object?>> explore(
      int userId, String sourceKey, int page) async {
    final source = sources.require(userId, sourceKey);
    final meta = _list(source.capabilities['exploreData']);
    final pages = <Map<String, Object?>>[];
    for (var index = 0; index < meta.length; index++) {
      final entry = _map(meta[index]);
      final type = (entry['type'] ?? 'multiPartPage').toString();
      try {
        final data = await sources
            .callValue(userId, sourceKey, 'explore.$index.load', [page]);
        pages.add({
          'index': index,
          'title': entry['title'] ?? source.name,
          'type': type,
          'data': type == 'mixed' ? _mixedExplore(data, sourceKey) : data,
          'error': null,
        });
      } catch (error) {
        pages.add({
          'index': index,
          'title': entry['title'] ?? source.name,
          'type': type,
          'data': null,
          'error': error.toString(),
        });
      }
    }
    return {'source': sourceKey, 'page': page, 'pages': pages};
  }

  /// `mixed` explore loaders return `{data: [Comic[] | part], maxPage}`.
  /// Normalize each entry so the client can render lists and parts uniformly.
  Object? _mixedExplore(Object? raw, String sourceKey) {
    final map = _map(raw);
    final data = map['data'];
    if (data is! List) return raw;
    final items = <Map<String, Object?>>[];
    for (final entry in data) {
      if (entry is List) {
        items.add({
          'type': 'comics',
          'comics': _comics(entry, sourceKey),
        });
      } else if (entry is Map) {
        final part = entry.map((key, value) => MapEntry(key.toString(), value));
        items.add({
          'type': 'part',
          'title': part['title'],
          'comics': _comics(part['comics'], sourceKey),
          'viewMore': part['viewMore'],
        });
      }
    }
    return {'items': items, 'maxPage': map['maxPage']};
  }

  Future<Map<String, Object?>> categories(int userId, String sourceKey) async {
    final source = sources.require(userId, sourceKey);
    final category = source.capabilities['categoryData'];
    if (category is! Map) {
      return {'source': sourceKey, 'title': source.name, 'parts': const []};
    }
    final parts = <Map<String, Object?>>[];
    final rawParts = _list(category['parts']);
    for (var index = 0; index < rawParts.length; index++) {
      final part = _map(rawParts[index]);
      final type = (part['type'] ?? 'fixed').toString();
      Object? categories = part['categories'];
      if (type == 'dynamic' || type == 'random') {
        try {
          final loaded = await sources.callValue(
              userId, sourceKey, 'category.parts.$index.loader', const []);
          if (loaded != null) categories = loaded;
        } catch (error) {
          Log.warning('Dynamic category failed',
              userId: userId, extra: {'source': sourceKey, 'error': '$error'});
        }
      }
      parts.add({
        'name': part['name'] ?? '',
        'type': type,
        'randomNumber': part['randomNumber'],
        'itemType': part['itemType'] ?? 'category',
        'categoryParams': part['categoryParams'],
        'groupParam': part['groupParam'],
        'categories': _categories(categories),
      });
    }
    return {
      'source': sourceKey,
      'title': category['title'] ?? source.name,
      'enableRankingPage': category['enableRankingPage'] == true,
      'parts': parts,
    };
  }

  List<Map<String, Object?>> _categories(Object? raw) {
    if (raw is! List) return const [];
    return raw.map((item) {
      if (item is Map) {
        return {
          'label': (item['label'] ?? item['name'] ?? '').toString(),
          'target': item['target'] ?? item['param'] ?? item['value'],
        };
      }
      return {'label': item.toString(), 'target': item.toString()};
    }).toList();
  }

  Future<Map<String, Object?>> categoryComics(
    int userId,
    String sourceKey,
    String category,
    Object? param,
    List<String> options,
    int page,
  ) async {
    final result = await sources.callValue(
      userId,
      sourceKey,
      'categoryComics.load',
      [category, param, options, page],
    );
    final map = _map(result);
    return {
      'comics': _comics(map['comics'], sourceKey),
      'maxPage': _int(map['maxPage']) ?? 1,
      'next': map['next'],
      'page': page,
    };
  }

  Future<Map<String, Object?>> ranking(
    int userId,
    String sourceKey,
    String option,
    int page,
  ) async {
    final result = await sources.callValue(
      userId,
      sourceKey,
      'categoryComics.ranking.load',
      [option, page],
    );
    final map = _map(result);
    return {
      'comics': _comics(map['comics'], sourceKey),
      'maxPage': _int(map['maxPage']) ?? 1,
      'next': map['next'],
      'page': page,
    };
  }

  // ---- comic details ----------------------------------------------------

  Future<Map<String, Object?>> comicInfo(
      int userId, String sourceKey, String comicId) async {
    final result =
        await sources.callValue(userId, sourceKey, 'comic.loadInfo', [comicId]);
    final map = _map(result);
    final details = _normalizeDetails(map, sourceKey, comicId);
    final progress =
        history.progress(userId, comicId, comicTypeForSource(sourceKey));
    details['progress'] = progress?.toJson();
    details['favoriteFolders'] = favorites.folderIdsForComic(
        userId, comicId, comicTypeForSource(sourceKey));
    details['isFavorite'] = (details['favoriteFolders'] as List).isNotEmpty;
    details['localComicId'] = _localComicId(userId, sourceKey, comicId);
    return details;
  }

  int? _localComicId(int userId, String sourceKey, String comicId) {
    final type = comicTypeForSource(sourceKey);
    final rows = sourceRepository.db.select(
      'SELECT id FROM local_comics WHERE user_id=? AND comic_type=? AND comic_id_ext=?',
      [userId, type, comicId],
    );
    return rows.isEmpty ? null : rows.first['id'] as int;
  }

  Map<String, Object?> _normalizeDetails(
      Map<String, Object?> raw, String sourceKey, String comicId) {
    final tagsRaw = raw['tags'];
    final tags = <String, List<String>>{};
    if (tagsRaw is Map) {
      for (final entry in tagsRaw.entries) {
        if (entry.value is List) {
          tags[entry.key.toString()] =
              (entry.value as List).map((v) => v.toString()).toList();
        }
      }
    }
    final chapters = _normalizeChapters(raw['chapters']);
    // Sources without a chapter list (single-gallery sources) use the original
    // app's convention: one implicit chapter with id "0".
    if (chapters.isEmpty) {
      chapters['0'] = 'Chapter 1';
    }
    final updateTime = _findUpdateTime(raw, tags);
    final author = _findAuthor(tags);
    return {
      'id': comicId,
      'comicId': comicId,
      'sourceKey': sourceKey,
      'comicType': comicTypeForSource(sourceKey),
      'title': (raw['title'] ?? '').toString(),
      'subtitle': (raw['subtitle'] ?? raw['subTitle'] ?? '').toString(),
      'subTitle': (raw['subtitle'] ?? raw['subTitle'] ?? '').toString(),
      'cover': (raw['cover'] ?? '').toString(),
      'description': (raw['description'] ?? '').toString(),
      'tags': tags,
      'chapters': chapters,
      'chapterCount': _chapterCount(chapters),
      'thumbnails': raw['thumbnails'],
      'recommend': _comics(raw['recommend'], sourceKey),
      'commentCount': raw['commentCount'],
      'likesCount': raw['likesCount'],
      'isLiked': raw['isLiked'],
      'isFavorite': raw['isFavorite'],
      'subId': raw['subId'],
      'uploader': raw['uploader'] ?? author,
      'updateTime': updateTime,
      'uploadTime': raw['uploadTime'],
      'url': raw['url'],
      'stars': raw['stars'],
      'maxPage': raw['maxPage'],
      'comments': raw['comments'],
    };
  }

  Map<String, Object?> _normalizeChapters(Object? raw) {
    if (raw is! Map) return {};
    final result = <String, Object?>{};
    for (final entry in raw.entries) {
      if (entry.value is Map) {
        final group = <String, String>{};
        for (final chapter in (entry.value as Map).entries) {
          group[chapter.key.toString()] = (chapter.value ?? '').toString();
        }
        result[entry.key.toString()] = group;
      } else {
        result[entry.key.toString()] = (entry.value ?? '').toString();
      }
    }
    return result;
  }

  int _chapterCount(Map<String, Object?> chapters) {
    var count = 0;
    for (final value in chapters.values) {
      count += value is Map ? value.length : 1;
    }
    return count;
  }

  String? _findUpdateTime(
      Map<String, Object?> raw, Map<String, List<String>> tags) {
    final value = raw['updateTime'];
    if (value is String && value.contains('|')) {
      final prefix = value.split('|').first;
      if (DateTime.tryParse(prefix) != null) return value;
    }
    if (value is String && value.isNotEmpty) {
      final normalized = _validateDate(value);
      if (normalized != null) return normalized;
    }
    for (final namespace in const [
      '更新',
      '最後更新',
      '最后更新',
      'update',
      'last update',
    ]) {
      final list = tags[namespace];
      if (list != null && list.isNotEmpty) return list.first;
    }
    return value is String ? value : null;
  }

  String? _validateDate(String value) {
    final date = value.split(' ').first;
    final parts = date.split('-');
    if (parts.length != 3) return null;
    final year = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    final day = int.tryParse(parts[2]);
    if (year == null || month == null || day == null) return null;
    if (year < 2000 ||
        year > 3000 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31) {
      return null;
    }
    return '$year-$month-$day';
  }

  String? _findAuthor(Map<String, List<String>> tags) {
    for (final namespace in const [
      'author',
      'authors',
      'artist',
      'artists',
      '作者',
      '画师',
    ]) {
      final list = tags[namespace];
      if (list != null && list.isNotEmpty) return list.first;
    }
    return null;
  }

  Future<Map<String, Object?>> chapterImages(
      int userId, String sourceKey, String comicId, String epId) async {
    final result = await sources
        .callValue(userId, sourceKey, 'comic.loadEp', [comicId, epId]);
    final map = _map(result);
    final images = _list(map['images']).map((e) => e.toString()).toList();
    return {'images': images, 'total': images.length};
  }

  Future<Map<String, Object?>> thumbnails(
      int userId, String sourceKey, String comicId, Object? next) async {
    final result = await sources
        .callValue(userId, sourceKey, 'comic.loadThumbnails', [comicId, next]);
    final map = _map(result);
    return {'thumbnails': map['thumbnails'], 'next': map['next']};
  }

  // ---- comments / interactions -----------------------------------------

  Future<Map<String, Object?>> comments(
    int userId,
    String sourceKey,
    String comicId, {
    String? subId,
    int page = 1,
    Object? replyTo,
  }) async {
    final result = await sources.callValue(
      userId,
      sourceKey,
      'comic.loadComments',
      [comicId, subId, page, replyTo],
    );
    final map = _map(result);
    return {
      'comments': _comments(map['comments']),
      'maxPage': _int(map['maxPage']) ?? 1,
      'page': page,
    };
  }

  Future<Map<String, Object?>> chapterComments(
    int userId,
    String sourceKey,
    String comicId,
    String epId, {
    int page = 1,
    Object? replyTo,
  }) async {
    final result = await sources.callValue(
      userId,
      sourceKey,
      'comic.loadChapterComments',
      [comicId, epId, page, replyTo],
    );
    final map = _map(result);
    return {
      'comments': _comments(map['comments']),
      'maxPage': _int(map['maxPage']) ?? 1,
      'page': page,
    };
  }

  Future<Object?> sendComment(
    int userId,
    String sourceKey,
    String comicId,
    String content, {
    String? subId,
    Object? replyTo,
  }) async {
    return sources.callValue(
      userId,
      sourceKey,
      'comic.sendComment',
      [comicId, subId, content, replyTo],
    );
  }

  Future<Object?> sendChapterComment(
    int userId,
    String sourceKey,
    String comicId,
    String epId,
    String content, {
    Object? replyTo,
  }) async {
    return sources.callValue(
      userId,
      sourceKey,
      'comic.sendChapterComment',
      [comicId, epId, content, replyTo],
    );
  }

  Future<Object?> like(
      int userId, String sourceKey, String comicId, bool isLiking) {
    return sources
        .callValue(userId, sourceKey, 'comic.likeComic', [comicId, isLiking]);
  }

  Future<Object?> rate(
      int userId, String sourceKey, String comicId, int rating) {
    return sources
        .callValue(userId, sourceKey, 'comic.starRating', [comicId, rating]);
  }

  Future<Object?> likeComment(
    int userId,
    String sourceKey,
    String comicId,
    String? subId,
    String commentId,
    bool isLiking,
  ) {
    return sources.callValue(
      userId,
      sourceKey,
      'comic.likeComment',
      [comicId, subId, commentId, isLiking],
    );
  }

  Future<Object?> voteComment(
    int userId,
    String sourceKey,
    String comicId,
    String? subId,
    String commentId,
    bool isUp,
    bool isCancel,
  ) {
    return sources.callValue(
      userId,
      sourceKey,
      'comic.voteComment',
      [comicId, subId, commentId, isUp, isCancel],
    );
  }

  Future<Object?> likeChapterComment(
    int userId,
    String sourceKey,
    String comicId,
    String epId,
    String commentId,
    bool isLiking,
  ) {
    return sources.callValue(
      userId,
      sourceKey,
      'comic.likeComment',
      [comicId, epId, commentId, isLiking],
    );
  }

  Future<Object?> voteChapterComment(
    int userId,
    String sourceKey,
    String comicId,
    String epId,
    String commentId,
    bool isUp,
    bool isCancel,
  ) {
    return sources.callValue(
      userId,
      sourceKey,
      'comic.voteComment',
      [comicId, epId, commentId, isUp, isCancel],
    );
  }

  Future<Map<String, Object?>> archives(
      int userId, String sourceKey, String comicId) async {
    final result = await sources
        .callValue(userId, sourceKey, 'comic.archive.getArchives', [comicId]);
    return {'items': result is List ? result : const []};
  }

  Future<Map<String, Object?>> archiveUrl(
      int userId, String sourceKey, String comicId, String archiveId) async {
    final result = await sources.callValue(userId, sourceKey,
        'comic.archive.getDownloadUrl', [comicId, archiveId]);
    return {'url': result};
  }

  // ---- image proxy ------------------------------------------------------

  Future<({Uint8List bytes, String mime})> image(
    int userId,
    String sourceKey,
    String comicId,
    String epId,
    String imageKey, {
    bool thumbnail = false,
  }) async {
    final cacheKey =
        _imageCacheKey(userId, sourceKey, comicId, epId, imageKey, thumbnail);
    final cached = _readCache(userId, cacheKey);
    if (cached != null) return cached;
    final configs = await _imageConfigs(userId, sourceKey, comicId, epId,
        imageKey, thumbnail: thumbnail);
    return _downloadImage(userId, cacheKey, configs, imageKey);
  }

  String _imageCacheKey(int userId, String sourceKey, String comicId,
          String epId, String imageKey, bool thumbnail) =>
      sha256
          .convert(utf8
              .encode('$userId|$sourceKey|$comicId|$epId|$imageKey|$thumbnail'))
          .toString();

  Future<List<Map<String, Object?>>> _imageConfigs(
    int userId,
    String sourceKey,
    String comicId,
    String epId,
    String imageKey, {
    bool thumbnail = false,
  }) async {
    final cacheKey =
        '$userId|$sourceKey|$comicId|$epId|$imageKey|$thumbnail';
    final now = DateTime.now().millisecondsSinceEpoch;
    final cached = _imageConfigCache[cacheKey];
    if (cached != null && cached.expiresAt > now) return cached.configs;

    List<Map<String, Object?>> configs;
    if (thumbnail) {
      Object? config;
      try {
        config = await sources
            .callValue(userId, sourceKey, 'comic.onThumbnailLoad', [imageKey]);
      } catch (_) {
        config = null;
      }
      configs = [
        if (config is Map)
          config.map((k, v) => MapEntry(k.toString(), v))
        else
          {'url': imageKey},
      ];
    } else {
      final source = sources.require(userId, sourceKey);
      if (source.capabilities['imageLoad'] == true) {
        try {
          configs = await sources
              .imageConfigs(userId, sourceKey, [imageKey, comicId, epId]);
        } catch (error) {
          Log.warning('onImageLoad failed',
              userId: userId, extra: {'source': sourceKey, 'error': '$error'});
          configs = [
            {'url': imageKey}
          ];
        }
      } else {
        configs = [
          {'url': imageKey}
        ];
      }
      if (configs.isEmpty) {
        configs = [
          {'url': imageKey}
        ];
      }
    }
    _rememberConfig(userId, sourceKey, comicId, epId, imageKey, configs,
        thumbnail: thumbnail);
    return configs;
  }

  void _rememberConfig(
    int userId,
    String sourceKey,
    String comicId,
    String epId,
    String imageKey,
    List<Map<String, Object?>> configs, {
    bool thumbnail = false,
  }) {
    final key = '$userId|$sourceKey|$comicId|$epId|$imageKey|$thumbnail';
    final now = DateTime.now().millisecondsSinceEpoch;
    _imageConfigCache[key] =
        (configs: configs, expiresAt: now + const Duration(minutes: 2).inMilliseconds);
    if (_imageConfigCache.length > 4000) {
      _imageConfigCache.removeWhere((_, value) => value.expiresAt <= now);
      if (_imageConfigCache.length > 4000) _imageConfigCache.clear();
    }
  }

  Future<({Uint8List bytes, String mime})> _downloadImage(
    int userId,
    String cacheKey,
    List<Map<String, Object?>> configs,
    String imageKey,
  ) async {
    Object? lastError;
    for (final config in configs) {
      try {
        final url = (config['url'] ?? imageKey).toString();
        final method = (config['method'] ?? 'GET').toString().toUpperCase();
        final headers = <String, String>{};
        final rawHeaders = config['headers'];
        if (rawHeaders is Map) {
          for (final entry in rawHeaders.entries) {
            headers[entry.key.toString()] = entry.value.toString();
          }
        }
        if (!headers.keys.any((k) => k.toLowerCase() == 'user-agent')) {
          headers['User-Agent'] =
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';
        }
        final cookie = _cookieHeader(userId, url);
        if (cookie != null) headers['Cookie'] = cookie;
        final request = http.Request(method, Uri.parse(url));
        request.headers.addAll(headers);
        final data = config['data'];
        if (data is String) request.body = data;
        final response =
            await httpClient.send(request).timeout(const Duration(seconds: 30));
        final bytes = await response.stream.toBytes();
        if (response.statusCode >= 200 &&
            response.statusCode < 300 &&
            bytes.isNotEmpty) {
          final mime = response.headers['content-type']?.split(';').first ??
              _guessMime(url);
          _writeCache(userId, cacheKey, bytes, mime);
          return (bytes: bytes, mime: mime);
        }
        lastError = 'HTTP ${response.statusCode}';
      } catch (error) {
        lastError = error;
      }
    }
    throw ApiException.sourceError('图片加载失败: $lastError');
  }

  /// Warms the per-user disk cache for a chapter. Returns immediately; the
  /// download runs in the background with a small concurrency limit.
  Future<Map<String, Object?>> prefetchChapter(
    int userId,
    String sourceKey,
    String comicId,
    String epId, {
    int from = 1,
  }) async {
    final source = sources.require(userId, sourceKey);
    if (!source.enabled) {
      return {'enabled': false, 'running': false, 'reason': 'disabled'};
    }
    final values = settings.all(userId);
    final raw = values['serverPrefetchImageCount'];
    final limit = raw is num ? raw.toInt() : -1;
    if (limit == 0) {
      return {'enabled': false, 'running': false, 'limit': 0};
    }
    final token = '$userId|$sourceKey|$comicId|$epId';
    if (_prefetching.contains(token)) {
      return {'enabled': true, 'running': true, 'limit': limit};
    }
    _prefetching.add(token);
    unawaited(_runPrefetch(userId, sourceKey, comicId, epId,
            from: from, limit: limit)
        .catchError((Object error) {
          Log.warning('Chapter prefetch failed',
              userId: userId,
              extra: {
                'source': sourceKey,
                'comic': comicId,
                'ep': epId,
                'error': '$error',
              });
        })
        .whenComplete(() => _prefetching.remove(token)));
    return {'enabled': true, 'running': true, 'limit': limit};
  }

  Future<void> _runPrefetch(
    int userId,
    String sourceKey,
    String comicId,
    String epId, {
    required int from,
    required int limit,
  }) async {
    final result = await sources
        .callValue(userId, sourceKey, 'comic.loadEp', [comicId, epId]);
    final keys = _list(_map(result)['images'])
        .map((value) => value.toString())
        .where((value) => value.isNotEmpty)
        .toList();
    if (keys.isEmpty) return;
    final total = limit < 0 ? keys.length : math.min(limit, keys.length);
    if (total <= 0) return;
    final start = math.max(0, math.min(from - 1, keys.length - 1));
    final indexes = <int>[];
    for (var offset = 0; offset < keys.length && indexes.length < total; offset++) {
      indexes.add((start + offset) % keys.length);
    }
    final missing = <int>[];
    for (final index in indexes) {
      if (!_hasCache(userId,
          _imageCacheKey(userId, sourceKey, comicId, epId, keys[index], false))) {
        missing.add(index);
      }
    }
    if (missing.isEmpty) return;

    final source = sources.require(userId, sourceKey);
    final configs = <int, List<Map<String, Object?>>>{};
    if (source.capabilities['imageLoad'] == true) {
      const chunkSize = 10;
      for (var offset = 0; offset < missing.length; offset += chunkSize) {
        final chunk = missing.sublist(
            offset, math.min(offset + chunkSize, missing.length));
        try {
          final lists = await sources.imageConfigsBatch(userId, sourceKey, [
            for (final index in chunk) [keys[index], comicId, epId],
          ]);
          for (var i = 0; i < chunk.length; i++) {
            final index = chunk[i];
            final list = i < lists.length && lists[i].isNotEmpty
                ? lists[i]
                : <Map<String, Object?>>[
                    {'url': keys[index]}
                  ];
            configs[index] = list;
            _rememberConfig(
                userId, sourceKey, comicId, epId, keys[index], list);
          }
        } catch (error) {
          Log.warning('Batch image config failed',
              userId: userId,
              extra: {'source': sourceKey, 'error': '$error'});
          for (final index in chunk) {
            configs[index] = [
              {'url': keys[index]}
            ];
          }
        }
      }
    } else {
      for (final index in missing) {
        configs[index] = [
          {'url': keys[index]}
        ];
      }
    }

    var completed = 0;
    await _forEachLimited(missing, 3, (index) async {
      final list = configs[index] ??
          <Map<String, Object?>>[
            {'url': keys[index]}
          ];
      try {
        await _downloadImage(
          userId,
          _imageCacheKey(userId, sourceKey, comicId, epId, keys[index], false),
          list,
          keys[index],
        );
        completed++;
      } catch (error) {
        Log.warning('Prefetch image failed',
            userId: userId,
            extra: {'source': sourceKey, 'index': index, 'error': '$error'});
      }
    });
    Log.info('Chapter prefetch finished', userId: userId, extra: {
      'source': sourceKey,
      'comic': comicId,
      'ep': epId,
      'requested': total,
      'downloaded': completed,
    });
  }

  Future<void> _forEachLimited<T>(
    List<T> items,
    int limit,
    Future<void> Function(T item) action,
  ) async {
    if (items.isEmpty) return;
    var next = 0;
    Future<void> worker() async {
      while (true) {
        final index = next++;
        if (index >= items.length) return;
        await action(items[index]);
      }
    }

    await Future.wait(
      List.generate(math.min(limit, items.length), (_) => worker()),
    );
  }

  Future<({Uint8List bytes, String mime})> cover(int userId, String url,
      {String? sourceKey}) async {
    final cacheKey =
        sha256.convert(utf8.encode('cover|$userId|$url')).toString();
    final cached = _readCache(userId, cacheKey);
    if (cached != null) return cached;
    final headers = {
      'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    };
    final cookie = _cookieHeader(userId, url);
    if (cookie != null) headers['Cookie'] = cookie;
    final response = await httpClient
        .get(Uri.parse(url), headers: headers)
        .timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.sourceError(
          'Cover load failed: ${response.statusCode}');
    }
    final mime =
        response.headers['content-type']?.split(';').first ?? _guessMime(url);
    _writeCache(userId, cacheKey, response.bodyBytes, mime);
    return (bytes: response.bodyBytes, mime: mime);
  }

  String? _cookieHeader(int userId, String url) {
    final uri = Uri.tryParse(url);
    if (uri == null) return null;
    final now = DateTime.now().millisecondsSinceEpoch;
    final pairs = <String>[];
    for (final cookie in sourceRepository.cookies(userId)) {
      final expires = cookie['expires'];
      if (expires is int && expires > 0 && expires < now) continue;
      if (cookie['secure'] == true && uri.scheme != 'https') continue;
      final domain = (cookie['domain'] ?? '').toString().replaceFirst('.', '');
      final host = uri.host.toLowerCase();
      final hostOnly = cookie['hostOnly'] != false;
      final domainOk = hostOnly
          ? host == domain.toLowerCase()
          : host == domain.toLowerCase() ||
              host.endsWith('.${domain.toLowerCase()}');
      if (!domainOk) continue;
      final path = (cookie['path'] ?? '/').toString();
      if (!uri.path.startsWith(path)) continue;
      pairs.add('${cookie['name']}=${cookie['value']}');
    }
    return pairs.isEmpty ? null : pairs.join('; ');
  }

  String _guessMime(String url) {
    final lower = url.toLowerCase().split('?').first;
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    if (lower.endsWith('.avif')) return 'image/avif';
    if (lower.endsWith('.bmp')) return 'image/bmp';
    return 'image/jpeg';
  }

  Directory _cacheDir(int userId) {
    final dir =
        Directory(p.join(paths.ensureUserDir(userId), 'cache', 'images'));
    dir.createSync(recursive: true);
    return dir;
  }

  ({int retentionDays, int limitBytes}) _cachePolicy(int userId) {
    final values = settings.all(userId);
    final rawRetention = values['cacheRetentionDays'];
    final retention =
        rawRetention is int && const [0, 1, 3, 7, 30].contains(rawRetention)
            ? rawRetention
            : 7;
    final rawLimit = values['cacheSize'];
    final limitMb = rawLimit is int && rawLimit >= 0 ? rawLimit : 2048;
    return (retentionDays: retention, limitBytes: limitMb * 1024 * 1024);
  }

  bool _hasCache(int userId, String key) {
    try {
      final dir = _cacheDir(userId);
      final file = File(p.join(dir.path, '$key.bin'));
      final meta = File(p.join(dir.path, '$key.type'));
      if (!file.existsSync() || !meta.existsSync()) return false;
      final policy = _cachePolicy(userId);
      if (policy.retentionDays > 0) {
        final age = DateTime.now().difference(file.statSync().modified);
        if (age > Duration(days: policy.retentionDays)) {
          file.deleteSync();
          meta.deleteSync();
          return false;
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  ({Uint8List bytes, String mime})? _readCache(int userId, String key) {
    try {
      final dir = _cacheDir(userId);
      final file = File(p.join(dir.path, '$key.bin'));
      final meta = File(p.join(dir.path, '$key.type'));
      if (!file.existsSync() || !meta.existsSync()) return null;
      final policy = _cachePolicy(userId);
      final now = DateTime.now();
      final age = now.difference(file.statSync().modified);
      if (policy.retentionDays > 0 &&
          age > Duration(days: policy.retentionDays)) {
        file.deleteSync();
        meta.deleteSync();
        return null;
      }
      final result =
          (bytes: file.readAsBytesSync(), mime: meta.readAsStringSync());
      // mtime is the LRU clock used by _enforceCacheLimit.
      file.setLastModifiedSync(now);
      return result;
    } catch (_) {
      return null;
    }
  }

  void _writeCache(int userId, String key, Uint8List bytes, String mime) {
    try {
      final dir = _cacheDir(userId);
      File(p.join(dir.path, '$key.bin')).writeAsBytesSync(bytes);
      File(p.join(dir.path, '$key.type')).writeAsStringSync(mime);
      _enforceCacheLimit(userId);
    } catch (_) {}
  }

  void _enforceCacheLimit(int userId) {
    // Prefetch writes hundreds of files; scanning the whole cache after each
    // write would make it O(n²). A short per-user throttle keeps the cap
    // effective without blocking chapter prefetch.
    final now = DateTime.now().millisecondsSinceEpoch;
    final last = _lastCacheEnforce[userId] ?? 0;
    if (now - last < 15000) return;
    _lastCacheEnforce[userId] = now;
    try {
      final policy = _cachePolicy(userId);
      final dir = _cacheDir(userId);
      final entries = dir
          .listSync()
          .whereType<File>()
          .where((file) => file.path.endsWith('.bin'))
          .toList();
      var total = 0;
      final stats = <({File file, int size, DateTime modified})>[];
      for (final file in entries) {
        final stat = file.statSync();
        total += stat.size;
        stats.add((file: file, size: stat.size, modified: stat.modified));
      }
      if (total <= policy.limitBytes) return;
      stats.sort((a, b) => a.modified.compareTo(b.modified));
      for (final entry in stats) {
        if (total <= policy.limitBytes) break;
        entry.file.deleteSync();
        final meta = File(entry.file.path
                .substring(0, entry.file.path.length - '.bin'.length) +
            '.type');
        if (meta.existsSync()) meta.deleteSync();
        total -= entry.size;
      }
    } catch (_) {}
  }

  int cacheBytes(int userId) {
    try {
      final dir =
          Directory(p.join(paths.ensureUserDir(userId), 'cache', 'images'));
      if (!dir.existsSync()) return 0;
      return dir
          .listSync()
          .whereType<File>()
          .where((file) => file.path.endsWith('.bin'))
          .fold<int>(0, (sum, file) => sum + file.statSync().size);
    } catch (_) {
      return 0;
    }
  }

  Future<void> clearCache(int userId) async {
    final dir =
        Directory(p.join(paths.ensureUserDir(userId), 'cache', 'images'));
    if (dir.existsSync()) {
      await dir.delete(recursive: true);
    }
  }

  // ---- link handling ----------------------------------------------------

  Future<Map<String, Object?>?> resolveLink(int userId, String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return null;
    for (final source in sources.list(userId)) {
      final domains = source.capabilities['linkDomains'];
      if (domains is! List) continue;
      if (!domains.any((d) => uri.host.endsWith(d.toString()))) continue;
      try {
        final id = await sources
            .callValue(userId, source.key, 'comic.link.linkToId', [url]);
        if (id != null && id.toString().isNotEmpty) {
          return {'source': source.key, 'comicId': id.toString()};
        }
      } catch (_) {}
    }
    return null;
  }

  // ---- helpers ----------------------------------------------------------

  Map<String, Object?> _map(Object? value) {
    if (value is Map) {
      return value.map((k, v) => MapEntry(k.toString(), v));
    }
    return {};
  }

  List<Object?> _list(Object? value) => value is List ? value : const [];

  int? _int(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return int.tryParse(value?.toString() ?? '');
  }

  List<Map<String, Object?>> _comics(Object? raw, String sourceKey) {
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((item) {
      final map = item.map((k, v) => MapEntry(k.toString(), v));
      final summary = comicSummary(map, sourceKey: sourceKey);
      summary['comicType'] = comicTypeForSource(sourceKey);
      return summary;
    }).toList();
  }

  List<Map<String, Object?>> _comments(Object? raw) {
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((item) {
      final map = item.map((k, v) => MapEntry(k.toString(), v));
      return {
        'id': (map['id'] ?? '').toString(),
        'userName': (map['userName'] ?? '').toString(),
        'avatar': map['avatar'],
        'content': (map['content'] ?? '').toString(),
        'time': _formatCommentTime(map['time']),
        'replyCount': map['replyCount'],
        'score': map['score'],
        'isLiked': map['isLiked'],
        'voteStatus': map['voteStatus'],
      };
    }).toList();
  }

  String _formatCommentTime(Object? value) {
    if (value is int) {
      final ms = value < 10000000000 ? value * 1000 : value;
      final date = DateTime.fromMillisecondsSinceEpoch(ms);
      return DateFormat('yyyy-MM-dd HH:mm:ss').format(date);
    }
    return value?.toString() ?? '';
  }

  Future<Object?> _setting(int userId, String key) async {
    final rows = sourceRepository.db.select(
        'SELECT value_json FROM settings WHERE user_id=? AND key=?',
        [userId, key]);
    if (rows.isEmpty) return null;
    try {
      return jsonDecode(rows.first['value_json'] as String);
    } catch (_) {
      return null;
    }
  }
}
