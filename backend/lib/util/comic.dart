import 'dart:convert';

import 'package:crypto/crypto.dart';

/// Stable integer comic-type identifiers.
///
/// The original uses Dart's `String.hashCode`, which is not stable across
/// processes. The server uses the first 8 hex digits of SHA-1 so the value is
/// deterministic and collision probability is negligible for source keys.
int comicTypeForSource(String? sourceKey) {
  if (sourceKey == null || sourceKey.isEmpty || sourceKey == 'local') return 0;
  final hex = sha1.convert(utf8.encode(sourceKey)).toString().substring(0, 8);
  final value = int.parse(hex, radix: 16);
  // Keep it in the signed 32-bit range to match the original's int type.
  return value & 0x7fffffff;
}

String comicKey(String comicId, int comicType) => '$comicType:$comicId';

Map<String, Object?> comicSummary(Map<String, Object?> raw,
        {String sourceKey = ''}) =>
    {
      'id': (raw['id'] ?? '').toString(),
      'title': (raw['title'] ?? '').toString(),
      'subtitle': (raw['subtitle'] ?? raw['subTitle'] ?? '').toString(),
      'cover': (raw['cover'] ?? '').toString(),
      'tags': raw['tags'] is List ? raw['tags'] : const [],
      'description': (raw['description'] ?? '').toString(),
      'sourceKey': sourceKey.isNotEmpty ? sourceKey : (raw['sourceKey'] ?? ''),
      'maxPage': raw['maxPage'],
      'language': raw['language'],
      'stars': raw['stars'],
    };
