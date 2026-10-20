import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../config.dart';
import '../db/database.dart';
import '../repositories/source_repository.dart';
import '../repositories/user_repository.dart';
import '../util/crypto.dart';
import '../util/errors.dart';
import '../util/log.dart';
import 'js_host_client.dart';

class _KeyedLock {
  final Map<String, Future<void>> _tails = {};

  Future<T> run<T>(String key, Future<T> Function() action) async {
    final previous = _tails[key] ?? Future.value();
    final completer = Completer<void>();
    _tails[key] = completer.future;
    await previous;
    try {
      return await action();
    } finally {
      completer.complete();
      if (identical(_tails[key], completer.future)) {
        _tails.remove(key);
      }
    }
  }
}

class SourceService {
  final Config config;
  final Db db;
  final SourceRepository repository;
  final SettingsRepository settingsRepository;
  final AuditRepository audit;
  final JsHostClient js;
  final _lock = _KeyedLock();

  SourceService({
    required this.config,
    required this.db,
    required this.repository,
    required this.settingsRepository,
    required this.audit,
    required this.js,
  });

  List<SourceRecord> list(int userId) => repository.list(userId);

  SourceRecord? get(int userId, String key) => repository.get(userId, key);

  SourceRecord require(int userId, String key) {
    final source = repository.get(userId, key);
    if (source == null) throw ApiException.notFound('未找到漫画源');
    return source;
  }

  String localeFor(int userId) {
    final language = settingsRepository.get(userId, 'language')?.toString();
    return switch (language) {
      'zh-CN' => 'zh_CN',
      'zh-TW' => 'zh_TW',
      _ => 'en_US',
    };
  }

  Future<Map<String, Object?>> _context(int userId, SourceRecord source) async {
    final data = await _decryptAccount(source.data);
    return {
      'sourceKey': source.key,
      'appVersion': '2.6.3',
      'locale': localeFor(userId),
      'platform': 'linux',
      'data': data,
      'settings': source.settings,
      'cookies': repository.cookies(userId),
    };
  }

  Future<Map<String, Object?>> _decryptAccount(
      Map<String, Object?> data) async {
    final copy = jsonDecode(jsonEncode(data)) as Map<String, Object?>;
    final account = copy['account'];
    if (account is List &&
        account.length == 2 &&
        account[1] is String &&
        (account[1] as String).startsWith('enc:')) {
      final plain = await CryptoUtil.decryptSecret(
          (account[1] as String).substring(4), config.sessionSecret);
      if (plain != null) copy['account'] = [account[0], plain];
    }
    return copy;
  }

  Future<Map<String, Object?>> _encryptAccount(
      Map<String, Object?> data) async {
    final copy = jsonDecode(jsonEncode(data)) as Map<String, Object?>;
    final account = copy['account'];
    if (account is List &&
        account.length == 2 &&
        account[1] is String &&
        (account[1] as String).isNotEmpty &&
        !(account[1] as String).startsWith('enc:')) {
      final encrypted = await CryptoUtil.encryptSecret(
          account[1] as String, config.sessionSecret);
      copy['account'] = [account[0], 'enc:$encrypted'];
    }
    return copy;
  }

  Future<void> _applyResponse(
      int userId, SourceRecord source, Map<String, Object?> response) async {
    final data = response['data'];
    if (data is Map) {
      final map = data.map((k, v) => MapEntry(k.toString(), v));
      final encrypted = await _encryptAccount(map);
      repository.saveData(userId, source.key, encrypted);
    }
    final cookies = response['cookies'];
    if (cookies is List) {
      repository.replaceCookies(
        userId,
        cookies
            .whereType<Map>()
            .map((c) => c.map((k, v) => MapEntry(k.toString(), v)))
            .toList(),
      );
    }
    final logs = response['logs'];
    if (logs is List) {
      for (final log in logs.whereType<Map>()) {
        final level = (log['level'] ?? 'info').toString();
        final title = (log['title'] ?? '').toString();
        final content = (log['content'] ?? '').toString();
        if (level == 'error') {
          Log.error('JS $title: $content', userId: userId);
        } else if (level == 'warning') {
          Log.warning('JS $title: $content', userId: userId);
        } else {
          Log.info('JS $title: $content', userId: userId);
        }
      }
    }
  }

