import 'package:test/test.dart';

import 'test_utils.dart';

void main() {
  late TestApp app;

  setUp(() => app = TestApp.create());
  tearDown(() => app.dispose());

  test('initialization creates exactly one admin', () async {
    final client = app.client();
    final status = await client.get('/api/init/status');
    expect(status.body['initialized'], false);

    await client.init('admin', 'admin123');
    final after = await client.get('/api/init/status');
    expect(after.body['initialized'], true);

    final duplicate = await client
        .post('/api/init', {'username': 'other', 'password': 'other123'});
    expect(duplicate.status, 409);
  });

  test('login, me, logout and wrong password', () async {
    final client = app.client();
    await client.init('admin', 'admin123');

    final wrong = await client
        .post('/api/auth/login', {'username': 'admin', 'password': 'nope'});
    expect(wrong.status, 401);

    await client.login('admin', 'admin123');
    final me = await client.get('/api/auth/me');
    expect(me.status, 200);
    expect((me.body['user'] as Map)['username'], 'admin');

    final logout = await client.post('/api/auth/logout');
    expect(logout.status, 200);
    final afterLogout = await client.get('/api/auth/me');
    expect(afterLogout.status, 401);
  });

  test('unauthenticated access is rejected', () async {
    final client = app.client();
    await client.init('admin', 'admin123');
    for (final path in [
      '/api/settings',
      '/api/sources',
      '/api/favorites',
      '/api/history',
      '/api/read-later',
      '/api/local-comics',
      '/api/downloads',
      '/api/webdav',
    ]) {
      final result = await client.get(path);
      expect(result.status, 401, reason: path);
    }
  });

  test('admin can create, update and delete users', () async {
    final admin = app.client();
    await admin.init('admin', 'admin123');
    await admin.login('admin', 'admin123');

    final created = await admin
        .post('/api/admin/users', {'username': 'bob', 'password': 'bob12345'});
    expect(created.status, 200);
    final bobId = (created.body['user'] as Map)['id'] as int;

    final list = await admin.get('/api/admin/users');
    expect((list.body['items'] as List).length, 2);

    final duplicate = await admin
        .post('/api/admin/users', {'username': 'bob', 'password': 'bob12345'});
    expect(duplicate.status, 409);

    final disabled =
        await admin.patch('/api/admin/users/$bobId', {'disabled': true});
    expect(disabled.status, 200);

    final bob = app.client();
    final disabledLogin = await bob
        .post('/api/auth/login', {'username': 'bob', 'password': 'bob12345'});
    expect(disabledLogin.status, 401);

    await admin.patch('/api/admin/users/$bobId', {'disabled': false});
    final enabledLogin = await bob
        .post('/api/auth/login', {'username': 'bob', 'password': 'bob12345'});
    expect(enabledLogin.status, 200);

    final deleted = await admin.delete('/api/admin/users/$bobId');
    expect(deleted.status, 200);
    final deletedLogin = await app
        .client()
        .post('/api/auth/login', {'username': 'bob', 'password': 'bob12345'});
    expect(deletedLogin.status, 401);
  });

  test('last admin cannot be removed or demoted', () async {
    final admin = app.client();
    await admin.init('admin', 'admin123');
    await admin.login('admin', 'admin123');
    final me = await admin.get('/api/auth/me');
    final id = (me.body['user'] as Map)['id'] as int;

    expect((await admin.patch('/api/admin/users/$id', {'role': 'user'})).status,
        400);
    expect((await admin.delete('/api/admin/users/$id')).status, 400);
  });

  test('disabling a user invalidates existing sessions', () async {
    final admin = app.client();
    await admin.init('admin', 'admin123');
    await admin.login('admin', 'admin123');
    final created = await admin.post(
        '/api/admin/users', {'username': 'carol', 'password': 'carol123'});
    final id = (created.body['user'] as Map)['id'] as int;

    final carol = app.client();
    await carol.login('carol', 'carol123');
    expect((await carol.get('/api/auth/me')).status, 200);

    await admin.patch('/api/admin/users/$id', {'disabled': true});
    expect((await carol.get('/api/auth/me')).status, 401);
  });

  test('non-admin cannot use admin endpoints', () async {
    final admin = app.client();
    await admin.init('admin', 'admin123');
    await admin.login('admin', 'admin123');
    await admin
        .post('/api/admin/users', {'username': 'dave', 'password': 'dave1234'});
    final dave = app.client();
    await dave.login('dave', 'dave1234');
    expect((await dave.get('/api/admin/users')).status, 403);
    expect((await dave.get('/api/admin/audit')).status, 403);
  });

  test('health endpoint is public', () async {
    final result = await app.client().get('/api/health');
    expect(result.status, 200);
    expect(result.body['status'], 'ok');
    expect(result.body['initialized'], false);
  });
}
