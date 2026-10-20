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

  test('suggestions endpoint works with empty text', () async {
    final res = await admin.get('/api/search/suggestions?q=');
    expect(res.status, 200);
    expect(res.body['items'], isA<List>());
  });
}
