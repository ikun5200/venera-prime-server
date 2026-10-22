import 'dart:async';

/// Fan-out of server-side state changes to connected SSE clients.
///
/// Events are scoped by user id: a subscription only ever receives events
/// published for the same account.
class EventBusService {
  final Map<int, Set<StreamController<Map<String, Object?>>>> _clients = {};

  StreamController<Map<String, Object?>> subscribe(int userId) {
    late StreamController<Map<String, Object?>> controller;
    controller = StreamController<Map<String, Object?>>(
      onListen: () {
        _clients.putIfAbsent(userId, () => {}).add(controller);
      },
      onCancel: () {
        final clients = _clients[userId];
        clients?.remove(controller);
        if (clients != null && clients.isEmpty) _clients.remove(userId);
      },
    );
    return controller;
  }

  void publish(
    int userId,
    String type, {
    Map<String, Object?>? data,
  }) {
    final clients = _clients[userId];
    if (clients == null || clients.isEmpty) return;
    final event = <String, Object?>{
      'type': type,
      'at': DateTime.now().millisecondsSinceEpoch,
      ...?data,
    };
    for (final client in clients.toList()) {
      if (!client.isClosed) client.add(event);
    }
  }

  int clientCount(int userId) => _clients[userId]?.length ?? 0;

  Future<void> dispose() async {
    for (final clients in _clients.values) {
      for (final client in clients) {
        await client.close();
      }
    }
    _clients.clear();
  }
}
