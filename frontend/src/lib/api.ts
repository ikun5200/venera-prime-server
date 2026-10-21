import type {
  CatalogEntry,
  Comic,
  ComicDetails,
  Comment,
  DownloadJob,
  FavoriteFolder,
  FavoriteItem,
  FollowUpdateConfig,
  FollowUpdateOverview,
  HistoryItem,
  ImageFavorite,
  LocalComic,
  Paged,
  ReadLaterItem,
  Settings,
  Source,
  SourceLibrary,
  SourceSettings,
  StatisticsSummary,
  TaskItem,
  User,
  WebDavConfig,
} from "./types";

export class ApiError extends Error {
  code: string;
  status: number;
  requestId: string;

  constructor(
    message: string,
    code: string,
    status: number,
    requestId: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

/** React Query retry policy: retry transient failures once, never 4xx. */
export function shouldRetryRequest(
  failureCount: number,
  error: unknown,
): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 1;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body &&
    !(init.body instanceof FormData) &&
    !headers.has("content-type")
  ) {
    headers.set("content-type", "application/json");
  }
  headers.set("x-requested-with", "venera-web");
  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const error =
      data && typeof data === "object" && "error" in data
        ? (
            data as {
              error: { code?: string; message?: string; requestId?: string };
            }
          ).error
        : {};
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent("venera:unauthorized"));
    }
    throw new ApiError(
      error.message ?? `Request failed (${response.status})`,
      error.code ?? "UNKNOWN",
      response.status,
      error.requestId ?? "",
    );
  }
  return data as T;
}

const get = <T>(path: string, init?: RequestInit) => request<T>(path, init);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const patch = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const del = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: "DELETE",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const enc = encodeURIComponent;

export interface SourceUrlResult {
  source: Source | null;
  library?: SourceLibrary | null;
  items?: SourceLibrary[];
}

