import 'package:test/test.dart';
import 'package:venera_server/util/errors.dart';
import 'package:venera_server/util/path_guard.dart';

import 'dart:io';

void main() {
  late Directory root;
  late PathGuard guard;

  setUp(() {
    root = Directory.systemTemp.createTempSync('path_guard_');
    guard = PathGuard(root.path);
  });

  tearDown(() {
    try {
      root.deleteSync(recursive: true);
    } catch (_) {}
  });

  test('rejects parent traversal', () {
    expect(() => guard.resolveInside(root.path, '../escape'),
        throwsA(isA<ApiException>()));
    expect(() => guard.resolveInside(root.path, 'a/../../escape'),
        throwsA(isA<ApiException>()));
  });

  test('rejects absolute paths outside the root', () {
    expect(() => guard.resolveInside(root.path, '/etc/passwd'),
        throwsA(isA<ApiException>()));
  });

  test('accepts safe nested paths', () {
    final path = guard.resolveInside(root.path, 'user/file.txt');
    expect(path.startsWith(root.path), true);
  });

  test('rejects symlinks', () {
    final target = Directory('${root.path}/outside')..createSync();
    final link = Link('${root.path}/link')..createSync(target.path);
    expect(() => guard.resolveInside(root.path, 'link/file.txt'),
        throwsA(isA<ApiException>()));
    link.deleteSync();
    target.deleteSync();
  });

  test('sanitizes file names', () {
    expect(PathGuard.sanitizeName('../../etc/passwd'), isNot(contains('..')));
    expect(PathGuard.sanitizeName('a/b:c*d?e'), isNot(contains('/')));
    expect(PathGuard.sanitizeName('   '), 'untitled');
  });

  test('refuses to delete outside the root', () async {
    final outside = Directory.systemTemp.createTempSync('outside_');
    expect(() => PathGuard.deleteInside(root.path, outside.path),
        throwsA(isA<ApiException>()));
    outside.deleteSync(recursive: true);
  });

  test('user directories are isolated', () {
    final one = guard.ensureUserDir(1);
    final two = guard.ensureUserDir(2);
    expect(one, isNot(two));
    expect(one.contains('/1'), true);
    expect(two.contains('/2'), true);
  });
}
