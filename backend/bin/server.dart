import 'dart:async';
import 'dart:io';

import 'package:shelf/shelf_io.dart' as shelf_io;

import 'package:venera_server/app_context.dart';
import 'package:venera_server/config.dart';
import 'package:venera_server/db/database.dart';
import 'package:venera_server/server_app.dart';
import 'package:venera_server/util/log.dart';

Future<void> main(List<String> args) async {
  final config = Config.fromEnv();
  Log.init(level: config.logLevel);
  final db = Db.open(config.dbPath);
  db.housekeeping();
  final ctx = AppContext(config, db);

  final handler = buildServerHandler(ctx);
  final server = await shelf_io.serve(handler, config.host, config.port);
  server.autoCompress = true;
  Log.info('Server listening', extra: {
    'host': config.host,
    'port': config.port,
    'data': config.dataDir
  });

  final timer = Timer.periodic(const Duration(hours: 1), (_) {
    try {
      db.housekeeping();
      ctx.sessions.deleteExpired();
      ctx.contentCache.pruneAll();
      ctx.followUpdates.runDueChecks();
    } catch (error) {
      Log.warning('Housekeeping failed', extra: {'error': '$error'});
    }
  });

  // Run due follow-up checks shortly after boot so the server cache and the
  // unread badges are current without waiting for the first hourly tick.
  unawaited(Future<void>.delayed(const Duration(seconds: 8), () {
    try {
      ctx.followUpdates.runDueChecks();
    } catch (error) {
      Log.warning('Startup follow check failed', extra: {'error': '$error'});
    }
  }));

  Future<void> shutdown() async {
    timer.cancel();
    await server.close(force: false);
    await ctx.dispose();
    exit(0);
  }

  ProcessSignal.sigint.watch().listen((_) => shutdown());
  if (!Platform.isWindows) {
    ProcessSignal.sigterm.watch().listen((_) => shutdown());
  }
}
