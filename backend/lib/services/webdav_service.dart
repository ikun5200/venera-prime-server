import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:http/http.dart' as http;
import 'package:xml/xml.dart';

import '../config.dart';
import '../db/database.dart';
import '../repositories/library_repository.dart';
import '../repositories/image_favorite_repository.dart';
import '../repositories/local_repository.dart';
import '../repositories/source_repository.dart';
import '../repositories/user_repository.dart';
import '../util/crypto.dart';
import '../util/errors.dart';
import '../util/log.dart';
import '../util/settings_defaults.dart';
import 'source_service.dart';

class BackupService {
  final Db db;
  final UserRepository users;
  final SettingsRepository settings;
  final SourceRepository sources;
  final SourceService sourceService;
  final FavoriteRepository favorites;
  final HistoryRepository history;
  final ReadLaterRepository readLater;
  final ImageFavoriteRepository imageFavorites;

  BackupService({
    required this.db,
    required this.users,
    required this.settings,
    required this.sources,
    required this.sourceService,
    required this.favorites,
    required this.history,
    required this.readLater,
    required this.imageFavorites,
  });

  Map<String, Object?> export(
    int userId, {
    bool includeSettings = true,
    bool includeHistory = true,
    bool includeStatistics = true,
  }) {
    final user = users.byId(userId);
    return {
      'format': 2,
      'app': 'venera-prime-server',
      'version': 1,
      'exportedAt': DateTime.now().toUtc().toIso8601String(),
      'user': {'username': user?.username, 'role': user?.role},
      if (includeSettings) 'settings': settings.all(userId),
      'sources': sources
          .list(userId)
          .map((s) => {
                'key': s.key,
                'name': s.name,
                'version': s.version,
                'url': s.url,
                'minAppVersion': s.minAppVersion,
                'script': s.script,
                'data': s.data,
                'settings': s.settings,
                'translation': s.translation,
                'capabilities': s.capabilities,
                'enabled': s.enabled,
                'sortOrder': s.sortOrder,
              })
          .toList(),
      'cookies': sources.cookies(userId),
      'favoriteFolders': favorites.folders(userId),
      'favorites': {
        for (final folder in favorites.folders(userId))
          folder['id'].toString(): favorites
              .allInFolder(userId, folder['id'] as int)
              .map((f) => f.toJson())
              .toList(),
      },
      if (includeHistory) ...{
        'history':
            history.recent(userId, 100000).map((h) => h.toJson()).toList(),
        'readLater': readLater.list(userId).map((r) => r.toJson()).toList(),
        'imageFavorites': imageFavorites.list(userId)['items'],
      },
      if (includeStatistics)
        'statistics': db
            .select(
                'SELECT day,comic_id,comic_type,title,author,cover,duration_seconds,last_read_at '
                'FROM reading_statistics WHERE user_id=?',
                [userId])
            .map((r) => {
                  'day': r['day'],
                  'comicId': r['comic_id'],
                  'comicType': r['comic_type'],
                  'title': r['title'],
                  'author': r['author'],
                  'cover': r['cover'],
                  'seconds': r['duration_seconds'],
                  'lastReadAt': r['last_read_at'],
                })
            .toList(),
      if (includeSettings)
        'followUpdates': {
          'config': db
              .select('SELECT * FROM follow_update_config WHERE user_id=?',
                  [userId])
              .map((r) => {
                    'folderId': r['folder_id'],
                    'checkOnStart': r['check_on_start'] == 1,
                    'intervalHours': r['interval_hours'],
                    'fixedTime': r['fixed_time'],
                  })
              .firstOrNull,
        },
    };
  }

  Future<Map<String, Object?>> import(int userId, Map<String, Object?> data,
      {String? ip}) async {
    final format = data['format'];
    if (format != 1 && format != 2) {
      throw ApiException.badRequest('不支持的备份格式');
    }
    return _importUnsafe(userId, data, ip: ip);
  }

