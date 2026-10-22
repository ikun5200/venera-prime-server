import 'package:mime/mime.dart';
import 'package:shelf/shelf.dart';
import 'package:shelf_router/shelf_router.dart';

import '../app_context.dart';
import '../services/auth_service.dart';
import '../util/errors.dart';

const _atomType = 'application/atom+xml;profile=opds-catalog;kind=navigation';
const _pseRel = 'http://vaemendis.net/opds-pse/stream';

Response _unauthorized() => Response(
      401,
      body: 'Authentication required',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'www-authenticate': 'Basic realm="Venera OPDS"',
      },
    );

Response _forbidden() => Response(
      403,
      body: 'Forbidden',
      headers: {'content-type': 'text/plain; charset=utf-8'},
    );

String _escape(String value) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

Uri _origin(Request request) {
  final host = request.headers['host'] ?? 'localhost';
  final proto = request.headers['x-forwarded-proto'] ?? 'http';
  return Uri.parse('$proto://$host');
}

String _href(Request request, String path, [Map<String, String>? query]) {
  final uri = _origin(request).replace(path: path, queryParameters: query);
  return _escape(uri
      .toString()
      .replaceAll('%7BpageNumber%7D', '{pageNumber}')
      .replaceAll('%7bpageNumber%7d', '{pageNumber}'));
}

String _feed({
  required Request request,
  required String id,
  required String title,
  required List<String> entries,
  String? self,
  String? next,
}) {
  final now = DateTime.now().toUtc().toIso8601String();
  final links = <String>[
    '<link rel="self" href="${self ?? _escape(request.requestedUri.toString())}" '
        'type="$_atomType"/>',
    if (next != null) '<link rel="next" href="$next" type="$_atomType"/>',
    '<link rel="start" href="${_href(request, "/opds")}" type="$_atomType"/>',
  ].join();
  return '<?xml version="1.0" encoding="UTF-8"?>'
      '<feed xmlns="http://www.w3.org/2005/Atom" '
      'xmlns:opds="http://opds-spec.org/2010/catalog" '
      'xmlns:pse="http://vaemobooks.com/opds-pse/1.0">'
      '<id>${_escape(id)}</id>'
      '<title>${_escape(title)}</title>'
      '<updated>$now</updated>'
      '<author><name>Venera</name></author>'
      '$links'
      '${entries.join()}'
      '</feed>';
}

String _navigationEntry({
  required Request request,
  required String title,
  required String content,
  required String path,
}) =>
    '<entry>'
    '<title>${_escape(title)}</title>'
    '<id>${_escape(path)}</id>'
    '<updated>${DateTime.now().toUtc().toIso8601String()}</updated>'
    '<content type="text">${_escape(content)}</content>'
    '<link rel="subsection" href="${_href(request, path)}" type="$_atomType"/>'
    '</entry>';

String _acquisitionEntry({
  required Request request,
  required String title,
  required String id,
  required String content,
  required List<String> links,
  String? cover,
}) =>
    '<entry>'
    '<title>${_escape(title)}</title>'
    '<id>${_escape(id)}</id>'
    '<updated>${DateTime.now().toUtc().toIso8601String()}</updated>'
    '<content type="text">${_escape(content)}</content>'
    '${cover == null ? '' : '<link rel="http://opds-spec.org/image" href="$cover"/>'}'
    '${links.join()}'
    '</entry>';

Response _xml(String body) => Response.ok(
      body,
      headers: {
        'content-type': 'application/atom+xml; charset=utf-8',
        'cache-control': 'no-store',
      },
    );

