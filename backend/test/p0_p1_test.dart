import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:image/image.dart' as img;
import 'package:shelf/shelf.dart';
import 'package:test/test.dart';
import 'package:venera_server/app_context.dart';

import 'test_utils.dart';

String autoSourceScript(int port, List<String> chapters) {
  final map = chapters.map((id) => '"$id": "Chapter $id"').join(',');
  return '''
class AutoSource extends ComicSource {
  name = "Auto Source";
  key = "auto_source";
  version = "1.0.0";
  search = { load: async () => ({ comics: [], maxPage: 1 }) };
  comic = {
    loadInfo: async (id) => new ComicDetails({
      title: "Auto Comic",
      cover: "http://127.0.0.1:$port/img.png",
      chapters: {$map},
      updateTime: "2024-01-02"
    }),
    loadEp: async (comicId, epId) => ({
      images: ["http://127.0.0.1:$port/img.png"]
    })
  };
}
''';
}

Future<void> waitForFollowTask(AppContext ctx, int userId) async {
  for (var i = 0; i < 100; i++) {
    await Future<void>.delayed(const Duration(milliseconds: 200));
    final tasks = ctx.tasks
        .list(userId)
        .where((task) => task['type'] == 'follow_updates');
    if (tasks.isNotEmpty && tasks.first['status'] != 'running') return;
  }
  throw StateError('follow update task did not finish');
}

