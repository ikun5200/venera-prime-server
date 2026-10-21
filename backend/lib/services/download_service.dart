import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:path/path.dart' as p;

import '../config.dart';
import '../repositories/local_repository.dart';
import '../repositories/source_repository.dart';
import '../repositories/user_repository.dart';
import '../util/comic.dart';
import '../util/errors.dart';
import '../util/log.dart';
import '../util/path_guard.dart';
import 'comic_service.dart';
import 'local_service.dart';
import 'source_service.dart';

class _Control {
  bool paused = false;
  bool cancelled = false;
}

class DownloadService {
  final Config config;
  final LocalRepository repository;
  final SourceRepository sources;
  final SettingsRepository settings;
  final SourceService sourceService;
  final ComicService comics;
  final LocalService local;
  final PathGuard paths;
  final Map<String, _Control> _controls = {};
  final Set<String> _running = {};

  DownloadService({
    required this.config,
    required this.repository,
    required this.sources,
    required this.settings,
    required this.sourceService,
    required this.comics,
    required this.local,
    required this.paths,
  });

  List<Map<String, Object?>> list(int userId) => repository.jobs(userId);

  Map<String, Object?> get(int userId, String id) {
    final job = repository.job(userId, id);
    if (job == null) throw ApiException.notFound('未找到下载任务');
    return job;
  }

  Future<Map<String, Object?>> create(
    int userId,
    String sourceKey,
    String comicId, {
    List<String>? chapterIds,
    String? archiveId,
  }) async {
    final source = sourceService.require(userId, sourceKey);
    final info = await comics.comicInfo(userId, sourceKey, comicId);
    final chapters = _chapterEntries(info['chapters']);
    final selected = chapterIds == null || chapterIds.isEmpty
        ? chapters
        : chapters.where((c) => chapterIds.contains(c['id'])).toList();
    if (selected.isEmpty) {
      throw ApiException.badRequest('未选择章节');
    }
    final existing = repository
        .jobs(userId)
        .where((j) =>
            j['comicId'] == comicId &&
            j['sourceKey'] == sourceKey &&
            (j['state'] == 'queued' ||
                j['state'] == 'running' ||
                j['state'] == 'paused'))
        .toList();
    if (existing.isNotEmpty) {
      return existing.first;
    }
    final jobId = repository.createJob(
      userId: userId,
      kind: 'images',
      sourceKey: sourceKey,
      comicId: comicId,
      comicType: comicTypeForSource(sourceKey),
      title: (info['title'] ?? comicId).toString(),
      cover: (info['cover'] ?? '').toString(),
      payload: {
        'chapters': selected,
        'comic': {
          'title': info['title'],
          'subtitle': info['subtitle'],
          'description': info['description'],
          'tags': info['tags'],
          'cover': info['cover'],
        },
        'sourceName': source.name,
      },
      chapters: selected,
      total: selected.length,
    );
    _controls[jobId] = _Control();
    unawaited(_run(userId, jobId));
    return repository.job(userId, jobId)!;
  }

  List<Map<String, Object?>> _chapterEntries(Object? chapters) {
    if (chapters is! Map) return const [];
    final result = <Map<String, Object?>>[];
    void add(String id, String title, [String? group]) {
      result.add({'id': id, 'name': title, 'group': group, 'totalPages': 0});
    }

    for (final entry in chapters.entries) {
      if (entry.value is Map) {
        for (final chapter in (entry.value as Map).entries) {
          add(chapter.key.toString(), chapter.value.toString(),
              entry.key.toString());
        }
      } else {
        add(entry.key.toString(), entry.value.toString());
      }
    }
    return result;
  }