export const api = {
  health: () =>
    get<{
      status: string;
      version: string;
      uptime: number;
      initialized: boolean;
    }>("/health"),
  initStatus: () => get<{ initialized: boolean }>("/init/status"),
  init: (username: string, password: string) =>
    post<{ user: User }>("/init", { username, password }),
  login: (username: string, password: string) =>
    post<{ user: User }>("/auth/login", { username, password }),
  logout: () => post<{ ok: boolean }>("/auth/logout"),
  me: () => get<{ user: User }>("/auth/me"),

  adminUsers: () => get<{ items: User[] }>("/admin/users"),
  adminCreateUser: (
    username: string,
    password: string,
    role: "admin" | "user",
  ) => post<{ user: User }>("/admin/users", { username, password, role }),
  adminUpdateUser: (
    id: number,
    body: { password?: string; role?: string; disabled?: boolean },
  ) => patch<{ user: User }>(`/admin/users/${id}`, body),
  adminDeleteUser: (id: number) => del<{ ok: boolean }>(`/admin/users/${id}`),
  adminAudit: (page = 1) =>
    get<Paged<Record<string, unknown>>>(
      `/admin/audit?page=${page}&pageSize=50`,
    ),

  settings: () => get<Settings>("/settings"),
  updateSettings: (patchValue: Settings) =>
    patch<Settings>("/settings", patchValue),
  searchHistory: () =>
    get<{ items: { keyword: string; createdAt: number }[] }>(
      "/settings/search-history",
    ),
  addSearchHistory: (keyword: string) =>
    post<{ items: { keyword: string; createdAt: number }[] }>(
      "/settings/search-history",
      { keyword },
    ),
  clearSearchHistory: () => del<{ ok: boolean }>("/settings/search-history"),
  searchSuggestions: (q: string, source?: string) => {
    const params = new URLSearchParams({ q });
    if (source) params.set("source", source);
    return get<{
      items: {
        value: string;
        namespace?: string | null;
        translated?: string | null;
      }[];
    }>(`/search/suggestions?${params}`);
  },
  selectSuggestion: (source: string, namespace: string, tag: string) =>
    post<{ result: string }>("/search/suggestion", { source, namespace, tag }),
  deleteSearchHistory: (keyword: string) =>
    del<{ items: { keyword: string; createdAt: number }[] }>(
      `/settings/search-history/${enc(keyword)}`,
    ),

  tasks: () => get<{ items: TaskItem[] }>("/tasks"),
  clearTasks: () => del<{ items: TaskItem[] }>("/tasks"),
  cancelTask: (id: string) =>
    post<{ items: TaskItem[] }>(`/tasks/${enc(id)}/cancel`),
  logs: () =>
    get<{
      items: Record<string, unknown>[];
      requests: Record<string, unknown>[];
    }>("/logs"),
  clearLogs: () => del<{ ok: boolean }>("/logs"),

  sources: () => get<{ items: Source[] }>("/sources"),
  source: (key: string) =>
    get<{ source: Source; provenance: Record<string, unknown> | null }>(
      `/sources/${enc(key)}`,
    ),
  importSource: (script: string) =>
    post<{ source: Source }>("/sources", { script }),
  importSourceFile: (script: string) =>
    request<{ source: Source }>("/sources/import", {
      method: "POST",
      headers: { "content-type": "application/javascript" },
      body: script,
    }),
  addSourceUrl: (url: string) => post<SourceUrlResult>("/sources/url", { url }),
  updateSource: (key: string, script: string) =>
    put<{ source: Source }>(`/sources/${enc(key)}`, { script }),
  updateSourceFromUrl: (key: string) =>
    post<{ source: Source }>(`/sources/${enc(key)}/update`),
  patchSource: (key: string, body: { enabled?: boolean }) =>
    patch<{ source: Source }>(`/sources/${enc(key)}`, body),
  deleteSource: (key: string) => del<{ ok: boolean }>(`/sources/${enc(key)}`),
  reorderSources: (keys: string[]) =>
    post<{ items: Source[] }>("/sources/reorder", { keys }),
  sourceSettings: (key: string) =>
    get<SourceSettings>(`/sources/${enc(key)}/settings`),
  updateSourceSettings: (key: string, values: Record<string, unknown>) =>
    put<SourceSettings>(`/sources/${enc(key)}/settings`, { values }),
  sourceSettingCallback: (key: string, setting: string) =>
    post<{ result: unknown }>(
      `/sources/${enc(key)}/settings/${enc(setting)}/callback`,
    ),
  loginSource: (key: string, username: string, password: string) =>
    post<{ source: Source }>(`/sources/${enc(key)}/login`, {
      username,
      password,
    }),
  loginSourceCookies: (key: string, values: Record<string, string>) =>
    post<{ source: Source }>(`/sources/${enc(key)}/login-cookies`, { values }),
  importSourceCookies: (key: string, cookies: Record<string, unknown>[]) =>
    post<{ source: Source }>(`/sources/${enc(key)}/cookies`, { cookies }),
  logoutSource: (key: string) =>
    post<{ source: Source }>(`/sources/${enc(key)}/logout`),
  checkSource: (key: string, comicId?: string) =>
    get<Record<string, unknown>>(
      `/sources/${enc(key)}/check${comicId ? `?comicId=${enc(comicId)}` : ""}`,
    ),
  bindSource: (key: string, libraryId: string, fileName?: string) =>
    post<{ source: Source }>(`/sources/${enc(key)}/bind`, {
      libraryId,
      fileName,
    }),

  libraries: () => get<{ items: SourceLibrary[] }>("/source-libraries"),
  addLibrary: (name: string, url: string) =>
    post<{ items: SourceLibrary[] }>("/source-libraries", { name, url }),
  patchLibrary: (id: string, body: { name?: string; enabled?: boolean }) =>
    patch<{ items: SourceLibrary[] }>(`/source-libraries/${enc(id)}`, body),
  deleteLibrary: (id: string) =>
    del<{ items: SourceLibrary[] }>(`/source-libraries/${enc(id)}`),
  libraryCatalog: (id: string) =>
    get<{ items: CatalogEntry[]; library: SourceLibrary }>(
      `/source-libraries/${enc(id)}/catalog`,
    ),
  installLibraryEntry: (
    id: string,
    entry: { url?: string; entryId?: string },
  ) => post<{ source: Source }>(`/source-libraries/${enc(id)}/install`, entry),

  search: (
    source: string,
    q: string,
    options: string[],
    page: number,
    signal?: AbortSignal,
    refresh = false,
  ) => {
    const params = new URLSearchParams({ source, q, page: String(page) });
    if (options.length) params.set("options", options.join(","));
    if (refresh) params.set("refresh", "1");
    return get<{ comics: Comic[]; maxPage: number; page: number }>(
      `/search?${params}`,
      signal ? { signal } : undefined,
    );
  },
  aggregatedSearch: (q: string) =>
    get<{
      sections: {
        source: string;
        name: string;
        comics: Comic[];
        maxPage: number;
        error: string | null;
      }[];
    }>(`/search/aggregated?q=${enc(q)}`),
  explore: (source: string, page: number, refresh = false) =>
    get<{
      source: string;
      page: number;
      pages: {
        index: number;
        title: string;
        type: string;
        data: unknown;
        error: string | null;
      }[];
    }>(
      `/explore?source=${enc(source)}&page=${page}${refresh ? "&refresh=1" : ""}`,
    ),
  categories: (source: string) =>
    get<{
      source: string;
      title: string;
      enableRankingPage: boolean;
      parts: {
        name: string;
        type: string;
        randomNumber?: number;
        itemType?: string;
        categoryParams?: string[];
        groupParam?: string;
        categories: { label: string; target: unknown }[];
      }[];
    }>(`/categories?source=${enc(source)}`),
  categoryComics: (
    source: string,
    category: string,
    param: unknown,
    options: string[],
    page: number,
  ) => {
    const params = new URLSearchParams({
      source,
      category,
      page: String(page),
    });
    if (param !== null && param !== undefined)
      params.set("param", JSON.stringify(param));
    if (options.length) params.set("options", options.join(","));
    return get<{ comics: Comic[]; maxPage: number; page: number }>(
      `/category-comics?${params}`,
    );
  },
  ranking: (source: string, option: string, page: number) =>
    get<{ comics: Comic[]; maxPage: number; page: number }>(
      `/ranking?source=${enc(source)}&option=${enc(option)}&page=${page}`,
    ),

  comic: (source: string, id: string) =>
    get<ComicDetails>(`/comic/${enc(source)}/${enc(id)}`),
  chapterImages: (source: string, id: string, ep: string) =>
    get<{ images: string[]; total: number }>(
      `/comic/${enc(source)}/${enc(id)}/chapter/${enc(ep)}/images`,
    ),
  prefetchChapter: (
    source: string,
    id: string,
    ep: string,
    from = 1,
    limit?: number,
  ) =>
    post<{ enabled: boolean; running: boolean; limit?: number }>(
      `/comic/${enc(source)}/${enc(id)}/chapter/${enc(ep)}/prefetch`,
      { from, ...(limit === undefined ? {} : { limit }) },
    ),
  thumbnails: (source: string, id: string, next?: string) =>
    get<{ thumbnails: unknown; next: unknown }>(
      `/comic/${enc(source)}/${enc(id)}/thumbnails${next ? `?next=${enc(next)}` : ""}`,
    ),
  comments: (
    source: string,
    id: string,
    page = 1,
    subId?: string,
    replyTo?: unknown,
  ) => {
    const params = new URLSearchParams({ page: String(page) });
    if (subId) params.set("subId", subId);
    if (replyTo) params.set("replyTo", JSON.stringify(replyTo));
    return get<{ comments: Comment[]; maxPage: number; page: number }>(
      `/comic/${enc(source)}/${enc(id)}/comments?${params}`,
    );
  },
  sendComment: (
    source: string,
    id: string,
    content: string,
    subId?: string,
    replyTo?: unknown,
  ) =>
    post<{ result: unknown }>(`/comic/${enc(source)}/${enc(id)}/comments`, {
      content,
      subId,
      replyTo,
    }),
  chapterComments: (
    source: string,
    id: string,
    ep: string,
    page = 1,
    replyTo?: unknown,
  ) => {
    const params = new URLSearchParams({ page: String(page) });
    if (replyTo) params.set("replyTo", JSON.stringify(replyTo));
    return get<{ comments: Comment[]; maxPage: number; page: number }>(
      `/comic/${enc(source)}/${enc(id)}/chapter/${enc(ep)}/comments?${params}`,
    );
  },
  sendChapterComment: (
    source: string,
    id: string,
    ep: string,
    content: string,
    replyTo?: unknown,
  ) =>
    post<{ result: unknown }>(
      `/comic/${enc(source)}/${enc(id)}/chapter/${enc(ep)}/comments`,
      {
        content,
        replyTo,
      },
    ),
  likeChapterComment: (
    source: string,
    id: string,
    ep: string,
    commentId: string,
    like: boolean,
  ) =>
    post<{ result: unknown }>(
      `/comic/${enc(source)}/${enc(id)}/chapter/${enc(ep)}/comment-like`,
      { commentId, like },
    ),
  voteChapterComment: (
    source: string,
    id: string,
    ep: string,
    commentId: string,
    up: boolean,
    cancel: boolean,
  ) =>
    post<{ result: unknown }>(
      `/comic/${enc(source)}/${enc(id)}/chapter/${enc(ep)}/comment-vote`,
      { commentId, up, cancel },
    ),
  likeComic: (source: string, id: string, like: boolean) =>
    post<{ result: unknown }>(`/comic/${enc(source)}/${enc(id)}/like`, {
      like,
    }),
  rateComic: (source: string, id: string, rating: number) =>
    post<{ result: unknown }>(`/comic/${enc(source)}/${enc(id)}/rating`, {
      rating,
    }),
  likeComment: (
    source: string,
    id: string,
    commentId: string,
    like: boolean,
    subId?: string,
  ) =>
    post<{ result: unknown }>(`/comic/${enc(source)}/${enc(id)}/comment-like`, {
      commentId,
      subId,
      like,
    }),
  voteComment: (
    source: string,
    id: string,
    commentId: string,
    up: boolean,
    cancel: boolean,
    subId?: string,
  ) =>
    post<{ result: unknown }>(`/comic/${enc(source)}/${enc(id)}/comment-vote`, {
      commentId,
      subId,
      up,
      cancel,
    }),
  archives: (source: string, id: string) =>
    get<{ items: Record<string, unknown>[] }>(
      `/comic/${enc(source)}/${enc(id)}/archives`,
    ),
  archiveUrl: (source: string, id: string, archiveId: string) =>
    post<{ url: unknown }>(`/comic/${enc(source)}/${enc(id)}/archive-url`, {
      archiveId,
    }),

  favoriteFolders: () => get<{ items: FavoriteFolder[] }>("/favorites/folders"),
  createFavoriteFolder: (name: string) =>
    post<{ id: number; items: FavoriteFolder[] }>("/favorites/folders", {
      name,
    }),
  renameFavoriteFolder: (id: number, name: string) =>
    patch<{ items: FavoriteFolder[] }>(`/favorites/folders/${id}`, { name }),
  deleteFavoriteFolder: (id: number) =>
    del<{ items: FavoriteFolder[] }>(`/favorites/folders/${id}`),
  sortFavoriteFolders: (ids: number[]) =>
    post<{ items: FavoriteFolder[] }>("/favorites/folders/sort", { ids }),
  favorites: (params: {
    folderId?: number;
    q?: string;
    status?: string;
    page?: number;
  }) => {
    const search = new URLSearchParams();
    if (params.folderId !== undefined)
      search.set("folderId", String(params.folderId));
    if (params.q) search.set("q", params.q);
    if (params.status) search.set("status", params.status);
    search.set("page", String(params.page ?? 1));
    return get<Paged<FavoriteItem>>(`/favorites?${search}`);
  },
  addFavorite: <T extends { id: string }>(
    folderId: number,
    comic: T,
    atStart = false,
  ) =>
    post<{ items: FavoriteFolder[] }>("/favorites", {
      folderId,
      comic,
      atStart,
    }),
  removeFavorite: (folderId: number, comicType: number, comicId: string) =>
    del<{ ok: boolean }>(`/favorites/${folderId}/${comicType}/${enc(comicId)}`),
  moveFavorites: (
    from: number,
    to: number,
    items: { comicId: string; comicType: number }[],
  ) => post<{ ok: boolean }>("/favorites/move", { from, to, items }),
  copyFavorites: (
    from: number,
    to: number,
    items: { comicId: string; comicType: number }[],
  ) => post<{ ok: boolean }>("/favorites/copy", { from, to, items }),
  batchDeleteFavorites: (
    items: { comicId: string; comicType: number; folderId?: number }[],
  ) => post<{ ok: boolean }>("/favorites/batch-delete", { items }),
  deleteUnavailableFavorites: () =>
    post<{ removed: number }>("/favorites/delete-unavailable"),
  updateFavoriteInfo: (folderId?: number) =>
    post<{ ok: boolean }>("/favorites/update-info", { folderId }),
  exportFavorites: (folderId: number) =>
    get<Record<string, unknown>>(`/favorites/export?folderId=${folderId}`),
  importFavorites: (data: unknown) =>
    post<{ folder: FavoriteFolder }>("/favorites/import", { data }),
  importNetworkFolder: (
    source: string,
    folder: string | null,
    name: string | undefined,
    pages = 20,
  ) =>
    post<{
      folder: FavoriteFolder;
      imported: number;
      received: number;
      pages: number;
    }>("/favorites/import-network", { source, folder, name, pages }),
  syncFavoriteFolder: (folderId: number, pages = 20) =>
    post<{ imported: number; received: number; pages: number }>(
      `/favorites/folders/${folderId}/sync`,
      { pages },
    ),
  networkFolders: (source: string, comicId?: string, refresh = false) => {
    const params = new URLSearchParams();
    if (comicId) params.set("comicId", comicId);
    if (refresh) params.set("refresh", "1");
    const query = params.toString();
    return get<{ folders: Record<string, string>; favorited: string[] }>(
      `/favorites/network/${enc(source)}${query ? `?${query}` : ""}`,
    );
  },
  networkComics: (
    source: string,
    folder: string | null,
    page = 1,
    refresh = false,
  ) =>
    get<{ comics: Comic[]; maxPage: number; page: number }>(
      `/favorites/network/${enc(source)}/${folder === null ? "all" : enc(JSON.stringify(folder))}?page=${page}${refresh ? "&refresh=1" : ""}`,
    ),
  toggleNetworkFavorite: (
    source: string,
    comicId: string,
    folderId: unknown,
    add: boolean,
    favoriteId?: unknown,
  ) =>
    post<{ result: unknown }>(`/favorites/network/${enc(source)}`, {
      comicId,
      folderId,
      add,
      favoriteId,
    }),
  addNetworkFolder: (source: string, name: string) =>
    post<{ result: unknown }>(`/favorites/network/${enc(source)}/folder`, {
      name,
    }),
  deleteNetworkFolder: (source: string, folderId: unknown) =>
    del<{ result: unknown }>(
      `/favorites/network/${enc(source)}/folder/${enc(JSON.stringify(folderId))}`,
    ),

  history: (params: { q?: string; page?: number } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    search.set("page", String(params.page ?? 1));
    return get<Paged<HistoryItem>>(`/history?${search}`);
  },
  saveProgress: (body: Record<string, unknown>) =>
    put<{ ok: boolean }>("/history", body),
  deleteHistory: (comicType: number, comicId: string) =>
    del<{ ok: boolean }>(`/history/${comicType}/${enc(comicId)}`),
  clearHistory: (unfavoritedOnly = false) =>
    post<{ ok: boolean }>("/history/clear", { unfavoritedOnly }),
  refreshHistory: (ids?: unknown[]) =>
    post<{ ok: boolean }>("/history/refresh", { ids }),
  progress: (source: string, id: string) =>
    get<Record<string, unknown>>(`/progress/${enc(source)}/${enc(id)}`),

  readLater: (q?: string) =>
    get<{ items: ReadLaterItem[]; count: number }>(
      `/read-later${q ? `?q=${enc(q)}` : ""}`,
    ),
  addReadLater: <T extends { id: string }>(comic: T) =>
    post<{ added: boolean }>("/read-later", { comic }),
  removeReadLater: (comicType: number, comicId: string) =>
    del<{ ok: boolean }>(`/read-later/${comicType}/${enc(comicId)}`),
  batchDeleteReadLater: (items: { comicId: string; comicType: number }[]) =>
    post<{ ok: boolean }>("/read-later/batch-delete", { items }),
  restoreReadLater: (items: ReadLaterItem[]) =>
    post<{ ok: boolean }>("/read-later/restore", { items }),
  clearReadLater: () => del<{ ok: boolean }>("/read-later"),

  followUpdatesConfig: () => get<FollowUpdateConfig>("/follow-updates/config"),
  saveFollowUpdatesConfig: (body: Partial<FollowUpdateConfig>) =>
    put<FollowUpdateConfig>("/follow-updates/config", body),
  followUpdates: () => get<FollowUpdateOverview>("/follow-updates"),
  checkFollowUpdates: () => post<{ ok: boolean }>("/follow-updates/check"),
  markFollowUpdatesRead: (ids?: unknown[]) =>
    post<{ ok: boolean }>("/follow-updates/mark-read", { ids }),

  downloads: () => get<{ items: DownloadJob[] }>("/downloads"),
  createDownload: (body: {
    source: string;
    comicId: string;
    chapters?: string[];
    archiveId?: string;
  }) => post<{ job: DownloadJob }>("/downloads", body),
  downloadAction: (
    id: string,
    action: "pause" | "resume" | "retry" | "cancel" | "first",
  ) => post<{ job: DownloadJob }>(`/downloads/${enc(id)}/${action}`),

  localComics: (params: { q?: string; sort?: string } = {}) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.sort) search.set("sort", params.sort);
    return get<{ items: LocalComic[] }>(`/local-comics?${search}`);
  },
  localComic: (id: number) => get<LocalComic>(`/local-comics/${id}`),
  refreshLocalLibrary: () => post<{ ok: boolean }>("/local-comics/refresh"),
  deleteLocalComic: (
    id: number,
    body: { removeFiles?: boolean; removeFavorites?: boolean } = {},
  ) => del<{ ok: boolean }>(`/local-comics/${id}`, body),
  deleteLocalChapters: (id: number, chapters: string[]) =>
    del<{ ok: boolean }>(`/local-comics/${id}/chapters`, { chapters }),
  localChapterImages: (id: number, chapter: string) =>
    get<{ images: string[]; total: number }>(
      `/local-comics/${id}/chapter/${enc(chapter)}/images`,
    ),
  uploads: () => get<{ items: Record<string, unknown>[] }>("/uploads"),

  webdav: () => get<WebDavConfig>("/webdav"),
  saveWebdav: (body: {
    url: string;
    username: string;
    password?: string;
    path?: string;
    autoSync?: boolean;
  }) => put<WebDavConfig>("/webdav", body),
  testWebdav: () => post<{ ok: boolean; status: number }>("/webdav/test"),
  uploadWebdav: () => post<{ ok: boolean; file: string }>("/webdav/upload"),
  downloadWebdav: () =>
    post<{ ok: boolean; file: string; imported: unknown }>("/webdav/download"),

  statistics: (days = 30) => get<StatisticsSummary>(`/statistics?days=${days}`),
  recordStatistics: (body: Record<string, unknown>) =>
    post<{ ok: boolean }>("/statistics", body),
  clearStatistics: () => del<{ ok: boolean }>("/statistics"),
  deleteStatistics: (comicType: number, comicId: string) =>
    del<{ ok: boolean }>(`/statistics/${comicType}/${enc(comicId)}`),

  imageFavorites: (
    params: {
      q?: string;
      sort?: string;
      filter?: string;
      minCount?: number;
    } = {},
  ) => {
    const search = new URLSearchParams();
    if (params.q) search.set("q", params.q);
    if (params.sort) search.set("sort", params.sort);
    if (params.filter) search.set("filter", params.filter);
    if (params.minCount) search.set("minCount", String(params.minCount));
    return get<{ items: ImageFavorite[]; total: number }>(
      `/image-favorites?${search}`,
    );
  },
  addImageFavorite: (body: Record<string, unknown>) =>
    post<{ ok: boolean }>("/image-favorites", body),
  removeImageFavorite: (comicId: string, sourceKey: string) =>
    del<{ ok: boolean }>(`/image-favorites/${enc(comicId)}/${enc(sourceKey)}`),
  removeImageFavoritePage: (body: Record<string, unknown>) =>
    del<{ ok: boolean }>("/image-favorites/pages", body),
  imageFavoriteStats: () =>
    get<{
      tags: { label: string; count: number }[];
      authors: { label: string; count: number }[];
      comics: { title: string; count: number }[];
      total: number;
    }>("/image-favorites/stats"),

  cacheSize: () => get<{ bytes: number }>("/maintenance/cache-size"),
  clearCache: () => post<{ ok: boolean }>("/maintenance/clear-cache"),
  cacheStats: (params: { source?: string; comic?: string } = {}) => {
    const query = new URLSearchParams();
    if (params.source) query.set("source", params.source);
    if (params.comic) query.set("comic", params.comic);
    const suffix = query.toString();
    return get<{
      bytes: number;
      images: {
        entries: number;
        bytes: number;
        bySource: { source: string; entries: number; bytes: number }[];
        chapters: { ep: string; images: number; bytes: number }[];
      };
      metadata: {
        entries: number;
        bytes: number;
        byKind: { kind: string; entries: number; bytes: number }[];
        bySource: { source: string; entries: number; bytes: number }[];
      };
    }>(`/maintenance/cache${suffix ? `?${suffix}` : ""}`);
  },
  clearCacheScope: (
    scope: "all" | "images" | "metadata",
    options: { sourceKey?: string; kind?: string } = {},
  ) =>
    post<{
      ok: boolean;
      metadataRemoved: number;
      imagesRemoved: number;
      cache: unknown;
    }>("/maintenance/cache/clear", { scope, ...options }),
  storagePath: () => get<{ path: string }>("/settings/storage"),
  resolveLink: (url: string) =>
    post<{ result: { source: string; comicId: string } | null }>(
      "/toolbox/link",
      { url },
    ),
  debugEval: (code: string) =>
    post<{ result: unknown }>("/debug/eval", { code }),
  debugReload: () => post<{ ok: boolean }>("/debug/reload"),
};

