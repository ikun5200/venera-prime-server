import 'dart:io';

import 'package:test/test.dart';

import 'test_utils.dart';

void main() {
  final binary = File('../rust/js_host/target/debug/venera_js_host');
  final realSource =
      File('../reference/venera-prime/tool/comic_sources/manga_dex.js');

  late TestApp app;
  late Client admin;

  setUp(() async {
    app = TestApp.create();
    admin = app.client();
    await admin.init('admin', 'admin123');
    await admin.login('admin', 'admin123');
  });

  tearDown(() => app.dispose());

  test('sidecar evaluates init.js, sources and async methods', () async {
    final imported = await admin.post('/api/sources', {'script': testSourceScript});
    expect(imported.status, 200, reason: '${imported.body}');

    final search = await admin.get('/api/search?source=test_source&q=abc');
    expect(search.status, 200);
    expect((search.body['comics'] as List), hasLength(1));

    final details = await admin.get('/api/comic/test_source/comic-1');
    expect(details.status, 200);
    expect(details.body['chapterCount'], 2);

    final images =
        await admin.get('/api/comic/test_source/comic-1/chapter/1/images');
    expect((images.body['images'] as List), hasLength(2));
  }, skip: !binary.existsSync());

  test('HTML DOM bridge and Convert work', () async {
    final imported = await admin.post('/api/sources', {'script': htmlSourceScript});
    expect(imported.status, 200, reason: '${imported.body}');
    final search = await admin.get('/api/search?source=html_source&q=x');
    expect(search.status, 200);
    final title = ((search.body['comics'] as List).first as Map)['title']
        .toString();
    // text | href | matching elements | md5("abc") | locale
    expect(title, contains('Hello World'));
    expect(title, contains('/c/1'));
    expect(title, contains('|2|'));
    expect(title, contains('900150983cd24fb0d6963f7d28e17f72'));
    expect(title, contains('en_US'));
  }, skip: !binary.existsSync());

  test('source storage and settings persist across calls', () async {
    const script = r'''
class StorageSource extends ComicSource {
  name = "Storage"; key = "storage_source"; version = "1.0.0";
  settings = { value: { type: "input", default: "d" } };
  search = { load: async () => {
    const counter = (this.loadData("counter") || 0) + 1;
    this.saveData("counter", counter);
    const setting = this.loadSetting("value");
    return { comics: [{ id: "1", title: "count=" + counter + ";setting=" + setting, cover: "" }], maxPage: 1 };
  }};
  comic = { loadInfo: async () => new ComicDetails({ title: "x", chapters: {} }) };
}
''';
    final imported = await admin.post('/api/sources', {'script': script});
    expect(imported.status, 200, reason: '${imported.body}');
    await admin.put('/api/sources/storage_source/settings', {
      'values': {'value': 'custom'}
    });

    final first = await admin.get('/api/search?source=storage_source&q=x');
    final second = await admin.get('/api/search?source=storage_source&q=x');
    expect(((first.body['comics'] as List).first as Map)['title'],
        'count=1;setting=custom');
    expect(((second.body['comics'] as List).first as Map)['title'],
        'count=2;setting=custom');
  }, skip: !binary.existsSync());

  test('real MangaDex source parses with full capabilities', () async {
    final script = realSource.readAsStringSync();
    final imported = await admin.post('/api/sources', {'script': script});
    expect(imported.status, 200, reason: '${imported.body}');
    final source = imported.body['source'] as Map;
    expect(source['key'], 'manga_dex');
    expect(source['name'], 'MangaDex');
    expect(source['version'], '1.3.0');
    final capabilities = source['capabilities'] as Map;
    expect(capabilities['search'], true);
    expect(capabilities['explore'], true);
    expect(capabilities['category'], true);
    expect(capabilities['comments'], true);
    expect(capabilities['imageLoad'], true);
    expect(capabilities['webviewLogin'], true);
    expect((source['settings'] as Map).containsKey('image_quality'), true);
  }, skip: !binary.existsSync() || !realSource.existsSync());
}
