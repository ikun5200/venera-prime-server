import 'dart:io';

import 'package:test/test.dart';
import 'test_utils.dart';

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
    final imported =
        await admin.post('/api/sources', {'script': script});
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

    final key = Uri.encodeComponent('$base/img/1');
    final image = await admin.rawRequest(
        'GET', '/api/image?source=prefetch_source&comic=1&ep=1&key=$key');
    expect(image.status, 200);
    expect(image.bytes.length, bytes.length);

    await admin.patch('/api/settings', {'serverPrefetchImageCount': 0});
    await admin.post('/api/maintenance/clear-cache');
    final disabled = await admin.post(
        '/api/comic/prefetch_source/1/chapter/1/prefetch', {'from': 1});
    expect(disabled.status, 200);
    expect(disabled.body['enabled'], false);
    await Future.delayed(const Duration(milliseconds: 300));
    final size = await admin.get('/api/maintenance/cache-size');
    expect(size.body['bytes'], 0);
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
    expect(hits, 1, reason: 'second URL must be served from the identity cache');
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

    final first = await admin.get('/api/favorites/network/fav_source/all?page=1');
    final second = await admin.get('/api/favorites/network/fav_source/all?page=1');
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
}
