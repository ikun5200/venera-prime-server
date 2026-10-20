import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as c;
import 'package:cryptography/cryptography.dart';

/// Password hashing (Argon2id) and symmetric encryption for stored secrets.
class CryptoUtil {
  static const int memory = 65536; // KiB
  static const int iterations = 3;
  static const int parallelism = 2;
  static const int hashLength = 32;
  static const int saltLength = 16;

  static final Argon2id _argon2 = Argon2id(
    memory: memory,
    iterations: iterations,
    parallelism: parallelism,
    hashLength: hashLength,
  );

  static String _b64(List<int> bytes) => base64UrlEncode(bytes);

  static Uint8List _unb64(String value) =>
      Uint8List.fromList(base64Url.decode(value));

  static Future<String> hashPassword(String password) async {
    final salt = _randomBytes(saltLength);
    final key = await _argon2.deriveKey(
      secretKey: SecretKey(utf8.encode(password)),
      nonce: salt,
    );
    final bytes = await key.extractBytes();
    return 'argon2id\$m=$memory,t=$iterations,p=$parallelism'
        '\$${_b64(salt)}\$${_b64(bytes)}';
  }

  static Future<bool> verifyPassword(String password, String encoded) async {
    try {
      final parts = encoded.split(r'$');
      if (parts.length != 4 || parts[0] != 'argon2id') return false;
      final params = <String, int>{};
      for (final pair in parts[1].split(',')) {
        final kv = pair.split('=');
        if (kv.length == 2) params[kv[0]] = int.parse(kv[1]);
      }
      final algorithm = Argon2id(
        memory: params['m'] ?? memory,
        iterations: params['t'] ?? iterations,
        parallelism: params['p'] ?? parallelism,
        hashLength: hashLength,
      );
      final salt = _unb64(parts[2]);
      final expected = _unb64(parts[3]);
      final key = await algorithm.deriveKey(
        secretKey: SecretKey(utf8.encode(password)),
        nonce: salt,
      );
      final actual = await key.extractBytes();
      return _constantTimeEquals(actual, expected);
    } catch (_) {
      return false;
    }
  }

  static bool _constantTimeEquals(List<int> a, List<int> b) {
    if (a.length != b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) {
      diff |= a[i] ^ b[i];
    }
    return diff == 0;
  }

  static Uint8List _randomBytes(int length) {
    final random = Random.secure();
    return Uint8List.fromList(
        List<int>.generate(length, (_) => random.nextInt(256)));
  }

  static String randomToken([int bytes = 32]) =>
      base64UrlEncode(_randomBytes(bytes)).replaceAll('=', '');

  static String sha256Hex(String value) =>
      c.sha256.convert(utf8.encode(value)).toString();

  static String sha256HexBytes(List<int> value) =>
      c.sha256.convert(value).toString();

  static String md5Hex(String value) =>
      c.md5.convert(utf8.encode(value)).toString();

  static SecretKey _encryptionKey(String secret) =>
      SecretKey(c.sha256.convert(utf8.encode(secret)).bytes);

  static final AesGcm _aesGcm = AesGcm.with256bits();

  /// Encrypts a secret with AES-256-GCM using a key derived from
  /// SESSION_SECRET. Output is base64(nonce | ciphertext | mac).
  static Future<String> encryptSecret(String plaintext, String secret) async {
    final box = await _aesGcm.encrypt(
      utf8.encode(plaintext),
      secretKey: _encryptionKey(secret),
    );
    return base64UrlEncode(box.concatenation());
  }

  static Future<String?> decryptSecret(String? encoded, String secret) async {
    if (encoded == null || encoded.isEmpty) return null;
    try {
      final bytes = base64Url.decode(encoded);
      final box = SecretBox.fromConcatenation(
        bytes,
        nonceLength: 12,
        macLength: 16,
      );
      final clear = await _aesGcm.decrypt(
        box,
        secretKey: _encryptionKey(secret),
      );
      return utf8.decode(clear);
    } catch (_) {
      return null;
    }
  }
}
