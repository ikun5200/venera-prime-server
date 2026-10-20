/// Structured JSON logger. Secrets are redacted before serialization.
library;

import 'dart:convert';
import 'dart:io';

enum LogLevel { debug, info, warning, error }

class Log {
  static LogLevel minLevel = LogLevel.info;
  static IOSink? _sink;
  static final List<Map<String, Object?>> _buffer = [];
  static const int _maxBuffer = 2000;

  static void init({String level = 'info', IOSink? sink}) {
    minLevel = switch (level) {
      'debug' => LogLevel.debug,
      'warning' || 'warn' => LogLevel.warning,
      'error' => LogLevel.error,
      _ => LogLevel.info,
    };
    _sink = sink;
  }

  static const _redacted = {
    'password',
    'passwd',
    'pwd',
    'token',
    'cookie',
    'authorization',
    'session',
    'secret',
    'password_enc',
  };

  static Object? redact(Object? value) {
    if (value is Map) {
      return {
        for (final e in value.entries)
          e.key.toString(): _redacted.contains(e.key.toString().toLowerCase())
              ? '***'
              : redact(e.value),
      };
    }
    if (value is List) return value.map(redact).toList();
    return value;
  }

  static void add(LogLevel level, String message,
      {String? requestId,
      int? userId,
      String? route,
      int? status,
      int? durationMs,
      Map<String, Object?>? extra}) {
    if (level.index < minLevel.index) return;
    final entry = <String, Object?>{
      'ts': DateTime.now().toUtc().toIso8601String(),
      'level': level.name,
      if (requestId != null) 'requestId': requestId,
      if (userId != null) 'userId': userId,
      if (route != null) 'route': route,
      if (status != null) 'status': status,
      if (durationMs != null) 'durationMs': durationMs,
      'msg': message,
      if (extra != null) ...redact(extra) as Map<String, Object?>,
    };
    _buffer.add(entry);
    if (_buffer.length > _maxBuffer) _buffer.removeAt(0);
    final line = jsonEncode(entry);
    if (_sink != null) {
      _sink!.writeln(line);
    } else {
      stdout.writeln(line);
    }
  }

  static void debug(String msg,
          {String? requestId,
          int? userId,
          String? route,
          Map<String, Object?>? extra}) =>
      add(LogLevel.debug, msg,
          requestId: requestId, userId: userId, route: route, extra: extra);

  static void info(String msg,
          {String? requestId,
          int? userId,
          String? route,
          int? status,
          int? durationMs,
          Map<String, Object?>? extra}) =>
      add(LogLevel.info, msg,
          requestId: requestId,
          userId: userId,
          route: route,
          status: status,
          durationMs: durationMs,
          extra: extra);

  static void warning(String msg,
          {String? requestId,
          int? userId,
          String? route,
          Map<String, Object?>? extra}) =>
      add(LogLevel.warning, msg,
          requestId: requestId, userId: userId, route: route, extra: extra);

  static void error(String msg,
          {String? requestId,
          int? userId,
          String? route,
          Object? error,
          StackTrace? stack,
          Map<String, Object?>? extra}) =>
      add(LogLevel.error, msg,
          requestId: requestId,
          userId: userId,
          route: route,
          extra: {
            if (error != null) 'error': error.toString(),
            if (stack != null) 'stack': stack.toString(),
            ...?extra,
          });

  static List<Map<String, Object?>> recent({int limit = 500}) {
    final start = _buffer.length > limit ? _buffer.length - limit : 0;
    return _buffer.sublist(start).reversed.toList();
  }

  static void clear() => _buffer.clear();
}
