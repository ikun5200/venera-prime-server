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
  final SessionRecord? session;
  AuthContext(this.user, [this.session]);
}

class AuthService {
  final Config config;
  final Db db;
  final UserRepository users;
  final SessionRepository sessions;
  final AuditRepository audit;
  final ApiTokenRepository tokens;

  static const sessionCookie = 'venera_session';
  static const sessionLifetime =
      Duration(days: 30); // renewed when < 25 days remain

  AuthService({
    required this.config,
    required this.db,
    required this.users,
    required this.sessions,
    required this.audit,
    required this.tokens,
  });

  bool get initialized => users.count() > 0;

  Future<UserRecord> initialize(
      String username, String password, String? ip) async {
    if (initialized) throw ApiException.conflict('系统已初始化');
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
    if (name.isEmpty) throw ApiException.badRequest('用户名不能为空');
    if (name.length > 64) throw ApiException.badRequest('用户名过长');
    if (password.length < 6) {
      throw ApiException.badRequest('密码至少需要 6 个字符');
    }
    if (password.length > 512) {
      throw ApiException.badRequest('密码过长');
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
      throw ApiException.unauthorized('用户名或密码错误');
    }
    final ok = await CryptoUtil.verifyPassword(password, user.passwordHash);
    if (!ok) {
      audit.log('login_failed',
          userId: user.id,
          ip: ip,
          detail: {'username': username, 'reason': 'invalid'});
      throw ApiException.unauthorized('用户名或密码错误');
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
    final session = context.session;
    if (session != null) sessions.deleteById(session.id);
    audit.log('logout', userId: context.user.id);
  }

  AuthContext? authenticate(Request request) {
    final cookieToken = _cookie(request, sessionCookie);
    if (cookieToken != null && cookieToken.isNotEmpty) {
      final fromSession = _sessionAuth(cookieToken);
      if (fromSession != null) return fromSession;
    }
    final header = request.headers['authorization'];
    String? token;
    if (header != null && header.trim().isNotEmpty) {
      final trimmed = header.trim();
      if (trimmed.toLowerCase().startsWith('bearer ')) {
        token = trimmed.substring(7).trim();
      } else if (trimmed.toLowerCase().startsWith('basic ')) {
        try {
          final decoded =
              utf8.decode(base64Decode(trimmed.substring(6).trim()));
          final index = decoded.indexOf(':');
          if (index >= 0) token = decoded.substring(index + 1);
        } catch (_) {
          return null;
        }
      }
    }
    // EventSource cannot set headers; allow the token as a query parameter
    // for the event stream only.
    if ((token == null || token.isEmpty) &&
        request.url.path.endsWith('api/events')) {
      token = request.url.queryParameters['access_token'];
    }
    if (token == null || token.isEmpty) return null;
    final row = tokens.byHash(CryptoUtil.sha256Hex(token));
    if (row == null) return null;
    tokens.touch(row['id'] as int);
    return AuthContext(_userFromTokenRow(row));
  }

  AuthContext? _sessionAuth(String token) {
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

  UserRecord _userFromTokenRow(Map<String, Object?> row) => UserRecord(
        id: row['user_id'] as int,
        username: row['user_name'] as String,
        passwordHash: row['user_password_hash'] as String,
        role: row['user_role'] as String,
        createdAt: row['user_created_at'] as int,
        disabled: row['user_disabled'] == 1 || row['user_disabled'] == true,
        permissions: parsePermissions(row['user_permissions']),
      );

  Map<String, Object?> createToken(
    UserRecord user, {
    required String name,
    int? expiresInDays,
  }) {
    final clean = name.trim();
    if (clean.isEmpty || clean.length > 80) {
      throw ApiException.badRequest('令牌名称不能为空且不超过 80 个字符');
    }
    final token = 'vps_${CryptoUtil.randomToken()}';
    final expiresAt = expiresInDays == null || expiresInDays <= 0
        ? null
        : DateTime.now()
            .add(Duration(days: expiresInDays))
            .millisecondsSinceEpoch;
    final id = tokens.create(
      userId: user.id,
      name: clean,
      tokenHash: CryptoUtil.sha256Hex(token),
      expiresAt: expiresAt,
    );
    return {
      'id': id,
      'name': clean,
      'token': token,
      'createdAt': DateTime.now().millisecondsSinceEpoch,
      'expiresAt': expiresAt,
    };
  }

  List<Map<String, Object?>> listTokens(UserRecord user) =>
      tokens.list(user.id);

  bool deleteToken(UserRecord user, int id) => tokens.delete(user.id, id);

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

/// Permissions a non-admin account can be granted.
const assignablePermissions = [
  'download',
  'manage_sources',
  'clear_cache',
  'nsfw',
];

List<String> parsePermissions(Object? raw) {
  if (raw is! String || raw.trim().isEmpty) return const [];
  try {
    final decoded = jsonDecode(raw);
    if (decoded is List) {
      return decoded
          .map((value) => value.toString())
          .where(assignablePermissions.contains)
          .toList();
    }
  } catch (_) {}
  return const [];
}

void requirePermission(Request request, String permission) {
  final auth = requireAuth(request);
  if (!auth.user.hasPermission(permission)) {
    throw ApiException.forbidden('没有权限执行此操作');
  }
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
      'permissions': user.permissions,
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
    throw ApiException.badRequest('需要 JSON 对象');
  } on FormatException {
    throw ApiException.badRequest('JSON 格式无效');
  }
}