  Never _throwResponse(Map<String, Object?> response) {
    final error = response['error'];
    final code =
        error is Map ? (error['code'] ?? 'JS_ERROR').toString() : 'JS_ERROR';
    final message = error is Map
        ? (error['message'] ?? 'Source error').toString()
        : 'Source error';
    if (code == 'TIMEOUT') throw ApiException.timeout(message);
    if (code == 'PARSE_ERROR') throw ApiException.sourceError(message);
    throw ApiException.sourceError(message);
  }

  Future<Map<String, Object?>> parseScript(String script,
      {String expectedKey = ''}) async {
    final response = await js.parse(script, {
      'sourceKey': expectedKey,
      'appVersion': '2.6.3',
      'locale': 'en_US',
      'platform': 'linux',
      'data': <String, Object?>{},
      'settings': <String, Object?>{},
      'cookies': <Object?>[],
    });
    if (response['ok'] != true) _throwResponse(response);
    final meta = response['result'];
    if (meta is! Map) {
      throw ApiException.sourceError('源未返回元数据');
    }
    final map = meta.map((k, v) => MapEntry(k.toString(), v));
    final minVersion = (map['minAppVersion'] ?? '').toString();
    if (minVersion.isNotEmpty && _versionGreater(minVersion, '2.6.3')) {
      throw ApiException.sourceError(
          'This source requires app version $minVersion or newer');
    }
    return map;
  }

  bool _versionGreater(String a, String b) {
    List<int> parse(String v) =>
        v.split('-').first.split('.').map((p) => int.tryParse(p) ?? 0).toList();
    final left = parse(a);
    final right = parse(b);
    for (var i = 0; i < 3; i++) {
      final l = i < left.length ? left[i] : 0;
      final r = i < right.length ? right[i] : 0;
      if (l != r) return l > r;
    }
    return false;
  }

  Future<SourceRecord> importScript(
    int userId,
    String script, {
    bool replace = false,
    String? url,
    String? fileName,
    String? libraryId,
    String? originId,
    String? ip,
  }) async {
    final meta = await parseScript(script);
    final key = (meta['key'] ?? '').toString();
    if (key.isEmpty) throw ApiException.sourceError('缺少源 key');
    final existing = repository.get(userId, key);
    if (existing != null && !replace) {
      throw ApiException.conflict('已存在相同 key 的源');
    }
    repository.upsert(
      userId: userId,
      key: key,
      name: (meta['name'] ?? key).toString(),
      version: (meta['version'] ?? '').toString(),
      url: url ?? (meta['url'] ?? '').toString(),
      minAppVersion: (meta['minAppVersion'] ?? '').toString(),
      script: script,
      settings: (meta['settings'] is Map)
          ? (meta['settings'] as Map).map((k, v) => MapEntry(k.toString(), v))
          : {},
      translation: (meta['translation'] is Map)
          ? (meta['translation'] as Map)
              .map((k, v) => MapEntry(k.toString(), v))
          : {},
      capabilities: _capabilities(meta),
      preserveData: true,
    );
    if (libraryId != null) {
      repository.setProvenance(
        userId,
        key,
        libraryIds: [libraryId],
        originId: originId,
        updateLibraryId: libraryId,
        sourceFileName: fileName,
      );
    }
    audit.log('source_import',
        userId: userId,
        ip: ip,
        detail: {'key': key, 'version': meta['version'], 'replace': replace});
    return repository.get(userId, key)!;
  }

  Map<String, Object?> _capabilities(Map<String, Object?> meta) {
    final capabilities = meta['capabilities'];
    final result = capabilities is Map
        ? capabilities.map((k, v) => MapEntry(k.toString(), v))
        : <String, Object?>{};
    result['explore'] = (meta['explore'] as List?)?.isNotEmpty ?? false;
    result['category'] = meta['category'] != null;
    result['categoryComics'] = meta['categoryComics'] != null;
    result['favorites'] = meta['favorites'] != null;
    result['searchOptions'] = meta['searchOptions'];
    result['categoryData'] = meta['category'];
    result['categoryComicsData'] = meta['categoryComics'];
    result['favoritesData'] = meta['favorites'];
    result['exploreData'] = meta['explore'];
    result['linkDomains'] = meta['linkDomains'];
    result['idMatch'] = meta['idMatch'];
    result['cookieFields'] = meta['cookieFields'];
    result['webviewLoginUrl'] = meta['webviewLoginUrl'];
    result['registerWebsite'] = meta['registerWebsite'];
    return result;
  }

