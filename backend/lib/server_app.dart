import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:mime/mime.dart';
import 'package:path/path.dart' as p;
import 'package:shelf/shelf.dart';

import 'app_context.dart';
import 'config.dart';
import 'routes/api_router.dart';
import 'services/auth_service.dart';
import 'util/errors.dart';
import 'util/log.dart';

Handler buildServerHandler(AppContext ctx) {
  final api = buildApiRouter(ctx);
  final staticHandler = StaticSpaHandler(ctx.config);
  Future<Response> router(Request request) async {
    if (request.url.path.startsWith('api')) {
      final response = await api(request);
      if (response.statusCode == 404) {
        throw ApiException.notFound('接口不存在');
      }
      return response;
    }
    return staticHandler.handle(request);
  }

  final rateLimiter = RateLimiter();
  final authLimiter = RateLimiter();

  return Pipeline()
      .addMiddleware(requestIdMiddleware())
      .addMiddleware(errorHandlerMiddleware(ctx))
      .addMiddleware(loggingMiddleware(ctx))
      .addMiddleware(corsMiddleware(ctx))
      .addMiddleware(authMiddleware(ctx))
      .addMiddleware(csrfMiddleware(ctx))
      .addMiddleware(rateLimitMiddleware(ctx, rateLimiter, authLimiter))
      .addHandler(router);
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

Middleware requestIdMiddleware() => (inner) => (request) {
      final id = request.headers['x-request-id']?.isNotEmpty == true
          ? request.headers['x-request-id']!
          : 'req_${DateTime.now().microsecondsSinceEpoch}_${randomSuffix()}';
      return inner(request.change(context: {'requestId': id}));
    };

String randomSuffix() {
  final random = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
  return random.substring(random.length > 6 ? random.length - 6 : 0);
}

Middleware errorHandlerMiddleware(AppContext ctx) =>
    (inner) => (request) async {
          final requestId = requestIdOf(request);
          try {
            return await inner(request);
          } on ApiException catch (error) {
            Log.warning('API error',
                requestId: requestId,
                route: request.url.path,
                extra: {'code': error.code, 'message': error.message});
            return errorResponse(
                requestId, error.code, error.message, error.status);
          } catch (error, stack) {
            Log.error('Unhandled error',
                requestId: requestId,
                route: request.url.path,
                error: error,
                stack: stack);
            return errorResponse(
                requestId, 'INTERNAL', 'Internal server error', 500);
          }
        };

Response errorResponse(
    String requestId, String code, String message, int status) {
  return Response(
    status,
    body: jsonEncode({
      'error': {'code': code, 'message': message, 'requestId': requestId}
    }),
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': requestId,
    },
  );
}

Middleware loggingMiddleware(AppContext ctx) => (inner) => (request) async {
      final stopwatch = Stopwatch()..start();
      final requestId = requestIdOf(request);
      try {
        final response = await inner(request);
        stopwatch.stop();
        final auth = optionalAuth(request);
        Log.info('request',
            requestId: requestId,
            userId: auth?.user.id,
            route: request.url.path,
            status: response.statusCode,
            durationMs: stopwatch.elapsedMilliseconds);
        if (request.url.path.startsWith('api')) {
          try {
            ctx.db.execute(
              'INSERT INTO request_logs (ts,level,request_id,user_id,route,method,status,duration_ms,message) '
              'VALUES (?,?,?,?,?,?,?,?,?)',
              [
                DateTime.now().millisecondsSinceEpoch,
                response.statusCode >= 500 ? 'error' : 'info',
                requestId,
                auth?.user.id,
                request.url.path,
                request.method,
                response.statusCode,
                stopwatch.elapsedMilliseconds,
                '',
              ],
            );
          } catch (_) {}
        }
        return response.change(headers: {'x-request-id': requestId});
      } catch (error) {
        stopwatch.stop();
        rethrow;
      }
    };

Middleware corsMiddleware(AppContext ctx) => (inner) => (request) async {
      final origin = request.headers['origin'];
      final allowed = origin != null && originAllowed(ctx, request, origin);
      if (request.method == 'OPTIONS') {
        return Response(204, headers: {
          if (allowed) 'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods':
              'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers':
              'content-type, x-requested-with, x-request-id, authorization',
          'access-control-max-age': '86400',
          'vary': 'origin',
        });
      }
      final response = await inner(request);
      if (!allowed) return response;
      return response.change(headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'vary': 'origin',
      });
    };

