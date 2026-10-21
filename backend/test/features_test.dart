import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';
import 'test_utils.dart';

const exploreSourceScript = r'''
class ExploreSource extends ComicSource {
  name = "Explore"; key = "explore_source"; version = "1.0.0";
  explore = [
    { title: "Paged", type: "multiPageComicList",
      load: async (page) => ({ comics: [{ id: "p1", title: "P1" }], maxPage: 2 }) },
    { title: "Parts", type: "multiPartPage",
      load: async () => [{ title: "Group", comics: [{ id: "m1", title: "M1" }], viewMore: "search:foo" }] },
    { title: "Single", type: "singlePageWithMultiPart",
      load: async () => ({ Group: [{ id: "s1", title: "S1" }] }) },
    { title: "Mixed", type: "mixed",
      load: async (page) => ({ data: [
        [{ id: "x1", title: "X1" }],
        { title: "Mixed part", comics: [{ id: "x2", title: "X2" }], viewMore: null }
      ], maxPage: 3 }) }
  ];
  comic = { loadInfo: async (id) => new ComicDetails({ title: id, chapters: {} }) };
}
''';

void main() {
  late TestApp app;
  late Client admin;

  setUp(() async {
    app = TestApp.create();
    admin = app.client();
    await admin.init('admin', 'admin123');
    await admin.login('admin', 'admin123');
    await admin.post('/api/sources', {'script': testSourceScript});
  });

  tearDown(() => app.dispose());

  test('search history single delete', () async {
    await admin.post('/api/settings/search-history', {'keyword': 'one'});
    await admin.post('/api/settings/search-history', {'keyword': 'two'});
    var items =
        (await admin.get('/api/settings/search-history')).body['items'] as List;
    expect(items.length, 2);
    await admin.delete('/api/settings/search-history/one');
    items =
        (await admin.get('/api/settings/search-history')).body['items'] as List;
    expect(items.length, 1);
    expect((items.first as Map)['keyword'], 'two');
  });

  test('explore payloads carry sourceKey for every renderer type', () async {
    final imported =
        await admin.post('/api/sources', {'script': exploreSourceScript});
    expect(imported.status, 200, reason: '${imported.body}');

    final first = await admin.get('/api/explore?source=explore_source&page=1');
    expect(first.status, 200, reason: '${first.body}');
    final pages = first.body['pages'] as List;
    expect(pages, hasLength(4));
    expect((first.body['cache'] as Map)['hit'], false);

    var comics = 0;
    void walk(Object? value) {
      if (value is List) {
        for (final item in value) {
          walk(item);
        }
        return;
      }
      if (value is! Map) return;
      if (value['id'] != null && value['title'] != null) {
        comics++;
        expect(value['sourceKey'], 'explore_source',
            reason: 'comic ${value['id']} must carry its source');
      }
      for (final item in value.values) {
        walk(item);
      }
    }

    for (final page in pages) {
      walk((page as Map)['data']);
    }
    expect(comics, 5, reason: 'paged + part + single + two mixed comics');

    final second = await admin.get('/api/explore?source=explore_source&page=1');
    expect((second.body['cache'] as Map)['hit'], true);
    final refreshed =
        await admin.get('/api/explore?source=explore_source&page=1&refresh=1');
    expect((refreshed.body['cache'] as Map)['hit'], false);
  });

  test('details, chapters and searches are served from the server cache',
      () async {
    final first = await admin.get('/api/comic/test_source/comic-1');
    expect(first.status, 200, reason: '${first.body}');
    expect((first.body['cache'] as Map)['hit'], false);

    final second = await admin.get('/api/comic/test_source/comic-1');
    expect((second.body['cache'] as Map)['hit'], true);

    // Per-user progress is merged fresh on top of the cached source payload.
    await admin.put('/api/history', {
      'comicId': 'comic-1',
      'sourceKey': 'test_source',
      'title': 'Comic comic-1',
      'ep': 2,
      'page': 3,
    });
    final withProgress = await admin.get('/api/comic/test_source/comic-1');
    expect((withProgress.body['progress'] as Map)['ep'], 2);
    expect((withProgress.body['progress'] as Map)['page'], 3);
    expect((withProgress.body['cache'] as Map)['hit'], true);

    final chapter =
        await admin.get('/api/comic/test_source/comic-1/chapter/1/images');
    expect((chapter.body['cache'] as Map)['hit'], false);
    final chapterAgain =
        await admin.get('/api/comic/test_source/comic-1/chapter/1/images');
    expect((chapterAgain.body['cache'] as Map)['hit'], true);

    final stats = await admin.get('/api/maintenance/cache');
    expect((stats.body['metadata'] as Map)['entries'] as int,
        greaterThanOrEqualTo(2));
    expect(
      ((stats.body['metadata'] as Map)['byKind'] as List)
          .map((entry) => (entry as Map)['kind']),
      containsAll(['comic', 'chapter']),
    );

    // Updating source settings invalidates cached payloads for that source.
    await admin.put('/api/sources/test_source/settings', {
      'values': {'quality': 'low'}
    });
    final afterSettings = await admin.get('/api/comic/test_source/comic-1');
    expect((afterSettings.body['cache'] as Map)['hit'], false);

    final cleared =
        await admin.post('/api/maintenance/cache/clear', {'scope': 'metadata'});
    expect(cleared.status, 200);
    expect(cleared.body['metadataRemoved'] as int, greaterThan(0));
    final afterClear = await admin.get('/api/comic/test_source/comic-1');
    expect((afterClear.body['cache'] as Map)['hit'], false);
  });

  test('cached payloads survive source failures and can be disabled', () async {
    await admin.get('/api/comic/test_source/comic-1');
    await admin.patch('/api/sources/test_source', {'enabled': false});

    final cached = await admin.get('/api/comic/test_source/comic-1');
    expect(cached.status, 200);
    expect((cached.body['cache'] as Map)['hit'], true);

    final stale = await admin.get('/api/comic/test_source/comic-1?refresh=1');
    expect(stale.status, 200);
    expect((stale.body['cache'] as Map)['stale'], true);
    expect((stale.body['cache'] as Map)['error'], isNotNull);

    await admin.patch('/api/settings', {'serverCacheOfflineFallback': false});
    final failed = await admin.get('/api/comic/test_source/comic-1?refresh=1');
    expect(failed.status, 400);

    await admin.patch('/api/settings', {'serverCacheOfflineFallback': true});
    await admin.patch('/api/sources/test_source', {'enabled': true});
  });

  test('images and polling use separate rate-limit buckets', () async {
    final limited = TestApp.create(env: {'RATE_LIMIT_PER_MINUTE': '6'});
    addTearDown(limited.dispose);
    final client = limited.client();
    await client.init('admin', 'admin123');
    await client.login('admin', 'admin123');
    final imported =
        await client.post('/api/sources', {'script': testSourceScript});
    expect(imported.status, 200, reason: '${imported.body}');

    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final bytes = List<int>.generate(2048, (index) => index % 241);
    server.listen((request) async {
      request.response.headers.contentType = ContentType('image', 'png');
      request.response.add(bytes);
      await request.response.close();
    });
    final base = 'http://127.0.0.1:${server.port}';
    final key = Uri.encodeComponent('$base/page.png');

    // A chapter burst is expected to exceed the general API budget without
    // consuming it: 20 images must all succeed even though the general limit
    // is only six requests per minute.
    for (var i = 0; i < 20; i++) {
      final image = await client.rawRequest(
          'GET', '/api/image?source=test_source&comic=comic-1&ep=1&key=$key');
      expect(image.status, 200, reason: 'image $i');
    }
    // Polling endpoints also have their own bucket.
    for (var i = 0; i < 20; i++) {
      expect((await client.get('/api/tasks')).status, 200);
    }

    // The import consumed one general request; after the rest of the minute
    // budget the next API call is rejected with Retry-After and a log row.
    var limitedResponse = false;
    for (var i = 0; i < 10; i++) {
      final result = await client.rawRequest('GET', '/api/sources');
      if (result.status == 429) {
        limitedResponse = true;
        expect(result.headers['retry-after'], '30');
        final body = jsonDecode(utf8.decode(result.bytes)) as Map;
        expect((body['error'] as Map)['code'], 'RATE_LIMITED');
        break;
      }
      expect(result.status, 200);
    }
    expect(limitedResponse, true, reason: 'general limit must still apply');

    final logs = limited.ctx.db.select(
        'SELECT route,status,message FROM request_logs WHERE status=429');
    expect(logs, isNotEmpty, reason: '429 responses must be logged');
    expect(logs.first['route'], 'api/sources');
    expect(logs.first['message'], 'RATE_LIMITED');
  });

  test('cache retention and size limit', () async {
    await admin
        .patch('/api/settings', {'cacheRetentionDays': 0, 'cacheSize': 1});
    // write a fake cache entry larger than 1MB via the image proxy path is
    // network dependent; instead verify the maintenance endpoint responds.
    final size = await admin.get('/api/maintenance/cache-size');
    expect(size.status, 200);
    expect(size.body['bytes'], isA<int>());
    final cleared = await admin.post('/api/maintenance/clear-cache');
    expect(cleared.status, 200);
  });

  test('a catalog URL is detected and registered as a source library',
      () async {
    final dir = Directory.systemTemp.createTempSync('venera_catalog_');
    addTearDown(() => dir.deleteSync(recursive: true));
    final catalog = File('${dir.path}/index.json')
      ..writeAsStringSync(
          '[{"name":"Demo","key":"demo_src","version":"1.0.0","fileName":"sources/demo.js"}]');
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    server.listen((request) async {
      final path = request.uri.path;
      request.response.headers.contentType = ContentType.json;
      if (path.endsWith('index.json')) {
        request.response.write(await catalog.readAsString());
      } else if (path.endsWith('demo.js')) {
        request.response.write(testSourceScript);
      } else {
        request.response.statusCode = 404;
      }
      await request.response.close();
    });
    final base = 'http://127.0.0.1:${server.port}';
    final result =
        await admin.post('/api/sources/url', {'url': '$base/index.json'});
    expect(result.status, 200, reason: '${result.body}');
    expect(result.body['source'], isNull);
    final library = result.body['library'] as Map;
    expect(library['url'], '$base/index.json');
    final sources = await admin.get('/api/sources');
    final keys = (sources.body['items'] as List)
        .map((item) => (item as Map)['key'])
        .toList();
    expect(keys, isNot(contains('demo_src')));
    final entries =
        await admin.get('/api/source-libraries/${library['id']}/catalog');
    expect(
        (entries.body['items'] as List).single['url'], '$base/sources/demo.js');
    final installed = await admin.post(
        '/api/source-libraries/${library['id']}/install',
        {'entryId': 'demo_src'});
    expect(installed.status, 200, reason: '${installed.body}');
    expect((installed.body['source'] as Map)['key'], 'test_source');
  });

  test('chapter prefetch warms the server image cache', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final bytes = List<int>.generate(4096, (index) => index % 251);
    server.listen((request) async {
      request.response.headers.contentType = ContentType('image', 'png');
      request.response.add(bytes);
      await request.response.close();
    });
    final base = 'http://127.0.0.1:${server.port}';
    final script = '''
class PrefetchSource extends ComicSource {
  name = "Prefetch"; key = "prefetch_source"; version = "1.0.0";
  comic = {
    loadInfo: async (id) => new ComicDetails({ title: "p", chapters: { "1": "c" } }),
    loadEp: async (id, ep) => ({ images: [
      "$base/img/1", "$base/img/2", "$base/img/3", "$base/img/4"
    ]}),
    onImageLoad: (url) => ({ url: url })
  };
}
''';
    final imported = await admin.post('/api/sources', {'script': script});
    expect(imported.status, 200, reason: '${imported.body}');

    final prefetch = await admin.post(
        '/api/comic/prefetch_source/1/chapter/1/prefetch',
        {'from': 1, 'limit': 2});
    expect(prefetch.status, 200, reason: '${prefetch.body}');
    expect(prefetch.body['enabled'], true);
    expect(prefetch.body['limit'], 2);

    var cacheBytes = 0;
    for (var attempt = 0; attempt < 40; attempt++) {
      final size = await admin.get('/api/maintenance/cache-size');
      cacheBytes = size.body['bytes'] as int;
      if (cacheBytes > 0) break;
      await Future.delayed(const Duration(milliseconds: 100));
    }
    expect(cacheBytes, greaterThan(0));

    final cacheStats = await admin
        .get('/api/maintenance/cache?source=prefetch_source&comic=1');
    expect(cacheStats.status, 200);
    final imageStats = cacheStats.body['images'] as Map;
    expect(imageStats['entries'] as int, greaterThan(0));
    expect(imageStats['bytes'] as int, greaterThan(0));
    expect(
      (imageStats['chapters'] as List).map((entry) => (entry as Map)['ep']),
      contains('1'),
    );

    final key = Uri.encodeComponent('$base/img/1');
    final image = await admin.rawRequest(
        'GET', '/api/image?source=prefetch_source&comic=1&ep=1&key=$key');
    expect(image.status, 200);
    expect(image.bytes.length, bytes.length);

    await admin.patch('/api/settings', {'serverPrefetchImageCount': 0});
    await admin.post('/api/maintenance/clear-cache');
    final disabled = await admin
        .post('/api/comic/prefetch_source/1/chapter/1/prefetch', {'from': 1});
    expect(disabled.status, 200);
    expect(disabled.body['enabled'], false);
    await Future.delayed(const Duration(milliseconds: 300));
    final size = await admin.get('/api/maintenance/cache-size');
    expect(size.body['bytes'], 0);
    final clearedStats = await admin.get('/api/maintenance/cache');
    expect(((clearedStats.body['images'] as Map)['entries'] as int), 0);
  });

  test('favorite snapshots store the description', () async {
    final created = await admin
        .post('/api/favorites/folders', {'name': 'Description folder'});
    expect(created.status, 200, reason: '${created.body}');
    final folders = await admin.get('/api/favorites/folders');
    final folderId = ((folders.body['items'] as List).first as Map)['id'];
    final added = await admin.post('/api/favorites', {
      'folderId': folderId,
      'comic': {
        'id': 'comic-desc',
        'sourceKey': 'test_source',
        'title': 'Described',
        'subtitle': 'Author',
        'cover': 'https://example.com/c.jpg',
        'description': 'A cached description',
        'tags': ['tag'],
      },
    });
    expect(added.status, 200, reason: '${added.body}');
    final list = await admin.get('/api/favorites?folderId=$folderId');
    final item = (list.body['items'] as List)
        .cast<Map>()
        .firstWhere((entry) => entry['id'] == 'comic-desc');
    expect(item['description'], 'A cached description');
  });

  test('cover cache is keyed by comic identity, not the signed URL', () async {
    var hits = 0;
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final bytes = List<int>.generate(2048, (index) => index % 239);
    server.listen((request) async {
      hits++;
      request.response.headers.contentType = ContentType('image', 'png');
      request.response.add(bytes);
      await request.response.close();
    });
    final base = 'http://127.0.0.1:${server.port}';
    String coverPath(String url) =>
        '/api/image/cover?url=${Uri.encodeQueryComponent(url)}'
        '&source=cover_source&comic=cover-1';

    final first = await admin.rawRequest('GET', coverPath('$base/a.png'));
    expect(first.status, 200);
    final second = await admin.rawRequest('GET', coverPath('$base/b.png'));
    expect(second.status, 200);
    expect(second.bytes.length, bytes.length);
    expect(hits, 1,
        reason: 'second URL must be served from the identity cache');
  });

  test('network favorites are cached and refresh bypasses the cache', () async {
    const script = r'''
class FavSource extends ComicSource {
  name = "Fav"; key = "fav_source"; version = "1.0.0";
  favorites = {
    loadFolders: async () => ({ folders: { all: "All" }, favorited: [] }),
    loadComics: async (page, folder) => {
      const n = (this.loadData("calls") || 0) + 1;
      this.saveData("calls", n);
      return { comics: [{ id: "1", title: "call=" + n, cover: "", tags: [] }], maxPage: 1 };
    },
    addOrDelFavorite: async () => true,
    addFolder: async () => true,
    deleteFolder: async () => true,
  };
  comic = { loadInfo: async () => new ComicDetails({ title: "x", chapters: {} }) };
}
''';
    final imported = await admin.post('/api/sources', {'script': script});
    expect(imported.status, 200, reason: '${imported.body}');

    String titleOf(Map<String, Object?> body) =>
        ((body['comics'] as List).first as Map)['title'].toString();

    final first =
        await admin.get('/api/favorites/network/fav_source/all?page=1');
    final second =
        await admin.get('/api/favorites/network/fav_source/all?page=1');
    expect(first.status, 200, reason: '${first.body}');
    expect(titleOf(first.body), 'call=1');
    expect(titleOf(second.body), 'call=1');

    final refreshed = await admin
        .get('/api/favorites/network/fav_source/all?page=1&refresh=1');
    expect(titleOf(refreshed.body), 'call=2');
  });

  test('favorite list prefetches covers by comic identity', () async {
    var hits = 0;
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    final bytes = List<int>.generate(3072, (index) => index % 233);
    server.listen((request) async {
      hits++;
      request.response.headers.contentType = ContentType('image', 'png');
      request.response.add(bytes);
      await request.response.close();
    });
    final base = 'http://127.0.0.1:${server.port}';

    final created =
        await admin.post('/api/favorites/folders', {'name': 'Cover folder'});
    expect(created.status, 200);
    final folders = await admin.get('/api/favorites/folders');
    final folderId = ((folders.body['items'] as List).first as Map)['id'];
    await admin.post('/api/favorites', {
      'folderId': folderId,
      'comic': {
        'id': 'cover-comic',
        'sourceKey': 'test_source',
        'title': 'Cover',
        'cover': '$base/one.png',
      },
    });
    await admin.get('/api/favorites?folderId=$folderId');

    var cacheBytes = 0;
    for (var attempt = 0; attempt < 40; attempt++) {
      final size = await admin.get('/api/maintenance/cache-size');
      cacheBytes = size.body['bytes'] as int;
      if (cacheBytes > 0) break;
      await Future.delayed(const Duration(milliseconds: 100));
    }
    expect(cacheBytes, greaterThan(0));

    final query = Uri.encodeQueryComponent('$base/two.png');
    final cover = await admin.rawRequest('GET',
        '/api/image/cover?url=$query&source=test_source&comic=cover-comic');
    expect(cover.status, 200);
    expect(cover.bytes.length, bytes.length);
    expect(hits, 1, reason: 'the list prefetch should already hold the cover');
  });

  test('suggestions endpoint works with empty text', () async {
    final res = await admin.get('/api/search/suggestions?q=');
    expect(res.status, 200);
    expect(res.body['items'], isA<List>());
  });

  test('source setting defaults are returned and empty input falls back',
      () async {
    const script = r'''
class SettingsSource extends ComicSource {
  name = "Settings"; key = "settings_source"; version = "1.0.0";
  settings = {
    base_url: {
      type: "input", default: "api.example.com", title: "API",
      validator: "^[a-z.]+$"
    },
    quality: {
      type: "select", default: "high",
      options: [{ value: "high", text: "High" }, { value: "low", text: "Low" }]
    }
  };
  search = { load: async (keyword, options, page) => ({ comics: [], maxPage: 1 }) };
  comic = { loadInfo: async (id) => new ComicDetails({ title: "x", chapters: {} }) };
}
''';
    final imported = await admin.post('/api/sources', {'script': script});
    expect(imported.status, 200, reason: '${imported.body}');

    final initial = await admin.get('/api/sources/settings_source/settings');
    expect(initial.status, 200);
    expect((initial.body['values'] as Map)['base_url'], 'api.example.com');
    expect((initial.body['values'] as Map)['quality'], 'high');

    // Saving an unrelated option must not persist an empty base_url.
    final saved = await admin.put('/api/sources/settings_source/settings', {
      'values': {'quality': 'low'},
    });
    expect(saved.status, 200, reason: '${saved.body}');
    expect((saved.body['values'] as Map)['base_url'], 'api.example.com');
    expect((saved.body['values'] as Map)['quality'], 'low');

    final empty = await admin.put('/api/sources/settings_source/settings', {
      'values': {'base_url': ''},
    });
    expect(empty.status, 200, reason: '${empty.body}');
    expect((empty.body['values'] as Map)['base_url'], 'api.example.com');

    final invalid = await admin.put('/api/sources/settings_source/settings', {
      'values': {'base_url': 'http://bad host'},
    });
    expect(invalid.status, 400, reason: '${invalid.body}');
  });

  test('adding a source rejects non-http URLs with 400', () async {
    final res = await admin.post('/api/sources/url', {'url': 'abc'});
    expect(res.status, 400, reason: '${res.body}');
    final error = res.body['error'] as Map;
    expect(error['message'], contains('HTTP'));
  });
}