  Future<SourceRecord> updateScript(
    int userId,
    String key,
    String script, {
    String? ip,
  }) async {
    final existing = require(userId, key);
    final meta = await parseScript(script, expectedKey: key);
    repository.upsert(
      userId: userId,
      key: key,
      name: (meta['name'] ?? existing.name).toString(),
      version: (meta['version'] ?? existing.version).toString(),
      url: (meta['url'] ?? existing.url).toString(),
      minAppVersion: (meta['minAppVersion'] ?? '').toString(),
      script: script,
      settings: (meta['settings'] is Map)
          ? (meta['settings'] as Map).map((k, v) => MapEntry(k.toString(), v))
          : {},
      translation: (meta['translation'] is Map)
          ? (meta['translation'] as Map)
              .map((k, v) => MapEntry(k.toString(), v))
          : {},
      capabilities: _capabilities(meta),
      preserveData: true,
    );
    audit.log('source_update', userId: userId, ip: ip, detail: {'key': key});
    return repository.get(userId, key)!;
  }

  Future<Map<String, Object?>> callRaw(
    int userId,
    String key,
    String method,
    List<Object?> args,
  ) async {
    final source = require(userId, key);
    if (!source.enabled) {
      throw ApiException.badRequest('漫画源已被禁用');
    }
    return _lock.run('$userId:${source.key}', () async {
      final current = repository.get(userId, source.key)!;
      final context = await _context(userId, current);
      final response = await js.request({
        'op': 'call',
        'script': current.script,
        'method': method,
        'args': args,
        'context': context,
      });
      await _applyResponse(userId, current, response);
      if (response['ok'] != true) _throwResponse(response);
      final result = response['result'];
      if (result is Map) {
        return result.map((k, v) => MapEntry(k.toString(), v));
      }
      return {'value': result};
    });
  }

  Future<Object?> call(
    int userId,
    String key,
    String method, [
    List<Object?> args = const [],
  ]) =>
      callValue(userId, key, method, args);

  /// Calls a method and returns the raw result (arrays included).
  Future<Object?> callValue(
    int userId,
    String key,
    String method,
    List<Object?> args,
  ) async {
    final source = require(userId, key);
    if (!source.enabled) {
      throw ApiException.badRequest('漫画源已被禁用');
    }
    return _lock.run('$userId:${source.key}', () async {
      final current = repository.get(userId, source.key)!;
      final context = await _context(userId, current);
      final response = await js.request({
        'op': 'call',
        'script': current.script,
        'method': method,
        'args': args,
        'context': context,
      });
      await _applyResponse(userId, current, response);
      if (response['ok'] != true) _throwResponse(response);
      return response['result'];
    });
  }

  Future<List<Map<String, Object?>>> imageConfigs(
    int userId,
    String key,
    List<Object?> args,
  ) async {
    final source = require(userId, key);
    return _lock.run('$userId:${source.key}', () async {
      final current = repository.get(userId, source.key)!;
      final context = await _context(userId, current);
      final response = await js.request({
        'op': 'image_config',
        'script': current.script,
        'method': 'comic.onImageLoad',
        'args': args,
        'context': context,
      });
      await _applyResponse(userId, current, response);
      if (response['ok'] != true) _throwResponse(response);
      final result = response['result'];
      if (result is List) {
        return result
            .whereType<Map>()
            .map((m) => m.map((k, v) => MapEntry(k.toString(), v)))
            .toList();
      }
      return const [];
    });
  }