Handler buildOpdsRouter(AppContext ctx) {
  final router = Router();

  router.get('/opds', (Request request) {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final entries = [
      _navigationEntry(
        request: request,
        title: '收藏',
        content: '网络收藏与本地收藏',
        path: '/opds/favorites',
      ),
      _navigationEntry(
        request: request,
        title: '本地漫画',
        content: '服务器上已下载的漫画',
        path: '/opds/local',
      ),
      _navigationEntry(
        request: request,
        title: '最近阅读',
        content: '继续阅读最近的历史记录',
        path: '/opds/history',
      ),
    ];
    return _xml(_feed(
      request: request,
      id: 'venera:root',
      title: 'Venera OPDS',
      entries: entries,
      self: _href(request, '/opds'),
    ));
  });

  router.get('/opds/favorites', (Request request) {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final page = int.tryParse(request.url.queryParameters['page'] ?? '1') ?? 1;
    final folderId =
        int.tryParse(request.url.queryParameters['folderId'] ?? '');
    final result = ctx.favorites.list(
      auth.user.id,
      folderId: folderId,
      page: page.clamp(1, 100000),
      pageSize: 50,
    );
    final items = (result['items'] as List?) ?? const [];
    final entries = <String>[];
    for (final raw in items) {
      if (raw is! Map) continue;
      final item = raw.map((k, v) => MapEntry(k.toString(), v));
      final sourceKey = (item['sourceKey'] ?? '').toString();
      final comicId = (item['id'] ?? '').toString();
      final title = (item['title'] ?? comicId).toString();
      if (sourceKey.isEmpty || comicId.isEmpty) continue;
      if (!auth.user.hasPermission('nsfw') && _isNsfw(item['tags'])) continue;
      entries.add(_acquisitionEntry(
        request: request,
        title: title,
        id: 'venera:favorite:$sourceKey:$comicId',
        content: (item['subtitle'] ?? '').toString(),
        cover: _href(request, '/api/image/cover', {
          'url': (item['cover'] ?? '').toString(),
          'source': sourceKey,
          'comic': comicId,
        }),
        links: [
          '<link rel="subsection" '
              'href="${_href(request, "/opds/comic", {
                "source": sourceKey,
                "id": comicId,
              })}" type="$_atomType"/>',
        ],
      ));
    }
    final maxPage = (result['maxPage'] as int?) ?? page;
    return _xml(_feed(
      request: request,
      id: 'venera:favorites:$page',
      title: '收藏',
      entries: entries,
      self: _href(request, '/opds/favorites', {'page': '$page'}),
      next: page < maxPage
          ? _href(request, '/opds/favorites', {'page': '${page + 1}'})
          : null,
    ));
  });

  router.get('/opds/local', (Request request) {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final items = ctx.local.list(auth.user.id, sort: 'name');
    final entries = <String>[];
    for (final item in items) {
      final id = item['id'];
      final title = (item['title'] ?? '').toString();
      final cover = item['coverUrl']?.toString();
      entries.add(_acquisitionEntry(
        request: request,
        title: title,
        id: 'venera:local:$id',
        content: (item['subtitle'] ?? '').toString(),
        cover: cover == null ? null : _href(request, cover),
        links: [
          '<link rel="subsection" '
              'href="${_href(request, "/opds/local/$id")}" type="$_atomType"/>',
        ],
      ));
    }
    return _xml(_feed(
      request: request,
      id: 'venera:local',
      title: '本地漫画',
      entries: entries,
      self: _href(request, '/opds/local'),
    ));
  });

  router.get('/opds/history', (Request request) {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final items = ctx.history.recent(auth.user.id)['items'] as List;
    final entries = <String>[];
    for (final raw in items) {
      if (raw is! Map) continue;
      final item = raw.map((k, v) => MapEntry(k.toString(), v));
      final sourceKey = (item['sourceKey'] ?? '').toString();
      final comicId = (item['id'] ?? '').toString();
      if (sourceKey.isEmpty || comicId.isEmpty) continue;
      entries.add(_acquisitionEntry(
        request: request,
        title: (item['title'] ?? comicId).toString(),
        id: 'venera:history:$sourceKey:$comicId',
        content: (item['subtitle'] ?? '').toString(),
        links: [
          '<link rel="subsection" '
              'href="${_href(request, "/opds/comic", {
                "source": sourceKey,
                "id": comicId,
              })}" type="$_atomType"/>',
        ],
      ));
    }
    return _xml(_feed(
      request: request,
      id: 'venera:history',
      title: '最近阅读',
      entries: entries,
      self: _href(request, '/opds/history'),
    ));
  });

  router.get('/opds/local/<id>', (Request request, String id) {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final comicId = int.tryParse(id);
    final comic = comicId == null ? null : ctx.local.get(auth.user.id, comicId);
    if (comic == null) throw ApiException.notFound('未找到本地漫画');
    final chapters = (comic['chapterList'] as List).whereType<Map>().toList();
    final entries = <String>[];
    for (final chapter in chapters) {
      final chapterId = chapter['id'].toString();
      final title = (chapter['title'] ?? chapterId).toString();
      final files = ctx.local.chapterFiles(auth.user.id, comicId!, chapterId);
      entries.add(_acquisitionEntry(
        request: request,
        title: title,
        id: 'venera:local:$comicId:$chapterId',
        content: '${files.length} 页',
        links: [
          if (files.isNotEmpty)
            '<link rel="$_pseRel" '
                'href="${_href(request, "/opds/local/$comicId/pse/$chapterId", {
                  "page": "{pageNumber}",
                })}" type="image/jpeg" pse:count="${files.length}"/>',
          '<link rel="http://opds-spec.org/acquisition" '
              'href="${_href(request, "/opds/local/$comicId/download", {
                "chapters": chapterId,
              })}" type="application/zip"/>',
        ],
      ));
    }
    return _xml(_feed(
      request: request,
      id: 'venera:local:$comicId',
      title: (comic['title'] ?? '本地漫画').toString(),
      entries: entries,
      self: _href(request, '/opds/local/$comicId'),
    ));
  });

  router.get('/opds/comic', (Request request) async {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final source = request.url.queryParameters['source'] ?? '';
    final comicId = request.url.queryParameters['id'] ?? '';
    if (source.isEmpty || comicId.isEmpty) {
      throw ApiException.badRequest('缺少 source 或 id');
    }
    final info = await ctx.comics.comicInfo(auth.user.id, source, comicId);
    if (!auth.user.hasPermission('nsfw') && _isNsfw(info['tags'])) {
      return _forbidden();
    }
    final chapters = <({String id, String name})>[];
    final rawChapters = info['chapters'];
    if (rawChapters is Map) {
      for (final entry in rawChapters.entries) {
        if (entry.value is Map) {
          for (final chapter in (entry.value as Map).entries) {
            chapters.add((
              id: chapter.key.toString(),
              name: chapter.value.toString(),
            ));
          }
        } else {
          chapters.add((
            id: entry.key.toString(),
            name: entry.value.toString(),
          ));
        }
      }
    }
    final counts = await _chapterCounts(
      ctx,
      auth.user.id,
      source,
      comicId,
      chapters.map((chapter) => chapter.id).toList(),
    );
    final entries = <String>[];
    for (final chapter in chapters) {
      final count = counts[chapter.id] ?? 0;
      entries.add(_acquisitionEntry(
        request: request,
        title: chapter.name,
        id: 'venera:$source:$comicId:${chapter.id}',
        content: '$count 页',
        links: [
          if (count > 0)
            '<link rel="$_pseRel" '
                'href="${_href(request, "/opds/pse", {
                  "source": source,
                  "comic": comicId,
                  "chapter": chapter.id,
                  "page": "{pageNumber}",
                })}" type="image/jpeg" pse:count="$count"/>',
          '<link rel="http://opds-spec.org/acquisition" '
              'href="${_href(request, "/opds/download", {
                "source": source,
                "comic": comicId,
                "chapters": chapter.id,
              })}" type="application/zip"/>',
        ],
      ));
    }
    return _xml(_feed(
      request: request,
      id: 'venera:$source:$comicId',
      title: (info['title'] ?? comicId).toString(),
      entries: entries,
      self: _href(request, '/opds/comic', {'source': source, 'id': comicId}),
    ));
  });

  router.get('/opds/local/<id>/pse/<chapterId>',
      (Request request, String id, String chapterId) async {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final comicId = int.tryParse(id);
    if (comicId == null) throw ApiException.notFound('未找到本地漫画');
    final page = (int.tryParse(request.url.queryParameters['page'] ?? '1') ?? 1)
        .clamp(1, 100000);
    final files = ctx.local.chapterFiles(auth.user.id, comicId, chapterId);
    if (files.isEmpty) {
      throw ApiException.notFound('未找到章节图片');
    }
    if (page > files.length) throw ApiException.notFound('页码超出范围');
    final file = files[page - 1];
    final result = await ctx.images.convert(
      userId: auth.user.id,
      cacheKey: 'opds|local|$comicId|$chapterId|$page',
      bytes: await file.readAsBytes(),
      mime: lookupMimeType(file.path) ?? 'image/jpeg',
    );
    return Response.ok(
      Stream<List<int>>.value(result.bytes),
      headers: {
        'content-type': result.mime,
        'content-length': '${result.bytes.length}',
        'cache-control': 'private, max-age=86400',
      },
    );
  });

  router.get('/opds/pse', (Request request) async {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final source = request.url.queryParameters['source'] ?? '';
    final comicId = request.url.queryParameters['comic'] ?? '';
    final chapterId = request.url.queryParameters['chapter'] ?? '';
    final page = (int.tryParse(request.url.queryParameters['page'] ?? '1') ?? 1)
        .clamp(1, 100000);
    if (source.isEmpty || comicId.isEmpty || chapterId.isEmpty) {
      throw ApiException.badRequest('缺少必要参数');
    }
    final info = await ctx.comics.comicInfo(auth.user.id, source, comicId);
    if (!auth.user.hasPermission('nsfw') && _isNsfw(info['tags'])) {
      return _forbidden();
    }
    final imagesResult = await ctx.comics
        .chapterImages(auth.user.id, source, comicId, chapterId);
    final images = (imagesResult['images'] as List?)
            ?.map((value) => value.toString())
            .toList() ??
        const <String>[];
    if (images.isEmpty) throw ApiException.notFound('章节没有图片');
    if (page > images.length) throw ApiException.notFound('页码超出范围');
    final image = await ctx.comics
        .image(auth.user.id, source, comicId, chapterId, images[page - 1]);
    final result = await ctx.images.convert(
      userId: auth.user.id,
      cacheKey: 'opds|$source|$comicId|$chapterId|$page',
      bytes: image.bytes,
      mime: image.mime,
    );
    return Response.ok(
      Stream<List<int>>.value(result.bytes),
      headers: {
        'content-type': result.mime,
        'content-length': '${result.bytes.length}',
        'cache-control': 'private, max-age=86400',
      },
    );
  });

  router.get('/opds/local/<id>/download', (Request request, String id) async {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final comicId = int.tryParse(id);
    if (comicId == null) throw ApiException.notFound('未找到本地漫画');
    final chapters = (request.url.queryParameters['chapters'] ?? '')
        .split(',')
        .where((value) => value.isNotEmpty)
        .toList();
    final result = await ctx.downloads.localArchive(
      auth.user.id,
      comicId,
      chapterIds: chapters.isEmpty ? null : chapters,
    );
    return Response.ok(
      result.bytes,
      headers: {
        'content-type': 'application/zip',
        'content-disposition':
            'attachment; filename="${Uri.encodeComponent(result.filename)}"',
      },
    );
  });

  router.get('/opds/download', (Request request) async {
    final auth = optionalAuth(request);
    if (auth == null) return _unauthorized();
    final source = request.url.queryParameters['source'] ?? '';
    final comicId = request.url.queryParameters['comic'] ?? '';
    final chapters = (request.url.queryParameters['chapters'] ?? '')
        .split(',')
        .where((value) => value.isNotEmpty)
        .toList();
    if (source.isEmpty || comicId.isEmpty) {
      throw ApiException.badRequest('缺少 source 或 comic');
    }
    final info = await ctx.comics.comicInfo(auth.user.id, source, comicId);
    if (!auth.user.hasPermission('nsfw') && _isNsfw(info['tags'])) {
      return _forbidden();
    }
    final result = await ctx.downloads.browserArchive(
      auth.user.id,
      source,
      comicId,
      chapterIds: chapters.isEmpty ? null : chapters,
    );
    return Response.ok(
      result.bytes,
      headers: {
        'content-type': 'application/zip',
        'content-disposition':
            'attachment; filename="${Uri.encodeComponent(result.filename)}"',
      },
    );
  });

  return router.call;
}