bool originAllowed(AppContext ctx, Request request, String origin) {
  if (origin == ctx.config.publicOrigin) return true;
  final host = request.headers['host'];
  if (host != null) {
    if (origin == 'http://$host' || origin == 'https://$host') return true;
  }
  // Development frontend.
  if (!ctx.config.production &&
      (origin == 'http://localhost:5173' ||
          origin == 'http://127.0.0.1:5173')) {
    return true;
  }
  return false;
}

Middleware authMiddleware(AppContext ctx) => (inner) => (request) {
      final auth = ctx.auth.authenticate(request);
      return inner(request.change(context: {
        ...request.context,
        if (auth != null) 'auth': auth,
      }));
    };

Middleware csrfMiddleware(AppContext ctx) => (inner) => (request) {
      const safeMethods = {'GET', 'HEAD', 'OPTIONS'};
      if (safeMethods.contains(request.method)) return inner(request);
      final origin = request.headers['origin'];
      final referer = request.headers['referer'];
      if (origin != null && origin.isNotEmpty) {
        if (!originAllowed(ctx, request, origin)) {
          throw ApiException.forbidden('跨域请求被拒绝');
        }
      } else if (referer != null && referer.isNotEmpty) {
        final uri = Uri.tryParse(referer);
        if (uri == null || !originAllowed(ctx, request, uri.origin)) {
          throw ApiException.forbidden('跨域请求被拒绝');
        }
      }
      return inner(request);
    };

Middleware rateLimitMiddleware(
        AppContext ctx, RateLimiter general, RateLimiter authLimiter) =>
    (inner) => (request) {
          if (!request.url.path.startsWith('api')) return inner(request);
          final auth = optionalAuth(request);
          final key = auth != null
              ? 'u:${auth.user.id}'
              : 'ip:${clientIp(request) ?? 'unknown'}';
          final isAuthPath = request.url.path == '/api/auth/login' ||
              request.url.path == '/api/init';
          final allowed = isAuthPath
              ? authLimiter.allow(key, 10)
              : general.allow(key, ctx.config.rateLimitPerMinute);
          if (!allowed) throw ApiException.rateLimited();
          return inner(request);
        };

class RateLimiter {
  final Map<String, List<int>> _hits = {};

  bool allow(String key, int limit) {
    final now = DateTime.now().millisecondsSinceEpoch;
    final window = _hits.putIfAbsent(key, () => []);
    window.removeWhere((ts) => now - ts > 60000);
    if (window.length >= limit) return false;
    window.add(now);
    if (_hits.length > 5000) {
      _hits.removeWhere((_, list) => list.isEmpty || now - list.last > 120000);
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Static SPA
// ---------------------------------------------------------------------------

class StaticSpaHandler {
  final Config config;
  StaticSpaHandler(this.config);

  Future<Response> handle(Request request) async {
    if (request.method != 'GET' && request.method != 'HEAD') {
      throw ApiException.notFound('未找到');
    }
    final root = p.normalize(p.absolute(config.staticDir));
    final index = File(p.join(root, 'index.html'));
    if (!index.existsSync()) {
      return Response.notFound(
        '未找到前端构建产物（${config.staticDir}）。'
        '请在 frontend/ 执行 npm run build，或使用 Docker 镜像。',
        headers: {'content-type': 'text/plain; charset=utf-8'},
      );
    }
    final relative = request.url.path;
    if (relative.isNotEmpty && !relative.contains('..')) {
      final candidate = p.normalize(p.join(root, relative));
      if (p.isWithin(root, candidate)) {
        final file = File(candidate);
        if (file.existsSync()) {
          final mime = lookupMimeType(candidate) ?? 'application/octet-stream';
          final immutable = relative.startsWith('assets/');
          return Response.ok(
            request.method == 'HEAD' ? const <int>[] : file.openRead(),
            headers: {
              'content-type': mime,
              'cache-control': immutable
                  ? 'public, max-age=31536000, immutable'
                  : 'no-cache',
            },
          );
        }
      }
    }
    final accept = request.headers['accept'] ?? '';
    final acceptsHtml = accept.isEmpty ||
        accept.contains('text/html') ||
        accept.contains('*/*');
    if (!acceptsHtml) throw ApiException.notFound('未找到');
    return Response.ok(index.openRead(), headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    });
  }
}