  Future<void> updateSettings(
      int userId, String key, Map<String, Object?> values) async {
    final source = require(userId, key);
    final allowed = source.settings.keys.toSet();
    for (final entry in values.entries) {
      if (allowed.isNotEmpty && !allowed.contains(entry.key)) {
        throw ApiException.badRequest('未知源设置: ${entry.key}');
      }
    }
    final data = jsonDecode(jsonEncode(source.data)) as Map<String, Object?>;
    final current = data['settings'];
    final settings = current is Map
        ? current.map((k, v) => MapEntry(k.toString(), v))
        : <String, Object?>{};
    settings.addAll(values);
    data['settings'] = settings;
    repository.saveData(userId, key, data);
  }

  Map<String, Object?> settingsFor(int userId, String key) {
    final source = require(userId, key);
    final values = source.data['settings'];
    return {
      'definitions': source.settings,
      'values': values is Map
          ? values.map((k, v) => MapEntry(k.toString(), v))
          : <String, Object?>{},
    };
  }

  Future<void> loginPassword(
      int userId, String key, String username, String password) async {
    final source = require(userId, key);
    final capabilities = source.capabilities;
    if (capabilities['passwordLogin'] != true) {
      throw ApiException.badRequest(
          'This source does not support password login');
    }
    await callValue(userId, key, 'account.login', [username, password]);
    final data = jsonDecode(jsonEncode(source.data)) as Map<String, Object?>;
    data['account'] = [username, password];
    final encrypted = await _encryptAccount(data);
    repository.saveData(userId, key, encrypted);
    audit.log('source_login',
        userId: userId, detail: {'key': key, 'kind': 'password'});
  }

  Future<void> loginCookies(
      int userId, String key, Map<String, Object?> values) async {
    final source = require(userId, key);
    if (source.capabilities['cookieLogin'] != true) {
      throw ApiException.badRequest(
          'This source does not support cookie login');
    }
    final result = await callValue(
        userId, key, 'account.loginWithCookies.validate', [values]);
    if (result != true) {
      throw ApiException.badRequest('Cookie 无效');
    }
    final data = jsonDecode(jsonEncode(source.data)) as Map<String, Object?>;
    data['account'] = 'ok';
    repository.saveData(userId, key, data);
    audit.log('source_login',
        userId: userId, detail: {'key': key, 'kind': 'cookies'});
  }

  Future<void> importCookies(
      int userId, String key, List<Map<String, Object?>> cookies) async {
    final source = require(userId, key);
    final existing = repository.cookies(userId);
    final map = <String, Map<String, Object?>>{
      for (final cookie in existing)
        '${cookie['name']}|${cookie['domain']}|${cookie['path']}': cookie,
    };
    for (final cookie in cookies) {
      final name = (cookie['name'] ?? '').toString().trim();
      final domain = (cookie['domain'] ?? '').toString().trim();
      if (name.isEmpty || domain.isEmpty) continue;
      map['$name|$domain|${cookie['path'] ?? '/'}'] = {
        'name': name,
        'value': (cookie['value'] ?? '').toString(),
        'domain': domain,
        'path': (cookie['path'] ?? '/').toString(),
        'expires': cookie['expires'],
        'secure': cookie['secure'] == true,
        'httpOnly': cookie['httpOnly'] == true,
        'hostOnly': cookie['hostOnly'] != false,
      };
    }
    repository.replaceCookies(userId, map.values.toList());
    final data = jsonDecode(jsonEncode(source.data)) as Map<String, Object?>;
    data['account'] = 'ok';
    repository.saveData(userId, key, data);
    audit.log('source_login',
        userId: userId, detail: {'key': key, 'kind': 'cookies'});
  }

  Future<void> logout(int userId, String key) async {
    final source = require(userId, key);
    if (source.capabilities['logout'] == true) {
      try {
        await callValue(userId, key, 'account.logout', const []);
      } catch (_) {
        // Logging out locally must succeed even if the source call fails.
      }
    }
    final data = jsonDecode(jsonEncode(source.data)) as Map<String, Object?>;
    data['account'] = null;
    repository.saveData(userId, key, data);
    audit.log('source_logout', userId: userId, detail: {'key': key});
  }

