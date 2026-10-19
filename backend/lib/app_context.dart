import 'dart:io';

import 'config.dart';
import 'db/database.dart';
import 'repositories/image_favorite_repository.dart';
import 'repositories/library_repository.dart';
import 'repositories/local_repository.dart';
import 'repositories/source_repository.dart';
import 'repositories/user_repository.dart';
import 'services/admin_service.dart';
import 'services/auth_service.dart';
import 'services/comic_service.dart';
import 'services/download_service.dart';
import 'services/js_host_client.dart';
import 'services/library_service.dart';
import 'services/local_service.dart';
import 'services/settings_service.dart';
import 'services/source_service.dart';
import 'services/task_service.dart';
import 'services/webdav_service.dart';
import 'util/path_guard.dart';

class AppContext {
  final Config config;
  final Db db;
  final PathGuard paths;
  final DateTime startedAt = DateTime.now();

  late final UserRepository users;
  late final SessionRepository sessions;
  late final SettingsRepository settingsRepository;
  late final AuditRepository audit;
  late final SourceRepository sourceRepository;
  late final FavoriteRepository favoriteRepository;
  late final HistoryRepository historyRepository;
  late final ReadLaterRepository readLaterRepository;
  late final ImageFavoriteRepository imageFavoriteRepository;
  late final StatisticsRepository statisticsRepository;
  late final FollowUpdateRepository followUpdateRepository;
  late final LocalRepository localRepository;

  late final JsHostClient js;
  late final AuthService auth;
  late final AdminService admin;
  late final SettingsService settings;
  late final TaskService tasks;
  late final SourceService sources;
  late final ComicService comics;
  late final FavoriteService favorites;
  late final HistoryService history;
  late final ReadLaterService readLater;
  late final ImageFavoriteService imageFavorites;
  late final StatisticsService statistics;
  late final FollowUpdateService followUpdates;
  late final LocalService local;
  late final DownloadService downloads;
  late final BackupService backup;
  late final WebDavService webdav;

  AppContext(this.config, this.db) : paths = PathGuard(config.dataDir) {
    Directory(config.dataDir).createSync(recursive: true);
    users = UserRepository(db);
    sessions = SessionRepository(db);
    settingsRepository = SettingsRepository(db);
    audit = AuditRepository(db);
    sourceRepository = SourceRepository(db);
    favoriteRepository = FavoriteRepository(db);
    historyRepository = HistoryRepository(db);
    readLaterRepository = ReadLaterRepository(db);
    imageFavoriteRepository = ImageFavoriteRepository(db);
    statisticsRepository = StatisticsRepository(db);
    followUpdateRepository = FollowUpdateRepository(db);
    localRepository = LocalRepository(db);

    js = JsHostClient(config);
    auth = AuthService(
      config: config,
      db: db,
      users: users,
      sessions: sessions,
      audit: audit,
    );
    admin = AdminService(users: users, sessions: sessions, audit: audit);
    settings = SettingsService(settingsRepository);
    tasks = TaskService();
    sources = SourceService(
      config: config,
      db: db,
      repository: sourceRepository,
      settingsRepository: settingsRepository,
      audit: audit,
      js: js,
    );
    comics = ComicService(
      config: config,
      sources: sources,
      sourceRepository: sourceRepository,
      history: historyRepository,
      favorites: favoriteRepository,
      paths: paths,
    );
    favorites = FavoriteService(
      favorites: favoriteRepository,
      sources: sourceRepository,
      sourceService: sources,
      comics: comics,
      tasks: tasks,
      history: historyRepository,
      db: db,
    );
    history = HistoryService(
      repository: historyRepository,
      comics: comics,
      tasks: tasks,
      favorites: favoriteRepository,
    );
    readLater = ReadLaterService(readLaterRepository);
    imageFavorites = ImageFavoriteService(imageFavoriteRepository);
    statistics = StatisticsService(statisticsRepository);
    followUpdates = FollowUpdateService(
      repository: followUpdateRepository,
      favorites: favoriteRepository,
      comics: comics,
      sources: sourceRepository,
      tasks: tasks,
    );
    local = LocalService(
      db: db,
      repository: localRepository,
      history: historyRepository,
      favorites: favoriteRepository,
      paths: paths,
    );
    downloads = DownloadService(
      config: config,
      repository: localRepository,
      sources: sourceRepository,
      settings: settingsRepository,
      sourceService: sources,
      comics: comics,
      local: local,
      paths: paths,
    );
    backup = BackupService(
      db: db,
      users: users,
      settings: settingsRepository,
      sources: sourceRepository,
      sourceService: sources,
      favorites: favoriteRepository,
      history: historyRepository,
      readLater: readLaterRepository,
      imageFavorites: imageFavoriteRepository,
    );
    webdav = WebDavService(
      config: config,
      repository: localRepository,
      backup: backup,
    );
  }

  Future<void> dispose() async {
    await js.dispose();
    db.close();
  }

  Map<String, Object?> health() => {
        'status': 'ok',
        'version': config.appVersion,
        'uptime': DateTime.now().difference(startedAt).inSeconds,
        'initialized': auth.initialized,
      };
}