  Future<Map<String, Object?>> _importUnsafe(
      int userId, Map<String, Object?> data,
      {String? ip}) async {
    var importedSources = 0;
    var importedFavorites = 0;
    var importedHistory = 0;
    var importedReadLater = 0;
    var importedImages = 0;

    final importedSettings = data['settings'];
    if (importedSettings is Map) {
      final clean = <String, Object?>{};
      for (final entry in importedSettings.entries) {
        final key = entry.key.toString();
        if (writableSettings.contains(key)) clean[key] = entry.value;
      }
      settings.setMany(userId, clean);
    }

    final sourceList = data['sources'];
    if (sourceList is List) {
      for (final raw in sourceList) {
        if (raw is! Map) continue;
        final map = raw.map((k, v) => MapEntry(k.toString(), v));
        final script = map['script'];
        if (script is! String || script.trim().isEmpty) continue;
        try {
          await sourceService.importScript(userId, script,
              replace: true, url: map['url']?.toString(), ip: ip);
          final source = sourceService.get(userId, map['key'].toString());
          if (source != null && map['data'] is Map) {
            sources.saveData(
              userId,
              source.key,
              (map['data'] as Map).map((k, v) => MapEntry(k.toString(), v)),
            );
          }
          importedSources++;
        } catch (error) {
          Log.warning('Backup source import failed',
              userId: userId, extra: {'source': map['key'], 'error': '$error'});
        }
      }
    }

    final folderList = data['favoriteFolders'];
    final folderMap = <String, int>{};
    if (folderList is List) {
      for (final raw in folderList) {
        if (raw is! Map) continue;
        final map = raw.map((k, v) => MapEntry(k.toString(), v));
        final name = (map['name'] ?? '').toString();
        if (name.isEmpty) continue;
        final existing = favorites
            .folders(userId)
            .where((f) => f['name'] == name)
            .firstOrNull;
        folderMap[map['id'].toString()] = existing != null
            ? existing['id'] as int
            : favorites.createFolder(userId, name);
      }
    }
    final favoritesData = data['favorites'];
    if (favoritesData is Map) {
      for (final entry in favoritesData.entries) {
        final folderId = folderMap[entry.key.toString()];
        if (folderId == null || entry.value is! List) continue;
        for (final raw in entry.value as List) {
          if (raw is! Map) continue;
          final map = raw.map((k, v) => MapEntry(k.toString(), v));
          favorites.addFavorite(userId, folderId, {
            'id': map['id'] ?? map['comicId'],
            'comicType': map['comicType'] ?? 0,
            'title': map['title'] ?? map['name'],
            'subtitle': map['subtitle'] ?? map['author'],
            'cover': map['cover'] ?? map['coverPath'],
            'tags': map['tags'],
          });
          importedFavorites++;
        }
      }
    }

    final historyList = data['history'];
    if (historyList is List) {
      for (final raw in historyList) {
        if (raw is! Map) continue;
        final map = raw.map((k, v) => MapEntry(k.toString(), v));
        final comicId = (map['id'] ?? '').toString();
        if (comicId.isEmpty) continue;
        history.upsert(
          userId: userId,
          comicId: comicId,
          comicType: (map['comicType'] as int?) ?? 0,
          sourceKey: (map['sourceKey'] ?? '').toString(),
          title: (map['title'] ?? '').toString(),
          subtitle: (map['subtitle'] ?? '').toString(),
          cover: (map['cover'] ?? '').toString(),
          ep: (map['ep'] as int?) ?? 1,
          page: (map['page'] as int?) ?? 1,
          chapterGroup: map['chapterGroup'] as int?,
          chapterId: map['chapterId']?.toString(),
          readEpisode: map['readEpisode'] is List
              ? map['readEpisode'] as List
              : const [],
          maxPage: map['maxPage'] as int?,
        );
        importedHistory++;
      }
    }

    final readLaterList = data['readLater'];
    if (readLaterList is List) {
      for (final raw in readLaterList) {
        if (raw is! Map) continue;
        final map = raw.map((k, v) => MapEntry(k.toString(), v));
        readLater.add(userId, {
          'id': map['id'],
          'comicType': map['comicType'],
          'sourceKey': map['sourceKey'],
          'title': map['title'],
          'subtitle': map['subtitle'],
          'description': map['description'],
          'tags': map['tags'],
          'cover': map['cover'],
        });
        importedReadLater++;
      }
    }

    final imageList = data['imageFavorites'];
    if (imageList is List) {
      for (final raw in imageList) {
        if (raw is! Map) continue;
        final comic = raw.map((k, v) => MapEntry(k.toString(), v));
        final sourceKey = (comic['sourceKey'] ?? '').toString();
        final chapters = comic['chapters'];
        if (chapters is! List) continue;
        for (final chapterRaw in chapters) {
          if (chapterRaw is! Map) continue;
          final chapter = chapterRaw.map((k, v) => MapEntry(k.toString(), v));
          final pages = chapter['images'];
          if (pages is! List) continue;
          for (final pageRaw in pages) {
            if (pageRaw is! Map) continue;
            final page = pageRaw.map((k, v) => MapEntry(k.toString(), v));
            try {
              imageFavorites.add(
                userId: userId,
                comic: comic,
                ep: (chapter['ep'] as int?) ?? 1,
                eid: (chapter['eid'] ?? '').toString(),
                epName: (chapter['epName'] ?? '').toString(),
                page: (page['page'] as int?) ?? 1,
                imageKey: (page['imageKey'] ?? '').toString(),
                auto: page['isAutoFavorite'] == true,
                sourceKey: sourceKey,
              );
              importedImages++;
            } catch (_) {}
          }
        }
      }
    }

    final cookies = data['cookies'];
    if (cookies is List) {
      sources.replaceCookies(
        userId,
        cookies
            .whereType<Map>()
            .map((c) => c.map((k, v) => MapEntry(k.toString(), v)))
            .toList(),
      );
    }

    return {
      'sources': importedSources,
      'favorites': importedFavorites,
      'history': importedHistory,
      'readLater': importedReadLater,
      'images': importedImages,
    };
  }

