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
        throw ApiException.badRequest('Setting is server-only: ${entry.key}');
      }
      if (!writableSettings.contains(entry.key)) {
        throw ApiException.badRequest('Unknown setting: ${entry.key}');
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
      throw ApiException.badRequest('$key must be a boolean');
    }
    if (defaultVal is num && value is! num) {
      throw ApiException.badRequest('$key must be a number');
    }
    if (defaultVal is String && value is! String) {
      throw ApiException.badRequest('$key must be a string');
    }
    if (defaultVal is List && value is! List) {
      throw ApiException.badRequest('$key must be a list');
    }
    if (defaultVal is Map && value is! Map) {
      throw ApiException.badRequest('$key must be an object');
    }
  }

  List<Map<String, Object?>> searchHistory(int userId) =>
      repository.searchHistory(userId);

  void addSearchHistory(int userId, String keyword) {
    if (keyword.trim().isEmpty)
      throw ApiException.badRequest('Keyword required');
    repository.addSearchHistory(userId, keyword);
  }

  void clearSearchHistory(int userId) => repository.clearSearchHistory(userId);

  void deleteSearchHistory(int userId, String keyword) {
    if (keyword.trim().isEmpty) {
      throw ApiException.badRequest('Keyword required');
    }
    repository.deleteSearchHistory(userId, keyword);
  }
}
