import 'dart:io';

import 'package:test/test.dart';

import 'test_utils.dart';

void main() {
  late TestApp app;
  late Client admin;
  late Client bob;
  late int bobId;

  setUp(() async {
    app = TestApp.create();
    admin = app.client();
    await admin.init('admin', 'admin123');
    await admin.login('admin', 'admin123');
    final created = await admin
        .post('/api/admin/users', {'username': 'bob', 'password': 'bob12345'});
    bobId = (created.body['user'] as Map)['id'] as int;
    bob = app.client();
    await bob.login('bob', 'bob12345');
  });

  tearDown(() => app.dispose());

  test('sources are per-user and cross-user reads return 404', () async {
    final imported =
        await admin.post('/api/sources', {'script': testSourceScript});
    expect(imported.status, 200);

    expect((await bob.get('/api/sources')).body['items'], isEmpty);
    expect((await bob.get('/api/sources/test_source')).status, 404);
    expect((await bob.get('/api/search?source=test_source&q=x')).status, 404);
    expect((await bob.get('/api/sources/test_source/settings')).status, 404);

    // Bob cannot delete or modify the admin source.
    expect((await bob.delete('/api/sources/test_source')).status, 200);
    expect((await admin.get('/api/sources/test_source')).status, 200);
  });

  test('favorites, history, read later and image favorites are isolated',
      () async {
    final folder =
        await admin.post('/api/favorites/folders', {'name': 'Admin'});
    final folderId = folder.body['id'] as int;
    await admin.post('/api/favorites', {
      'folderId': folderId,
      'comic': {'id': 'c1', 'title': 'Admin Comic', 'sourceKey': 'test_source'}
    });
    await admin.put('/api/history', {
      'comicId': 'c1',
      'sourceKey': 'test_source',
      'title': 'Admin Comic',
      'ep': 1,
      'page': 2,
      'maxPage': 10
    });
    await admin.post('/api/read-later', {
      'comic': {'id': 'c1', 'title': 'Admin Comic', 'sourceKey': 'test_source'}
    });
    await admin.post('/api/image-favorites', {
      'sourceKey': 'test_source',
      'comic': {'id': 'c1', 'title': 'Admin Comic'},
      'ep': 1,
      'eid': 'e1',
      'epName': 'Chapter 1',
      'page': 1,
      'imageKey': 'https://example.com/1.jpg'
    });

    expect((await bob.get('/api/favorites')).body['total'], 0);
    expect(
        (await bob.get('/api/favorites?folderId=$folderId')).body['total'], 0);
    expect((await bob.get('/api/history')).body['total'], 0);
    expect((await bob.get('/api/read-later')).body['items'], isEmpty);
    expect((await bob.get('/api/image-favorites')).body['items'], isEmpty);

    // Bob's writes do not leak into admin's data.
    final bobFolder = await bob.post('/api/favorites/folders', {'name': 'Bob'});
    final bobFolderId = bobFolder.body['id'] as int;
    await bob.post('/api/favorites', {
      'folderId': bobFolderId,
      'comic': {'id': 'b1', 'title': 'Bob Comic', 'sourceKey': 'test_source'}
    });
    expect((await admin.get('/api/favorites')).body['total'], 1);
    expect(
        (await admin.get('/api/favorites?folderId=$bobFolderId')).body['total'],
        0);
  });

  test('settings are per-user', () async {
    await admin.patch('/api/settings', {'theme_mode': 'dark'});
    expect((await admin.get('/api/settings')).body['theme_mode'], 'dark');
    expect((await bob.get('/api/settings')).body['theme_mode'], 'system');
  });

  test('webdav configuration is per-user', () async {
    await admin.put('/api/webdav', {
      'url': 'https://dav.example.com/remote.php/dav/files/admin/',
      'username': 'admin',
      'password': 'secret',
    });
    expect((await admin.get('/api/webdav')).body['configured'], true);
    final bobConfig = await bob.get('/api/webdav');
    expect(bobConfig.body['configured'], false);
    expect(bobConfig.body['url'], '');
  });

  test('local comics and uploads are isolated', () async {
    // Create a local comic for the admin directly on disk.
    final root = app.ctx.local.libraryRoot(1);
    final directory = Directory('$root/AdminComic')
      ..createSync(recursive: true);
    File('${directory.path}/1.jpg').writeAsBytesSync([0xff, 0xd8, 0xff, 0xd9]);
    final localId = app.ctx.localRepository.create(
      userId: 1,
      title: 'AdminComic',
      directory: 'AdminComic',
      chapters: {'1': 'Chapter 1'},
      comicType: 0,
    );

    expect((await admin.get('/api/local-comics')).body['items'], hasLength(1));
    expect((await bob.get('/api/local-comics')).body['items'], isEmpty);
    expect((await bob.get('/api/local-comics/$localId')).status, 404);
    expect((await bob.get('/api/local-comics/$localId/cover')).status, 404);
    expect(
        (await bob.get('/api/local-comics/$localId/chapter/1/images')).status,
        404);
    expect((await bob.delete('/api/local-comics/$localId')).status, 404);

    // Upload created by admin cannot be written to by bob.
    final init = await admin.post('/api/uploads/init',
        {'name': 'x.zip', 'size': 10, 'mime': 'application/zip'});
    final uploadId = init.body['uploadId'] as String;
    final bobChunk = await bob.request(
      'PUT',
      '/api/uploads/$uploadId/chunk?offset=0',
      body: [1, 2, 3],
      raw: true,
    );
    expect(bobChunk.status, 404);
    final bobComplete =
        await bob.post('/api/uploads/$uploadId/complete', {'import': false});
    expect(bobComplete.status, 404);
  });

  test('deleting a user cascades data and removes the session', () async {
    await bob.post('/api/favorites/folders', {'name': 'Bob'});
    await bob.patch('/api/settings', {'theme_mode': 'dark'});

    final deleted = await admin.delete('/api/admin/users/$bobId');
    expect(deleted.status, 200);

    expect((await bob.get('/api/auth/me')).status, 401);
    final login = await app
        .client()
        .post('/api/auth/login', {'username': 'bob', 'password': 'bob12345'});
    expect(login.status, 401);

    final rows = app.db.select(
        'SELECT COUNT(*) AS c FROM favorite_folders WHERE user_id = ?',
        [bobId]);
    expect(rows.first['c'], 0);
    expect(Directory(app.ctx.paths.userRoot(bobId)).existsSync(), false);
  });

  test('cross-user history deletion is a no-op', () async {
    await admin.put('/api/history', {
      'comicId': 'c1',
      'sourceKey': 'test_source',
      'title': 'Admin Comic',
      'ep': 1,
      'page': 1,
    });
    await bob.delete('/api/history/0/c1');
    expect((await admin.get('/api/history')).body['total'], 1);
  });
}
