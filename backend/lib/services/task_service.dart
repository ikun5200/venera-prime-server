import 'dart:async';

import 'package:uuid/uuid.dart';

import '../db/rows.dart';
import 'event_bus.dart';

enum TaskStatus { running, completed, failed, cancelled }

class BackgroundTask {
  final String id;
  final int userId;
  final String type;
  final String title;
  TaskStatus status;
  double progress;
  String message;
  String? error;
  Object? result;
  final int createdAt;
  int updatedAt;
  bool cancelRequested;

  BackgroundTask({
    required this.id,
    required this.userId,
    required this.type,
    required this.title,
    required this.status,
    required this.progress,
    required this.message,
    required this.createdAt,
    required this.updatedAt,
    this.error,
    this.result,
    this.cancelRequested = false,
  });

  Map<String, Object?> toJson() => {
        'id': id,
        'type': type,
        'title': title,
        'status': status.name,
        'progress': progress,
        'message': message,
        'error': error,
        'result': result,
        'createdAt': createdAt,
        'updatedAt': updatedAt,
      };
}

/// In-memory task registry. Tasks are per user and are pruned to the most
/// recent 100 per user. Long-running operations poll [isCancelled].
class TaskService {
  final Map<String, BackgroundTask> _tasks = {};
  final Map<int, List<String>> _byUser = {};
  final Map<String, int> _lastEmit = {};
  final _uuid = const Uuid();
  final EventBusService? events;

  TaskService({this.events});

  void _emit(BackgroundTask task, {bool force = false}) {
    final bus = events;
    if (bus == null) return;
    final now = nowMs();
    if (!force && now - (_lastEmit[task.id] ?? 0) < 500) return;
    _lastEmit[task.id] = now;
    bus.publish(task.userId, 'task', data: {'task': task.toJson()});
  }

  BackgroundTask create(int userId, String type, String title) {
    final task = BackgroundTask(
      id: _uuid.v4(),
      userId: userId,
      type: type,
      title: title,
      status: TaskStatus.running,
      progress: 0,
      message: '',
      createdAt: nowMs(),
      updatedAt: nowMs(),
    );
    _tasks[task.id] = task;
    final list = _byUser.putIfAbsent(userId, () => []);
    list.insert(0, task.id);
    while (list.length > 100) {
      final removed = list.removeLast();
      _tasks.remove(removed);
      _lastEmit.remove(removed);
    }
    _emit(task, force: true);
    return task;
  }

  void update(String id, {double? progress, String? message, Object? result}) {
    final task = _tasks[id];
    if (task == null) return;
    if (progress != null) task.progress = progress.clamp(0, 1);
    if (message != null) task.message = message;
    if (result != null) task.result = result;
    task.updatedAt = nowMs();
    _emit(task);
  }

  void complete(String id, {String? message, Object? result}) {
    final task = _tasks[id];
    if (task == null) return;
    task.status = TaskStatus.completed;
    task.progress = 1;
    if (message != null) task.message = message;
    task.result = result;
    task.updatedAt = nowMs();
    _emit(task, force: true);
  }

  void fail(String id, String error) {
    final task = _tasks[id];
    if (task == null) return;
    task.status = TaskStatus.failed;
    task.error = error;
    task.updatedAt = nowMs();
    _emit(task, force: true);
  }

  void cancel(String id) {
    final task = _tasks[id];
    if (task == null) return;
    task.cancelRequested = true;
    if (task.status == TaskStatus.running) {
      task.status = TaskStatus.cancelled;
    }
    task.updatedAt = nowMs();
    _emit(task, force: true);
  }

  bool isCancelled(String id) => _tasks[id]?.cancelRequested ?? false;

  BackgroundTask? get(String userId, String id) {
    final task = _tasks[id];
    if (task == null || task.userId != int.tryParse(userId)) return null;
    return task;
  }

  List<Map<String, Object?>> list(int userId) => (_byUser[userId] ?? [])
      .map((id) => _tasks[id])
      .whereType<BackgroundTask>()
      .map((t) => t.toJson())
      .toList();

  void clearFinished(int userId) {
    final ids = _byUser[userId];
    if (ids == null) return;
    ids.removeWhere((id) {
      final task = _tasks[id];
      if (task == null) return true;
      if (task.status == TaskStatus.running) return false;
      _tasks.remove(id);
      return true;
    });
  }

  void run(int userId, String type, String title,
      Future<Object?> Function(BackgroundTask task) work) {
    final task = create(userId, type, title);
    Future(() async {
      try {
        final result = await work(task);
        if (task.cancelRequested) {
          task.status = TaskStatus.cancelled;
          task.updatedAt = nowMs();
        } else {
          complete(task.id, result: result);
        }
      } catch (error) {
        fail(task.id, error.toString());
      }
    });
  }
}