  Future<Map<String, Object?>> importBytes(int userId, Uint8List bytes,
      {String? ip}) async {
    Object? decoded;
    try {
      decoded = jsonDecode(utf8.decode(bytes));
    } catch (_) {
      decoded = null;
    }
    if (decoded == null) {
      try {
        final archive = ZipDecoder().decodeBytes(bytes);
        for (final file in archive) {
          if (file.isFile && file.name.endsWith('.json')) {
            decoded = jsonDecode(utf8.decode(file.content as List<int>));
            break;
          }
        }
      } catch (_) {}
    }
    if (decoded is! Map) throw ApiException.badRequest('备份文件无效');
    return import(userId, decoded.map((k, v) => MapEntry(k.toString(), v)),
        ip: ip);
  }

  Uint8List exportZip(
    int userId, {
    bool includeSettings = true,
    bool includeHistory = true,
    bool includeStatistics = true,
  }) {
    final json = const JsonEncoder.withIndent('  ').convert(export(
      userId,
      includeSettings: includeSettings,
      includeHistory: includeHistory,
      includeStatistics: includeStatistics,
    ));
    final archive = Archive();
    final bytes = utf8.encode(json);
    archive.addFile(ArchiveFile('backup.json', bytes.length, bytes));
    return Uint8List.fromList(ZipEncoder().encode(archive));
  }
}

class WebDavService {
  final Config config;
  final LocalRepository repository;
  final BackupService backup;
  final SettingsRepository settings;
  final http.Client client = http.Client();
  final Set<int> _scheduled = {};

  WebDavService({
    required this.config,
    required this.repository,
    required this.backup,
    required this.settings,
  });

  Map<String, Object?> get(int userId) {
    final row = repository.webdav(userId);
    if (row == null) {
      return {
        'configured': false,
        'url': '',
        'username': '',
        'path': '/',
        'autoSync': false,
        'dataVersion': 0,
        'lastBackupName': null,
        'lastAutoBackupAt': null,
        'updatedAt': null,
      };
    }
    return {
      'configured': (row['url'] as String).isNotEmpty,
      'url': row['url'],
      'username': row['username'],
      'path': row['path'],
      'autoSync': row['autoSync'],
      'dataVersion': row['dataVersion'],
      'lastBackupName': row['lastBackupName'],
      'lastAutoBackupAt': row['lastAutoBackupAt'],
      'updatedAt': row['updatedAt'],
    };
  }

  Future<Map<String, Object?>> save(
      int userId, Map<String, Object?> body) async {
    final url = (body['url'] ?? '').toString().trim();
    if (url.isNotEmpty &&
        !(url.startsWith('http://') || url.startsWith('https://'))) {
      throw ApiException.badRequest('WebDAV 地址无效');
    }
    final password = body['password'];
    final existing = repository.webdav(userId);
    String? encrypted = existing?['passwordEnc'] as String?;
    if (password is String && password.isNotEmpty) {
      encrypted =
          await CryptoUtil.encryptSecret(password, config.sessionSecret);
    }
    repository.saveWebdav(
      userId,
      url: url,
      username: (body['username'] ?? '').toString(),
      passwordEnc: encrypted,
      path: (body['path'] ?? '/').toString(),
      autoSync: body['autoSync'] == true,
    );
    return get(userId);
  }

