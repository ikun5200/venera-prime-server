import 'dart:io';

/// Runtime configuration. Every value comes from the environment; nothing is
/// hard-coded that could be a credential.
class Config {
  final String host;
  final int port;
  final String dataDir;
  final String dbPath;
  final String logLevel;
  final String sessionSecret;
  final bool cookieSecure;
  final String publicOrigin;
  final String jsHostBin;
  final int jsTimeoutMs;
  final int jsConcurrency;
  final int rateLimitPerMinute;
  final int maxUploadBytes;
  final String staticDir;
  final String appVersion;
  final bool production;

  Config({
    required this.host,
    required this.port,
    required this.dataDir,
    required this.dbPath,
    required this.logLevel,
    required this.sessionSecret,
    required this.cookieSecure,
    required this.publicOrigin,
    required this.jsHostBin,
    required this.jsTimeoutMs,
    required this.jsConcurrency,
    required this.rateLimitPerMinute,
    required this.maxUploadBytes,
    required this.staticDir,
    required this.appVersion,
    required this.production,
  });

  static Map<String, String> _readDotEnv() {
    final result = <String, String>{};
    for (final file in [File('/config/.env'), File('.env')]) {
      if (!file.existsSync()) continue;
      for (final raw in file.readAsLinesSync()) {
        final line = raw.trim();
        if (line.isEmpty || line.startsWith('#')) continue;
        final i = line.indexOf('=');
        if (i <= 0) continue;
        final key = line.substring(0, i).trim();
        var value = line.substring(i + 1).trim();
        if (value.length >= 2 &&
            ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'")))) {
          value = value.substring(1, value.length - 1);
        }
        result[key] = value;
      }
    }
    return result;
  }

  factory Config.fromEnv([Map<String, String>? env]) {
    final dotenv = _readDotEnv();
    String read(String key, String fallback) {
      final v = env?[key] ?? Platform.environment[key] ?? dotenv[key];
      if (v == null || v.isEmpty) return fallback;
      return v;
    }

    bool readBool(String key, bool fallback) {
      final v = read(key, '').toLowerCase();
      if (v.isEmpty) return fallback;
      return v == '1' || v == 'true' || v == 'yes';
    }

    int readInt(String key, int fallback) {
      final v = read(key, '');
      return int.tryParse(v) ?? fallback;
    }

    final dataDir = read('DATA_DIR', 'data');
    final production = read('NODE_ENV', '') == 'production' ||
        read('APP_ENV', '') == 'production';
    final secret = read('SESSION_SECRET', '');
    if (production && secret.length < 32) {
      throw StateError(
          'SESSION_SECRET must be set to at least 32 characters in production');
    }
    return Config(
      host: read('HOST', '0.0.0.0'),
      port: readInt('PORT', 8080),
      dataDir: dataDir,
      dbPath: read('DB_PATH', '$dataDir/venera.db'),
      logLevel: read('LOG_LEVEL', 'info').toLowerCase(),
      sessionSecret: secret.isEmpty
          ? 'dev-only-insecure-session-secret-change-me-please'
          : secret,
      cookieSecure: readBool('COOKIE_SECURE', production),
      publicOrigin: read('PUBLIC_ORIGIN', 'http://localhost:8080'),
      jsHostBin:
          read('JS_HOST_BIN', 'rust/js_host/target/release/venera_js_host'),
      jsTimeoutMs: readInt('JS_TIMEOUT_MS', 30000),
      jsConcurrency: readInt('JS_CONCURRENCY', 8),
      rateLimitPerMinute: readInt('RATE_LIMIT_PER_MINUTE', 300),
      maxUploadBytes: readInt('MAX_UPLOAD_BYTES', 512 * 1024 * 1024),
      staticDir: read('STATIC_DIR', 'frontend/dist'),
      appVersion: read('APP_VERSION', '1.0.0'),
      production: production,
    );
  }
}
