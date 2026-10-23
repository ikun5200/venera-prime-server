export interface User {
  id: number;
  username: string;
  role: "admin" | "user";
  createdAt: number;
  disabled: boolean;
  permissions?: string[];
}

export type ChapterMap = Record<string, string | Record<string, string>>;

export interface Comic {
  id: string;
  title: string;
  subtitle: string;
  cover: string;
  tags: string[];
  description: string;
  sourceKey: string;
  maxPage?: number;
  language?: string;
  stars?: number;
  comicType?: number;
}

export interface Progress {
  id: string;
  comicType: number;
  sourceKey: string;
  title: string;
  subtitle: string;
  cover: string;
  time: number;
  ep: number;
  page: number;
  chapterGroup?: number | null;
  chapterId?: string | null;
  readEpisode: unknown[];
  maxPage?: number | null;
}

export interface ComicDetails extends Omit<Comic, "tags"> {
  comicId: string;
  comicType: number;
  subTitle: string;
  tags: Record<string, string[]>;
  chapters: ChapterMap;
  chapterCount: number;
  thumbnails?: unknown;
  recommend: Comic[];
  commentCount?: number | null;
  likesCount?: number | null;
  isLiked?: boolean | null;
  isFavorite?: boolean | null;
  subId?: string | null;
  uploader?: string | null;
  updateTime?: string | null;
  status?: string | null;
  updateStrategy?: string;
  uploadTime?: string | null;
  url?: string | null;
  progress?: Progress | null;
  favoriteFolders: number[];
  localComicId?: number | null;
  cache?: {
    hit: boolean;
    stale: boolean;
    fetchedAt: number;
    expiresAt: number;
    error?: string;
  } | null;
}

export interface Chapter {
  id: string;
  title: string;
  group?: string;
  index: number;
}

export interface Comment {
  id: string;
  userName: string;
  avatar?: string | null;
  content: string;
  time: string;
  replyCount?: number | null;
  score?: number | null;
  isLiked?: boolean | null;
  voteStatus?: number | null;
}

export interface Source {
  key: string;
  name: string;
  version: string;
  url: string;
  minAppVersion: string;
  enabled: boolean;
  sortOrder: number;
  capabilities: Record<string, unknown>;
  account: { loggedIn: boolean; kind: string | null };
  createdAt: number;
  updatedAt: number;
  script?: string;
  data?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  translation?: Record<string, unknown>;
}

export interface SourceSettingDef {
  type: "select" | "switch" | "input" | "callback";
  title?: string;
  options?: { value?: string; text?: string }[];
  default?: unknown;
  buttonText?: string;
  validator?: string;
}

export interface SourceSettings {
  definitions: Record<string, SourceSettingDef>;
  values: Record<string, unknown>;
}

export interface FavoriteFolder {
  id: number;
  name: string;
  sortOrder: number;
  count: number;
  sourceKey?: string | null;
  sourceFolder?: string | null;
  createdAt: number;
}

export interface FavoriteItem {
  id: string;
  comicType: number;
  sourceKey?: string;
  title: string;
  subtitle: string;
  cover: string;
  description?: string;
  tags: unknown[];
  translatedTags: unknown[];
  folderId: number;
  favoritedAt: string;
  displayOrder: number;
  lastUpdateTime?: string | null;
  hasNewUpdate: boolean;
  lastCheckTime?: number | null;
  lastAttemptTime?: number | null;
}

export interface HistoryItem {
  id: string;
  comicType: number;
  sourceKey: string;
  title: string;
  subtitle: string;
  cover: string;
  time: number;
  ep: number;
  page: number;
  chapterGroup?: number | null;
  chapterId?: string | null;
  readEpisode: unknown[];
  maxPage?: number | null;
}

export interface ReadLaterItem {
  id: string;
  comicType: number;
  sourceKey: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  cover: string;
  addedAt: number;
}

export interface LocalChapter {
  id: string;
  title: string;
  group?: string | null;
  index: number;
  downloaded: boolean;
}

export interface LocalComic {
  id: number;
  title: string;
  subtitle: string;
  description: string;
  tags: unknown[];
  directory: string;
  chapters: ChapterMap;
  chapterList: LocalChapter[];
  cover: string;
  coverUrl?: string | null;
  comicType: number;
  downloadedChapters: unknown[];
  createdAt: number;
  managedByApp: boolean;
  sourceKey?: string | null;
  comicId?: string | null;
}

export interface DownloadChapter {
  id: string;
  name: string;
  status: string;
  totalPages: number;
  downloadedPages: number;
}

export interface DownloadJob {
  id: string;
  kind: string;
  sourceKey: string;
  comicId: string;
  comicType: number;
  title: string;
  cover: string;
  state: string;
  progress: number;
  total: number;
  error?: string | null;
  queueOrder?: number;
  createdAt: number;
  updatedAt: number;
  payload: Record<string, unknown>;
  chapters: DownloadChapter[];
}

export interface ImageFavoritePage {
  page: number;
  imageKey: string;
  isAutoFavorite?: boolean;
}

export interface ImageFavoriteChapter {
  eid: string;
  ep: number;
  epName: string;
  maxPage: number;
  images: ImageFavoritePage[];
}

export interface ImageFavorite {
  id: string;
  sourceKey: string;
  title: string;
  subtitle: string;
  author: string;
  tags: unknown[];
  translatedTags: unknown[];
  cover: string;
  time: number;
  maxPage: number;
  count: number;
  chapters: ImageFavoriteChapter[];
}

export interface StatisticsSummary {
  todaySeconds: number;
  weekSeconds: number;
  totalSeconds: number;
  daily: { day: string; seconds: number }[];
  recent: {
    id: string;
    comicType: number;
    title: string;
    author: string;
    cover: string;
    sourceKey?: string;
    seconds: number;
    lastReadAt: number;
  }[];
}

export interface TaskItem {
  id: string;
  type: string;
  title: string;
  status: "running" | "completed" | "failed" | "cancelled";
  progress: number;
  message: string;
  error?: string | null;
  result?: unknown;
  createdAt: number;
  updatedAt: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SourceLibrary {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
  lastChecked?: number | null;
}

export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  url?: string | null;
}

export interface WebDavConfig {
  configured: boolean;
  url: string;
  username: string;
  path: string;
  autoSync: boolean;
  dataVersion: number;
  lastBackupName?: string | null;
  lastAutoBackupAt?: number | null;
  updatedAt?: number | null;
}

export interface FollowUpdateConfig {
  folderId?: number | null;
  checkOnStart: boolean;
  intervalHours: number;
  fixedTime: string;
}

export interface FollowUpdateOverview {
  configured: boolean;
  config: FollowUpdateConfig;
  folder?: FavoriteFolder | null;
  updates: FavoriteItem[];
  comics: FavoriteItem[];
  count: number;
}

export type Settings = Record<string, unknown>;

export interface ApiTokenInfo {
  id: number;
  name: string;
  createdAt: number;
  lastUsedAt?: number | null;
  expiresAt?: number | null;
  token?: string;
}
