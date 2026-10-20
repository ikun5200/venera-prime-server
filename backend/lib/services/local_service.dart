import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:collection/collection.dart';
import 'package:path/path.dart' as p;
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:xml/xml.dart';

import '../db/database.dart';
import '../repositories/library_repository.dart';
import '../repositories/local_repository.dart';
import '../util/errors.dart';
import '../util/path_guard.dart';

const Set<String> imageExtensions = {
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'jpe',
  'avif',
  'bmp',
};

bool isImageFile(String name) {
  final ext = p.extension(name).replaceFirst('.', '').toLowerCase();
  return imageExtensions.contains(ext);
}

int naturalCompare(String a, String b) {
  final regex = RegExp(r'(\d+)|(\D+)');
  final left = regex.allMatches(a).map((m) => m[0]!).toList();
  final right = regex.allMatches(b).map((m) => m[0]!).toList();
  for (var i = 0; i < left.length && i < right.length; i++) {
    final l = int.tryParse(left[i]);
    final r = int.tryParse(right[i]);
    if (l != null && r != null) {
      if (l != r) return l.compareTo(r);
    } else {
      final cmp = left[i].toLowerCase().compareTo(right[i].toLowerCase());
      if (cmp != 0) return cmp;
    }
  }
  return left.length.compareTo(right.length);
}

class LocalService {
  final Db db;
  final LocalRepository repository;
  final HistoryRepository history;
  final FavoriteRepository favorites;
  final PathGuard paths;

  LocalService({
    required this.db,
    required this.repository,
    required this.history,
    required this.favorites,
    required this.paths,
  });

  String libraryRoot(int userId) => paths.ensureUserDir(userId, 'library');

  List<Map<String, Object?>> list(int userId,
          {String? query, String sort = 'name'}) =>
      repository
          .list(userId, query: query, sort: sort)
          .map((c) => _comicJson(userId, c))
          .toList();

  Map<String, Object?>? get(int userId, int id) {
    final comic = repository.get(userId, id);
    if (comic == null) return null;
    return _comicJson(userId, comic);
  }

  Map<String, Object?> _comicJson(int userId, LocalComicRecord comic) {
    final chapters = _chapterList(comic);
    return {
      ...comic.toJson(),
      'chapterList': chapters,
      'coverUrl':
          comic.cover.isEmpty ? null : '/api/local-comics/${comic.id}/cover',
    };
  }

  List<Map<String, Object?>> _chapterList(LocalComicRecord comic) {
    final chapters = comic.chapters;
    final downloaded =
        comic.downloadedChapters.map((e) => e.toString()).toSet();
    final result = <Map<String, Object?>>[];
    var index = 1;
    void add(String id, String title, [String? group]) {
      result.add({
        'id': id,
        'title': title,
        'group': group,
        'index': index++,
        'downloaded': downloaded.isEmpty || downloaded.contains(id),
      });
    }

    for (final entry in chapters.entries) {
      if (entry.value is Map) {
        final group = entry.value as Map;
        for (final chapter in group.entries) {
          add(chapter.key.toString(), chapter.value.toString(), entry.key);
        }
      } else {
        add(entry.key.toString(), entry.value.toString());
      }
    }
    return result;
  }

  List<File> chapterFiles(int userId, int id, String chapterId) {
    final comic = repository.get(userId, id);
    if (comic == null) throw ApiException.notFound('Local comic not found');
    final root = libraryRoot(userId);
    final dir = Directory(paths.resolveInside(root, comic.directory));
    Directory target = dir;
    // Chapter may be a subdirectory (by id or sanitized title).
    final chapters = comic.chapters;
    String? title;
    if (chapters[chapterId] is Map) {
      final group = chapters[chapterId] as Map;
      title = group[chapterId]?.toString();
    } else if (chapters[chapterId] != null) {
      title = chapters[chapterId].toString();
    }
    for (final candidate in [
      if (title != null) PathGuard.sanitizeName(title),
      chapterId,
    ]) {
      final sub = Directory(p.join(dir.path, candidate));
      if (sub.existsSync()) {
        target = sub;
        break;
      }
    }
    if (!target.existsSync()) {
      throw ApiException.notFound('Chapter not found');
    }
    final files = target
        .listSync()
        .whereType<File>()
        .where(
            (f) => isImageFile(f.path) && !p.basename(f.path).startsWith('.'))
        .toList()
      ..sort((a, b) => naturalCompare(p.basename(a.path), p.basename(b.path)));
    return files;
  }