  Future<Map<String, Object?>> checkReadability(
    int userId,
    String key, {
    String? comicId,
  }) async {
    final source = require(userId, key);
    final stages = <String, Object?>{};
    String? id = comicId;
    try {
      if (id == null) {
        stages['catalog'] = 'running';
        final explore = source.capabilities['exploreData'];
        if (explore is List && explore.isNotEmpty) {
          final page = await callValue(userId, key, 'explore.0.load', [1])
              .timeout(const Duration(seconds: 15));
          id = _firstComicId(page);
        }
        stages['catalog'] = id == null ? 'skipped' : 'ok';
      }
      if (id == null) {
        return {'status': 'failed', 'stage': 'catalog', 'stages': stages};
      }
      stages['details'] = 'running';
      final info = await callValue(userId, key, 'comic.loadInfo', [id])
          .timeout(const Duration(seconds: 15));
      stages['details'] = 'ok';
      final chapters = info is Map ? info['chapters'] : null;
      String? epId;
      if (chapters is Map && chapters.isNotEmpty) {
        final first = chapters.values.first;
        if (first is Map && first.isNotEmpty) {
          epId = first.keys.first.toString();
        } else {
          epId = chapters.keys.first.toString();
        }
      }
      if (epId == null) {
        return {'status': 'failed', 'stage': 'chapters', 'stages': stages};
      }
      stages['pages'] = 'running';
      final pages = await callValue(userId, key, 'comic.loadEp', [id, epId])
          .timeout(const Duration(seconds: 15));
      stages['pages'] = 'ok';
      final images = pages is Map ? pages['images'] : null;
      final image = images is List && images.isNotEmpty ? images.first : null;
      if (image != null) {
        stages['image'] = 'running';
        final configs =
            await imageConfigs(userId, key, [image.toString(), id, epId])
                .timeout(const Duration(seconds: 15));
        stages['image'] = configs.isEmpty ? 'skipped' : 'ok';
      }
      return {'status': 'readable', 'comicId': id, 'stages': stages};
    } catch (error) {
      final failed = stages.entries
          .firstWhere((e) => e.value == 'running',
              orElse: () => const MapEntry('catalog', ''))
          .key;
      stages[failed] = 'failed';
      return {
        'status': 'failed',
        'stage': failed,
        'message': error.toString(),
        'stages': stages,
      };
    }
  }

  String? _firstComicId(Object? page) {
    if (page is List) {
      for (final item in page) {
        final found = _firstComicId(item);
        if (found != null) return found;
      }
      return null;
    }
    if (page is Map) {
      if (page['comics'] is List) {
        final comics = page['comics'] as List;
        if (comics.isNotEmpty && comics.first is Map) {
          final id = (comics.first as Map)['id'];
          if (id != null) return id.toString();
        }
      }
      for (final value in page.values) {
        if (value is Map || value is List) {
          final found = _firstComicId(value);
          if (found != null) return found;
        }
      }
    }
    return null;
  }

  // ---- source libraries -------------------------------------------------

