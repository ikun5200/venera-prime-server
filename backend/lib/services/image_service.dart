import 'dart:io';
import 'dart:isolate';
import 'dart:typed_data';

import 'package:image/image.dart' as img;
import 'package:path/path.dart' as p;

import '../config.dart';
import '../repositories/user_repository.dart';
import '../util/crypto.dart';
import '../util/log.dart';

Uint8List? _encodeWebp(({Uint8List bytes, int quality, int maxWidth}) input) {
  try {
    var image = img.decodeImage(input.bytes);
    if (image == null) return null;
    if (input.maxWidth > 0 && image.width > input.maxWidth) {
      image = img.copyResize(image, width: input.maxWidth);
    }
    return img.encodeWebP(image, quality: input.quality.clamp(1, 100));
  } catch (_) {
    return null;
  }
}

/// Converts images to WebP on demand and caches the result on disk.
///
/// The original image cache keeps its bytes untouched, so switching back to
/// "original" or changing the quality never requires re-downloading.
class ImageService {
  final Config config;
  final SettingsRepository settings;
  final Map<String, ({Uint8List bytes, String mime})> _memory = {};
  int _memoryBytes = 0;
  static const _maxMemoryBytes = 96 * 1024 * 1024;

  ImageService({required this.config, required this.settings});

  Directory get _directory =>
      Directory(p.join(config.dataDir, 'image-conversions'));

  Future<({Uint8List bytes, String mime})> convert({
    required int userId,
    required String cacheKey,
    required Uint8List bytes,
    required String mime,
    bool thumbnail = false,
  }) async {
    final format =
        (settings.get(userId, 'imageFormat') as String?) ?? 'original';
    if (format != 'webp' || mime.contains('webp') || mime.contains('gif')) {
      return (bytes: bytes, mime: mime);
    }
    final quality =
        ((settings.get(userId, 'imageQuality') as num?)?.toInt() ?? 80)
            .clamp(1, 100);
    final maxWidth =
        ((settings.get(userId, 'imageMaxWidth') as num?)?.toInt() ?? 0)
            .clamp(0, 4096);
    final digest = CryptoUtil.sha256Hex(
        '$userId|$cacheKey|$mime|$quality|$maxWidth|$thumbnail');
    final memoryKey = '${digest}_$quality';
    final cached = _memory[memoryKey];
    if (cached != null) return cached;
    final file = File(p.join(_directory.path, '$memoryKey.webp'));
    try {
      if (file.existsSync() && file.lengthSync() > 0) {
        final data = await file.readAsBytes();
        _remember(memoryKey, data);
        return (bytes: data, mime: 'image/webp');
      }
    } catch (_) {}

    final converted = await Isolate.run(
      () => _encodeWebp((bytes: bytes, quality: quality, maxWidth: maxWidth)),
    );
    if (converted == null) return (bytes: bytes, mime: mime);
    try {
      _directory.createSync(recursive: true);
      await file.writeAsBytes(converted, flush: false);
    } catch (error) {
      Log.warning('WebP cache write failed', extra: {'error': '$error'});
    }
    _remember(memoryKey, converted);
    return (bytes: converted, mime: 'image/webp');
  }

  void _remember(String key, Uint8List bytes) {
    if (_memoryBytes + bytes.length > _maxMemoryBytes) {
      _memory.clear();
      _memoryBytes = 0;
    }
    _memory[key] = (bytes: bytes, mime: 'image/webp');
    _memoryBytes += bytes.length;
  }

  /// Keeps the conversion cache bounded (1 GiB / 20000 files).
  Future<void> prune() async {
    try {
      if (!_directory.existsSync()) return;
      final files = _directory
          .listSync()
          .whereType<File>()
          .where((file) => file.path.endsWith('.webp'))
          .toList();
      var total = 0;
      final stats = <({File file, int size, DateTime modified})>[];
      for (final file in files) {
        final stat = file.statSync();
        total += stat.size;
        stats.add((file: file, size: stat.size, modified: stat.modified));
      }
      if (total <= 1024 * 1024 * 1024 && stats.length <= 20000) return;
      stats.sort((a, b) => a.modified.compareTo(b.modified));
      var count = stats.length;
      for (final entry in stats) {
        if (total <= 1024 * 1024 * 1024 && count <= 20000) break;
        try {
          entry.file.deleteSync();
          total -= entry.size;
          count--;
        } catch (_) {}
      }
    } catch (error) {
      Log.warning('WebP cache prune failed', extra: {'error': '$error'});
    }
  }
}
