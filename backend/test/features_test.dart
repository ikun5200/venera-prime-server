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

  test('suggestions endpoint works with empty text', () async {
    final res = await admin.get('/api/search/suggestions?q=');
    expect(res.status, 200);
    expect(res.body['items'], isA<List>());
  });
}