  Future<List<Map<String, Object?>>> fetchCatalog(String url) async {
    final response = await http.get(Uri.parse(url)).timeout(
          const Duration(seconds: 20),
        );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.sourceError('目录请求返回 ${response.statusCode}');
    }
    Object? decoded;
    try {
      decoded = jsonDecode(utf8.decode(response.bodyBytes));
    } catch (_) {
      throw ApiException.sourceError('目录不是有效的 JSON');
    }
    List<Object?> entries;
    if (decoded is List) {
      entries = decoded;
    } else if (decoded is Map) {
      final list = decoded['sources'] ?? decoded['data'] ?? decoded['items'];
      entries = list is List ? list : const [];
    } else {
      entries = const [];
    }
    final base = Uri.parse(url);
    return entries.whereType<Map>().map((entry) {
      final map = entry.map((k, v) => MapEntry(k.toString(), v));
      final rawUrl = map['url'] ?? map['fileName'] ?? map['filename'];
      String? resolved;
      if (rawUrl != null) {
        resolved = base.resolve(rawUrl.toString()).toString();
      }
      return {
        'id': (map['id'] ?? map['key'] ?? map['name'] ?? resolved ?? '')
            .toString(),
        'name': (map['name'] ?? '').toString(),
        'version': (map['version'] ?? '').toString(),
        'description': (map['description'] ?? '').toString(),
        'url': resolved,
      };
    }).toList();
  }

  /// Downloads and validates a script URL. The original client treats a
  /// catalog (`index.json` with a JSON array of sources) as a source library
  /// rather than a script; detect that here so pasting a catalog URL into
  /// "Add comic source" behaves like the original app.
  Future<({SourceRecord? source, Map<String, Object?>? library})>
      installFromUrlOrCatalog(int userId, String url,
          {String? libraryId, String? originId, String? ip}) async {
    final response =
        await http.get(Uri.parse(url)).timeout(const Duration(seconds: 30));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.sourceError('下载失败: ${response.statusCode}');
    }
    final body = utf8.decode(response.bodyBytes);
    final trimmed = body.trimLeft();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      final parsed = _tryParseCatalog(trimmed);
      if (parsed != null) {
        final id = CryptoUtil.md5Hex(_canonicalUrl(url)).substring(0, 12);
        final existing = repository
            .libraries(userId)
            .where((item) => item['url'] == url)
            .firstOrNull;
        final name = (existing?['name'] ?? _defaultLibraryName(url)).toString();
        repository.upsertLibrary(
          userId,
          id: (existing?['id'] ?? id).toString(),
          name: name,
          url: url,
          enabled: existing?['enabled'] as bool? ?? true,
          priority: existing?['priority'] as int? ?? 0,
          lastChecked: DateTime.now().millisecondsSinceEpoch,
        );
        audit.log('source_library_add',
            userId: userId, ip: ip, detail: {'url': url, 'entries': parsed});
        return (
          source: null,
          library: repository
              .libraries(userId)
              .where((item) => item['url'] == url)
              .firstOrNull,
        );
      }
    }
    final source = await importScript(userId, body,
        replace: true,
        url: url,
        fileName: url.split('/').last,
        libraryId: libraryId,
        originId: originId,
        ip: ip);
    return (source: source, library: null);
  }

  int? _tryParseCatalog(String text) {
    try {
      final decoded = jsonDecode(text);
      final list = decoded is List
          ? decoded
          : decoded is Map
              ? decoded['sources'] ?? decoded['data'] ?? decoded['items']
              : null;
      if (list is! List || list.isEmpty) return null;
      final viable = list.whereType<Map>().where((entry) {
        return (entry['key'] ?? entry['id']) != null &&
            (entry['fileName'] != null ||
                entry['filename'] != null ||
                entry['url'] != null);
      });
      return viable.isEmpty ? null : viable.length;
    } catch (_) {
      return null;
    }
  }

  String _canonicalUrl(String url) {
    final uri = Uri.tryParse(url.trim());
    if (uri == null || uri.host.isEmpty) {
      return url.trim().replaceFirst(RegExp(r'/+$'), '');
    }
    final segments =
        uri.pathSegments.where((segment) => segment.isNotEmpty).toList();
    return uri
        .replace(
          scheme: uri.scheme.toLowerCase(),
          host: uri.host.toLowerCase(),
          pathSegments: segments,
        )
        .toString();
  }

  String _defaultLibraryName(String url) {
    final uri = Uri.tryParse(url.trim());
    if (uri == null || uri.host.isEmpty) return url.trim();
    final segments = uri.pathSegments
        .where((s) => s.isNotEmpty && !s.toLowerCase().endsWith('.json'))
        .toList();
    return segments.isEmpty ? uri.host : '${uri.host}/${segments.last}';
  }

  Future<SourceRecord> installFromUrl(int userId, String url,
      {String? libraryId, String? originId, String? ip}) async {
    final result = await installFromUrlOrCatalog(userId, url,
        libraryId: libraryId, originId: originId, ip: ip);
    final source = result.source;
    if (source == null) {
      throw ApiException.badRequest('该地址是漫画源目录，请到“源仓库”中安装');
    }
    return source;
  }

  void bindSource(int userId, String key, String libraryId, String? fileName) {
    final source = require(userId, key);
    repository.setProvenance(userId, key,
        libraryIds: [libraryId],
        updateLibraryId: libraryId,
        sourceFileName: fileName ?? '${source.key}.js');
  }
}
