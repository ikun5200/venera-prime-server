import 'dart:io';

import 'package:path/path.dart' as p;

import 'errors.dart';

/// Filesystem sandbox for per-user data.
class PathGuard {
  final String dataDir;
  PathGuard(this.dataDir);

  String get absoluteDataDir => p.normalize(p.absolute(dataDir));

  String userRoot(int userId) =>
      p.join(absoluteDataDir, 'users', userId.toString());

  String ensureUserDir(int userId, [String? sub]) {
    final dir = sub == null
        ? Directory(userRoot(userId))
        : Directory(p.join(userRoot(userId), sub));
    dir.createSync(recursive: true);
    return dir.path;
  }

  /// Resolves [relative] inside [root], rejecting absolute paths, `..`
  /// traversal and symlinks that escape the root.
  String resolveInside(String root, String relative) {
    if (relative.contains('\u0000')) {
      throw ApiException.badRequest('Invalid path');
    }
    final normalizedRoot = p.normalize(p.absolute(root));
    final candidate = p.normalize(p.absolute(p.join(normalizedRoot, relative)));
    if (candidate != normalizedRoot &&
        !p.isWithin(normalizedRoot, candidate)) {
      throw ApiException.badRequest('Path escapes user directory');
    }
    // Reject symlinked ancestors.
    var current = normalizedRoot;
    final relativePart = p.relative(candidate, from: normalizedRoot);
    for (final segment in p.split(relativePart)) {
      if (segment == '.' || segment.isEmpty) continue;
      current = p.join(current, segment);
      final type = FileSystemEntity.typeSync(current, followLinks: false);
      if (type == FileSystemEntityType.link) {
        throw ApiException.badRequest('Symlinks are not allowed');
      }
    }
    return candidate;
  }

  /// Sanitizes a display name into a safe single path segment.
  static String sanitizeName(String name, {int maxLength = 180}) {
    var value = name
        .replaceAll(RegExp(r'[/\\:*?"<>|\u0000-\u001f]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    value = value.replaceAll(RegExp(r'\.{2,}'), '.');
    value = value.replaceAll(RegExp(r'[. ]+$'), '');
    if (value.isEmpty) value = 'untitled';
    if (value.length > maxLength) value = value.substring(0, maxLength).trim();
    if (value == '.' || value == '..') value = 'untitled';
    return value;
  }

  static String sanitizeFileName(String name) {
    final base = p.basename(name.replaceAll('\\', '/'));
    return sanitizeName(base, maxLength: 200);
  }

  static String uniquePath(String directory, String fileName) {
    final ext = p.extension(fileName);
    final base = p.basenameWithoutExtension(fileName);
    var candidate = p.join(directory, fileName);
    var index = 1;
    while (FileSystemEntity.typeSync(candidate) !=
        FileSystemEntityType.notFound) {
      candidate = p.join(directory, '$base($index)$ext');
      index++;
    }
    return candidate;
  }

  /// Deletes a directory only if it is inside [root].
  static Future<void> deleteInside(String root, String target) async {
    final normalizedRoot = p.normalize(p.absolute(root));
    final normalizedTarget = p.normalize(p.absolute(target));
    if (normalizedTarget == normalizedRoot ||
        !p.isWithin(normalizedRoot, normalizedTarget)) {
      throw ApiException.badRequest('Refusing to delete outside user root');
    }
    final type =
        FileSystemEntity.typeSync(normalizedTarget, followLinks: false);
    if (type == FileSystemEntityType.notFound) return;
    if (type == FileSystemEntityType.link) {
      File(normalizedTarget).deleteSync();
      return;
    }
    if (type == FileSystemEntityType.directory) {
      await Directory(normalizedTarget).delete(recursive: true);
    } else {
      await File(normalizedTarget).delete();
    }
  }
}
