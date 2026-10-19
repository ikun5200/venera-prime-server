/// Default values for every user setting, mirroring the original
/// `appdata.dart` defaults.
library;

const Map<String, Object?> defaultSettings = {
  // Explore
  'comicDisplayMode': 'detailed',
  'comicTileScale': 1.0,
  'explore_pages': <String>[],
  'categories': <String>[],
  'favorites': <String>[],
  'searchSources': null,
  'showFavoriteStatusOnTile': true,
  'showHistoryStatusOnTile': false,
  'reverseChapterOrder': false,
  'blockedWords': <String>[],
  'blockedCommentWords': <String>[],
  'defaultSearchTarget': null,
  'autoAddLanguageFilter': 'none',
  'initialPage': '0',
  'comicListDisplayMode': 'paging',

  // Reader
  'readerMode': 'galleryLeftToRight',
  'readerTwoPageSpread': false,
  'readerPageMarginEnabled': false,
  'readerPageMarginPercent': 19.3,
  'readerScreenPicNumberForLandscape': 1,
  'readerScreenPicNumberForPortrait': 1,
  'enableTapToTurnPages': true,
  'reverseTapToTurnPages': false,
  'enablePageAnimation': true,
  'flashWhiteScreenOnPageTurn': false,
  'autoPageTurningInterval': 5,
  'showSingleImageOnFirstPage': false,
  'readerScrollSpeed': 1.0,
  'enableDoubleTapToZoom': true,
  'enableLongPressToZoom': true,
  'longPressZoomPosition': 'press',
  'limitImageWidth': true,
  'enableTurnPageByVolumeKey': true,
  'enableClockAndBatteryInfoInReader': true,
  'showSystemStatusBar': false,
  'quickCollectImage': 'No',
  'preloadImageCount': 4,
  'showPageNumberInReader': true,
  'removeReadLaterOnComplete': true,
  'showChapterComments': true,
  'showChapterCommentsAtEnd': false,
  'hideDuplicateChapters': true,
  'readerBackground': 'theme',
  'readerNightMode': 'none',
  'readerNightModeIntensity': 0.25,
  'readerOrientationBehavior': 'keepAfterExit',
  'rememberReaderOrientation': false,
  'rememberReaderOrientationPerComic': false,
  'enableCustomImageProcessing': false,
  'customImageProcessing': '',
  'comicSpecificSettings': <String, Object?>{},
  'deviceSpecificSettings': <String, Object?>{},
  'deviceId': '',

  // Appearance
  'homeLayout': <String, Object?>{},
  'theme_mode': 'system',
  'color': 'system',

  // Local favorites
  'localFavoritesFirst': true,
  'autoCloseFavoritePanel': false,
  'favoriteFolderTitleAction': 'openSidebar',
  'newFavoriteAddTo': 'end',
  'moveFavoriteAfterRead': 'none',
  'quickFavorite': null,
  'onClickFavorite': 'viewDetail',

  // App
  'showBackgroundTaskButton': true,
  'cacheSize': 2048,
  'cacheRetentionDays': 7,
  'language': 'system',
  'convertTraditionalToSimplified': false,
  'authorizationRequired': false,
  'disableSyncFields': '',
  'dataVersion': 0,
  'recordReadingStatistics': true,

  // Network
  'proxy': 'system',
  'enableDnsOverrides': false,
  'dnsOverrides': <String, String>{},
  'sni': true,
  'downloadThreads': 5,
  'ignoreBadCertificate': false,

  // About
  'checkUpdateOnStart': true,
  'autoUpdateComicSources': false,

  // Follow updates
  'followUpdatesFolder': null,
  'followUpdatesCheckOnStart': true,
  'followUpdatesCheckIntervalHours': 24,
  'followUpdatesCheckFixedTime': '',

  // Sources
  'comicSourceOrder': <String>[],
  'comicSourceLibraries': <Object?>[],
  'comicSourceProvenance': <String, Object?>{},
  'comicSourceLibrariesMigrated': false,
  'comicSourceListUrl':
      'https://cdn.jsdelivr.net/gh/venera-app/venera-configs@main/index.json',

  // Per-comic overrides
  'comicChapterOrder': <String, Object?>{},
  'comicChapterReadingOrder': <String, Object?>{},
  'detectedChapterReadingOrder': <String, Object?>{},

  // Device-local / implicit
  'webdavAutoSync': false,
  'webdavLastBackup': null,
  'readerOrientationMode': 'automatic',
  'readerOrientationModesByComic': <String, Object?>{},
  'backgroundTaskHistory': <String, Object?>{},
  'cacheMaintenance': null,
  'comicSourceUpdateHistory': <Object?>[],
  'favoriteFolder': null,
  'favoritesOverviewColumns': 2,
  'image_favorites_sort': 'Title',
  'image_favorites_time_filter': 'all',
  'image_favorites_number_filter': 0,
  'local_favorites_read_filter': 'All',
  'local_favorites_update_page_num': 9999999,
  'local_sort': 'name',
  'ua': null,
};

Map<String, Object?> mergeSettings(Map<String, Object?> stored) => {
      ...defaultSettings,
      ...stored,
    };

/// Settings that must never be exposed to the client or synced.
const Set<String> serverOnlySettings = {'webdav', 'webdavPassword'};

/// Settings accepted by PATCH /api/settings.
Set<String> get writableSettings =>
    defaultSettings.keys.where((k) => !serverOnlySettings.contains(k)).toSet();