  Future<void> _run(int userId, String jobId) async {
    if (_running.contains(jobId)) return;
    _running.add(jobId);
    final control = _controls.putIfAbsent(jobId, () => _Control());
    final job = repository.job(userId, jobId);
    if (job == null) {
      _running.remove(jobId);
      return;
    }
    try {
      repository.updateJob(jobId, state: 'running', error: '');
      final payload = job['payload'] as Map<String, Object?>;
      final sourceKey = job['sourceKey'] as String;
      final comicId = job['comicId'] as String;
      final title = job['title'] as String;
      final comicMeta = payload['comic'] is Map
          ? (payload['comic'] as Map).map((k, v) => MapEntry(k.toString(), v))
          : <String, Object?>{};
      final directoryName = PathGuard.sanitizeName(title, maxLength: 120);
      final root = local.libraryRoot(userId);
      final comicDir = Directory(p.join(root, directoryName));
      comicDir.createSync(recursive: true);
      final chapters = (payload['chapters'] as List)
          .whereType<Map>()
          .map((m) => m.map((k, v) => MapEntry(k.toString(), v)))
          .toList();
      final chapterMap = <String, Object?>{};
      final downloaded = <String>[];
      final threads =
          ((settings.get(userId, 'downloadThreads') as int?) ?? 5).clamp(1, 16);
      var totalPages = 0;
      var donePages = 0;

      for (var chapterIndex = 0;
          chapterIndex < chapters.length;
          chapterIndex++) {
        if (control.cancelled) break;
        while (control.paused && !control.cancelled) {
          await Future.delayed(const Duration(milliseconds: 300));
        }
        if (control.cancelled) break;
        final chapter = chapters[chapterIndex];
        final chapterId = chapter['id'].toString();
        final chapterName =
            PathGuard.sanitizeName(chapter['name']?.toString() ?? chapterId);
        final chapterDir = Directory(p.join(comicDir.path, chapterName));
        chapterDir.createSync(recursive: true);
        try {
          final imagesResult =
              await comics.chapterImages(userId, sourceKey, comicId, chapterId);
          final images = (imagesResult['images'] as List)
              .map((e) => e.toString())
              .toList();
          repository.updateChapter(jobId, chapterId,
              status: 'running', totalPages: images.length);
          totalPages += images.length;
          repository.updateJob(jobId, total: totalPages);
          var chapterDone = 0;
          final failed = <int>[];
          final queue = List<int>.generate(images.length, (i) => i);
          Future<void> worker() async {
            while (queue.isNotEmpty) {
              if (control.cancelled) return;
              while (control.paused && !control.cancelled) {
                await Future.delayed(const Duration(milliseconds: 300));
              }
              if (control.cancelled) return;
              final index = queue.removeAt(0);
              final target = File(p.join(chapterDir.path,
                  '${(index + 1).toString().padLeft(4, '0')}.jpg'));
              if (target.existsSync() && target.lengthSync() > 0) {
                chapterDone++;
                donePages++;
                continue;
              }
              Object? lastError;
              for (var attempt = 0; attempt < 4; attempt++) {
                try {
                  final result = await comics
                      .image(
                          userId, sourceKey, comicId, chapterId, images[index],
                          persistCache: false)
                      .timeout(const Duration(seconds: 40));
                  final ext = _extensionFor(result.mime);
                  final path = p.join(chapterDir.path,
                      '${(index + 1).toString().padLeft(4, '0')}.$ext');
                  await File(path).writeAsBytes(result.bytes);
                  chapterDone++;
                  donePages++;
                  lastError = null;
                  break;
                } catch (error) {
                  lastError = error;
                  await Future.delayed(Duration(seconds: attempt + 1));
                }
              }
              if (lastError != null) {
                failed.add(index);
              }
              repository.updateChapter(jobId, chapterId,
                  downloadedPages: chapterDone);
              repository.updateJob(jobId,
                  progress: totalPages == 0 ? 0 : donePages / totalPages);
            }
          }

          await Future.wait(
              List.generate(threads.clamp(1, 8), (_) => worker()));
          if (control.cancelled) break;
          if (failed.isEmpty) {
            chapterMap[chapterId] = chapter['name'] ?? chapterId;
            downloaded.add(chapterId);
            repository.updateChapter(jobId, chapterId,
                status: 'completed', downloadedPages: chapterDone);
          } else {
            repository.updateChapter(jobId, chapterId,
                status: 'error', downloadedPages: chapterDone);
            throw ApiException.sourceError(
                '$chapterName 有 ${failed.length} 页下载失败');
          }
        } catch (error) {
          repository.updateChapter(jobId, chapterId, status: 'error');
          repository.updateJob(jobId, state: 'error', error: error.toString());
          return;
        }
      }

      if (control.cancelled) {
        repository.updateJob(jobId, state: 'cancelled');
        try {
          await PathGuard.deleteInside(root, comicDir.path);
        } catch (_) {}
        return;
      }

      // Cover.
      String cover = '';
      final coverUrl = (comicMeta['cover'] ?? '').toString();
      if (coverUrl.isNotEmpty) {
        try {
          final bytes = await comics.cover(userId, coverUrl);
          final ext = _extensionFor(bytes.mime);
          final coverFile = File(p.join(comicDir.path, 'cover.$ext'));
          await coverFile.writeAsBytes(bytes.bytes);
          cover = 'cover.$ext';
        } catch (_) {}
      }

      final localId = local.registerDownloaded(
        userId: userId,
        title: title,
        directory: directoryName,
        chapters: chapterMap,
        comicType: comicTypeForSource(sourceKey),
        sourceKey: sourceKey,
        comicId: comicId,
        cover: cover,
        downloadedChapters: downloaded,
      );
      repository.updateJob(jobId, state: 'completed', progress: 1, error: '');
      Log.info('Download completed',
          userId: userId, extra: {'job': jobId, 'localComic': localId});
    } catch (error, stack) {
      repository.updateJob(jobId, state: 'error', error: error.toString());
      Log.error('Download failed',
          userId: userId, error: error, stack: stack, extra: {'job': jobId});
    } finally {
      _running.remove(jobId);
      _controls.remove(jobId);
    }
  }