  Future<Map<String, Object?>> chapterImages(
      int userId, int id, String chapterId) async {
    final files = chapterFiles(userId, id, chapterId);
    return {
      'images': files.map((f) => p.basename(f.path)).toList(),
      'total': files.length,
    };
  }

  Future<({Uint8List bytes, String mime})> image(
      int userId, int id, String chapterId, int pageIndex) async {
    final files = chapterFiles(userId, id, chapterId);
    if (pageIndex < 0 || pageIndex >= files.length) {
      throw ApiException.notFound('Image not found');
    }
    final file = files[pageIndex];
    return (bytes: await file.readAsBytes(), mime: _mimeFor(file.path));
  }

  Future<({Uint8List bytes, String mime})> cover(int userId, int id) async {
    final comic = repository.get(userId, id);
    if (comic == null) throw ApiException.notFound('Local comic not found');
    final root = libraryRoot(userId);
    if (comic.cover.isNotEmpty) {
      final file =
          File(paths.resolveInside(root, p.join(comic.directory, comic.cover)));
      if (file.existsSync()) {
        return (bytes: await file.readAsBytes(), mime: _mimeFor(file.path));
      }
    }
    // Fallback: first image of the first chapter.
    try {
      final chapters = _chapterList(comic);
      if (chapters.isNotEmpty) {
        final files = chapterFiles(userId, id, chapters.first['id'] as String);
        if (files.isNotEmpty) {
          return (
            bytes: await files.first.readAsBytes(),
            mime: _mimeFor(files.first.path)
          );
        }
      }
    } catch (_) {}
    throw ApiException.notFound('Cover not found');
  }

  String _mimeFor(String path) {
    final ext = p.extension(path).replaceFirst('.', '').toLowerCase();
    return switch (ext) {
      'png' => 'image/png',
      'webp' => 'image/webp',
      'gif' => 'image/gif',
      'avif' => 'image/avif',
      'bmp' => 'image/bmp',
      _ => 'image/jpeg',
    };
  }

  Future<void> deleteComic(int userId, int id,
      {bool removeFiles = false, bool removeFavorites = true}) async {
    final comic = repository.get(userId, id);
    if (comic == null) throw ApiException.notFound('Local comic not found');
    if (removeFiles && comic.managedByApp) {
      final root = libraryRoot(userId);
      final target = paths.resolveInside(root, comic.directory);
      await PathGuard.deleteInside(root, target);
    }
    repository.delete(userId, id);
    if (removeFavorites) {
      history.delete(
          userId, comic.comicIdExt ?? comic.id.toString(), comic.comicType);
      favorites.removeFromAll(
          userId, comic.comicIdExt ?? comic.id.toString(), comic.comicType);
    }
  }

  Future<void> deleteChapters(
      int userId, int id, List<String> chapterIds) async {
    final comic = repository.get(userId, id);
    if (comic == null) throw ApiException.notFound('Local comic not found');
    final root = libraryRoot(userId);
    final dir = Directory(paths.resolveInside(root, comic.directory));
    for (final chapterId in chapterIds) {
      final chapters = comic.chapters;
      String? title;
      if (chapters[chapterId] is Map) {
        final group = chapters[chapterId] as Map;
        title = group[chapterId]?.toString();
      } else if (chapters[chapterId] != null) {
        title = chapters[chapterId].toString();
      }
      for (final candidate in [
        if (title != null) PathGuard.sanitizeName(title),
        chapterId,
      ]) {
        final sub = Directory(p.join(dir.path, candidate));
        if (sub.existsSync()) {
          await PathGuard.deleteInside(root, sub.path);
        }
      }
    }
    final chapters = Map<String, Object?>.from(comic.chapters);
    chapters.removeWhere((key, value) {
      if (value is Map) {
        value.removeWhere((k, v) => chapterIds.contains(k.toString()));
        return value.isEmpty;
      }
      return chapterIds.contains(key);
    });
    final downloaded = comic.downloadedChapters
        .map((e) => e.toString())
        .where((id) => !chapterIds.contains(id))
        .toList();
    repository.updateChapters(userId, id,
        chapters: chapters, downloadedChapters: downloaded);
  }