export function imageUrl(
  source: string,
  comicId: string,
  epId: string,
  key: string,
  thumbnail = false,
): string {
  const params = new URLSearchParams({ source, comic: comicId, ep: epId, key });
  if (thumbnail) params.set("thumb", "true");
  return `/api/image?${params}`;
}

export function coverUrl(
  url: string,
  source?: string,
  comicId?: string,
): string {
  if (!url) return "";
  const params = new URLSearchParams({ url });
  if (source) params.set("source", source);
  if (comicId) params.set("comic", comicId);
  return `/api/image/cover?${params}`;
}

export function localImageUrl(
  id: number,
  chapter: string,
  page: number,
): string {
  return `/api/local-comics/${id}/image/${enc(chapter)}/${page}`;
}

export function localCoverUrl(id: number): string {
  return `/api/local-comics/${id}/cover`;
}

export async function uploadFile(
  file: File,
  onProgress?: (progress: number) => void,
): Promise<{ uploadId: string; size: number }> {
  const init = await post<{ uploadId: string; offset: number }>(
    "/uploads/init",
    {
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
    },
  );
  const chunkSize = 4 * 1024 * 1024;
  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + chunkSize, file.size));
    const response = await fetch(
      `/api/uploads/${init.uploadId}/chunk?offset=${offset}`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "x-requested-with": "venera-web" },
        body: chunk,
      },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Upload failed (${response.status})`);
    }
    const data = (await response.json()) as { offset: number };
    offset = data.offset;
    onProgress?.(file.size === 0 ? 1 : offset / file.size);
  }
  return { uploadId: init.uploadId, size: file.size };
}

export async function completeUpload(uploadId: string, importComic = true) {
  return post<{ upload: Record<string, unknown>; comic?: LocalComic }>(
    `/uploads/${enc(uploadId)}/complete`,
    { import: importComic },
  );
}

export async function downloadUrl(
  path: string,
  filename: string,
): Promise<void> {
  const response = await fetch(path, { credentials: "include" });
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function backupExportUrl(): string {
  return "/api/backup/export";
}

export async function importBackup(
  file: File,
): Promise<Record<string, unknown>> {
  const response = await fetch("/api/backup/import", {
    method: "POST",
    credentials: "include",
    headers: { "x-requested-with": "venera-web" },
    body: file,
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) {
    const error =
      data && typeof data === "object" && "error" in data
        ? (data as { error: { message?: string } }).error
        : {};
    throw new Error(error.message ?? `Import failed (${response.status})`);
  }
  return (data ?? {}) as Record<string, unknown>;
}