  Future<String?> _password(int userId) async {
    final row = repository.webdav(userId);
    if (row == null) return null;
    return CryptoUtil.decryptSecret(
        row['passwordEnc'] as String?, config.sessionSecret);
  }

  Map<String, String> _headers(String username, String? password) => {
        'Authorization':
            'Basic ${base64Encode(utf8.encode('$username:${password ?? ''}'))}',
      };

  Uri _base(int userId) {
    final row = repository.webdav(userId);
    if (row == null || (row['url'] as String).isEmpty) {
      throw ApiException.badRequest('尚未配置 WebDAV');
    }
    var url = row['url'] as String;
    if (!url.endsWith('/')) url = '$url/';
    return Uri.parse(url);
  }

  Future<Map<String, Object?>> test(int userId) async {
    final row = repository.webdav(userId);
    if (row == null) throw ApiException.badRequest('尚未配置 WebDAV');
    final password = await _password(userId);
    try {
      final response = await client
          .head(_base(userId),
              headers: _headers(row['username'] as String, password))
          .timeout(const Duration(seconds: 20));
      if (response.statusCode >= 200 && response.statusCode < 400) {
        return {'ok': true, 'status': response.statusCode};
      }
      throw ApiException.sourceError('WebDAV 返回 ${response.statusCode}');
    } catch (error) {
      if (error is ApiException) rethrow;
      throw ApiException.sourceError('WebDAV 连接失败：$error');
    }
  }

