import '../repositories/user_repository.dart';
import '../util/errors.dart';
import '../util/settings_defaults.dart';

class SettingsService {
  final SettingsRepository repository;
  SettingsService(this.repository);

  Map<String, Object?> get(int userId) => mergeSettings(repository.all(userId));

  Map<String, Object?> update(int userId, Map<String, Object?> patch) {
    final clean = <String, Object?>{};
    for (final entry in patch.entries) {
      if (serverOnlySettings.contains(entry.key)) {
        throw ApiException.badRequest('该设置为服务器专用: ${entry.key}');
      }
      if (!writableSettings.contains(entry.key)) {
        throw ApiException.badRequest('未知设置: ${entry.key}');
      }
      _validate(entry.key, entry.value);
      clean[entry.key] = entry.value;
    }
    repository.setMany(userId, clean);
    return get(userId);
  }

  void _validate(String key, Object? value) {
    final defaultVal = defaultSettings[key];
    if (defaultVal == null) return; // nullable setting, any JSON accepted
    if (defaultVal is bool && value is! bool) {
      throw ApiException.badRequest('@key 必须是布尔值');
    }
    if (defaultVal is num && value is! num) {
      throw ApiException.badRequest('@key 必须是数字');
    }
    if (defaultVal is String && value is! String) {
      throw ApiException.badRequest('@key 必须是字符串');
    }
    if (defaultVal is List && value is! List) {
      throw ApiException.badRequest('@key 必须是数组');
    }
    if (defaultVal is Map && value is! Map) {
      throw ApiException.badRequest('@key 必须是对象');
    }
  }

  List<Map<String, Object?>> searchHistory(int userId) =>
      repository.searchHistory(userId);

  void addSearchHistory(int userId, String keyword) {
    if (keyword.trim().isEmpty)
      throw ApiException.badRequest('缺少关键词');
    repository.addSearchHistory(userId, keyword);
  }

  void clearSearchHistory(int userId) => repository.clearSearchHistory(userId);

  void deleteSearchHistory(int userId, String keyword) {
    if (keyword.trim().isEmpty) {
      throw ApiException.badRequest('缺少关键词');
    }
    repository.deleteSearchHistory(userId, keyword);
  }
}
