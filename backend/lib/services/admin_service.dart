import '../repositories/user_repository.dart';
import '../util/crypto.dart';
import '../util/errors.dart';
import '../util/log.dart';
import 'auth_service.dart';

class AdminService {
  final UserRepository users;
  final SessionRepository sessions;
  final AuditRepository audit;

  AdminService({
    required this.users,
    required this.sessions,
    required this.audit,
  });

  List<Map<String, Object?>> list() => users.all().map(userJson).toList();

  Future<UserRecord> create({
    required String username,
    required String password,
    String role = 'user',
    int? actorId,
    String? ip,
  }) async {
    validate(username, password, role);
    if (users.byUsername(username.trim()) != null) {
      throw ApiException.conflict('用户名已存在');
    }
    final hash = await CryptoUtil.hashPassword(password);
    final user =
        users.create(username: username.trim(), passwordHash: hash, role: role);
    audit.log('user_create',
        userId: actorId,
        ip: ip,
        detail: {'target': user.id, 'username': user.username});
    Log.info('User created', userId: actorId, extra: {'target': user.id});
    return user;
  }

  Future<UserRecord> update(
    int id, {
    String? password,
    String? role,
    bool? disabled,
    required int actorId,
    String? ip,
  }) async {
    final user = users.byId(id);
    if (user == null) throw ApiException.notFound('未找到用户');
    if (role != null && role != 'admin' && role != 'user') {
      throw ApiException.badRequest('角色无效');
    }
    if (id == actorId && (disabled == true || role == 'user')) {
      throw ApiException.badRequest('不能降级或禁用自己的账号');
    }
    if (user.isAdmin &&
        (role == 'user' || disabled == true) &&
        users.adminCount() <= 1) {
      throw ApiException.badRequest('不能移除最后一个管理员');
    }
    String? hash;
    if (password != null) {
      if (password.length < 6) {
        throw ApiException.badRequest('密码至少需要 6 个字符');
      }
      hash = await CryptoUtil.hashPassword(password);
    }
    users.update(id, passwordHash: hash, role: role, disabled: disabled);
    if (disabled == true || hash != null) {
      sessions.deleteForUser(id);
    }
    audit.log('user_update', userId: actorId, ip: ip, detail: {
      'target': id,
      if (role != null) 'role': role,
      if (disabled != null) 'disabled': disabled,
      if (hash != null) 'passwordChanged': true,
    });
    return users.byId(id)!;
  }

  void delete(int id, {required int actorId, String? ip}) {
    final user = users.byId(id);
    if (user == null) throw ApiException.notFound('未找到用户');
    if (id == actorId) throw ApiException.badRequest('不能删除自己');
    if (user.isAdmin && users.adminCount() <= 1) {
      throw ApiException.badRequest('不能删除最后一个管理员');
    }
    users.delete(id);
    audit.log('user_delete',
        userId: actorId,
        ip: ip,
        detail: {'target': id, 'username': user.username});
    Log.info('User deleted', userId: actorId, extra: {'target': id});
  }

  void validate(String username, String password, String role) {
    if (username.trim().isEmpty) {
      throw ApiException.badRequest('用户名不能为空');
    }
    if (username.trim().length > 64) {
      throw ApiException.badRequest('用户名过长');
    }
    if (password.length < 6) {
      throw ApiException.badRequest('密码至少需要 6 个字符');
    }
    if (role != 'admin' && role != 'user') {
      throw ApiException.badRequest('角色无效');
    }
  }
}
