/// API error type and helpers shared by routes and services.
library;

class ApiException implements Exception {
  final String code;
  final int status;
  final String message;
  final Map<String, Object?>? details;

  ApiException(this.code, this.status, this.message, {this.details});

  factory ApiException.badRequest(String message) =>
      ApiException('BAD_REQUEST', 400, message);
  factory ApiException.unauthorized([String message = 'Authentication required']) =>
      ApiException('UNAUTHORIZED', 401, message);
  factory ApiException.forbidden([String message = 'Forbidden']) =>
      ApiException('FORBIDDEN', 403, message);
  factory ApiException.notFound([String message = 'Not found']) =>
      ApiException('NOT_FOUND', 404, message);
  factory ApiException.conflict(String message) =>
      ApiException('CONFLICT', 409, message);
  factory ApiException.rateLimited() =>
      ApiException('RATE_LIMITED', 429, 'Too many requests');
  factory ApiException.payloadTooLarge([String message = 'Payload too large']) =>
      ApiException('PAYLOAD_TOO_LARGE', 413, message);
  factory ApiException.timeout([String message = 'Operation timed out']) =>
      ApiException('TIMEOUT', 504, message);
  factory ApiException.sourceError(String message) =>
      ApiException('SOURCE_ERROR', 502, message);
  factory ApiException.internal([String message = 'Internal error']) =>
      ApiException('INTERNAL', 500, message);

  @override
  String toString() => '$code($status): $message';
}

class Json {
  static Map<String, Object?> obj(Object? value) {
    if (value is Map<String, Object?>) return value;
    if (value is Map) return value.map((k, v) => MapEntry(k.toString(), v));
    return const {};
  }

  static List<Object?> list(Object? value) {
    if (value is List) return value;
    return const [];
  }

  static String str(Object? value, [String fallback = '']) {
    if (value == null) return fallback;
    if (value is String) return value;
    return value.toString();
  }

  static int? integer(Object? value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }

  static bool boolean(Object? value, [bool fallback = false]) {
    if (value is bool) return value;
    if (value is num) return value != 0;
    if (value is String) return value == 'true' || value == '1';
    return fallback;
  }
}