  Future<Map<String, Object?>> upload(int userId) async {
    final row = repository.webdav(userId);
    if (row == null) throw ApiException.badRequest('尚未配置 WebDAV');
    final password = await _password(userId);
    final bytes = backup.exportZip(
      userId,
      includeSettings:
          settings.get(userId, 'autoBackupIncludeSettings') != false,
      includeHistory: settings.get(userId, 'autoBackupIncludeHistory') != false,
      includeStatistics:
          settings.get(userId, 'autoBackupIncludeStatistics') != false,
    );
    final version = ((row['dataVersion'] as int?) ?? 0) + 1;
    final now = DateTime.now();
    final day = now.millisecondsSinceEpoch ~/ 86400000;
    final name =
        '${day.toString().padLeft(6, '0')}-${version.toString().padLeft(6, '0')}-'
        '${now.microsecondsSinceEpoch.toString().padLeft(20, '0')}-'
        '${CryptoUtil.randomToken(8).replaceAll(RegExp(r'[^A-Za-z0-9]'), '')}.venera';
    final target = _base(userId).resolve(name);
    final response = await client
        .put(target,
            headers: {
              ..._headers(row['username'] as String, password),
              'Content-Type': 'application/octet-stream',
            },
            body: bytes)
        .timeout(const Duration(seconds: 60));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.sourceError('上传失败：${response.statusCode}');
    }
    repository.saveWebdav(
      userId,
      url: row['url'] as String,
      username: row['username'] as String,
      passwordEnc: row['passwordEnc'] as String?,
      path: row['path'] as String? ?? '/',
      autoSync: row['autoSync'] == true,
      dataVersion: version,
      lastBackupName: name,
      lastBackupIdentity: name,
    );
    await _prune(userId, row['username'] as String, password);
    Log.info('WebDAV upload', userId: userId, extra: {'file': name});
    return {'ok': true, 'file': name, 'version': version, 'size': bytes.length};
  }

  Future<Map<String, Object?>> download(int userId) async {
    final row = repository.webdav(userId);
    if (row == null) throw ApiException.badRequest('尚未配置 WebDAV');
    final password = await _password(userId);
    final base = _base(userId);
    final body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop>'
        '<d:displayname/><d:getcontentlength/></d:prop></d:propfind>';
    final request = http.Request('PROPFIND', base)
      ..headers.addAll({
        ..._headers(row['username'] as String, password),
        'Depth': '1',
        'Content-Type': 'application/xml',
      })
      ..body = body;
    final streamed =
        await client.send(request).timeout(const Duration(seconds: 30));
    final text = await streamed.stream.bytesToString();
    if (streamed.statusCode >= 300) {
      throw ApiException.sourceError(
          'WebDAV listing failed: ${streamed.statusCode}');
    }
    final names = <String>[];
    try {
      final doc = XmlDocument.parse(text);
      for (final element in doc.descendants.whereType<XmlElement>()) {
        if (element.name.local != 'href') continue;
        final name = element.innerText.split('/').last;
        if (name.endsWith('.venera') || name.endsWith('.zip')) {
          names.add(name);
        }
      }
    } catch (_) {
      throw ApiException.sourceError('WebDAV 列表无效');
    }
    if (names.isEmpty) {
      throw ApiException.notFound('未找到备份');
    }
    names.sort();
    final newest = names.last;
    final response = await client
        .get(base.resolve(newest),
            headers: _headers(row['username'] as String, password))
        .timeout(const Duration(seconds: 120));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw ApiException.sourceError('下载失败: ${response.statusCode}');
    }
    final data = _decodeBackup(response.bodyBytes);
    final result = await backup.import(userId, data);
    repository.saveWebdav(
      userId,
      url: row['url'] as String,
      username: row['username'] as String,
      passwordEnc: row['passwordEnc'] as String?,
      path: row['path'] as String? ?? '/',
      autoSync: row['autoSync'] == true,
      lastBackupName: newest,
      lastBackupIdentity: newest,
    );
    Log.info('WebDAV download', userId: userId, extra: {'file': newest});
    return {'ok': true, 'file': newest, 'imported': result};
  }

  Map<String, Object?> _decodeBackup(Uint8List bytes) {
    // Try raw JSON first, then a zip containing backup.json.
    try {
      final text = utf8.decode(bytes);
      final decoded = jsonDecode(text);
      if (decoded is Map) {
        return decoded.map((k, v) => MapEntry(k.toString(), v));
      }
    } catch (_) {}
    try {
      final archive = ZipDecoder().decodeBytes(bytes);
      for (final file in archive) {
        if (file.name.endsWith('.json') && file.isFile) {
          final decoded = jsonDecode(utf8.decode(file.content as List<int>));
          if (decoded is Map) {
            return decoded.map((k, v) => MapEntry(k.toString(), v));
          }
        }
      }
    } catch (_) {}
    throw ApiException.badRequest('备份文件无效');
  }

  /// Runs due scheduled backups for every configured WebDAV account. The
  /// server timer calls this hourly; the time of day and the retention count
  /// are user settings.
  Future<void> runScheduledBackups() async {
    for (final userId in repository.usersWithWebdav()) {
      if (_scheduled.contains(userId)) continue;
      final interval =
          (settings.get(userId, 'backupIntervalDays') as num?)?.toInt() ?? 0;
      if (interval <= 0) continue;
      final time = (settings.get(userId, 'backupTime') as String?) ?? '03:00';
      final parts = time.split(':');
      final hour = int.tryParse(parts.isNotEmpty ? parts[0] : '') ?? 3;
      final minute = int.tryParse(parts.length > 1 ? parts[1] : '') ?? 0;
      final now = DateTime.now();
      final today =
          DateTime(now.year, now.month, now.day, hour.clamp(0, 23), minute);
      if (now.isBefore(today)) continue;
      final row = repository.webdav(userId);
      final lastAt = row?['lastAutoBackupAt'] as int?;
      if (lastAt != null &&
          now.difference(DateTime.fromMillisecondsSinceEpoch(lastAt)) <
              Duration(days: interval)) {
        continue;
      }
      _scheduled.add(userId);
      try {
        await upload(userId);
        repository.markAutoBackup(userId, now.millisecondsSinceEpoch);
        Log.info('Scheduled backup completed', userId: userId);
      } catch (error) {
        Log.warning('Scheduled backup failed',
            userId: userId, extra: {'error': '$error'});
      } finally {
        _scheduled.remove(userId);
      }
    }
  }

  Future<void> _prune(int userId, String username, String? password) async {
    try {
      final request = http.Request('PROPFIND', _base(userId))
        ..headers.addAll({
          ..._headers(username, password),
          'Depth': '1',
          'Content-Type': 'application/xml',
        })
        ..body = '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop>'
            '<d:displayname/></d:prop></d:propfind>';
      final streamed =
          await client.send(request).timeout(const Duration(seconds: 20));
      final text = await streamed.stream.bytesToString();
      final names = <String>[];
      final doc = XmlDocument.parse(text);
      for (final element in doc.descendants.whereType<XmlElement>()) {
        if (element.name.local != 'href') continue;
        final name = element.innerText.split('/').last;
        if (name.endsWith('.venera')) names.add(name);
      }
      names.sort();
      final retention =
          ((settings.get(userId, 'backupRetention') as num?)?.toInt() ?? 10)
              .clamp(1, 1000);
      while (names.length > retention) {
        final oldest = names.removeAt(0);
        await client.delete(_base(userId).resolve(oldest),
            headers: _headers(username, password));
      }
    } catch (_) {}
  }
}
