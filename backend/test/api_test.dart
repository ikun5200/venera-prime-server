import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:test/test.dart';

import 'test_utils.dart';

// 1x1 transparent PNG.
final Uint8List tinyPng = Uint8List.fromList(base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='));

Uint8List makeZip(String name, Uint8List bytes) {
  final archive = Archive();
  archive.addFile(ArchiveFile(name, bytes.length, bytes));
  return Uint8List.fromList(ZipEncoder().encode(archive));
}

void main() {
  late TestApp app;
  late Client admin;

  setUp(() async {
    app = TestApp.create();
    admin = app.client();
    await admin.init('admin', 'admin123');
    await admin.login('admin', 'admin123');
    final imported =
        await admin.post('/api/sources', {'script': testSourceScript});
    expect(imported.status, 200, reason: '${imported.body}');
  });

  tearDown(() => app.dispose());

  test('source CRUD and settings', () async {
    final list = await admin.get('/api/sources');
    expect((list.body['items'] as List).length, 1);

    final detail = await admin.get('/api/sources/test_source');
    expect(detail.status, 200);
    expect(
        (detail.body['source'] as Map)['script'], contains('class TestSource'));

    final settings = await admin.get('/api/sources/test_source/settings');
    expect(settings.status, 200);
    expect((settings.body['definitions'] as Map).containsKey('quality'), true);

    final updated = await admin.put('/api/sources/test_source/settings', {
      'values': {'quality': 'low'}
    });
    expect(((updated.body['values'] as Map)['quality']), 'low');

    final disabled =
        await admin.patch('/api/sources/test_source', {'enabled': false});
    expect(disabled.status, 200);
    final searchDisabled =
        await admin.get('/api/search?source=test_source&q=x');
    expect(searchDisabled.status, 400);

    await admin.patch('/api/sources/test_source', {'enabled': true});
    final searchEnabled = await admin.get('/api/search?source=test_source&q=x');
    expect(searchEnabled.status, 200);

    final bad = await admin.post('/api/sources', {'script': 'not javascript'});
    expect(bad.status, 502);
    expect((bad.body['error'] as Map)['code'], 'SOURCE_ERROR');

    expect((await admin.delete('/api/sources/test_source')).status, 200);
    expect((await admin.get('/api/sources/test_source')).status, 404);
  });

  test('search, details, chapters and image config', () async {
    final search = await admin
        .get('/api/search?source=test_source&q=hello&options=&page=1');
    expect(search.status, 200);
    final comics = search.body['comics'] as List;
    expect(comics, hasLength(1));
    expect((comics.first as Map)['title'], 'hello result');
    expect(search.body['maxPage'], 2);

    final details = await admin.get('/api/comic/test_source/comic-1');
    expect(details.status, 200);
    expect(details.body['title'], 'Comic comic-1');
    expect(details.body['chapterCount'], 2);
    expect((details.body['tags'] as Map)['Tags'], ['tag1', 'tag2']);
    expect(details.body['updateTime'], '2024-1-2');

    final images =
        await admin.get('/api/comic/test_source/comic-1/chapter/1/images');
    expect(images.status, 200);
    expect((images.body['images'] as List), hasLength(2));
    expect(images.body['total'], 2);

    final configs = await app.ctx.sources.imageConfigs(
        1, 'test_source', ['https://example.com/a.jpg', 'comic-1', '1']);
    expect(configs, isNotEmpty);
    expect(configs.first['url'], 'https://example.com/a.jpg');
    expect(
        (configs.first['headers'] as Map)['Referer'], 'https://example.com/');
  });

  test('aggregated search returns per-source sections', () async {
    final result = await admin.get('/api/search/aggregated?q=hello');
    expect(result.status, 200);
    final sections = result.body['sections'] as List;
    expect(sections, hasLength(1));
    expect((sections.first as Map)['source'], 'test_source');
    expect((sections.first as Map)['error'], isNull);
  });

  test('favorites: folders, add, move, copy, delete', () async {
    final one = await admin.post('/api/favorites/folders', {'name': 'One'});
    final two = await admin.post('/api/favorites/folders', {'name': 'Two'});
    final oneId = one.body['id'] as int;
    final twoId = two.body['id'] as int;

    await admin.post('/api/favorites', {
      'folderId': oneId,
      'comic': {'id': 'c1', 'title': 'Comic', 'sourceKey': 'test_source'}
    });
    expect(
        (await admin.get('/api/favorites?folderId=$oneId')).body['total'], 1);

    await admin.post('/api/favorites/copy', {
      'from': oneId,
      'to': twoId,
      'items': [
        {'comicId': 'c1', 'comicType': 0}
      ]
    });
    // comicType is derived from sourceKey when adding, so look up the real one.
    final favorite = ((await admin.get('/api/favorites?folderId=$oneId'))
            .body['items'] as List)
        .first as Map;
    final comicType = favorite['comicType'] as int;
    await admin.post('/api/favorites/copy', {
      'from': oneId,
      'to': twoId,
      'items': [
        {'comicId': 'c1', 'comicType': comicType}
      ]
    });
    expect(
        (await admin.get('/api/favorites?folderId=$twoId')).body['total'], 1);

    await admin.post('/api/favorites/move', {
      'from': twoId,
      'to': oneId,
      'items': [
        {'comicId': 'c1', 'comicType': comicType}
      ]
    });
    expect(
        (await admin.get('/api/favorites?folderId=$twoId')).body['total'], 0);

    await admin.delete('/api/favorites/$oneId/$comicType/c1');
    expect(
        (await admin.get('/api/favorites?folderId=$oneId')).body['total'], 0);

    await admin.delete('/api/favorites/folders/$oneId');
    final folders = await admin.get('/api/favorites/folders');
    expect((folders.body['items'] as List), hasLength(1));
  });

  test('history, progress and read later', () async {
    final folder =
        await admin.post('/api/favorites/folders', {'name': 'History'});
    await admin.post('/api/favorites', {
      'folderId': folder.body['id'],
      'comic': {'id': 'c1', 'title': 'Comic', 'sourceKey': 'test_source'}
    });
    await admin.put('/api/history', {
      'comicId': 'c1',
      'sourceKey': 'test_source',
      'title': 'Comic',
      'ep': 2,
      'page': 3,
      'chapterGroup': 1,
      'maxPage': 20,
      'readEpisode': [1, 2]
    });
    final history = await admin.get('/api/history');
    expect(history.body['total'], 1);
    expect(((history.body['items'] as List).first as Map)['page'], 3);

    final progress = await admin.get('/api/progress/test_source/c1');
    expect(progress.body['ep'], 2);
    expect(progress.body['maxPage'], 20);

    await admin.post('/api/read-later', {
      'comic': {'id': 'c1', 'title': 'Comic', 'sourceKey': 'test_source'}
    });
    expect((await admin.get('/api/read-later')).body['count'], 1);
    final readLaterItem =
        ((await admin.get('/api/read-later')).body['items'] as List).first
            as Map;
    await admin.delete('/api/read-later/${readLaterItem['comicType']}/c1');
    expect((await admin.get('/api/read-later')).body['count'], 0);

    await admin.post('/api/read-later', {
      'comic': {'id': 'c1', 'title': 'Comic', 'sourceKey': 'test_source'}
    });
    await admin.delete('/api/read-later');
    expect((await admin.get('/api/read-later')).body['count'], 0);

    await admin.post('/api/history/clear', {'unfavoritedOnly': true});
    expect((await admin.get('/api/history')).body['total'], 1);
    await admin.post('/api/history/clear', {});
    expect((await admin.get('/api/history')).body['total'], 0);
  });

  test('image favorites and statistics', () async {
    await admin.post('/api/image-favorites', {
      'sourceKey': 'test_source',
      'comic': {
        'id': 'c1',
        'title': 'Comic',
        'tags': ['tag1']
      },
      'ep': 1,
      'eid': 'e1',
      'epName': 'Chapter 1',
      'page': 1,
      'imageKey': 'https://example.com/1.jpg'
    });
    final list = await admin.get('/api/image-favorites');
    expect((list.body['items'] as List), hasLength(1));
    final stats = await admin.get('/api/image-favorites/stats');
    expect((stats.body['tags'] as List), isNotEmpty);

    await admin.post('/api/statistics',
        {'comicId': 'c1', 'comicType': 0, 'title': 'Comic', 'seconds': 90});
    final summary = await admin.get('/api/statistics');
    expect(summary.body['todaySeconds'], 90);
    expect(summary.body['totalSeconds'], 90);
    expect((summary.body['recent'] as List), hasLength(1));

    await admin.delete('/api/statistics/0/c1');
    expect((await admin.get('/api/statistics')).body['totalSeconds'], 0);
  });

  test('settings validation and defaults', () async {
    final defaults = await admin.get('/api/settings');
    expect(defaults.body['theme_mode'], 'system');
    expect(defaults.body['readerMode'], 'galleryLeftToRight');

    final bad = await admin.patch('/api/settings', {'unknown_key': 1});
    expect(bad.status, 400);

    final wrongType = await admin.patch('/api/settings', {'theme_mode': 5});
    expect(wrongType.status, 400);

    final good = await admin.patch('/api/settings',
        {'theme_mode': 'dark', 'readerPageMarginPercent': 12.5});
    expect(good.status, 200);
    expect(good.body['theme_mode'], 'dark');
    expect(good.body['readerPageMarginPercent'], 12.5);
  });

  test('upload, import, read local images and export', () async {
    final zip = makeZip('page1.png', tinyPng);
    final init = await admin.post('/api/uploads/init', {
      'name': 'My Comic.zip',
      'size': zip.length,
      'mime': 'application/zip'
    });
    expect(init.status, 200);
    final uploadId = init.body['uploadId'] as String;

    final chunk = await admin.request(
      'PUT',
      '/api/uploads/$uploadId/chunk?offset=0',
      body: zip,
      raw: true,
    );
    expect(chunk.status, 200);
    expect(chunk.body['received'], zip.length);

    final complete =
        await admin.post('/api/uploads/$uploadId/complete', {'import': true});
    expect(complete.status, 200);
    final comic = complete.body['comic'] as Map;
    final id = comic['id'] as int;
    expect(comic['title'], 'My Comic');

    final list = await admin.get('/api/local-comics');
    expect((list.body['items'] as List), hasLength(1));

    final images = await admin.get('/api/local-comics/$id/chapter/1/images');
    expect(images.status, 200);
    expect((images.body['images'] as List), hasLength(1));

    final image =
        await admin.rawRequest('GET', '/api/local-comics/$id/image/1/0');
    expect(image.status, 200);
    expect(image.bytes, isNotEmpty);

    final cover = await admin.rawRequest('GET', '/api/local-comics/$id/cover');
    expect(cover.status, 200);
    expect(cover.bytes, isNotEmpty);

    for (final format in ['cbz', 'pdf', 'epub']) {
      final export = await admin.rawRequest(
          'GET', '/api/local-comics/$id/export?format=$format');
      expect(export.status, 200, reason: format);
      expect(export.bytes, isNotEmpty, reason: format);
    }

    final deleted =
        await admin.delete('/api/local-comics/$id', {'removeFiles': true});
    expect(deleted.status, 200);
    expect((await admin.get('/api/local-comics')).body['items'], isEmpty);
  });

  test('backup export and import restores user data', () async {
    final folder =
        await admin.post('/api/favorites/folders', {'name': 'Backup'});
    final folderId = folder.body['id'] as int;
    await admin.post('/api/favorites', {
      'folderId': folderId,
      'comic': {'id': 'c1', 'title': 'Comic', 'sourceKey': 'test_source'}
    });
    await admin.put('/api/history', {
      'comicId': 'c1',
      'sourceKey': 'test_source',
      'title': 'Comic',
      'ep': 1,
      'page': 1
    });
    await admin.patch('/api/settings', {'theme_mode': 'dark'});

    final export = await admin.rawRequest('GET', '/api/backup/export');
    expect(export.status, 200);
    final backupBytes = export.bytes;

    await admin
        .post('/api/admin/users', {'username': 'eve', 'password': 'eve12345'});
    final eve = app.client();
    await eve.login('eve', 'eve12345');
    final imported = await eve.request('POST', '/api/backup/import',
        body: backupBytes, raw: true);
    expect(imported.status, 200);
    expect((await eve.get('/api/sources')).body['items'], hasLength(1));
    expect((await eve.get('/api/favorites')).body['total'], 1);
    expect((await eve.get('/api/history')).body['total'], 1);
    expect((await eve.get('/api/settings')).body['theme_mode'], 'dark');
  });

  test('error envelope contains requestId and correct status codes', () async {
    final missing = await admin.get('/api/does-not-exist');
    expect(missing.status, 404);
    final error = missing.body['error'] as Map;
    expect(error['code'], 'NOT_FOUND');
    expect(error['requestId'], isNotEmpty);

    final noSource = await admin.get('/api/search?q=x');
    expect(noSource.status, 400);
    expect((noSource.body['error'] as Map)['code'], 'BAD_REQUEST');

    final badJson = await admin.request('PATCH', '/api/settings',
        body: '{not json', raw: true);
    expect(badJson.status, 400);
  });

  test('image endpoint requires authentication', () async {
    final anonymous = app.client();
    final result = await anonymous.get('/api/image?source=test_source&key=x');
    expect(result.status, 401);
  });

  test('webdav configuration is stored encrypted and never returned', () async {
    final saved = await admin.put('/api/webdav', {
      'url': 'https://dav.example.com/remote.php/dav/files/admin/',
      'username': 'admin',
      'password': 'super-secret'
    });
    expect(saved.status, 200);
    final config = await admin.get('/api/webdav');
    expect(config.body['configured'], true);
    expect(jsonEncode(config.body), isNot(contains('super-secret')));
    final row = app.db
        .select('SELECT password_enc FROM webdav_config WHERE user_id = 1')
        .first;
    expect(row['password_enc'], isNot(contains('super-secret')));
  });
}