  String _extensionFor(String mime) {
    if (mime.contains('png')) return 'png';
    if (mime.contains('webp')) return 'webp';
    if (mime.contains('gif')) return 'gif';
    if (mime.contains('avif')) return 'avif';
    if (mime.contains('bmp')) return 'bmp';
    return 'jpg';
  }

  void pause(int userId, String id) {
    get(userId, id);
    final control = _controls.putIfAbsent(id, () => _Control());
    control.paused = true;
    repository.updateJob(id, state: 'paused');
  }

  void resume(int userId, String id) {
    get(userId, id);
    final control = _controls.putIfAbsent(id, () => _Control());
    control.paused = false;
    repository.updateJob(id, state: 'queued');
    unawaited(_run(userId, id));
  }

  void retry(int userId, String id) {
    get(userId, id);
    final control = _controls.putIfAbsent(id, () => _Control());
    control.paused = false;
    control.cancelled = false;
    repository.updateJob(id, state: 'queued', error: '');
    unawaited(_run(userId, id));
  }

  void cancel(int userId, String id) {
    get(userId, id);
    final control = _controls.putIfAbsent(id, () => _Control());
    control.cancelled = true;
    repository.updateJob(id, state: 'cancelled');
  }

  void moveToFirst(int userId, String id) {
    get(userId, id);
    repository.db.execute(
      'UPDATE download_jobs SET created_at = ? WHERE user_id=? AND id=?',
      [0, userId, id],
    );
  }

  /// Zips already-downloaded files for a local comic chapter selection.
  Future<({Uint8List bytes, String filename})> localArchive(
    int userId,
    int localComicId, {
    List<String>? chapterIds,
  }) async {
    final comic = repository.db.select(
        'SELECT * FROM local_comics WHERE user_id=? AND id=?',
        [userId, localComicId]);
    if (comic.isEmpty) throw ApiException.notFound('未找到本地漫画');
    final localComic = local.get(userId, localComicId)!;
    final chapters = (localComic['chapterList'] as List)
        .whereType<Map>()
        .where((c) => chapterIds == null || chapterIds.contains(c['id']))
        .toList();
    final archive = Archive();
    for (final chapter in chapters) {
      final files =
          local.chapterFiles(userId, localComicId, chapter['id'] as String);
      for (var i = 0; i < files.length; i++) {
        final name = '${chapter['title']}/${(i + 1).toString().padLeft(4, '0')}'
            '${p.extension(files[i].path)}';
        archive.addFile(ArchiveFile(
            name, files[i].lengthSync(), await files[i].readAsBytes()));
      }
    }
    final bytes = ZipEncoder().encode(archive);
    return (
      bytes: Uint8List.fromList(bytes),
      filename: '${PathGuard.sanitizeName(localComic['title'].toString())}.zip'
    );
  }

  /// Downloads selected chapters directly to the browser without storing them.
  Future<({Uint8List bytes, String filename})> browserArchive(
    int userId,
    String sourceKey,
    String comicId, {
    List<String>? chapterIds,
  }) async {
    final info = await comics.comicInfo(userId, sourceKey, comicId);
    final chapters = _chapterEntries(info['chapters'])
        .where((c) => chapterIds == null || chapterIds.contains(c['id']))
        .toList();
    if (chapters.isEmpty) throw ApiException.badRequest('未选择章节');
    final archive = Archive();
    for (final chapter in chapters) {
      final imagesResult = await comics.chapterImages(
          userId, sourceKey, comicId, chapter['id'] as String);
      final images =
          (imagesResult['images'] as List).map((e) => e.toString()).toList();
      for (var i = 0; i < images.length; i++) {
        final result = await comics
            .image(
                userId, sourceKey, comicId, chapter['id'] as String, images[i],
                persistCache: false)
            .timeout(const Duration(seconds: 40));
        final name = '${PathGuard.sanitizeName(chapter['name'] as String)}/'
            '${(i + 1).toString().padLeft(4, '0')}.${_extensionFor(result.mime)}';
        archive.addFile(ArchiveFile(name, result.bytes.length, result.bytes));
      }
    }
    final bytes = ZipEncoder().encode(archive);
    return (
      bytes: Uint8List.fromList(bytes),
      filename: '${PathGuard.sanitizeName(info['title'].toString())}.zip'
    );
  }
}
