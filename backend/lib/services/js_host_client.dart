import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:uuid/uuid.dart';

import '../config.dart';
import '../util/errors.dart';
import '../util/log.dart';

class _Semaphore {
  final int max;
  int _active = 0;
  final List<Completer<void>> _waiters = [];

  _Semaphore(this.max);

  Future<void> acquire() {
    if (_active < max) {
      _active++;
      return Future.value();
    }
    final completer = Completer<void>();
    _waiters.add(completer);
    return completer.future;
  }

  void release() {
    if (_waiters.isNotEmpty) {
      _waiters.removeAt(0).complete();
    } else {
      _active--;
    }
  }
}

/// JSON-lines client for `rust/js_host`. Each request is independent; the
/// sidecar creates a fresh QuickJS runtime and enforces the timeout/memory
/// limits.
class JsHostClient {
  final Config config;
  Process? _process;
  StreamSubscription<List<int>>? _stdoutSub;
  StreamSubscription<List<int>>? _stderrSub;
  final Map<String, Completer<Map<String, Object?>>> _pending = {};
  final StringBuffer _buffer = StringBuffer();
  late final _Semaphore _semaphore = _Semaphore(config.jsConcurrency);
  final _uuid = const Uuid();
  bool _starting = false;
  int _generation = 0;

  JsHostClient(this.config);

  Future<Map<String, Object?>> parse(
          String script, Map<String, Object?> context) =>
      request({'op': 'parse', 'script': script, 'context': context});

  Future<Map<String, Object?>> call(
    String script,
    String method,
    List<Object?> args,
    Map<String, Object?> context,
  ) =>
      request({
        'op': 'call',
        'script': script,
        'method': method,
        'args': args,
        'context': context,
      });

  Future<Map<String, Object?>> run(String code, Map<String, Object?> context) =>
      request({'op': 'run', 'script': code, 'context': context});

  Future<Map<String, Object?>> request(Map<String, Object?> payload) async {
    await _semaphore.acquire();
    try {
      final process = await _ensureProcess();
      final id = _uuid.v4();
      final completer = Completer<Map<String, Object?>>();
      _pending[id] = completer;
      final line = jsonEncode({
        'id': id,
        'timeoutMs': config.jsTimeoutMs,
        ...payload,
      });
      process.stdin.writeln(line);
      await process.stdin.flush();
      final response = await completer.future.timeout(
        Duration(milliseconds: config.jsTimeoutMs + 5000),
        onTimeout: () {
          _pending.remove(id);
          throw ApiException.timeout('JS source timed out');
        },
      );
      return response;
    } finally {
      _semaphore.release();
    }
  }

  Future<Process> _ensureProcess() async {
    final existing = _process;
    if (existing != null) return existing;
    if (_starting) {
      while (_starting) {
        await Future.delayed(const Duration(milliseconds: 20));
      }
      if (_process != null) return _process!;
    }
    _starting = true;
    try {
      final binary = _resolveBinary();
      final process = await Process.start(binary, const [], runInShell: false);
      _process = process;
      _generation++;
      final generation = _generation;
      _stdoutSub = process.stdout.listen(
        (bytes) => _onStdout(bytes, generation),
        onError: (Object error) => _onProcessError(error),
        onDone: () => _onProcessExit(generation),
        cancelOnError: false,
      );
      _stderrSub = process.stderr.listen((bytes) {
        final text = utf8.decode(bytes, allowMalformed: true).trim();
        if (text.isNotEmpty) {
          Log.warning('js_host: $text');
        }
      });
      Log.info('JS host started',
          extra: {'binary': binary, 'pid': process.pid});
      return process;
    } catch (error) {
      _starting = false;
      throw ApiException.sourceError(
          'JS runtime unavailable: $error. Build rust/js_host.');
    } finally {
      _starting = false;
    }
  }

  String _resolveBinary() {
    final candidates = <String>[
      config.jsHostBin,
      'rust/js_host/target/release/venera_js_host',
      '../rust/js_host/target/release/venera_js_host',
      '/app/venera_js_host',
      'venera_js_host',
    ];
    for (final candidate in candidates) {
      if (File(candidate).existsSync()) return candidate;
    }
    throw StateError('venera_js_host not found (looked in $candidates)');
  }

  void _onStdout(List<int> bytes, int generation) {
    if (generation != _generation) return;
    _buffer.write(utf8.decode(bytes, allowMalformed: true));
    var content = _buffer.toString();
    while (true) {
      final index = content.indexOf('\n');
      if (index < 0) break;
      final line = content.substring(0, index).trim();
      content = content.substring(index + 1);
      if (line.isEmpty) continue;
      _handleLine(line);
    }
    _buffer
      ..clear()
      ..write(content);
  }

  void _handleLine(String line) {
    Map<String, Object?> decoded;
    try {
      final value = jsonDecode(line);
      if (value is! Map) return;
      decoded = value.map((k, v) => MapEntry(k.toString(), v));
    } catch (error) {
      Log.error('Invalid js_host response',
          error: error, extra: {'line': line});
      return;
    }
    final id = decoded['id']?.toString();
    if (id == null) return;
    final completer = _pending.remove(id);
    if (completer == null || completer.isCompleted) return;
    completer.complete(decoded);
  }

  void _onProcessError(Object error) {
    Log.error('JS host stream error', error: error);
    _failPending(error);
  }

  void _onProcessExit(int generation) {
    if (generation != _generation) return;
    Log.warning('JS host exited');
    _process = null;
    _failPending(StateError('JS host exited'));
  }

  void _failPending(Object error) {
    final pending = Map.of(_pending);
    _pending.clear();
    for (final completer in pending.values) {
      if (!completer.isCompleted) {
        completer.completeError(
            ApiException.sourceError('JS runtime error: $error'));
      }
    }
  }

  Future<void> dispose() async {
    final process = _process;
    _process = null;
    _failPending(StateError('shutting down'));
    await _stdoutSub?.cancel();
    await _stderrSub?.cancel();
    process?.kill();
  }
}