  /// Registers (or updates) a comic produced by the server-side downloader.
  int registerDownloaded({
    required int userId,
    required String title,
    required String directory,
    required Map<String, Object?> chapters,
    required int comicType,
    required String sourceKey,
    required String comicId,
    String cover = '',
    List<String>? downloadedChapters,
  }) {
    final existing = repository.findByExt(userId, comicType, comicId);
    if (existing != null) {
      repository.updateChapters(
        userId,
        existing.id,
        chapters: chapters,
        downloadedChapters: downloadedChapters,
        directory: directory,
        cover: cover.isEmpty ? null : cover,
      );
      return existing.id;
    }
    return repository.create(
      userId: userId,
      title: title,
      directory: directory,
      chapters: chapters,
      cover: cover,
      comicType: comicType,
      sourceKey: sourceKey,
      comicIdExt: comicId,
      downloadedChapters: downloadedChapters ?? chapters.keys.toList(),
      managedByApp: true,
    );
  }

  // ---- import -----------------------------------------------------------

  Future<Map<String, Object?>> importArchive(
    int userId,
    Uint8List bytes,
    String fileName, {
    bool addToFavorites = false,
    int? favoriteFolderId,
  }) async {
    if (bytes.length > 512 * 1024 * 1024) {
      throw ApiException.payloadTooLarge('Archive is too large');
    }
    final baseName = PathGuard.sanitizeFileName(
        p.basenameWithoutExtension(fileName).isEmpty
            ? 'comic'
            : p.basenameWithoutExtension(fileName));
    final root = libraryRoot(userId);
    var directoryName = baseName;
    var counter = 1;
    while (Directory(p.join(root, directoryName)).existsSync()) {
      directoryName = '$baseName($counter)';
      counter++;
    }
    final targetDir = Directory(p.join(root, directoryName));
    targetDir.createSync(recursive: true);
    try {
      final archive = ZipDecoder().decodeBytes(bytes, verify: false);
      _validateArchive(archive);
      var total = 0;
      var count = 0;
      for (final entry in archive) {
        if (!entry.isFile) continue;
        count++;
        if (count > 20000)
          throw ApiException.badRequest('Too many archive entries');
        final name = _safeArchiveName(entry.name);
        if (name == null) continue;
        final content = entry.content;
        total += content.length;
        if (content.length > 256 * 1024 * 1024) {
          throw ApiException.payloadTooLarge('Archive entry is too large');
        }
        if (total > 1024 * 1024 * 1024) {
          throw ApiException.payloadTooLarge('Archive expands beyond 1 GiB');
        }
        final target = File(p.join(targetDir.path, name));
        if (!p.isWithin(targetDir.path, target.path)) continue;
        target.parent.createSync(recursive: true);
        target.writeAsBytesSync(content);
      }
      final comicId = _registerDirectory(userId, targetDir.path,
          addToFavorites: addToFavorites, favoriteFolderId: favoriteFolderId);
      return get(userId, comicId)!;
    } catch (error) {
      try {
        await PathGuard.deleteInside(root, targetDir.path);
      } catch (_) {}
      if (error is ApiException) rethrow;
      throw ApiException.badRequest('Failed to import archive: $error');
    }
  }

  void _validateArchive(Archive archive) {
    var total = 0;
    final names = <String>{};
    for (final entry in archive) {
      if (!entry.isFile) continue;
      final name = entry.name;
      if (name.contains('..') ||
          name.startsWith('/') ||
          RegExp(r'^[A-Za-z]:').hasMatch(name)) {
        throw ApiException.badRequest('Unsafe archive path: $name');
      }
      if (!names.add(name)) {
        throw ApiException.badRequest('Duplicate archive entry: $name');
      }
      final content = entry.content;
      total += content.length;
      if (content.length > 256 * 1024 * 1024) {
        throw ApiException.payloadTooLarge('Archive entry is too large');
      }
      if (total > 1024 * 1024 * 1024) {
        throw ApiException.payloadTooLarge('Archive expands beyond 1 GiB');
      }
    }
  }