void main() {
  TestApp? app;

  Future<(TestApp, Client, int)> setUpApp() async {
    app = TestApp.create();
    final client = app!.client();
    await client.init('admin', 'secret123');
    await client.login('admin', 'secret123');
    final me = await client.get('/api/auth/me');
    final userId = ((me.body['user'] as Map)['id'] as num).toInt();
    return (app!, client, userId);
  }

  tearDown(() async {
    await app?.dispose();
    app = null;
  });

  group('API tokens and permissions', () {
    test('bearer and basic tokens authenticate', () async {
      final (_, client, _) = await setUpApp();
      final created = await client.post('/api/tokens', {'name': 'test'});
      expect(created.status, 200);
      final token = ((created.body['token'] as Map)['token'] as String);

      final bearer = Client(app!.handler);
      final me = await bearer.request('GET', '/api/auth/me',
          headers: {'authorization': 'Bearer $token'});
      expect(me.status, 200);
      expect(((me.body['user'] as Map)['username']), 'admin');

      final basic = Client(app!.handler);
      final header = 'Basic ${base64Encode(utf8.encode('admin:$token'))}';
      final meBasic = await basic
          .request('GET', '/api/auth/me', headers: {'authorization': header});
      expect(meBasic.status, 200);

      final list = await client.get('/api/tokens');
      expect((list.body['items'] as List).length, 1);
      final id = ((list.body['items'] as List).first as Map)['id'];
      final deleted = await client.delete('/api/tokens/$id');
      expect(deleted.status, 200);
      final after = await bearer.request('GET', '/api/auth/me',
          headers: {'authorization': 'Bearer $token'});
      expect(after.status, 401);
    });

    test('non-admin permissions are enforced and editable', () async {
      final (_, client, _) = await setUpApp();
      final created = await client.post('/api/admin/users', {
        'username': 'reader',
        'password': 'secret123',
        'role': 'user',
        'permissions': ['download'],
      });
      expect(created.status, 200);
      final userId = ((created.body['user'] as Map)['id'] as num).toInt();

      final reader = Client(app!.handler);
      await reader.login('reader', 'secret123');
      final denied =
          await reader.post('/api/sources', {'script': testSourceScript});
      expect(denied.status, 403);

      final updated = await client.patch('/api/admin/users/$userId', {
        'permissions': ['download', 'manage_sources'],
      });
      expect(updated.status, 200);
      final allowed =
          await reader.post('/api/sources', {'script': testSourceScript});
      expect(allowed.status, 200);
    });
  });

  group('durable download queue', () {
    test('reordering and restart recovery persist in SQLite', () async {
      final (app, _, userId) = await setUpApp();
      final repository = app.ctx.localRepository;
      final first = repository.createJob(
        userId: userId,
        kind: 'images',
        sourceKey: 'test_source',
        comicId: 'comic-1',
        comicType: 1,
        title: 'First',
        cover: '',
        payload: {'chapters': []},
        chapters: const [],
        total: 0,
      );
      final second = repository.createJob(
        userId: userId,
        kind: 'images',
        sourceKey: 'test_source',
        comicId: 'comic-2',
        comicType: 1,
        title: 'Second',
        cover: '',
        payload: {'chapters': []},
        chapters: const [],
        total: 0,
      );
      expect(repository.nextQueuedJob(userId), first);
      repository.moveInQueue(userId, second, 'first');
      expect(repository.nextQueuedJob(userId), second);
      repository.moveInQueue(userId, second, 'down');
      expect(repository.nextQueuedJob(userId), first);
      repository.moveInQueue(userId, first, 'last');
      expect(repository.nextQueuedJob(userId), second);

      repository.updateJob(first, state: 'running');
      repository.resetInterruptedJobs();
      expect(repository.job(userId, first)!['state'], 'queued');
      expect(repository.job(userId, second)!['queueOrder'], isNotNull);
    });
  });

  group('OPDS and SSE', () {
    test('OPDS requires auth and serves an Atom feed', () async {
      final (app, client, _) = await setUpApp();
      final anonymous = Client(app.handler);
      final denied = await anonymous.request('GET', '/opds');
      expect(denied.status, 401);
      expect(denied.body['data'], contains('Authentication required'));

      final tokenResult = await client.post('/api/tokens', {'name': 'opds'});
      final token = ((tokenResult.body['token'] as Map)['token'] as String);
      final basic = 'Basic ${base64Encode(utf8.encode('admin:$token'))}';
      final feed = await client.request('GET', '/opds', headers: {
        'authorization': basic,
      });
      expect(feed.status, 200);
      expect(feed.body['data'], contains('<feed'));
      expect(feed.body['data'], contains('/opds/local'));
    });

    test('event stream sends SSE headers and an initial retry directive',
        () async {
      final (app, client, _) = await setUpApp();
      final request = Request(
        'GET',
        Uri.parse('http://localhost:18080/api/events'),
        headers: {'cookie': client.cookie!},
      );
      final response = await app.handler(request);
      expect(response.statusCode, 200);
      expect(response.headers['content-type'], contains('text/event-stream'));
      final first = await response.read().first.timeout(
            const Duration(seconds: 3),
          );
      expect(utf8.decode(first), contains('retry:'));
    });
  });

  group('library update strategy', () {
    test('per-comic strategy is stored and returned', () async {
      final (app, client, _) = await setUpApp();
      final folder = await client.post('/api/favorites/folders', {
        'name': 'Following',
      });
      final folderId = folder.body['id'];
      final added = await client.post('/api/favorites', {
        'folderId': folderId,
        'comic': {
          'id': 'comic-1',
          'comicType': 1,
          'sourceKey': 'test_source',
          'title': 'Comic 1',
          'subtitle': 'Author',
          'cover': '',
          'tags': [],
        },
      });
      expect(added.status, 200);
      final saved = await client.post('/api/favorites/update-strategy', {
        'comicId': 'comic-1',
        'comicType': 1,
        'strategy': 'unread',
      });
      expect(saved.status, 200);
      final list = await client.get('/api/favorites?folderId=$folderId');
      final item = (list.body['items'] as List).first as Map;
      expect(item['updateStrategy'], 'unread');

      final created = await client.post('/api/admin/users', {
        'username': 'plain',
        'password': 'secret123',
        'role': 'user',
        'permissions': ['download'],
      });
      expect(created.status, 200);
      final plain = Client(app.handler);
      await plain.login('plain', 'secret123');
      final plainFolder =
          await plain.post('/api/favorites/folders', {'name': 'Mine'});
      await plain.post('/api/favorites', {
        'folderId': plainFolder.body['id'],
        'comic': {
          'id': 'adult-1',
          'comicType': 1,
          'sourceKey': 'test_source',
          'title': 'Adult Comic',
          'tags': ['R18'],
        },
      });
      final hidden = await plain.get('/api/favorites');
      expect((hidden.body['items'] as List), isEmpty);
    });
  });

  group('auto download', () {
    test('downloads chapters that appear after the initial check', () async {
      final image = img.Image(width: 4, height: 4);
      img.fill(image, color: img.ColorRgb8(20, 120, 200));
      final png = img.encodePng(image);
      final media = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      media.listen((request) {
        request.response.headers.contentType = ContentType('image', 'png');
        request.response.add(png);
        request.response.close();
      });
      addTearDown(() => media.close(force: true));

      final (app, client, userId) = await setUpApp();
      final script = autoSourceScript(media.port, ['1']);
      final imported = await client.post('/api/sources', {'script': script});
      expect(imported.status, 200);
      final folder =
          await client.post('/api/favorites/folders', {'name': 'Auto'});
      final folderId = folder.body['id'];
      final added = await client.post('/api/favorites', {
        'folderId': folderId,
        'comic': {
          'id': 'auto1',
          'sourceKey': 'auto_source',
          'title': 'Auto Comic',
          'cover': '',
          'tags': [],
        },
      });
      expect(added.status, 200);
      final configured = await client.put('/api/follow-updates/config', {
        'folderId': folderId,
        'intervalHours': 0,
        'checkOnStart': false,
        'fixedTime': '',
      });
      expect(configured.status, 200);
      final settings = await client.patch('/api/settings', {
        'autoDownloadNewChapters': true,
        'autoDownloadNewChaptersLimit': 0,
        'excludeUnreadChapters': false,
        'excludeNotStarted': false,
        'excludeCompleted': false,
        'excludeEntryWithUnreadChapters': false,
      });
      expect(settings.status, 200);

      await client.post('/api/follow-updates/check');
      await waitForFollowTask(app.ctx, userId);

      final updated = await client.put('/api/sources/auto_source', {
        'script': autoSourceScript(media.port, ['1', '2']),
      });
      expect(updated.status, 200);
      await client.post('/api/follow-updates/check');
      await waitForFollowTask(app.ctx, userId);

      Map<String, Object?>? job;
      for (var i = 0; i < 150; i++) {
        final jobs = app.ctx.downloads.list(userId);
        if (jobs.isNotEmpty) {
          job = jobs.first;
          if (job['state'] == 'completed' || job['state'] == 'error') break;
        }
        await Future<void>.delayed(const Duration(milliseconds: 200));
      }
      expect(job, isNotNull, reason: 'auto download did not create a job');
      expect(
        (job!['chapters'] as List)
            .whereType<Map>()
            .map((chapter) => chapter['id'])
            .toList(),
        contains('2'),
      );
      expect(job['state'], isNot('error'), reason: '${job['error']}');
    });
  });

  group('scheduled backups', () {
    test('uploads once when due and enforces retention', () async {
      final files = <String, Uint8List>{
        '000001-000001-old1.venera': Uint8List.fromList([1]),
        '000001-000002-old2.venera': Uint8List.fromList([2]),
      };
      var puts = 0;
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      server.listen((request) async {
        final name = request.uri.pathSegments.isEmpty
            ? ''
            : request.uri.pathSegments.last;
        if (request.method == 'PUT') {
          final bytes = await request.fold<List<int>>(
              <int>[], (buffer, chunk) => buffer..addAll(chunk));
          files[name] = Uint8List.fromList(bytes);
          puts++;
          request.response.statusCode = 201;
        } else if (request.method == 'PROPFIND') {
          request.response.headers.contentType =
              ContentType('application', 'xml', charset: 'utf-8');
          request.response.write('<?xml version="1.0"?><d:multistatus '
              'xmlns:d="DAV:">'
              '${files.keys.map((file) => '<d:response><d:href>/$file</d:href></d:response>').join()}'
              '</d:multistatus>');
        } else if (request.method == 'DELETE') {
          files.remove(name);
          request.response.statusCode = 204;
        } else {
          request.response.statusCode = 200;
        }
        await request.response.close();
      });
      addTearDown(() => server.close(force: true));

      final (app, client, userId) = await setUpApp();
      final saved = await client.put('/api/webdav', {
        'url': 'http://127.0.0.1:${server.port}/',
        'username': 'user',
        'password': 'pass',
        'path': '/',
      });
      expect(saved.status, 200);
      await client.patch('/api/settings', {
        'backupIntervalDays': 1,
        'backupTime': '00:00',
        'backupRetention': 2,
        'autoBackupIncludeHistory': false,
      });

      await app.ctx.webdav.runScheduledBackups();
      expect(puts, 1);
      expect(files.length, 2);
      expect(
        app.ctx.localRepository.webdav(userId)!['lastAutoBackupAt'],
        isNotNull,
      );

      await app.ctx.webdav.runScheduledBackups();
      expect(puts, 1);
    });
  });

  group('history chapter ids', () {
    test('persists the current and finished chapter ids', () async {
      final (_, client, _) = await setUpApp();
      final saved = await client.put('/api/history', {
        'comicId': 'comic-history',
        'comicType': 1,
        'sourceKey': 'test_source',
        'title': 'History Comic',
        'subtitle': 'Author',
        'cover': '',
        'ep': 3,
        'page': 2,
        'chapterId': 'chapter-300',
        'readEpisode': ['chapter-100', 'chapter-200'],
        'maxPage': 10,
      });
      expect(saved.status, 200);
      final list = await client.get('/api/history');
      final item = (list.body['items'] as List).first as Map;
      expect(item['chapterId'], 'chapter-300');
      expect(item['readEpisode'], ['chapter-100', 'chapter-200']);
    });
  });

  group('image conversion and backup filters', () {
    test('WebP conversion returns a WebP payload and caches it', () async {
      final (app, _, userId) = await setUpApp();
      app.ctx.settingsRepository
          .setMany(userId, {'imageFormat': 'webp', 'imageQuality': 70});
      final source = img.Image(width: 8, height: 8);
      img.fill(source, color: img.ColorRgb8(200, 30, 30));
      final png = Uint8List.fromList(img.encodePng(source));
      final converted = await app.ctx.images.convert(
        userId: userId,
        cacheKey: 'test-image',
        bytes: png,
        mime: 'image/png',
      );
      expect(converted.mime, 'image/webp');
      expect(converted.bytes.length, greaterThan(0));
      expect(String.fromCharCodes(converted.bytes.take(4)), 'RIFF');
      final again = await app.ctx.images.convert(
        userId: userId,
        cacheKey: 'test-image',
        bytes: png,
        mime: 'image/png',
      );
      expect(again.bytes, converted.bytes);
    });

    test('backup export honors content selection', () async {
      final (app, _, userId) = await setUpApp();
      final all = app.ctx.backup.export(userId);
      expect(all.containsKey('history'), isTrue);
      expect(all.containsKey('statistics'), isTrue);
      expect(all.containsKey('settings'), isTrue);
      final minimal = app.ctx.backup.export(
        userId,
        includeHistory: false,
        includeStatistics: false,
        includeSettings: false,
      );
      expect(minimal.containsKey('history'), isFalse);
      expect(minimal.containsKey('statistics'), isFalse);
      expect(minimal.containsKey('settings'), isFalse);
      expect(minimal.containsKey('favorites'), isTrue);
      expect(minimal.containsKey('sources'), isTrue);
    });
  });
}
