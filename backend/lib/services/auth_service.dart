import 'dart:convert';

import 'package:shelf/shelf.dart';
import 'package:uuid/uuid.dart';

import '../config.dart';
import '../db/database.dart';
import '../repositories/user_repository.dart';
import '../util/crypto.dart';
import '../util/errors.dart';
import '../util/log.dart';

class AuthContext {
  final UserRecord user;
  final SessionRecord session;
  AuthContext(this.user, this.session);
}

class AuthService {
  final Config config;
  final Db db;
  final UserRepository users;
  final SessionRepository sessions;
  final AuditRepository audit;

  static const sessionCookie = 'venera_session';
  static const sessionLifetime =
      Duration(days: 30); // renewed when < 25 days remain

  AuthService({
    required this.config,
    required this.db,
    required this.users,
    required this.sessions,
    required this.audit,
  });

  bool get initialized => users.count() > 0;

  Future<UserRecord> initialize(
      String username, String password, String? ip) async {
    if (initialized) throw ApiException.conflict('Already initialized');
    validateCredentials(username, password);
    final hash = await CryptoUtil.hashPassword(password);
    final user = users.create(
        username: username.trim(), passwordHash: hash, role: 'admin');
    audit.log('init',
        userId: user.id, ip: ip, detail: {'username': user.username});
    Log.info('Initialized administrator', userId: user.id);
    return user;
  }

  void validateCredentials(String username, String password) {
    final name = username.trim();
    if (name.isEmpty) throw ApiException.badRequest('Username cannot be empty');
    if (name.length > 64) throw ApiException.badRequest('Username is too long');
    if (password.length < 6) {
      throw ApiException.badRequest('Password must be at least 6 characters');
    }
    if (password.length > 512) {
      throw ApiException.badRequest('Password is too long');
    }
  }

  Future<({UserRecord user, String token, DateTime expires})> login(
    String username,
    String password,
    String? userAgent,
    String? ip,
  ) async {
    final user = users.byUsername(username.trim());
    if (user == null || user.disabled) {
      audit.log('login_failed',
          ip: ip, detail: {'username': username, 'reason': 'invalid'});
      throw ApiException.unauthorized('Invalid username or password');
    }
    final ok = await CryptoUtil.verifyPassword(password, user.passwordHash);
    if (!ok) {
      audit.log('login_failed',
          userId: user.id,
          ip: ip,
          detail: {'username': username, 'reason': 'invalid'});
      throw ApiException.unauthorized('Invalid username or password');
    }
    final token = CryptoUtil.randomToken();
    final expires = DateTime.now().add(sessionLifetime);
    sessions.create(
      userId: user.id,
      tokenHash: CryptoUtil.sha256Hex(token),
      expiresAt: expires.millisecondsSinceEpoch,
      userAgent: userAgent,
      ip: ip,
    );
    audit.log('login', userId: user.id, ip: ip);
    return (user: user, token: token, expires: expires);
  }

  void logout(AuthContext? context) {
    if (context == null) return;
    sessions.deleteById(context.session.id);
    audit.log('logout', userId: context.user.id);
  }

  AuthContext? authenticate(Request request) {
    final token = _cookie(request, sessionCookie);
    if (token == null || token.isEmpty) return null;
    final session = sessions.byHash(CryptoUtil.sha256Hex(token));
    if (session == null) return null;
    final user = users.byId(session.userId);
    if (user == null || user.disabled) {
      sessions.deleteById(session.id);
      return null;
    }
    final remaining = session.expiresAt - DateTime.now().millisecondsSinceEpoch;
    if (remaining < const Duration(days: 25).inMilliseconds) {
      sessions.touch(session.id,
          DateTime.now().add(sessionLifetime).millisecondsSinceEpoch);
    }
    return AuthContext(user, session);
  }

  static String? _cookie(Request request, String name) {
    final header = request.headers['cookie'];
    if (header == null) return null;
    for (final part in header.split(';')) {
      final index = part.indexOf('=');
      if (index < 0) continue;
      if (part.substring(0, index).trim() == name) {
        return Uri.decodeComponent(part.substring(index + 1).trim());
      }
    }
    return null;
  }

  static String cookieHeader(String token, DateTime expires,
      {bool secure = false}) {
    final maxAge = expires.difference(DateTime.now()).inSeconds;
    return '$sessionCookie=$token; Path=/; HttpOnly; SameSite=Lax; '
        'Max-Age=$maxAge${secure ? '; Secure' : ''}';
  }

  static String clearCookieHeader() =>
      '$sessionCookie=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

/// Helpers for extracting auth and request metadata.
AuthContext requireAuth(Request request) {
  final context = request.context['auth'];
  if (context is! AuthContext) throw ApiException.unauthorized();
  return context;
}

AuthContext? optionalAuth(Request request) {
  final context = request.context['auth'];
  return context is AuthContext ? context : null;
}

void requireAdmin(Request request) {
  final auth = requireAuth(request);
  if (!auth.user.isAdmin) throw ApiException.forbidden();
}

String requestIdOf(Request request) =>
    request.context['requestId'] as String? ?? const Uuid().v4();

String? clientIp(Request request) {
  final forwarded = request.headers['x-forwarded-for'];
  if (forwarded != null && forwarded.isNotEmpty) {
    return forwarded.split(',').first.trim();
  }
  return request.context['ip'] as String?;
}

Map<String, Object?> userJson(UserRecord user) => {
      'id': user.id,
      'username': user.username,
      'role': user.role,
      'createdAt': user.createdAt,
      'disabled': user.disabled,
    };

Future<Map<String, Object?>> readJsonBody(Request request,
    {int maxBytes = 2 * 1024 * 1024}) async {
  final body = await request.readAsString();
  if (body.length > maxBytes) {
    throw ApiException.payloadTooLarge();
  }
  if (body.trim().isEmpty) return {};
  try {
    final decoded = jsonDecode(body);
    if (decoded is Map) {
      return decoded.map((k, v) => MapEntry(k.toString(), v));
    }
    throw ApiException.badRequest('JSON object expected');
  } on FormatException {
    throw ApiException.badRequest('Invalid JSON');
  }
}
