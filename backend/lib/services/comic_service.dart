import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:intl/intl.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;

import '../config.dart';
import '../repositories/library_repository.dart';
import '../repositories/source_repository.dart';
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
  final PathGuard paths;
  final http.Client httpClient = http.Client();

  ComicService({
    required this.config,
    required this.sources,
    required this.sourceRepository,
    required this.history,
    required this.favorites,
    required this.paths,
  });

  // ---- search / discovery ----------------------------------------------

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
      try {
        final data = await sources.callValue(
            userId, sourceKey, 'explore.$index.load', [page]);
        pages.add({
          'index': index,
          'title': entry['title'] ?? source.name,
          'type': entry['type'] ?? 'multiPartPage',
          'data': data,
          'error': null,
        });
      } catch (error) {
        pages.add({
          'index': index,
          'title': entry['title'] ?? source.name,
          'type': entry['type'] ?? 'multiPartPage',
          'data': null,
          'error': error.toString(),
        });
      }
    }
    return {'source': sourceKey, 'page': page, 'pages': pages};
  }

  Future<Map<String, Object?>> categories(
      int userId, String sourceKey) async {
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
    final result = await sources.callValue(
        userId, sourceKey, 'comic.loadInfo', [comicId]);
    final map = _map(result);
    final details = _normalizeDetails(map, sourceKey, comicId);
    final progress = history.progress(userId, comicId, comicTypeForSource(sourceKey));
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
          tags[entry.key.toString()] = (entry.value as List)
              .map((v) => v.toString())
              .toList();
        }
      }
    }
    final chapters = _normalizeChapters(raw['chapters']);
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

  String? _findUpdateTime(Map<String, Object?> raw, Map<String, List<String>> tags) {
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
    if (year < 2000 || year > 3000 || month < 1 || month > 12 || day < 1 || day > 31) {
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
    final result = await sources.callValue(
        userId, sourceKey, 'comic.loadEp', [comicId, epId]);
    final map = _map(result);
    final images = _list(map['images']).map((e) => e.toString()).toList();
    return {'images': images, 'total': images.length};
  }

  Future<Map<String, Object?>> thumbnails(
      int userId, String sourceKey, String comicId, Object? next) async {
    final result = await sources.callValue(
        userId, sourceKey, 'comic.loadThumbnails', [comicId, next]);
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
    return sources.callValue(
        userId, sourceKey, 'comic.likeComic', [comicId, isLiking]);
  }

  Future<Object?> rate(
      int userId, String sourceKey, String comicId, int rating) {
    return sources.callValue(
        userId, sourceKey, 'comic.starRating', [comicId, rating]);
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

  Future<Map<String, Object?>> archives(
      int userId, String sourceKey, String comicId) async {
    final result = await sources.callValue(
        userId, sourceKey, 'comic.archive.getArchives', [comicId]);
    return {'items': result is List ? result : const []};
  }

  Future<Map<String, Object?>> archiveUrl(
      int userId, String sourceKey, String comicId, String archiveId) async {
    final result = await sources.callValue(
        userId, sourceKey, 'comic.archive.getDownloadUrl', [comicId, archiveId]);
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
    final cacheKey = sha256
        .convert(utf8.encode(
            '$userId|$sourceKey|$comicId|$epId|$imageKey|$thumbnail'))
        .toString();
    final cached = _readCache(userId, cacheKey);
    if (cached != null) return cached;

    List<Map<String, Object?>> configs;
    if (thumbnail) {
      Object? config;
      try {
        config = await sources.callValue(
            userId, sourceKey, 'comic.onThumbnailLoad', [imageKey]);
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
          configs = await sources.imageConfigs(
              userId, sourceKey, [imageKey, comicId, epId]);
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
      if (configs.isEmpty) configs = [
        {'url': imageKey}
      ];
    }

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
          final result = (bytes: bytes, mime: mime);
          _writeCache(userId, cacheKey, bytes, mime);
          return result;
        }
        lastError = 'HTTP ${response.statusCode}';
      } catch (error) {
        lastError = error;
      }
    }
    throw ApiException.sourceError('Image load failed: $lastError');
  }

  Future<({Uint8List bytes, String mime})> cover(
      int userId, String url, {String? sourceKey}) async {
    final cacheKey = sha256.convert(utf8.encode('cover|$userId|$url')).toString();
    final cached = _readCache(userId, cacheKey);
    if (cached != null) return cached;
    final headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    };
    final cookie = _cookieHeader(userId, url);
    if (cookie != null) headers['Cookie'] = cookie;
    final response = await httpClient
        .get(Uri.parse(url), headers: headers)
        .timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.sourceError('Cover load failed: ${response.statusCode}');
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
    final dir = Directory(p.join(paths.ensureUserDir(userId), 'cache', 'images'));
    dir.createSync(recursive: true);
    return dir;
  }

  ({Uint8List bytes, String mime})? _readCache(int userId, String key) {
    try {
      final dir = _cacheDir(userId);
      final file = File(p.join(dir.path, '$key.bin'));
      final meta = File(p.join(dir.path, '$key.type'));
      if (!file.existsSync() || !meta.existsSync()) return null;
      final age = DateTime.now().difference(file.statSync().modified);
      if (age > const Duration(days: 7)) {
        file.deleteSync();
        meta.deleteSync();
        return null;
      }
      return (bytes: file.readAsBytesSync(), mime: meta.readAsStringSync());
    } catch (_) {
      return null;
    }
  }

  void _writeCache(int userId, String key, Uint8List bytes, String mime) {
    try {
      final dir = _cacheDir(userId);
      File(p.join(dir.path, '$key.bin')).writeAsBytesSync(bytes);
      File(p.join(dir.path, '$key.type')).writeAsStringSync(mime);
    } catch (_) {}
  }

  Future<void> clearCache(int userId) async {
    final dir = Directory(p.join(paths.ensureUserDir(userId), 'cache', 'images'));
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
        final id = await sources.callValue(
            userId, source.key, 'comic.link.linkToId', [url]);
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
    final rows = sourceRepository.db
        .select('SELECT value_json FROM settings WHERE user_id=? AND key=?',
            [userId, key]);
    if (rows.isEmpty) return null;
    try {
      return jsonDecode(rows.first['value_json'] as String);
    } catch (_) {
      return null;
    }
  }
}
