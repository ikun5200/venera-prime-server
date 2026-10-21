import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:shelf/shelf.dart';
import 'package:shelf_router/shelf_router.dart';

import '../app_context.dart';
import '../services/auth_service.dart';
import '../util/crypto.dart';
import '../util/errors.dart';
import '../util/log.dart';

Response _json(Object? data,
        {int status = 200, Map<String, String>? headers}) =>
    Response(
      status,
      body: jsonEncode(data),
      headers: {
        'content-type': 'application/json; charset=utf-8',
        ...?headers,
      },
    );

String? _q(Request request, String key) => request.url.queryParameters[key];

int _qi(Request request, String key, [int fallback = 0]) =>
    int.tryParse(request.url.queryParameters[key] ?? '') ?? fallback;

int _page(Request request) => _qi(request, 'page', 1).clamp(1, 100000);

bool _refresh(Request request) => _q(request, 'refresh') == '1';

int _pageSize(Request request, [int fallback = 60]) =>
    _qi(request, 'pageSize', fallback).clamp(1, 500);

List<String> _options(Request request) {
  final all = request.url.queryParametersAll['options'];
  if (all == null || all.isEmpty) return const [];
  return all
      .expand((value) => value.split(','))
      .where((value) => value.isNotEmpty)
      .toList();
}

Object? _decodeParam(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  try {
    return jsonDecode(raw);
  } catch (_) {
    return raw;
  }
}

Future<Uint8List> _rawBody(Request request,
    {int maxBytes = 512 * 1024 * 1024}) async {
  final chunks = <int>[];
  await for (final chunk in request.read()) {
    chunks.addAll(chunk);
    if (chunks.length > maxBytes) {
      throw ApiException.payloadTooLarge();
    }
  }
  return Uint8List.fromList(chunks);
}

Response _file(Uint8List bytes, String mime, String filename) {
  final encoded = Uri.encodeComponent(filename);
  return Response.ok(bytes, headers: {
    'content-type': mime,
    'content-disposition': "attachment; filename*=UTF-8''$encoded",
    'cache-control': 'no-store',
  });
}

/// shelf_router captures path parameters as they appear in the raw path, so
/// `%2F` inside an opaque comic/chapter id stays encoded. The web client
/// sends those ids through `encodeURIComponent`; decode each captured
/// parameter exactly once before handing it to a route handler.
class _DecodingRouter {
  final Router _router = Router();

  static String _decode(String value) {
    try {
      return Uri.decodeComponent(value);
    } on FormatException {
      return value;
    }
  }

  static Function _wrap(Function handler) {
    if (handler is Handler) return handler;
    return (Request request, [String? a, String? b, String? c, String? d]) {
      final params = <String>[
        if (a != null) _decode(a),
        if (b != null) _decode(b),
        if (c != null) _decode(c),
        if (d != null) _decode(d),
      ];
      return Function.apply(handler, [request, ...params]);
    };
  }

  void get(String route, Function handler) =>
      _router.get(route, _wrap(handler));

  void post(String route, Function handler) =>
      _router.post(route, _wrap(handler));

  void put(String route, Function handler) =>
      _router.put(route, _wrap(handler));

  void patch(String route, Function handler) =>
      _router.patch(route, _wrap(handler));

  void delete(String route, Function handler) =>
      _router.delete(route, _wrap(handler));

  Future<Response> call(Request request) => _router.call(request);
}