  String? _safeArchiveName(String raw) {
    final normalized = raw.replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.contains('..')) return null;
    final parts = normalized
        .split('/')
        .where((s) => s.isNotEmpty && s != '.')
        .map((s) => PathGuard.sanitizeName(s, maxLength: 120))
        .toList();
    if (parts.isEmpty) return null;
    return parts.join('/');
  }

  /// Scans [directory] and registers it as a local comic.
  int _registerDirectory(int userId, String directory,
      {bool addToFavorites = false, int? favoriteFolderId}) {
    final root = libraryRoot(userId);
    final relative = p.relative(directory, from: root);
    final dir = Directory(directory);
    final rootImages = dir
        .listSync()
        .whereType<File>()
        .where(
            (f) => isImageFile(f.path) && !p.basename(f.path).startsWith('.'))
        .toList()
      ..sort((a, b) => naturalCompare(p.basename(a.path), p.basename(b.path)));
    final chapterDirs = dir
        .listSync()
        .whereType<Directory>()
        .where((d) =>
            d.listSync().whereType<File>().any((f) => isImageFile(f.path)))
        .toList()
      ..sort((a, b) => naturalCompare(p.basename(a.path), p.basename(b.path)));
    final metadata = _readMetadata(dir);
    final title = metadata['title']?.toString().isNotEmpty == true
        ? metadata['title'].toString()
        : p.basename(directory);
    final chapters = <String, Object?>{};
    if (chapterDirs.isNotEmpty) {
      for (var i = 0; i < chapterDirs.length; i++) {
        final name = p.basename(chapterDirs[i].path);
        chapters['${i + 1}'] = name;
      }
    } else {
      chapters['1'] = 'Chapter 1';
    }
    String cover = '';
    final coverFile = rootImages
        .where(
            (f) => p.basenameWithoutExtension(f.path).toLowerCase() == 'cover')
        .firstOrNull;
    if (coverFile != null) {
      cover = p.relative(coverFile.path, from: directory);
    } else if (rootImages.isNotEmpty) {
      cover = p.relative(rootImages.first.path, from: directory);
    } else if (chapterDirs.isNotEmpty) {
      final images = chapterDirs.first
          .listSync()
          .whereType<File>()
          .where((f) => isImageFile(f.path))
          .toList()
        ..sort(
            (a, b) => naturalCompare(p.basename(a.path), p.basename(b.path)));
      if (images.isNotEmpty) {
        cover = p.relative(images.first.path, from: directory);
      }
    }
    final existing = repository.findByTitle(userId, title);
    if (existing != null) {
      repository.updateChapters(userId, existing.id,
          chapters: chapters, directory: relative, cover: cover);
      return existing.id;
    }
    final id = repository.create(
      userId: userId,
      title: title,
      subtitle: metadata['author']?.toString() ?? '',
      description: metadata['description']?.toString() ?? '',
      tags: metadata['tags'] is List ? metadata['tags'] as List : const [],
      directory: relative,
      chapters: chapters,
      cover: cover,
      comicType: 0,
      downloadedChapters: chapters.keys.toList(),
      managedByApp: true,
    );
    if (addToFavorites) {
      final folderId = favoriteFolderId ??
          (favorites.folders(userId).isNotEmpty
              ? favorites.folders(userId).first['id'] as int
              : favorites.createFolder(userId, 'Default'));
      favorites.addFavorite(userId, folderId, {
        'id': 'local:$id',
        'comicType': 0,
        'title': title,
        'subtitle': metadata['author']?.toString() ?? '',
        'cover': '',
        'tags': metadata['tags'],
      });
    }
    return id;
  }

  Map<String, Object?> _readMetadata(Directory dir) {
    final result = <String, Object?>{};
    final jsonFile = File(p.join(dir.path, 'metadata.json'));
    if (jsonFile.existsSync()) {
      try {
        final decoded = jsonDecode(jsonFile.readAsStringSync());
        if (decoded is Map) {
          result['title'] = decoded['title'] ?? decoded['Title'];
          result['author'] = decoded['author'] ?? decoded['Author'];
          result['description'] = decoded['description'] ?? decoded['summary'];
          final tags = decoded['tags'];
          result['tags'] = tags is List
              ? tags
              : tags is String
                  ? tags.split(RegExp(r'[,;]')).map((e) => e.trim()).toList()
                  : const [];
        }
      } catch (_) {}
    }
    final xmlFile = File(p.join(dir.path, 'ComicInfo.xml'));
    if (xmlFile.existsSync()) {
      try {
        final doc = XmlDocument.parse(xmlFile.readAsStringSync());
        String? text(String name) =>
            doc.findAllElements(name).firstOrNull?.innerText;
        result['title'] ??= text('Title');
        result['author'] ??= text('Writer') ?? text('Penciller');
        result['description'] ??= text('Summary');
        final genre = text('Genre');
        if (genre != null && genre.isNotEmpty) {
          result['tags'] = genre.split(',').map((e) => e.trim()).toList();
        }
      } catch (_) {}
    }
    return result;
  }

  Future<void> refreshLibrary(int userId) async {
    final root = Directory(libraryRoot(userId));
    for (final dir in root.listSync().whereType<Directory>()) {
      if (p.basename(dir.path).startsWith('.')) continue;
      final hasImages = dir.listSync(recursive: true).whereType<File>().any(
          (f) => isImageFile(f.path) && !p.basename(f.path).startsWith('.'));
      if (hasImages) _registerDirectory(userId, dir.path);
    }
  }

  // ---- export -----------------------------------------------------------

  Future<Uint8List> export(int userId, int id, String format) async {
    final comic = repository.get(userId, id);
    if (comic == null) throw ApiException.notFound('Local comic not found');
    final chapters = _chapterList(comic);
    final images = <({String name, Uint8List bytes})>[];
    for (final chapter in chapters) {
      final files = chapterFiles(userId, id, chapter['id'] as String);
      for (var i = 0; i < files.length; i++) {
        images.add((
          name: '${chapter['id']}_${(i + 1).toString().padLeft(4, '0')}'
              '${p.extension(files[i].path)}',
          bytes: await files[i].readAsBytes(),
        ));
      }
    }
    return switch (format) {
      'pdf' => _exportPdf(images),
      'epub' => _exportEpub(comic.title, chapters, images),
      _ => _exportCbz(comic.title, images),
    };
  }

  Uint8List _exportCbz(
      String title, List<({String name, Uint8List bytes})> images) {
    final archive = Archive();
    for (final image in images) {
      archive.addFile(ArchiveFile(image.name, image.bytes.length, image.bytes));
    }
    final info = '<?xml version="1.0" encoding="utf-8"?>\n'
        '<ComicInfo><Title>${_xmlEscape(title)}</Title></ComicInfo>';
    archive
        .addFile(ArchiveFile('ComicInfo.xml', info.length, utf8.encode(info)));
    final data = ZipEncoder().encode(archive);
    return Uint8List.fromList(data);
  }

  Future<Uint8List> _exportPdf(
      List<({String name, Uint8List bytes})> images) async {
    final doc = pw.Document();
    for (final image in images) {
      final isJpeg = image.bytes.length > 2 &&
          image.bytes[0] == 0xff &&
          image.bytes[1] == 0xd8;
      final isPng = image.bytes.length > 8 &&
          image.bytes[0] == 0x89 &&
          image.bytes[1] == 0x50 &&
          image.bytes[2] == 0x4e &&
          image.bytes[3] == 0x47;
      if (!isJpeg && !isPng) continue;
      doc.addPage(
        pw.Page(
          pageFormat: PdfPageFormat.a4,
          margin: const pw.EdgeInsets.all(8),
          build: (context) => pw.Center(
            child:
                pw.Image(pw.MemoryImage(image.bytes), fit: pw.BoxFit.contain),
          ),
        ),
      );
    }
    final bytes = await doc.save();
    return Uint8List.fromList(bytes);
  }

  Uint8List _exportEpub(
    String title,
    List<Map<String, Object?>> chapters,
    List<({String name, Uint8List bytes})> images,
  ) {
    final archive = Archive();
    void add(String name, List<int> bytes, {bool store = false}) {
      archive.addFile(ArchiveFile(name, bytes.length, bytes));
    }

    add('mimetype', utf8.encode('application/epub+zip'), store: true);
    add(
        'META-INF/container.xml',
        utf8.encode('<?xml version="1.0"?><container version="1.0" '
            'xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
            '<rootfiles><rootfile full-path="OEBPS/content.opf" '
            'media-type="application/oebps-package+xml"/></rootfiles></container>'));
    final manifest = StringBuffer();
    final spine = StringBuffer();
    final navPoints = StringBuffer();
    var chapterIndex = 0;
    for (final chapter in chapters) {
      chapterIndex++;
      final chapterImages =
          images.where((i) => i.name.startsWith('${chapter['id']}_')).toList();
      final html = StringBuffer(
          '<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>${_xmlEscape(chapter['title'].toString())}</title></head><body>');
      for (var i = 0; i < chapterImages.length; i++) {
        final name = 'images/${chapterImages[i].name}';
        add('OEBPS/$name', chapterImages[i].bytes);
        manifest.writeln(
            '<item id="img_${chapterIndex}_$i" href="$name" media-type="image/jpeg"/>');
        html.write('<img src="$name" alt="page"/>');
      }
      html.write('</body></html>');
      final fileName = 'chapter_$chapterIndex.xhtml';
      add('OEBPS/$fileName', utf8.encode(html.toString()));
      manifest.writeln(
          '<item id="ch_$chapterIndex" href="$fileName" media-type="application/xhtml+xml"/>');
      spine.writeln('<itemref idref="ch_$chapterIndex"/>');
      navPoints.writeln(
          '<navPoint id="nav_$chapterIndex" playOrder="$chapterIndex"><navLabel><text>${_xmlEscape(chapter['title'].toString())}</text></navLabel><content src="$fileName"/></navPoint>');
    }
    final opf = '<?xml version="1.0" encoding="utf-8"?>'
        '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">'
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
        '<dc:title>${_xmlEscape(title)}</dc:title><dc:identifier id="bookid">venera-${DateTime.now().millisecondsSinceEpoch}</dc:identifier>'
        '</metadata><manifest>'
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
        '$manifest</manifest><spine toc="ncx">$spine</spine></package>';
    add('OEBPS/content.opf', utf8.encode(opf));
    final ncx = '<?xml version="1.0" encoding="utf-8"?>'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">'
        '<head><meta name="dtb:uid" content="venera"/></head><docTitle><text>${_xmlEscape(title)}</text></docTitle>'
        '<navMap>$navPoints</navMap></ncx>';
    add('OEBPS/toc.ncx', utf8.encode(ncx));
    final data = ZipEncoder().encode(archive);
    return Uint8List.fromList(data);
  }

  String _xmlEscape(String value) => value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');

  // ---- uploads ----------------------------------------------------------

  String uploadDir(int userId) => paths.ensureUserDir(userId, 'uploads');

  Map<String, Object?> initUpload(
      int userId, String name, int size, String mime) {
    if (size < 0) throw ApiException.badRequest('Invalid size');
    final safeName = PathGuard.sanitizeFileName(name);
    final id =
        'up_${DateTime.now().millisecondsSinceEpoch}_${size.toRadixString(16)}';
    final dir = Directory(uploadDir(userId));
    final path = p.join(dir.path, '$id.part');
    File(path).createSync(recursive: true);
    repository.createUpload(
      id: id,
      userId: userId,
      name: safeName,
      path: p.relative(path, from: paths.ensureUserDir(userId)),
      size: size,
      mime: mime,
    );
    return {'uploadId': id, 'offset': 0};
  }

  Future<Map<String, Object?>> writeChunk(
      int userId, String uploadId, int offset, List<int> bytes) async {
    final upload = repository.upload(userId, uploadId);
    if (upload == null) throw ApiException.notFound('Upload not found');
    final path = paths.resolveInside(
        paths.ensureUserDir(userId), upload['path'] as String);
    final file = File(path);
    final current = file.existsSync() ? file.lengthSync() : 0;
    if (offset != current) {
      return {'offset': current, 'received': current};
    }
    final total = (upload['size'] as int);
    if (current + bytes.length > total) {
      throw ApiException.badRequest('Upload exceeds declared size');
    }
    final raf = file.openSync(mode: FileMode.append);
    raf.writeFromSync(bytes);
    raf.closeSync();
    final received = current + bytes.length;
    repository.updateUpload(uploadId,
        received: received, completed: received >= total);
    return {'offset': received, 'received': received, 'size': total};
  }

  Future<Map<String, Object?>> completeUpload(int userId, String uploadId,
      {bool import = false}) async {
    final upload = repository.upload(userId, uploadId);
    if (upload == null) throw ApiException.notFound('Upload not found');
    final path = paths.resolveInside(
        paths.ensureUserDir(userId), upload['path'] as String);
    final file = File(path);
    if (!file.existsSync()) throw ApiException.notFound('Upload file missing');
    final received = file.lengthSync();
    if (received != upload['size']) {
      throw ApiException.badRequest(
          'Upload incomplete: $received of ${upload['size']} bytes');
    }
    repository.updateUpload(uploadId, completed: true, received: received);
    if (!import) {
      return {'upload': repository.upload(userId, uploadId)};
    }
    final bytes = await file.readAsBytes();
    final comic = await importArchive(userId, bytes, upload['name'] as String);
    return {'upload': repository.upload(userId, uploadId), 'comic': comic};
  }

  Future<void> deleteUpload(int userId, String uploadId) async {
    final upload = repository.upload(userId, uploadId);
    if (upload == null) return;
    final path = paths.resolveInside(
        paths.ensureUserDir(userId), upload['path'] as String);
    final file = File(path);
    if (file.existsSync()) await file.delete();
    repository.deleteUpload(userId, uploadId);
  }

  List<Map<String, Object?>> uploads(int userId) => repository.uploads(userId);
}
