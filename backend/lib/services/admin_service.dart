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
      throw ApiException.conflict('Username already exists');
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
    if (user == null) throw ApiException.notFound('User not found');
    if (role != null && role != 'admin' && role != 'user') {
      throw ApiException.badRequest('Invalid role');
    }
    if (id == actorId && (disabled == true || role == 'user')) {
      throw ApiException.badRequest('Cannot demote or disable yourself');
    }
    if (user.isAdmin &&
        (role == 'user' || disabled == true) &&
        users.adminCount() <= 1) {
      throw ApiException.badRequest('Cannot remove the last administrator');
    }
    String? hash;
    if (password != null) {
      if (password.length < 6) {
        throw ApiException.badRequest('Password must be at least 6 characters');
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
    if (user == null) throw ApiException.notFound('User not found');
    if (id == actorId) throw ApiException.badRequest('Cannot delete yourself');
    if (user.isAdmin && users.adminCount() <= 1) {
      throw ApiException.badRequest('Cannot delete the last administrator');
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
      throw ApiException.badRequest('Username cannot be empty');
    }
    if (username.trim().length > 64) {
      throw ApiException.badRequest('Username is too long');
    }
    if (password.length < 6) {
      throw ApiException.badRequest('Password must be at least 6 characters');
    }
    if (role != 'admin' && role != 'user') {
      throw ApiException.badRequest('Invalid role');
    }
  }
}