Handler buildApiRouter(AppContext ctx) {
  final router = _DecodingRouter();

  // ---- public ----------------------------------------------------------
  router.get('/api/health', (Request request) => _json(ctx.health()));
  router.get('/api/init/status',
      (Request request) => _json({'initialized': ctx.auth.initialized}));

  router.post('/api/init', (Request request) async {
    final body = await readJsonBody(request);
    final user = await ctx.auth.initialize(
      (body['username'] ?? '').toString(),
      (body['password'] ?? '').toString(),
      clientIp(request),
    );
    return _json({'user': userJson(user)});
  });

  router.post('/api/auth/login', (Request request) async {
    final body = await readJsonBody(request);
    final result = await ctx.auth.login(
      (body['username'] ?? '').toString(),
      (body['password'] ?? '').toString(),
      request.headers['user-agent'],
      clientIp(request),
    );
    return _json(
      {'user': userJson(result.user)},
      headers: {
        'set-cookie': AuthService.cookieHeader(
          result.token,
          result.expires,
          secure: ctx.config.cookieSecure,
        ),
      },
    );
  });

  router.post('/api/auth/logout', (Request request) {
    ctx.auth.logout(optionalAuth(request));
    return _json({
      'ok': true
    }, headers: {
      'set-cookie': AuthService.clearCookieHeader(),
    });
  });

  router.get('/api/auth/me', (Request request) {
    final auth = requireAuth(request);
    return _json({'user': userJson(auth.user)});
  });

  // ---- admin -----------------------------------------------------------
  router.get('/api/admin/users', (Request request) {
    requireAdmin(request);
    return _json({'items': ctx.admin.list()});
  });

  router.post('/api/admin/users', (Request request) async {
    requireAdmin(request);
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final user = await ctx.admin.create(
      username: (body['username'] ?? '').toString(),
      password: (body['password'] ?? '').toString(),
      role: (body['role'] ?? 'user').toString(),
      actorId: auth.user.id,
      ip: clientIp(request),
    );
    return _json({'user': userJson(user)});
  });

  router.patch('/api/admin/users/<id>', (Request request, String id) async {
    requireAdmin(request);
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final user = await ctx.admin.update(
      int.tryParse(id) ?? 0,
      password: body['password']?.toString(),
      role: body['role']?.toString(),
      disabled: body['disabled'] is bool ? body['disabled'] as bool : null,
      actorId: auth.user.id,
      ip: clientIp(request),
    );
    return _json({'user': userJson(user)});
  });

  router.delete('/api/admin/users/<id>', (Request request, String id) async {
    requireAdmin(request);
    final auth = requireAuth(request);
    final userId = int.tryParse(id) ?? 0;
    final root = ctx.paths.userRoot(userId);
    ctx.admin.delete(userId, actorId: auth.user.id, ip: clientIp(request));
    try {
      final dir = Directory(root);
      if (dir.existsSync() && root.startsWith(ctx.paths.absoluteDataDir)) {
        await dir.delete(recursive: true);
      }
    } catch (error) {
      Log.warning('Failed to delete user files', extra: {'error': '$error'});
    }
    return _json({'ok': true});
  });

  router.get('/api/admin/audit', (Request request) {
    requireAdmin(request);
    return _json(ctx.audit.page(_page(request), _pageSize(request, 50)));
  });

  // ---- settings --------------------------------------------------------
  router.get('/api/settings', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.settings.get(auth.user.id));
  });

  router.patch('/api/settings', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    return _json(ctx.settings.update(auth.user.id, body));
  });

  router.get('/api/settings/search-history', (Request request) {
    final auth = requireAuth(request);
    return _json({'items': ctx.settings.searchHistory(auth.user.id)});
  });

  router.post('/api/settings/search-history', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.settings
        .addSearchHistory(auth.user.id, (body['keyword'] ?? '').toString());
    return _json({'items': ctx.settings.searchHistory(auth.user.id)});
  });

  router.delete('/api/settings/search-history', (Request request) {
    final auth = requireAuth(request);
    ctx.settings.clearSearchHistory(auth.user.id);
    return _json({'ok': true});
  });

  router.delete('/api/settings/search-history/<keyword>',
      (Request request, String keyword) {
    final auth = requireAuth(request);
    final raw = _decodeParam(keyword);
    ctx.settings
        .deleteSearchHistory(auth.user.id, raw is String ? raw : '$raw');
    return _json({'items': ctx.settings.searchHistory(auth.user.id)});
  });

  router.get('/api/tasks', (Request request) {
    final auth = requireAuth(request);
    return _json({'items': ctx.tasks.list(auth.user.id)});
  });

  router.post('/api/tasks/<id>/cancel', (Request request, String id) {
    final auth = requireAuth(request);
    ctx.tasks.cancel(id);
    return _json({'items': ctx.tasks.list(auth.user.id)});
  });

  router.delete('/api/tasks', (Request request) {
    final auth = requireAuth(request);
    ctx.tasks.clearFinished(auth.user.id);
    return _json({'items': ctx.tasks.list(auth.user.id)});
  });

  router.get('/api/logs', (Request request) {
    requireAdmin(request);
    final rows = ctx.db.select(
      'SELECT ts,level,request_id,user_id,route,method,status,duration_ms,message '
      'FROM request_logs ORDER BY id DESC LIMIT 500',
    );
    return _json({
      'items': Log.recent(limit: 500),
      'requests': rows
          .map((r) => {
                'ts': r['ts'],
                'level': r['level'],
                'requestId': r['request_id'],
                'userId': r['user_id'],
                'route': r['route'],
                'method': r['method'],
                'status': r['status'],
                'durationMs': r['duration_ms'],
                'message': r['message'],
              })
          .toList(),
    });
  });

  router.delete('/api/logs', (Request request) {
    requireAdmin(request);
    ctx.db.execute('DELETE FROM request_logs');
    Log.clear();
    return _json({'ok': true});
  });

  router.get('/api/settings/storage', (Request request) {
    requireAuth(request);
    return _json({'path': ctx.config.dataDir});
  });

  // ---- maintenance -----------------------------------------------------
  router.get('/api/maintenance/cache', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.comics.cacheStats(
      auth.user.id,
      sourceKey: _q(request, 'source'),
      comicId: _q(request, 'comic'),
    ));
  });

  router.post('/api/maintenance/cache/clear', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final scope = (body['scope'] ?? 'all').toString();
    final sourceKey = body['sourceKey']?.toString();
    var metadataRemoved = 0;
    var imagesRemoved = 0;
    if (scope == 'all' || scope == 'metadata') {
      metadataRemoved = ctx.comics.clearMetadataCache(
        auth.user.id,
        sourceKey: sourceKey,
        kind: body['kind']?.toString(),
      );
    }
    if (scope == 'all' || scope == 'images') {
      imagesRemoved =
          await ctx.comics.clearImageCache(auth.user.id, sourceKey: sourceKey);
    }
    return _json({
      'ok': true,
      'metadataRemoved': metadataRemoved,
      'imagesRemoved': imagesRemoved,
      'cache': ctx.comics.cacheStats(auth.user.id),
    });
  });

  router.get('/api/maintenance/cache-size', (Request request) {
    final auth = requireAuth(request);
    return _json({'bytes': ctx.comics.cacheBytes(auth.user.id)});
  });

  router.post('/api/maintenance/clear-cache', (Request request) async {
    final auth = requireAuth(request);
    await ctx.comics.clearCache(auth.user.id);
    return _json({'ok': true});
  });

  // ---- sources ---------------------------------------------------------
  router.get('/api/sources', (Request request) {
    final auth = requireAuth(request);
    return _json({
      'items': ctx.sources.list(auth.user.id).map((s) => s.toJson()).toList()
    });
  });

  router.post('/api/sources', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final script = (body['script'] ?? '').toString();
    if (script.isEmpty) throw ApiException.badRequest('缺少脚本');
    final source = await ctx.sources.importScript(auth.user.id, script,
        replace: body['replace'] == true, ip: clientIp(request));
    return _json({'source': source.toJson(includeScript: true)});
  });

  router.post('/api/sources/import', (Request request) async {
    final auth = requireAuth(request);
    final contentType = request.headers['content-type'] ?? '';
    String script;
    if (contentType.contains('application/json')) {
      final body = await readJsonBody(request);
      script = (body['script'] ?? '').toString();
    } else {
      script = utf8.decode(await _rawBody(request, maxBytes: 8 * 1024 * 1024));
    }
    if (script.trim().isEmpty) throw ApiException.badRequest('缺少脚本');
    final source = await ctx.sources.importScript(auth.user.id, script,
        replace: true, ip: clientIp(request));
    return _json({'source': source.toJson(includeScript: true)});
  });

  router.post('/api/sources/url', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final url = (body['url'] ?? '').toString();
    if (url.isEmpty) throw ApiException.badRequest('缺少地址');
    final result = await ctx.sources
        .installFromUrlOrCatalog(auth.user.id, url, ip: clientIp(request));
    if (result.source == null) {
      return _json({
        'source': null,
        'library': result.library,
        'items': ctx.sourceRepository.libraries(auth.user.id),
      });
    }
    return _json({'source': result.source!.toJson(includeScript: true)});
  });

  router.post('/api/sources/reorder', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final keys = body['keys'];
    if (keys is! List) throw ApiException.badRequest('keys 必须是数组');
    ctx.sourceRepository
        .reorder(auth.user.id, keys.map((e) => e.toString()).toList());
    return _json({
      'items': ctx.sources.list(auth.user.id).map((s) => s.toJson()).toList()
    });
  });

  router.get('/api/sources/<key>', (Request request, String key) {
    final auth = requireAuth(request);
    final source = ctx.sources.require(auth.user.id, key);
    return _json({
      'source': source.toJson(includeScript: true),
      'provenance': ctx.sourceRepository.provenance(auth.user.id, key),
    });
  });

  router.put('/api/sources/<key>', (Request request, String key) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final script = (body['script'] ?? '').toString();
    if (script.isEmpty) throw ApiException.badRequest('缺少脚本');
    final source = await ctx.sources
        .updateScript(auth.user.id, key, script, ip: clientIp(request));
    return _json({'source': source.toJson(includeScript: true)});
  });

  router.patch('/api/sources/<key>', (Request request, String key) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    if (body['enabled'] is bool) {
      ctx.sourceRepository
          .setEnabled(auth.user.id, key, body['enabled'] as bool);
    }
    return _json({'source': ctx.sources.require(auth.user.id, key).toJson()});
  });

  router.delete('/api/sources/<key>', (Request request, String key) {
    final auth = requireAuth(request);
    ctx.sourceRepository.delete(auth.user.id, key);
    ctx.contentCache.invalidate(auth.user.id, sourceKey: key);
    ctx.audit.log('source_delete', userId: auth.user.id, detail: {'key': key});
    return _json({'ok': true});
  });

  router.post('/api/sources/<key>/update', (Request request, String key) async {
    final auth = requireAuth(request);
    final source = ctx.sources.require(auth.user.id, key);
    if (source.url.isEmpty) throw ApiException.badRequest('源没有更新地址');
    final updated = await ctx.sources
        .installFromUrl(auth.user.id, source.url, ip: clientIp(request));
    return _json({'source': updated.toJson()});
  });

  router.get('/api/sources/<key>/settings', (Request request, String key) {
    final auth = requireAuth(request);
    return _json(ctx.sources.settingsFor(auth.user.id, key));
  });

  router.put('/api/sources/<key>/settings',
      (Request request, String key) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final values = body['values'];
    if (values is! Map) throw ApiException.badRequest('values 必须是对象');
    await ctx.sources.updateSettings(
      auth.user.id,
      key,
      values.map((k, v) => MapEntry(k.toString(), v)),
    );
    return _json(ctx.sources.settingsFor(auth.user.id, key));
  });

  router.post('/api/sources/<key>/settings/<setting>/callback',
      (Request request, String key, String setting) async {
    final auth = requireAuth(request);
    final result = await ctx.sources
        .callValue(auth.user.id, key, 'settings.$setting.callback', const []);
    return _json({'result': result});
  });

  router.post('/api/sources/<key>/login', (Request request, String key) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    await ctx.sources.loginPassword(
      auth.user.id,
      key,
      (body['username'] ?? '').toString(),
      (body['password'] ?? '').toString(),
    );
    return _json({'source': ctx.sources.require(auth.user.id, key).toJson()});
  });

  router.post('/api/sources/<key>/login-cookies',
      (Request request, String key) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final values = body['values'];
    if (values is! Map) throw ApiException.badRequest('values 必须是对象');
    await ctx.sources.loginCookies(
      auth.user.id,
      key,
      values.map((k, v) => MapEntry(k.toString(), v)),
    );
    return _json({'source': ctx.sources.require(auth.user.id, key).toJson()});
  });

  router.post('/api/sources/<key>/cookies',
      (Request request, String key) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final cookies = body['cookies'];
    if (cookies is! List) throw ApiException.badRequest('cookies 必须是数组');
    await ctx.sources.importCookies(
      auth.user.id,
      key,
      cookies
          .whereType<Map>()
          .map((c) => c.map((k, v) => MapEntry(k.toString(), v)))
          .toList(),
    );
    return _json({'source': ctx.sources.require(auth.user.id, key).toJson()});
  });

  router.post('/api/sources/<key>/logout', (Request request, String key) async {
    final auth = requireAuth(request);
    await ctx.sources.logout(auth.user.id, key);
    return _json({'source': ctx.sources.require(auth.user.id, key).toJson()});
  });

  router.get('/api/sources/<key>/check', (Request request, String key) async {
    final auth = requireAuth(request);
    return _json(await ctx.sources.checkReadability(
      auth.user.id,
      key,
      comicId: _q(request, 'comicId'),
    ));
  });

  router.post('/api/sources/<key>/bind', (Request request, String key) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.sources.bindSource(
      auth.user.id,
      key,
      (body['libraryId'] ?? '').toString(),
      body['fileName']?.toString(),
    );
    return _json({'source': ctx.sources.require(auth.user.id, key).toJson()});
  });

  // ---- source libraries ------------------------------------------------
  router.get('/api/source-libraries', (Request request) {
    final auth = requireAuth(request);
    return _json({'items': ctx.sourceRepository.libraries(auth.user.id)});
  });

  router.post('/api/source-libraries', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final url = (body['url'] ?? '').toString();
    if (url.isEmpty) throw ApiException.badRequest('缺少地址');
    final id = CryptoUtil.md5Hex(url).substring(0, 12);
    ctx.sourceRepository.upsertLibrary(
      auth.user.id,
      id: id,
      name: (body['name'] ?? url).toString(),
      url: url,
    );
    return _json({'items': ctx.sourceRepository.libraries(auth.user.id)});
  });

  router.patch('/api/source-libraries/<id>',
      (Request request, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final existing = ctx.sourceRepository
        .libraries(auth.user.id)
        .where((l) => l['id'] == id)
        .firstOrNull;
    if (existing == null) throw ApiException.notFound('未找到仓库');
    ctx.sourceRepository.upsertLibrary(
      auth.user.id,
      id: id,
      name: (body['name'] ?? existing['name']).toString(),
      url: existing['url'] as String,
      enabled: body['enabled'] is bool
          ? body['enabled'] as bool
          : existing['enabled'] as bool,
      priority: existing['priority'] as int,
      lastChecked: existing['lastChecked'] as int?,
    );
    return _json({'items': ctx.sourceRepository.libraries(auth.user.id)});
  });

  router.delete('/api/source-libraries/<id>', (Request request, String id) {
    final auth = requireAuth(request);
    ctx.sourceRepository.deleteLibrary(auth.user.id, id);
    return _json({'items': ctx.sourceRepository.libraries(auth.user.id)});
  });

  router.get('/api/source-libraries/<id>/catalog',
      (Request request, String id) async {
    final auth = requireAuth(request);
    final library = ctx.sourceRepository
        .libraries(auth.user.id)
        .where((l) => l['id'] == id)
        .firstOrNull;
    if (library == null) throw ApiException.notFound('未找到仓库');
    final entries = await ctx.sources.fetchCatalog(library['url'] as String);
    ctx.sourceRepository.upsertLibrary(
      auth.user.id,
      id: id,
      name: library['name'] as String,
      url: library['url'] as String,
      enabled: library['enabled'] as bool,
      priority: library['priority'] as int,
      lastChecked: DateTime.now().millisecondsSinceEpoch,
    );
    return _json({'items': entries, 'library': library});
  });

  router.post('/api/source-libraries/<id>/install',
      (Request request, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final library = ctx.sourceRepository
        .libraries(auth.user.id)
        .where((l) => l['id'] == id)
        .firstOrNull;
    if (library == null) throw ApiException.notFound('未找到仓库');
    var url = (body['url'] ?? '').toString();
    if (url.isEmpty) {
      final entries = await ctx.sources.fetchCatalog(library['url'] as String);
      final entryId = (body['entryId'] ?? '').toString();
      final entry = entries
          .where((e) => e['id'] == entryId || e['name'] == entryId)
          .firstOrNull;
      if (entry == null) throw ApiException.notFound('未找到目录条目');
      url = (entry['url'] ?? '').toString();
    }
    if (url.isEmpty) throw ApiException.badRequest('条目缺少下载地址');
    final source = await ctx.sources.installFromUrl(auth.user.id, url,
        libraryId: id,
        originId: (body['entryId'] ?? '').toString(),
        ip: clientIp(request));
    return _json({'source': source.toJson()});
  });

  // ---- search / discovery ---------------------------------------------
  router.get('/api/search', (Request request) async {
    final auth = requireAuth(request);
    final source = _q(request, 'source');
    final keyword = _q(request, 'q') ?? '';
    if (source == null || source.isEmpty) {
      throw ApiException.badRequest('缺少源');
    }
    return _json(await ctx.comics.search(
        auth.user.id, source, keyword, _options(request), _page(request),
        refresh: _refresh(request)));
  });

  router.get('/api/search/aggregated', (Request request) async {
    final auth = requireAuth(request);
    final keyword = _q(request, 'q') ?? '';
    if (keyword.trim().isEmpty) {
      throw ApiException.badRequest('缺少搜索关键词');
    }
    return _json(await ctx.comics.aggregatedSearch(auth.user.id, keyword));
  });

  router.get('/api/search/suggestions', (Request request) {
    final auth = requireAuth(request);
    final text = _q(request, 'q') ?? '';
    return _json({
      'items': ctx.comics
          .suggestions(auth.user.id, text, sourceKey: _q(request, 'source')),
    });
  });

  router.post('/api/search/suggestion', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.comics.selectSuggestion(
      auth.user.id,
      (body['source'] ?? '').toString(),
      (body['namespace'] ?? '').toString(),
      (body['tag'] ?? '').toString(),
    );
    return _json({'result': result});
  });

  router.get('/api/explore', (Request request) async {
    final auth = requireAuth(request);
    final source = _q(request, 'source');
    if (source == null || source.isEmpty) {
      throw ApiException.badRequest('缺少源');
    }
    return _json(await ctx.comics.explore(auth.user.id, source, _page(request),
        refresh: _refresh(request)));
  });

  router.get('/api/explore/next', (Request request) async {
    final auth = requireAuth(request);
    final source = _q(request, 'source');
    if (source == null || source.isEmpty) {
      throw ApiException.badRequest('缺少源');
    }
    return _json(await ctx.comics.explore(
        auth.user.id, source, _qi(request, 'next', 1),
        refresh: _refresh(request)));
  });

  router.get('/api/categories', (Request request) async {
    final auth = requireAuth(request);
    final source = _q(request, 'source');
    if (source == null || source.isEmpty) {
      throw ApiException.badRequest('缺少源');
    }
    return _json(await ctx.comics
        .categories(auth.user.id, source, refresh: _refresh(request)));
  });

  router.get('/api/category-comics', (Request request) async {
    final auth = requireAuth(request);
    final source = _q(request, 'source');
    if (source == null || source.isEmpty) {
      throw ApiException.badRequest('缺少源');
    }
    return _json(await ctx.comics.categoryComics(
      auth.user.id,
      source,
      _q(request, 'category') ?? '',
      _decodeParam(_q(request, 'param')),
      _options(request),
      _page(request),
      refresh: _refresh(request),
    ));
  });

  router.get('/api/ranking', (Request request) async {
    final auth = requireAuth(request);
    final source = _q(request, 'source');
    if (source == null || source.isEmpty) {
      throw ApiException.badRequest('缺少源');
    }
    return _json(await ctx.comics.ranking(
      auth.user.id,
      source,
      _q(request, 'option') ?? '',
      _page(request),
      refresh: _refresh(request),
    ));
  });

  // ---- comic -----------------------------------------------------------
  router.get('/api/comic/<source>/<id>',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    return _json(await ctx.comics
        .comicInfo(auth.user.id, source, id, refresh: _refresh(request)));
  });

  router.get('/api/comic/<source>/<id>/chapter/<ep>/images',
      (Request request, String source, String id, String ep) async {
    final auth = requireAuth(request);
    return _json(await ctx.comics.chapterImages(auth.user.id, source, id, ep,
        refresh: _refresh(request)));
  });

  router.post('/api/comic/<source>/<id>/chapter/<ep>/prefetch',
      (Request request, String source, String id, String ep) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final from = (body['from'] as num?)?.toInt() ?? 1;
    final limit = (body['limit'] as num?)?.toInt();
    return _json(await ctx.comics.prefetchChapter(auth.user.id, source, id, ep,
        from: from, limit: limit));
  });

  router.get('/api/comic/<source>/<id>/thumbnails',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    return _json(await ctx.comics.thumbnails(
        auth.user.id, source, id, _decodeParam(_q(request, 'next')),
        refresh: _refresh(request)));
  });

  router.get('/api/comic/<source>/<id>/comments',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    return _json(await ctx.comics.comments(
      auth.user.id,
      source,
      id,
      subId: _q(request, 'subId'),
      page: _page(request),
      replyTo: _decodeParam(_q(request, 'replyTo')),
      refresh: _refresh(request),
    ));
  });

  router.post('/api/comic/<source>/<id>/comments',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.comics.sendComment(
      auth.user.id,
      source,
      id,
      (body['content'] ?? '').toString(),
      subId: body['subId']?.toString(),
      replyTo: body['replyTo'],
    );
    return _json({'result': result});
  });

  router.get('/api/comic/<source>/<id>/chapter/<ep>/comments',
      (Request request, String source, String id, String ep) async {
    final auth = requireAuth(request);
    return _json(await ctx.comics.chapterComments(
      auth.user.id,
      source,
      id,
      ep,
      page: _page(request),
      replyTo: _decodeParam(_q(request, 'replyTo')),
      refresh: _refresh(request),
    ));
  });

  router.post('/api/comic/<source>/<id>/chapter/<ep>/comments',
      (Request request, String source, String id, String ep) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.comics.sendChapterComment(
      auth.user.id,
      source,
      id,
      ep,
      (body['content'] ?? '').toString(),
      replyTo: body['replyTo'],
    );
    return _json({'result': result});
  });

  router.post('/api/comic/<source>/<id>/like',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result =
        await ctx.comics.like(auth.user.id, source, id, body['like'] == true);
    return _json({'result': result});
  });

  router.post('/api/comic/<source>/<id>/rating',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final stars = (body['rating'] as num?)?.toInt() ?? 0;
    final result = await ctx.comics
        .rate(auth.user.id, source, id, (stars * 2).clamp(0, 10));
    return _json({'result': result});
  });

  router.post('/api/comic/<source>/<id>/comment-like',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.comics.likeComment(
      auth.user.id,
      source,
      id,
      body['subId']?.toString(),
      (body['commentId'] ?? '').toString(),
      body['like'] == true,
    );
    return _json({'result': result});
  });

  router.post('/api/comic/<source>/<id>/chapter/<ep>/comment-like',
      (Request request, String source, String id, String ep) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.comics.likeChapterComment(
      auth.user.id,
      source,
      id,
      ep,
      (body['commentId'] ?? '').toString(),
      body['like'] == true,
    );
    return _json({'result': result});
  });

  router.post('/api/comic/<source>/<id>/chapter/<ep>/comment-vote',
      (Request request, String source, String id, String ep) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.comics.voteChapterComment(
      auth.user.id,
      source,
      id,
      ep,
      (body['commentId'] ?? '').toString(),
      body['up'] == true,
      body['cancel'] == true,
    );
    return _json({'result': result});
  });

  router.post('/api/comic/<source>/<id>/comment-vote',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.comics.voteComment(
      auth.user.id,
      source,
      id,
      body['subId']?.toString(),
      (body['commentId'] ?? '').toString(),
      body['up'] == true,
      body['cancel'] == true,
    );
    return _json({'result': result});
  });

  router.get('/api/comic/<source>/<id>/archives',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    return _json(await ctx.comics.archives(auth.user.id, source, id));
  });

  router.post('/api/comic/<source>/<id>/archive-url',
      (Request request, String source, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    return _json(await ctx.comics.archiveUrl(
        auth.user.id, source, id, (body['archiveId'] ?? '').toString()));
  });

  router.get('/api/image', (Request request) async {
    final auth = requireAuth(request);
    final source = _q(request, 'source') ?? '';
    final key = _q(request, 'key') ?? '';
    if (source.isEmpty) {
      if (key.isEmpty) throw ApiException.badRequest('缺少 key');
      final result = await ctx.comics.cover(auth.user.id, key);
      return Response.ok(result.bytes, headers: {
        'content-type': result.mime,
        'cache-control': 'private, max-age=86400',
      });
    }
    final result = await ctx.comics.image(
      auth.user.id,
      source,
      _q(request, 'comic') ?? '',
      _q(request, 'ep') ?? '',
      key,
      thumbnail: _q(request, 'thumb') == 'true',
    );
    return Response.ok(result.bytes, headers: {
      'content-type': result.mime,
      'cache-control': 'private, max-age=86400',
    });
  });

  router.get('/api/image/thumb', (Request request) async {
    final auth = requireAuth(request);
    final source = _q(request, 'source') ?? '';
    final key = _q(request, 'key') ?? '';
    final result = await ctx.comics.image(
      auth.user.id,
      source,
      _q(request, 'comic') ?? '',
      _q(request, 'ep') ?? '',
      key,
      thumbnail: true,
    );
    return Response.ok(result.bytes, headers: {
      'content-type': result.mime,
      'cache-control': 'private, max-age=86400',
    });
  });

  router.get('/api/image/cover', (Request request) async {
    final auth = requireAuth(request);
    final url = _q(request, 'url') ?? '';
    if (url.isEmpty) throw ApiException.badRequest('缺少地址');
    final result = await ctx.comics.cover(
      auth.user.id,
      url,
      sourceKey: _q(request, 'source'),
      comicId: _q(request, 'comic'),
    );
    return Response.ok(result.bytes, headers: {
      'content-type': result.mime,
      'cache-control': 'private, max-age=86400',
    });
  });

  // ---- favorites -------------------------------------------------------
  router.get('/api/favorites/folders', (Request request) {
    final auth = requireAuth(request);
    return _json({'items': ctx.favorites.folders(auth.user.id)});
  });

  router.post('/api/favorites/folders', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final id = ctx.favorites
        .createFolder(auth.user.id, (body['name'] ?? '').toString());
    return _json({'id': id, 'items': ctx.favorites.folders(auth.user.id)});
  });

  router.patch('/api/favorites/folders/<id>',
      (Request request, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final folderId = int.tryParse(id) ?? 0;
    if (body['name'] != null) {
      ctx.favorites
          .renameFolder(auth.user.id, folderId, body['name'].toString());
    }
    if (body.containsKey('sourceKey')) {
      ctx.favorites.linkFolder(
        auth.user.id,
        folderId,
        sourceKey: body['sourceKey']?.toString(),
        sourceFolder: body['sourceFolder']?.toString(),
      );
    }
    return _json({'items': ctx.favorites.folders(auth.user.id)});
  });

  router.post('/api/favorites/folders/<id>/sync',
      (Request request, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final pages = (body['pages'] as num?)?.toInt() ?? 20;
    return _json(await ctx.favorites.syncNetworkFolder(
      auth.user.id,
      int.tryParse(id) ?? 0,
      pages: pages,
    ));
  });

  router.post('/api/favorites/import-network', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final source = (body['source'] ?? '').toString();
    if (source.isEmpty) throw ApiException.badRequest('缺少源');
    return _json(await ctx.favorites.importNetworkFolder(
      auth.user.id,
      sourceKey: source,
      networkFolder: body['folder']?.toString(),
      name: body['name']?.toString(),
      pages: (body['pages'] as num?)?.toInt() ?? 20,
    ));
  });

  router.delete('/api/favorites/folders/<id>', (Request request, String id) {
    final auth = requireAuth(request);
    ctx.favorites.deleteFolder(auth.user.id, int.tryParse(id) ?? 0);
    return _json({'items': ctx.favorites.folders(auth.user.id)});
  });

  router.post('/api/favorites/folders/sort', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final ids = body['ids'];
    if (ids is! List) throw ApiException.badRequest('ids 必须是数组');
    ctx.favorites.sortFolders(
        auth.user.id, ids.map((e) => int.tryParse(e.toString()) ?? 0).toList());
    return _json({'items': ctx.favorites.folders(auth.user.id)});
  });

  router.get('/api/favorites', (Request request) {
    final auth = requireAuth(request);
    final folderId = int.tryParse(_q(request, 'folderId') ?? '');
    return _json(ctx.favorites.list(
      auth.user.id,
      folderId: folderId,
      query: _q(request, 'q'),
      status: _q(request, 'status'),
      page: _page(request),
      pageSize: _pageSize(request),
    ));
  });

  router.post('/api/favorites', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final comic = body['comic'];
    if (comic is! Map) throw ApiException.badRequest('缺少漫画信息');
    ctx.favorites.add(
      auth.user.id,
      (body['folderId'] as num?)?.toInt() ?? 0,
      comic.map((k, v) => MapEntry(k.toString(), v)),
      atStart: body['atStart'] == true,
    );
    return _json({'items': ctx.favorites.folders(auth.user.id)});
  });

  router.delete('/api/favorites/<folderId>/<comicType>/<comicId>',
      (Request request, String folderId, String comicType, String comicId) {
    final auth = requireAuth(request);
    ctx.favorites.remove(
      auth.user.id,
      int.tryParse(folderId) ?? 0,
      comicId,
      int.tryParse(comicType) ?? 0,
    );
    return _json({'ok': true});
  });

  router.post('/api/favorites/move', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.favorites.moveOrCopy(
      auth.user.id,
      (body['from'] as num?)?.toInt() ?? 0,
      (body['to'] as num?)?.toInt() ?? 0,
      _mapList(body['items']),
      move: true,
    );
    return _json({'ok': true});
  });

  router.post('/api/favorites/copy', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.favorites.moveOrCopy(
      auth.user.id,
      (body['from'] as num?)?.toInt() ?? 0,
      (body['to'] as num?)?.toInt() ?? 0,
      _mapList(body['items']),
      move: false,
    );
    return _json({'ok': true});
  });

  router.post('/api/favorites/batch-delete', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.favorites.batchDelete(auth.user.id, _mapList(body['items']));
    return _json({'ok': true});
  });

  router.post('/api/favorites/delete-unavailable', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.favorites.deleteUnavailable(auth.user.id));
  });

  router.post('/api/favorites/update-info', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.favorites.updateInfo(auth.user.id,
        folderId: (body['folderId'] as num?)?.toInt());
    return _json({'ok': true});
  });

  router.get('/api/favorites/export', (Request request) {
    final auth = requireAuth(request);
    final folderId = int.tryParse(_q(request, 'folderId') ?? '');
    if (folderId == null) throw ApiException.badRequest('缺少文件夹 ID');
    final data = ctx.favorites.exportFolder(auth.user.id, folderId);
    return _json(data, headers: {
      'content-disposition':
          'attachment; filename="favorites-${data['name']}.json"',
    });
  });

  router.post('/api/favorites/import', (Request request) async {
    final auth = requireAuth(request);
    Object? decoded;
    final contentType = request.headers['content-type'] ?? '';
    if (contentType.contains('application/json')) {
      decoded = await readJsonBody(request);
    } else {
      final raw = await _rawBody(request, maxBytes: 32 * 1024 * 1024);
      decoded = jsonDecode(utf8.decode(raw));
    }
    if (decoded is! Map) throw ApiException.badRequest('收藏文件无效');
    final data = decoded['data'] is Map ? decoded['data'] as Map : decoded;
    final folder = ctx.favorites.importFolder(
        auth.user.id, data.map((k, v) => MapEntry(k.toString(), v)));
    return _json({'folder': folder});
  });

  router.get('/api/favorites/network/<source>',
      (Request request, String source) async {
    final auth = requireAuth(request);
    return _json(await ctx.favorites.networkFolders(
      auth.user.id,
      source,
      comicId: _q(request, 'comicId'),
      refresh: _q(request, 'refresh') == '1',
    ));
  });

  router.get('/api/favorites/network/<source>/<folder>',
      (Request request, String source, String folder) async {
    final auth = requireAuth(request);
    return _json(await ctx.favorites.networkComics(
      auth.user.id,
      source,
      folder == 'all' ? null : _decodeParam(folder),
      _page(request),
      refresh: _q(request, 'refresh') == '1',
    ));
  });

  router.post('/api/favorites/network/<source>',
      (Request request, String source) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.favorites.networkToggle(
      auth.user.id,
      source,
      (body['comicId'] ?? '').toString(),
      body['folderId'],
      body['add'] == true,
      favoriteId: body['favoriteId'],
    );
    return _json({'result': result});
  });

  router.post('/api/favorites/network/<source>/folder',
      (Request request, String source) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.favorites.networkAddFolder(
        auth.user.id, source, (body['name'] ?? '').toString());
    return _json({'result': result});
  });

  router.delete('/api/favorites/network/<source>/folder/<folderId>',
      (Request request, String source, String folderId) async {
    final auth = requireAuth(request);
    final result = await ctx.favorites
        .networkDeleteFolder(auth.user.id, source, _decodeParam(folderId));
    return _json({'result': result});
  });

  // ---- history / progress ---------------------------------------------
  router.get('/api/history', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.history.list(
      auth.user.id,
      query: _q(request, 'q'),
      page: _page(request),
      pageSize: _pageSize(request),
    ));
  });

  router.put('/api/history', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.history.upsert(auth.user.id, body);
    return _json({'ok': true});
  });

  router.delete('/api/history/<comicType>/<comicId>',
      (Request request, String comicType, String comicId) {
    final auth = requireAuth(request);
    ctx.history.delete(auth.user.id, comicId, int.tryParse(comicType) ?? 0);
    return _json({'ok': true});
  });

  router.post('/api/history/clear', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.history
        .clear(auth.user.id, unfavoritedOnly: body['unfavoritedOnly'] == true);
    return _json({'ok': true});
  });

  router.post('/api/history/refresh', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.history.refresh(auth.user.id,
        ids: body['ids'] is List ? _mapList(body['ids']) : null);
    return _json({'ok': true});
  });

  router.get('/api/progress/<source>/<id>',
      (Request request, String source, String id) {
    final auth = requireAuth(request);
    return _json(ctx.history.progress(auth.user.id, source, id));
  });

  // ---- read later ------------------------------------------------------
  router.get('/api/read-later', (Request request) {
    final auth = requireAuth(request);
    return _json({
      'items': ctx.readLater.list(auth.user.id, query: _q(request, 'q')),
      'count': ctx.readLater.count(auth.user.id),
    });
  });

  router.post('/api/read-later', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final comic = body['comic'];
    if (comic is! Map) throw ApiException.badRequest('缺少漫画信息');
    final added = ctx.readLater
        .add(auth.user.id, comic.map((k, v) => MapEntry(k.toString(), v)));
    return _json({'added': added});
  });

  router.delete('/api/read-later', (Request request) {
    final auth = requireAuth(request);
    ctx.readLater.clear(auth.user.id);
    return _json({'ok': true});
  });

  router.delete('/api/read-later/<comicType>/<comicId>',
      (Request request, String comicType, String comicId) {
    final auth = requireAuth(request);
    ctx.readLater.remove(auth.user.id, comicId, int.tryParse(comicType) ?? 0);
    return _json({'ok': true});
  });

  router.post('/api/read-later/batch-delete', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.readLater.batchDelete(auth.user.id, _mapList(body['items']));
    return _json({'ok': true});
  });

  router.post('/api/read-later/restore', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.readLater.restore(auth.user.id, _mapList(body['items']));
    return _json({'ok': true});
  });

  // ---- follow updates --------------------------------------------------
  router.get('/api/follow-updates/config', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.followUpdates.config(auth.user.id).toJson());
  });

  router.put('/api/follow-updates/config', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.followUpdates.saveConfig(auth.user.id, body);
    return _json(ctx.followUpdates.config(auth.user.id).toJson());
  });

  router.get('/api/follow-updates', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.followUpdates.overview(auth.user.id));
  });

  router.post('/api/follow-updates/check', (Request request) {
    final auth = requireAuth(request);
    ctx.followUpdates.check(auth.user.id);
    return _json({'ok': true});
  });

  router.post('/api/follow-updates/mark-read', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.followUpdates.markRead(auth.user.id,
        ids: body['ids'] is List ? _mapList(body['ids']) : null);
    return _json({'ok': true});
  });

  // ---- downloads -------------------------------------------------------
  router.get('/api/downloads', (Request request) {
    final auth = requireAuth(request);
    return _json({'items': ctx.downloads.list(auth.user.id)});
  });

  router.post('/api/downloads', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final source = (body['source'] ?? '').toString();
    final comicId = (body['comicId'] ?? '').toString();
    if (source.isEmpty || comicId.isEmpty) {
      throw ApiException.badRequest('缺少源或漫画 ID');
    }
    final chapters = body['chapters'] is List
        ? (body['chapters'] as List).map((e) => e.toString()).toList()
        : null;
    final job = await ctx.downloads.create(
      auth.user.id,
      source,
      comicId,
      chapterIds: chapters,
      archiveId: body['archiveId']?.toString(),
    );
    return _json({'job': job});
  });

  router.get('/api/downloads/browser', (Request request) async {
    final auth = requireAuth(request);
    final source = _q(request, 'source') ?? '';
    final comicId = _q(request, 'comicId') ?? '';
    if (source.isEmpty || comicId.isEmpty) {
      throw ApiException.badRequest('缺少源或漫画 ID');
    }
    final chapters = (_q(request, 'chapters') ?? '')
        .split(',')
        .where((e) => e.isNotEmpty)
        .toList();
    final result = await ctx.downloads.browserArchive(
      auth.user.id,
      source,
      comicId,
      chapterIds: chapters.isEmpty ? null : chapters,
    );
    return _file(result.bytes, 'application/zip', result.filename);
  });

  router.get('/api/downloads/<id>', (Request request, String id) {
    final auth = requireAuth(request);
    return _json({'job': ctx.downloads.get(auth.user.id, id)});
  });

  router.post('/api/downloads/<id>/<action>',
      (Request request, String id, String action) {
    final auth = requireAuth(request);
    switch (action) {
      case 'pause':
        ctx.downloads.pause(auth.user.id, id);
      case 'resume':
        ctx.downloads.resume(auth.user.id, id);
      case 'retry':
        ctx.downloads.retry(auth.user.id, id);
      case 'cancel':
        ctx.downloads.cancel(auth.user.id, id);
      case 'first':
        ctx.downloads.moveToFirst(auth.user.id, id);
      default:
        throw ApiException.badRequest('未知操作');
    }
    return _json({'job': ctx.downloads.get(auth.user.id, id)});
  });

  router.get('/api/downloads/<id>/archive', (Request request, String id) async {
    final auth = requireAuth(request);
    final job = ctx.downloads.get(auth.user.id, id);
    final localComic = ctx.localRepository.findByExt(
      auth.user.id,
      job['comicType'] as int,
      job['comicId'] as String,
    );
    if (localComic == null) {
      throw ApiException.notFound('未找到已下载漫画');
    }
    final result =
        await ctx.downloads.localArchive(auth.user.id, localComic.id);
    return _file(result.bytes, 'application/zip', result.filename);
  });

  // ---- local library / uploads ----------------------------------------
  router.get('/api/local-comics', (Request request) {
    final auth = requireAuth(request);
    return _json({
      'items': ctx.local.list(auth.user.id,
          query: _q(request, 'q'), sort: _q(request, 'sort') ?? 'name'),
    });
  });

  router.get('/api/local-comics/<id>', (Request request, String id) {
    final auth = requireAuth(request);
    final comic = ctx.local.get(auth.user.id, int.tryParse(id) ?? 0);
    if (comic == null) throw ApiException.notFound('未找到本地漫画');
    return _json(comic);
  });

  router.delete('/api/local-comics/<id>', (Request request, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    await ctx.local.deleteComic(
      auth.user.id,
      int.tryParse(id) ?? 0,
      removeFiles: body['removeFiles'] != false,
      removeFavorites: body['removeFavorites'] != false,
    );
    return _json({'ok': true});
  });

  router.delete('/api/local-comics/<id>/chapters',
      (Request request, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final chapters = body['chapters'];
    if (chapters is! List) throw ApiException.badRequest('chapters 必须是数组');
    await ctx.local.deleteChapters(
      auth.user.id,
      int.tryParse(id) ?? 0,
      chapters.map((e) => e.toString()).toList(),
    );
    return _json({'ok': true});
  });

  router.get('/api/local-comics/<id>/chapter/<chapter>/images',
      (Request request, String id, String chapter) async {
    final auth = requireAuth(request);
    return _json(await ctx.local
        .chapterImages(auth.user.id, int.tryParse(id) ?? 0, chapter));
  });

  router.get('/api/local-comics/<id>/image/<chapter>/<page>',
      (Request request, String id, String chapter, String page) async {
    final auth = requireAuth(request);
    final result = await ctx.local.image(
      auth.user.id,
      int.tryParse(id) ?? 0,
      chapter,
      int.tryParse(page) ?? 0,
    );
    return Response.ok(result.bytes, headers: {
      'content-type': result.mime,
      'cache-control': 'private, max-age=86400',
    });
  });

  router.get('/api/local-comics/<id>/cover',
      (Request request, String id) async {
    final auth = requireAuth(request);
    final result = await ctx.local.cover(auth.user.id, int.tryParse(id) ?? 0);
    return Response.ok(result.bytes, headers: {
      'content-type': result.mime,
      'cache-control': 'private, max-age=86400',
    });
  });

  router.get('/api/local-comics/<id>/export',
      (Request request, String id) async {
    final auth = requireAuth(request);
    final format = _q(request, 'format') ?? 'cbz';
    final bytes =
        await ctx.local.export(auth.user.id, int.tryParse(id) ?? 0, format);
    final comic = ctx.local.get(auth.user.id, int.tryParse(id) ?? 0);
    final name = '${comic?['title'] ?? 'comic'}.$format';
    final mime = switch (format) {
      'pdf' => 'application/pdf',
      'epub' => 'application/epub+zip',
      _ => 'application/zip',
    };
    return _file(bytes, mime, name);
  });

  router.get('/api/uploads', (Request request) {
    final auth = requireAuth(request);
    return _json({'items': ctx.local.uploads(auth.user.id)});
  });

  router.post('/api/uploads/init', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    return _json(ctx.local.initUpload(
      auth.user.id,
      (body['name'] ?? 'upload.zip').toString(),
      (body['size'] as num?)?.toInt() ?? 0,
      (body['mime'] ?? 'application/octet-stream').toString(),
    ));
  });

  router.put('/api/uploads/<id>/chunk', (Request request, String id) async {
    final auth = requireAuth(request);
    final offset = _qi(request, 'offset', 0);
    final bytes = await _rawBody(request, maxBytes: 32 * 1024 * 1024);
    return _json(await ctx.local.writeChunk(auth.user.id, id, offset, bytes));
  });

  router.post('/api/uploads/<id>/complete', (Request request, String id) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    return _json(await ctx.local.completeUpload(
      auth.user.id,
      id,
      import: body['import'] == true,
    ));
  });

  router.delete('/api/uploads/<id>', (Request request, String id) async {
    final auth = requireAuth(request);
    await ctx.local.deleteUpload(auth.user.id, id);
    return _json({'ok': true});
  });

  router.post('/api/local-comics/refresh', (Request request) async {
    final auth = requireAuth(request);
    await ctx.local.refreshLibrary(auth.user.id);
    return _json({'ok': true});
  });

  router.post('/api/local-comics/import', (Request request) async {
    final auth = requireAuth(request);
    final name = _q(request, 'name') ?? 'comic.zip';
    final bytes = await _rawBody(request);
    final comic = await ctx.local.importArchive(auth.user.id, bytes, name);
    return _json({'comic': comic});
  });

  // ---- webdav / backup -------------------------------------------------
  router.get('/api/webdav', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.webdav.get(auth.user.id));
  });

  router.put('/api/webdav', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    return _json(await ctx.webdav.save(auth.user.id, body));
  });

  router.post('/api/webdav/test', (Request request) async {
    final auth = requireAuth(request);
    return _json(await ctx.webdav.test(auth.user.id));
  });

  router.post('/api/webdav/upload', (Request request) async {
    final auth = requireAuth(request);
    return _json(await ctx.webdav.upload(auth.user.id));
  });

  router.post('/api/webdav/download', (Request request) async {
    final auth = requireAuth(request);
    return _json(await ctx.webdav.download(auth.user.id));
  });

  router.get('/api/webdav/status', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.webdav.get(auth.user.id));
  });

  router.get('/api/backup/export', (Request request) {
    final auth = requireAuth(request);
    final bytes = ctx.backup.exportZip(auth.user.id);
    return _file(bytes, 'application/zip', 'venera-backup.zip');
  });

  router.post('/api/backup/import', (Request request) async {
    final auth = requireAuth(request);
    final bytes = await _rawBody(request);
    final result = await ctx.backup
        .importBytes(auth.user.id, bytes, ip: clientIp(request));
    return _json(result);
  });

  // ---- statistics ------------------------------------------------------
  router.get('/api/statistics', (Request request) {
    final auth = requireAuth(request);
    return _json(
        ctx.statistics.summary(auth.user.id, days: _qi(request, 'days', 30)));
  });

  router.post('/api/statistics', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.statistics.record(auth.user.id, body);
    return _json({'ok': true});
  });

  router.delete('/api/statistics', (Request request) {
    final auth = requireAuth(request);
    ctx.statistics.clear(auth.user.id);
    return _json({'ok': true});
  });

  router.delete('/api/statistics/<comicType>/<comicId>',
      (Request request, String comicType, String comicId) {
    final auth = requireAuth(request);
    ctx.statistics
        .deleteComic(auth.user.id, comicId, int.tryParse(comicType) ?? 0);
    return _json({'ok': true});
  });

  // ---- image favorites -------------------------------------------------
  router.get('/api/image-favorites', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.imageFavorites.list(
      auth.user.id,
      query: _q(request, 'q'),
      sort: _q(request, 'sort') ?? 'Title',
      timeFilter: _q(request, 'filter'),
      minCount: _qi(request, 'minCount', 0),
    ));
  });

  router.post('/api/image-favorites', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.imageFavorites.add(auth.user.id, body);
    return _json({'ok': true});
  });

  router.delete('/api/image-favorites/pages', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    ctx.imageFavorites.removePage(auth.user.id, body);
    return _json({'ok': true});
  });

  router.delete('/api/image-favorites/<comicId>/<sourceKey>',
      (Request request, String comicId, String sourceKey) {
    final auth = requireAuth(request);
    ctx.imageFavorites.removeComic(auth.user.id, comicId, sourceKey);
    return _json({'ok': true});
  });

  router.get('/api/image-favorites/stats', (Request request) {
    final auth = requireAuth(request);
    return _json(ctx.imageFavorites.stats(auth.user.id));
  });

  // ---- toolbox / debug -------------------------------------------------
  router.post('/api/toolbox/link', (Request request) async {
    final auth = requireAuth(request);
    final body = await readJsonBody(request);
    final result = await ctx.comics
        .resolveLink(auth.user.id, (body['url'] ?? '').toString());
    return _json({'result': result});
  });

  router.post('/api/debug/eval', (Request request) async {
    requireAdmin(request);
    final body = await readJsonBody(request);
    final code = (body['code'] ?? '').toString();
    final response = await ctx.js.run(code, {
      'sourceKey': '',
      'appVersion': '2.6.3',
      'locale': 'en_US',
      'platform': 'linux',
      'data': <String, Object?>{},
      'settings': <String, Object?>{},
      'cookies': <Object?>[],
    });
    if (response['ok'] != true) {
      final error = response['error'];
      throw ApiException.sourceError(
          error is Map ? (error['message'] ?? '').toString() : 'JS error');
    }
    return _json({'result': response['result']});
  });

  router.post('/api/debug/reload', (Request request) {
    requireAdmin(request);
    return _json({'ok': true});
  });

  return router.call;
}

List<Map<String, Object?>> _mapList(Object? value) {
  if (value is! List) return const [];
  return value
      .whereType<Map>()
      .map((m) => m.map((k, v) => MapEntry(k.toString(), v)))
      .toList();
}