bool _isNsfw(Object? tags) {
  final values = <String>[];
  void collect(Object? value) {
    if (value is String) {
      values.add(value);
    } else if (value is Iterable) {
      for (final item in value) {
        collect(item);
      }
    } else if (value is Map) {
      for (final item in value.values) {
        collect(item);
      }
    }
  }

  collect(tags);
  final text = values.join(' ').toLowerCase();
  return const ['nsfw', 'r-18', 'r18', '18+', 'adult', '成人', '里番', 'エロ', '18禁']
      .any(text.contains);
}

Future<Map<String, int>> _chapterCounts(
  AppContext ctx,
  int userId,
  String source,
  String comicId,
  List<String> chapterIds,
) async {
  final counts = <String, int>{};
  var index = 0;
  Future<void> worker() async {
    while (index < chapterIds.length) {
      final chapterId = chapterIds[index++];
      try {
        final result = await ctx.comics
            .chapterImages(userId, source, comicId, chapterId)
            .timeout(const Duration(seconds: 20));
        counts[chapterId] = (result['images'] as List?)?.length ?? 0;
      } catch (_) {
        counts[chapterId] = 0;
      }
    }
  }

  await Future.wait(
      List.generate(chapterIds.length >= 4 ? 4 : 1, (_) => worker()));
  return counts;
}
