import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Heart,
  ListOrdered,
  MessageSquare,
  MoreHorizontal,
  Play,
  Share2,
  Star,
  ThumbsUp,
  X,
} from "lucide-react";
import { api, coverUrl, downloadUrl } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type {
  Chapter,
  ComicDetails,
  Comment,
  FavoriteFolder,
} from "../lib/types";
import {
  chapterGroups,
  cn,
  copyText,
  flattenChapters,
  friendlyError,
  sortChapters,
  type ChapterOrder,
} from "../lib/utils";
import { ComicGrid } from "../components/ComicCard";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  IconButton,
  Menu,
  Modal,
  PromptDialog,
  Select,
  Skeleton,
  Spinner,
  Textarea,
} from "../components/ui";
import { comicPath, readerPath } from "../lib/links";

const chapterOrderOptions: { value: ChapterOrder; label: string }[] = [
  { value: "source", label: "Source order" },
  { value: "reverse", label: "Reversed source order" },
  { value: "titleAscending", label: "Chapter title ascending" },
  { value: "titleDescending", label: "Chapter title descending" },
];

const readingOrderOptions = [
  { value: "automatic", label: "Automatic (chapter links)" },
  { value: "source", label: "Source order (earliest first)" },
  { value: "reverse", label: "Source order (latest first)" },
];

export default function ComicDetailPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { source = "", id = "" } = useParams();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);

  const comicKey = `${id}@${source}`;
  const [order, setOrder] = useState<ChapterOrder>(
    (settings.comicChapterOrder as Record<string, ChapterOrder>)?.[comicKey] ??
      (settings.reverseChapterOrder ? "reverse" : "source"),
  );
  const [readingOrder, setReadingOrder] = useState(
    (settings.comicChapterReadingOrder as Record<string, string>)?.[comicKey] ??
      "automatic",
  );
  const [group, setGroup] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [coverZoomed, setCoverZoomed] = useState(false);
  const [coverBarVisible, setCoverBarVisible] = useState(true);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(
    new Set(),
  );
  const [browserDownloading, setBrowserDownloading] = useState(false);
  const [selectedArchive, setSelectedArchive] = useState("");
  const [thumbsOpen, setThumbsOpen] = useState(false);
  const [thumbsNext, setThumbsNext] = useState<string | undefined>(undefined);
  const archivesQuery = useQuery({
    queryKey: ["archives", source, id],
    queryFn: () => api.archives(source, id),
    enabled: Boolean(source && id),
  });
  const thumbnailsQuery = useQuery({
    queryKey: ["thumbnails", source, id, thumbsNext],
    queryFn: () => api.thumbnails(source, id, thumbsNext),
    enabled: thumbsOpen && Boolean(source && id),
  });

  const comic = useQuery({
    queryKey: ["comic", source, id],
    queryFn: () => api.comic(source, id),
    enabled: Boolean(source && id),
  });
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const sourceInfo = sources.data?.items.find((item) => item.key === source);
  const folders = useQuery({
    queryKey: ["favorite-folders"],
    queryFn: api.favoriteFolders,
  });
  const readLater = useQuery({
    queryKey: ["read-later"],
    queryFn: () => api.readLater(),
  });
  const commentsPreview = useQuery({
    queryKey: ["comic-comments-preview", source, id],
    queryFn: () => api.comments(source, id, 1, comic.data?.subId ?? undefined),
    enabled: Boolean(source && id && comic.data?.commentCount !== 0),
  });

  const data = comic.data;
  const chapterList = useMemo(() => {
    const all = data ? flattenChapters(data.chapters) : [];
    if (settings.hideDuplicateChapters === false) return all;
    const seen = new Set<string>();
    return all.filter((chapter) => {
      const key = chapter.title.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data, settings.hideDuplicateChapters]);
  const ordered = useMemo(
    () => sortChapters(chapterList, order),
    [chapterList, order],
  );
  const groups = useMemo(
    () => (data ? chapterGroups(data.chapters) : []),
    [data],
  );
  const isGrouped = groups.some((item) => item.name);
  const currentGroup = group || (isGrouped ? (groups[0]?.name ?? "") : "");
  const groupChapters = isGrouped
    ? sortChapters(
        groups.find((item) => item.name === currentGroup)?.chapters ?? [],
        order,
      )
    : ordered;
  const shownChapters = showAll ? groupChapters : groupChapters.slice(0, 60);

  const inReadLater = (readLater.data?.items ?? []).some(
    (item) => item.id === id && item.sourceKey === source,
  );
  const favoriteFolders = data?.favoriteFolders ?? [];

  useEffect(() => {
    if (isGrouped && !group && groups.length > 0) setGroup(groups[0].name);
  }, [group, groups, isGrouped]);

  const openChapter = (chapter: Chapter, page = 1) => {
    navigate(readerPath(source, id, { chapter: chapter.id, page }));
  };

  const continueReading = () => {
    if (!data?.progress) {
      if (ordered[0]) openChapter(ordered[0], 1);
      return;
    }
    const index = Math.max(0, (data.progress.ep ?? 1) - 1);
    const chapter = chapterList[index] ?? ordered[0];
    if (chapter) openChapter(chapter, data.progress.page ?? 1);
  };

  const saveSettings = async (patch: Record<string, unknown>) => {
    try {
      const updated = await api.updateSettings(patch);
      setSettings(updated);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const changeOrder = (value: ChapterOrder) => {
    setOrder(value);
    saveSettings({
      comicChapterOrder: {
        ...((settings.comicChapterOrder as object) ?? {}),
        [comicKey]: value,
      },
    });
  };

  const changeReadingOrder = (value: string) => {
    setReadingOrder(value);
    saveSettings({
      comicChapterReadingOrder: {
        ...((settings.comicChapterReadingOrder as object) ?? {}),
        [comicKey]: value,
      },
    });
  };

  const like = useMutation({
    mutationFn: () => api.likeComic(source, id, !data?.isLiked),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["comic", source, id] });
      toast.success(t("Updated"));
    },
    onError: (error) => toast.error(error.message),
  });

  const rate = useMutation({
    mutationFn: (value: number) => api.rateComic(source, id, value),
    onSuccess: () => {
      toast.success(t("Success"));
      setRatingOpen(false);
      queryClient.invalidateQueries({ queryKey: ["comic", source, id] });
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleReadLater = useMutation({
    mutationFn: async () => {
      if (inReadLater) {
        await api.removeReadLater(data?.comicType ?? 0, id);
      } else if (data) {
        await api.addReadLater(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["read-later"] });
      toast.success(inReadLater ? t("Removed") : t("Added to Read later"));
    },
    onError: (error) => toast.error(error.message),
  });

  const browserDownload = async (chapters?: string[]) => {
    setBrowserDownloading(true);
    try {
      const params = new URLSearchParams({ source, comicId: id });
      if (chapters && chapters.length > 0)
        params.set("chapters", chapters.join(","));
      await downloadUrl(
        `/api/downloads/browser?${params}`,
        `${data?.title ?? "comic"}.zip`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBrowserDownloading(false);
    }
  };

  const createDownload = useMutation({
    mutationFn: (chapters?: string[]) =>
      api.createDownload({
        source,
        comicId: id,
        chapters,
        archiveId: selectedArchive || undefined,
      }),
    onSuccess: () => {
      toast.success(t("Added to download queue"));
      setDownloadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
      navigate("/downloads");
    },
    onError: (error) => toast.error(error.message),
  });

  const applyFavoriteFolder = (folderId: number, add: boolean) => {
    queryClient.setQueryData<ComicDetails | undefined>(
      ["comic", source, id],
      (old) => {
        if (!old) return old;
        const current = old.favoriteFolders ?? [];
        const next = add
          ? current.includes(folderId)
            ? current
            : [...current, folderId]
          : current.filter((value) => value !== folderId);
        return {
          ...old,
          favoriteFolders: next,
          isFavorite: next.length > 0,
        };
      },
    );
  };

  const addToFolder = useMutation({
    mutationFn: (folder: FavoriteFolder) =>
      api.addFavorite(folder.id, data!, settings.newFavoriteAddTo === "start"),
    onSuccess: (_result, folder) => {
      // The comic details refetch hits the source again; when that request
      // fails (rate limits are common) the drawer would keep showing stale
      // membership, so apply the known change to the cache first.
      applyFavoriteFolder(folder.id, true);
      queryClient.invalidateQueries({ queryKey: ["comic", source, id] });
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      if (settings.autoCloseFavoritePanel === true) setFavoriteOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const removeFromFolder = useMutation({
    mutationFn: (folder: FavoriteFolder) =>
      api.removeFavorite(folder.id, data?.comicType ?? 0, id),
    onSuccess: (_result, folder) => {
      applyFavoriteFolder(folder.id, false);
      queryClient.invalidateQueries({ queryKey: ["comic", source, id] });
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      if (settings.autoCloseFavoritePanel === true) setFavoriteOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const created = await api.createFavoriteFolder(name);
      const folder = created.items.find((item) => item.name === name);
      if (folder && data) await api.addFavorite(folder.id, data);
      return folder?.id ?? null;
    },
    onSuccess: (folderId) => {
      if (folderId !== null) applyFavoriteFolder(folderId, true);
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
      queryClient.invalidateQueries({ queryKey: ["comic", source, id] });
    },
    onError: (error) => toast.error(error.message),
  });

  const share = async () => {
    if (!data) return;
    const url = data.url ?? window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: data.title, url });
      } else {
        await copyText(url);
        toast.success(t("Copied"));
      }
    } catch {
      // User cancelled the share sheet.
    }
  };

  if (comic.isLoading || comic.isPending) {
    return (
      <>
        <PageHeader title={t("Comic details")} />
        <PageBody>
          <p className="mb-4 text-[12px] text-muted">
            {t("Loading comic details…")}
          </p>
          <div className="flex flex-col gap-6 md:flex-row">
            <Skeleton className="aspect-[2/3] w-[180px] shrink-0 rounded-card md:w-[220px]" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-10 w-full" />
            ))}
          </div>
        </PageBody>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title={t("Comic details")} />
        <PageBody>
          <EmptyState
            title={t("Error")}
            description={
              comic.error ? friendlyError(comic.error) : t("Unknown error")
            }
            action={
              <Button onClick={() => comic.refetch()}>{t("Retry")}</Button>
            }
          />
        </PageBody>
      </>
    );
  }

  const canComments =
    sourceInfo?.capabilities.comments === true &&
    settings.showChapterComments !== false;
  const isDownloaded = Boolean(data.localComicId);

  return (
    <>
      <PageHeader
        title={data.title}
        subtitle={sourceInfo?.name ?? source}
        actions={
          <Menu
            trigger={({ onClick, ...rest }) => (
              <IconButton label={t("More")} onClick={onClick} {...rest}>
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            )}
            items={[
              {
                label: inReadLater
                  ? t("Remove from Read Later")
                  : t("Read later"),
                onSelect: () => toggleReadLater.mutate(),
              },
              {
                label: t("Copy Title"),
                icon: <Copy className="h-3.5 w-3.5" />,
                onSelect: () =>
                  copyText(data.title).then(() => toast.success(t("Copied"))),
              },
              {
                label: t("Copy ID"),
                onSelect: () =>
                  copyText(data.id).then(() => toast.success(t("Copied"))),
              },
              ...(data.url
                ? [
                    {
                      label: t("Copy URL"),
                      onSelect: () =>
                        copyText(data.url!).then(() =>
                          toast.success(t("Copied")),
                        ),
                    },
                    {
                      label: t("Open in Browser"),
                      icon: <ExternalLink className="h-3.5 w-3.5" />,
                      onSelect: () =>
                        window.open(data.url!, "_blank", "noopener"),
                    },
                  ]
                : []),
            ]}
          />
        }
      />
      <PageBody wide>
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex flex-col gap-5 sm:flex-row lg:w-[320px] lg:shrink-0 lg:flex-col">
            <button
              onClick={() => setCoverOpen(true)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!data.cover) return;
                downloadUrl(coverUrl(data.cover, source, id), "cover.jpg").catch((error) =>
                  toast.error(
                    error instanceof Error ? error.message : String(error),
                  ),
                );
              }}
              className="relative aspect-[2/3] w-[150px] shrink-0 overflow-hidden rounded-card border border-border bg-surface2 sm:w-[180px]"
            >
              {data.cover ? (
                <img
                  src={coverUrl(data.cover, source, id)}
                  alt={data.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl text-muted">
                  {data.title.slice(0, 1)}
                </div>
              )}
            </button>
            {sourceInfo?.capabilities.thumbnails === true ? (
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 self-start"
                onClick={() => {
                  setThumbsNext(undefined);
                  setThumbsOpen(true);
                }}
              >
                {t("Thumbnails")}
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">
                {data.title}
              </h1>
              {data.cache?.stale ? (
                <span title={data.cache.error ?? undefined}>
                  <Badge tone="warning">{t("Cached")}</Badge>
                </span>
              ) : null}
              {data.subtitle ? (
                <button
                  className="mt-1 text-[13px] text-accent hover:underline"
                  onClick={() =>
                    navigate(
                      `/search/result?source=${encodeURIComponent(source)}&q=${encodeURIComponent(data.subtitle)}`,
                    )
                  }
                >
                  {data.subtitle}
                </button>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                <Badge>{sourceInfo?.name ?? source}</Badge>
                {data.stars ? (
                  <button
                    className="flex items-center gap-1 text-warning"
                    onClick={() => setRatingOpen(true)}
                  >
                    <Star className="h-3.5 w-3.5" fill="currentColor" />
                    {Number(data.stars).toFixed(2)}
                  </button>
                ) : null}
                {data.maxPage ? <span>{data.maxPage} pages</span> : null}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="primary" onClick={continueReading}>
                  <Play className="h-4 w-4" />
                  {data.progress ? t("Continue") : t("Start")}
                </Button>
                {isDownloaded ? (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      navigate(`/reader/local/${data.localComicId}`)
                    }
                  >
                    <Download className="h-4 w-4" />
                    {t("Read local")}
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    onClick={() => setDownloadOpen(true)}
                  >
                    <Download className="h-4 w-4" />
                    {t("Download")}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setFavoriteOpen(true)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    const quick = String(settings.quickFavorite ?? "");
                    if (!quick) {
                      toast.info(t("No quick favorite folder configured"));
                      return;
                    }
                    const folder = (folders.data?.items ?? []).find(
                      (item) => item.name === quick,
                    );
                    if (!folder) {
                      toast.info(t("Quick favorite folder not found"));
                      return;
                    }
                    if (favoriteFolders.includes(folder.id)) {
                      removeFromFolder.mutate(folder);
                    } else {
                      addToFolder.mutate(folder);
                    }
                  }}
                >
                  <Bookmark
                    className="h-4 w-4"
                    fill={favoriteFolders.length ? "currentColor" : "none"}
                  />
                  {t("Favorite")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    canComments
                      ? setCommentsOpen(true)
                      : toast.info(
                          t("Comments are not supported by this source"),
                        )
                  }
                >
                  <MessageSquare className="h-4 w-4" />
                  {t("Comments")}
                  {data.commentCount ? ` ${data.commentCount}` : ""}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => like.mutate()}
                  disabled={!sourceInfo?.capabilities.like}
                >
                  <Heart
                    className="h-4 w-4"
                    fill={data.isLiked ? "currentColor" : "none"}
                  />
                  {data.isLiked ? t("Liked") : t("Like")}
                  {data.likesCount ? ` ${data.likesCount}` : ""}
                </Button>
                <Button variant="secondary" onClick={share}>
                  <Share2 className="h-4 w-4" />
                  {t("Share")}
                </Button>
              </div>
              {data.progress ? (
                <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
                  <Clock className="h-3.5 w-3.5" />
                  {t("Last Reading")}: {data.progress.ep}:{data.progress.page}
                </p>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {data.description ? (
              <section className="mb-6">
                <h2 className="mb-2 text-[15px] font-semibold">
                  {t("Description")}
                </h2>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
                  {data.description}
                </p>
              </section>
            ) : null}

            <section className="mb-6">
              <h2 className="mb-2 text-[15px] font-semibold">
                {t("Information")}
              </h2>
              <div className="flex flex-col gap-2">
                {Object.entries(data.tags ?? {}).map(([namespace, values]) => (
                  <div
                    key={namespace}
                    className="flex flex-wrap items-center gap-1.5"
                  >
                    <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-muted">
                      {namespace}
                    </span>
                    {values.map((value) => (
                      <button
                        key={value}
                        title={t("Click to search, right-click to copy")}
                        onClick={() =>
                          navigate(
                            `/search/result?source=${encodeURIComponent(source)}&q=${encodeURIComponent(
                              namespace.toLowerCase() === "tags"
                                ? `tag:${value}`
                                : value,
                            )}`,
                          )
                        }
                        onContextMenu={(event) => {
                          event.preventDefault();
                          copyText(value).then(() =>
                            toast.success(t("Copied")),
                          );
                        }}
                        className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-fg hover:border-accent/40"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-muted sm:grid-cols-4">
                {data.uploader ? (
                  <span>{t("Uploader: @name", { name: data.uploader })}</span>
                ) : null}
                {data.uploadTime ? (
                  <span>
                    {t("Uploaded: @time", { time: data.uploadTime })}
                  </span>
                ) : null}
                {data.updateTime ? (
                  <span>{t("Updated: @time", { time: data.updateTime })}</span>
                ) : null}
                <span>
                  {t("Pages: @count", {
                    count: data.maxPage ?? data.chapterCount,
                  })}
                </span>
              </div>
            </section>

            <section className="mb-6">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">{t("Chapters")}</h2>
                <span className="text-[12px] text-muted">
                  {data.chapterCount}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Menu
                    trigger={({ onClick, ...rest }) => (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={onClick}
                        {...rest}
                      >
                        <ListOrdered className="h-3.5 w-3.5" />
                        {t(
                          chapterOrderOptions.find(
                            (item) => item.value === order,
                          )?.label ?? "",
                        )}
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    items={chapterOrderOptions.map((item) => ({
                      label: t(item.label),
                      onSelect: () => changeOrder(item.value),
                    }))}
                  />
                  <Menu
                    trigger={({ onClick, ...rest }) => (
                      <IconButton
                        label={`${t("Reading order")}: ${t(readingOrderOptions.find((item) => item.value === readingOrder)?.label ?? readingOrder)}`}
                        onClick={onClick}
                        {...rest}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </IconButton>
                    )}
                    items={readingOrderOptions.map((item) => ({
                      label: t(item.label),
                      onSelect: () => changeReadingOrder(item.value),
                    }))}
                  />
                </div>
              </div>

              {isGrouped ? (
                <div className="mb-3 flex gap-1 overflow-x-auto scrollbar-thin">
                  {groups.map((item) => (
                    <button
                      key={item.name}
                      onClick={() => setGroup(item.name)}
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1.5 text-[12px]",
                        currentGroup === item.name
                          ? "border-accent bg-accent/10 text-accent"
                          : "border-border bg-surface text-muted",
                      )}
                    >
                      {item.name || t("Default")}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-card border border-border">
                {shownChapters.map((chapter) => (
                  <button
                    key={chapter.id}
                    onClick={() => openChapter(chapter)}
                    className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-surface2"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px]">
                      {chapter.title}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                  </button>
                ))}
                {groupChapters.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[13px] text-muted">
                    {t("No chapters")}
                  </p>
                ) : null}
              </div>
              {groupChapters.length > 60 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setShowAll((value) => !value)}
                >
                  {showAll
                    ? t("Show less")
                    : t("Show all (@count)", { count: groupChapters.length })}
                </Button>
              ) : null}
            </section>

            {canComments && (commentsPreview.data?.comments.length ?? 0) > 0 ? (
              <section className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold">{t("Comments")}</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setCommentsOpen(true)}
                  >
                    {t("View more")}
                  </Button>
                </div>
                <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-thin">
                  {commentsPreview.data?.comments.slice(0, 6).map((comment) => (
                    <div
                      key={comment.id}
                      className="w-[240px] shrink-0 rounded-card border border-border bg-surface p-3"
                    >
                      <p className="truncate text-[12px] font-medium">
                        {comment.userName}
                      </p>
                      <p className="mt-1 line-clamp-2 text-[12px] text-muted">
                        {comment.content}
                      </p>
                      <p className="mt-1 text-[10px] text-muted">
                        {comment.time}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {(data.recommend?.length ?? 0) > 0 ? (
              <section>
                <h2 className="mb-3 text-[15px] font-semibold">
                  {t("Related")}
                </h2>
                <ComicGrid
                  comics={data.recommend}
                  onOpen={(item) =>
                    navigate(comicPath(item.sourceKey, item.id))
                  }
                />
              </section>
            ) : null}
          </div>
        </div>
      </PageBody>

      {/* Cover viewer */}
      <Modal
        open={coverOpen}
        onClose={() => {
          setCoverOpen(false);
          setCoverZoomed(false);
        }}
        width="max-w-3xl"
      >
        <div className="relative overflow-hidden">
          {coverBarVisible ? (
            <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-end gap-2 bg-black/55 px-2 py-1.5 backdrop-blur-sm">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  data.cover
                    ? downloadUrl(coverUrl(data.cover, source, id), "cover.jpg").catch(
                        (error) =>
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : String(error),
                          ),
                      )
                    : undefined
                }
              >
                {t("Save Image")}
              </Button>
              <Button size="sm" onClick={() => setCoverOpen(false)}>
                {t("Close")}
              </Button>
            </div>
          ) : null}
          <div className="flex min-h-[40dvh] items-center justify-center overflow-auto">
            {data.cover ? (
              <img
                src={coverUrl(data.cover, source, id)}
                alt={data.title}
                onClick={() => setCoverBarVisible((value) => !value)}
                onDoubleClick={() => setCoverZoomed((value) => !value)}
                className={cn(
                  "max-h-[80dvh] max-w-full select-none object-contain transition-transform duration-200",
                  coverZoomed ? "scale-[2] cursor-zoom-out" : "cursor-zoom-in",
                )}
              />
            ) : null}
          </div>
        </div>
      </Modal>

      {/* Favorite drawer */}
      <Drawer
        open={favoriteOpen}
        onClose={() => setFavoriteOpen(false)}
        title={t("Favorite")}
        footer={
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setNewFolderOpen(true)}
          >
            {t("New Folder")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {settings.localFavoritesFirst === false &&
          sourceInfo?.capabilities.favorites === true ? (
            <NetworkFavoriteSection source={source} comicId={id} />
          ) : null}
          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
              {t("Local")}
            </h3>
            <div className="flex flex-col gap-1">
              {(folders.data?.items ?? []).map((folder) => {
                const active = favoriteFolders.includes(folder.id);
                return (
                  <button
                    key={folder.id}
                    onClick={() =>
                      active
                        ? removeFromFolder.mutate(folder)
                        : addToFolder.mutate(folder)
                    }
                    className="flex items-center justify-between rounded px-2 py-2 text-left hover:bg-surface2"
                  >
                    <span className="truncate text-[13px]">{folder.name}</span>
                    <span className="text-[11px] text-muted">
                      {active ? t("Added") : folder.count}
                    </span>
                  </button>
                );
              })}
              {(folders.data?.items.length ?? 0) === 0 ? (
                <p className="px-2 text-[12px] text-muted">
                  {t("No folders available")}
                </p>
              ) : null}
            </div>
          </div>
          {sourceInfo?.capabilities.favorites === true &&
          settings.localFavoritesFirst !== false ? (
            <NetworkFavoriteSection source={source} comicId={id} />
          ) : null}
        </div>
      </Drawer>

      <PromptDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title={t("New Folder")}
        label={t("Folder Name")}
        onConfirm={(value) => createFolder.mutate(value)}
      />

      {/* Comments drawer */}
      <CommentsDrawer
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        source={source}
        comicId={id}
        subId={data.subId ?? undefined}
      />

      {/* Download dialog */}
      <Modal
        open={downloadOpen}
        onClose={() => setDownloadOpen(false)}
        title={t("Download")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDownloadOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="ghost"
              loading={browserDownloading}
              onClick={() =>
                browserDownload(
                  selectedChapters.size > 0 ? [...selectedChapters] : undefined,
                )
              }
            >
              {t("Download to browser")}
            </Button>
            <Button
              variant="secondary"
              loading={createDownload.isPending}
              onClick={() => createDownload.mutate([...selectedChapters])}
              disabled={selectedChapters.size === 0}
            >
              {t("Download Selected")}
            </Button>
            <Button
              variant="primary"
              loading={createDownload.isPending}
              onClick={() => createDownload.mutate(undefined)}
            >
              {t("Download All")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {archivesQuery.data?.items.length ? (
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[12px] text-muted">
                {t("Archive")}
              </span>
              <Select
                value={selectedArchive}
                onChange={(event) => setSelectedArchive(event.target.value)}
                className="flex-1"
              >
                <option value="">{t("Normal download")}</option>
                {archivesQuery.data.items.map((archive) => (
                  <option key={String(archive.id)} value={String(archive.id)}>
                    {String(archive.name ?? archive.id)}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="max-h-[50dvh] overflow-y-auto rounded border border-border">
            {chapterList.map((chapter) => (
              <label
                key={chapter.id}
                className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-[13px] last:border-b-0 hover:bg-surface2"
              >
                <input
                  type="checkbox"
                  checked={selectedChapters.has(chapter.id)}
                  onChange={(event) => {
                    const next = new Set(selectedChapters);
                    if (event.target.checked) next.add(chapter.id);
                    else next.delete(chapter.id);
                    setSelectedChapters(next);
                  }}
                  className="h-4 w-4 accent-[rgb(var(--accent))]"
                />
                <span className="truncate">{chapter.title}</span>
              </label>
            ))}
          </div>
        </div>
      </Modal>

      {/* Thumbnails preview */}
      <Modal
        open={thumbsOpen}
        onClose={() => setThumbsOpen(false)}
        title={t("Thumbnails")}
        width="max-w-4xl"
      >
        {thumbnailsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : thumbnailsQuery.isError ? (
          <EmptyState
            title={t("Error")}
            description={
              thumbnailsQuery.error instanceof Error
                ? thumbnailsQuery.error.message
                : String(thumbnailsQuery.error)
            }
            action={
              <Button size="sm" onClick={() => thumbnailsQuery.refetch()}>
                {t("Retry")}
              </Button>
            }
          />
        ) : ((thumbnailsQuery.data?.thumbnails as string[] | undefined) ?? [])
            .length === 0 ? (
          <EmptyState title={t("No data")} />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {(
              (thumbnailsQuery.data?.thumbnails as string[] | undefined) ?? []
            ).map((thumb, index) => (
              <button
                key={`${thumb}-${index}`}
                onClick={() =>
                  navigate(
                    readerPath(source, id, {
                      chapter: String(data.chapters[0] ?? "1"),
                      page: index + 1,
                    }),
                  )
                }
                className="group relative aspect-[3/4] overflow-hidden rounded-card border border-border bg-surface2"
              >
                <img
                  src={coverUrl(thumb)}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
                <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] tabular text-white">
                  {index + 1}
                </span>
              </button>
            ))}
          </div>
        )}
        {thumbnailsQuery.data?.next ? (
          <div className="mt-4 flex justify-center">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setThumbsNext(String(thumbnailsQuery.data?.next))}
            >
              {t("More")}
            </Button>
          </div>
        ) : null}
      </Modal>

      {/* Rating dialog */}
      <Modal
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
        title={t("Rate this comic")}
      >
        <div className="flex justify-center gap-2 py-4">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              onClick={() => rate.mutate(value)}
              className="rounded p-2 text-warning transition-transform duration-100 hover:scale-110"
              aria-label={`${value} stars`}
            >
              <Star className="h-8 w-8" />
            </button>
          ))}
        </div>
        {!sourceInfo?.capabilities.starRating ? (
          <p className="text-center text-[12px] text-muted">
            {t("This source does not support ratings.")}
          </p>
        ) : null}
      </Modal>
    </>
  );
}

function NetworkFavoriteSection({
  source,
  comicId,
}: {
  source: string;
  comicId: string;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["network-favorites", source, comicId],
    queryFn: () => api.networkFolders(source, comicId),
  });
  const toggle = useMutation({
    mutationFn: ({ folderId, add }: { folderId: unknown; add: boolean }) =>
      api.toggleNetworkFavorite(source, comicId, folderId, add),
    onSuccess: (_result, { folderId, add }) => {
      queryClient.setQueryData<{
        folders: Record<string, string>;
        favorited: string[];
      } | undefined>(["network-favorites", source, comicId], (old) => {
        if (!old) return old;
        const id = String(folderId);
        const next = new Set(old.favorited);
        if (add) next.add(id);
        else next.delete(id);
        return { ...old, favorited: [...next] };
      });
      queryClient.invalidateQueries({
        queryKey: ["network-favorites", source, comicId],
      });
      toast.success(t("Updated"));
    },
    onError: (error) => toast.error(error.message),
  });
  const folders = Object.entries(query.data?.folders ?? {});
  const favorited = new Set(query.data?.favorited ?? []);
  if (query.isLoading) return <Spinner />;
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
        {t("Network")}
      </h3>
      <div className="flex flex-col gap-1">
        {folders.map(([id, name]) => {
          const active = favorited.has(id);
          return (
            <button
              key={id}
              onClick={() => toggle.mutate({ folderId: id, add: !active })}
              className="flex items-center justify-between rounded px-2 py-2 text-left hover:bg-surface2"
            >
              <span className="truncate text-[13px]">{name}</span>
              <span className="text-[11px] text-muted">
                {active ? t("Added") : ""}
              </span>
            </button>
          );
        })}
        {folders.length === 0 ? (
          <p className="px-2 text-[12px] text-muted">
            {t("No folders available")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function CommentsDrawer({
  open,
  onClose,
  source,
  comicId,
  subId,
}: {
  open: boolean;
  onClose: () => void;
  source: string;
  comicId: string;
  subId?: string;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const query = useQuery({
    queryKey: ["comic-comments", source, comicId, subId, page],
    queryFn: () => api.comments(source, comicId, page, subId, replyTo?.id),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setPage(1);
      setReplyTo(null);
    }
  }, [open]);

  const send = useMutation({
    mutationFn: () =>
      api.sendComment(source, comicId, content, subId, replyTo?.id),
    onSuccess: () => {
      setContent("");
      setReplyTo(null);
      queryClient.invalidateQueries({
        queryKey: ["comic-comments", source, comicId],
      });
      queryClient.invalidateQueries({
        queryKey: ["comic-comments-preview", source, comicId],
      });
      toast.success(t("Comment sent"));
    },
    onError: (error) => toast.error(error.message),
  });

  const like = useMutation({
    mutationFn: (comment: Comment) =>
      api.likeComment(source, comicId, comment.id, !comment.isLiked, subId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["comic-comments", source, comicId],
      }),
    onError: (error) => toast.error(error.message),
  });

  const vote = useMutation({
    mutationFn: ({ comment, up }: { comment: Comment; up: boolean }) =>
      api.voteComment(
        source,
        comicId,
        comment.id,
        up,
        comment.voteStatus === (up ? 1 : -1),
        subId,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["comic-comments", source, comicId],
      }),
    onError: (error) => toast.error(error.message),
  });

  const comments = query.data?.comments ?? [];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("Comments")}
      width="sm:max-w-lg"
    >
      <div className="flex h-full flex-col">
        <div className="flex-1">
          {query.isLoading ? (
            <Spinner />
          ) : query.isError ? (
            <EmptyState
              title={t("Error")}
              description={
                query.error instanceof Error
                  ? query.error.message
                  : String(query.error)
              }
              action={
                <Button size="sm" onClick={() => query.refetch()}>
                  {t("Retry")}
                </Button>
              }
            />
          ) : comments.length === 0 ? (
            <EmptyState title={t("No comments yet")} />
          ) : (
            <div className="flex flex-col gap-3">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="rounded-card border border-border bg-surface p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">
                      {comment.userName}
                    </span>
                    <span className="text-[10px] text-muted">
                      {comment.time}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-fg">
                    {comment.content}
                  </p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
                    <button
                      className={cn(
                        "flex items-center gap-1",
                        comment.voteStatus === 1 && "text-accent",
                      )}
                      onClick={() => vote.mutate({ comment, up: true })}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> {comment.score ?? ""}
                    </button>
                    <button
                      className={cn(
                        "flex items-center gap-1",
                        comment.voteStatus === -1 && "text-accent",
                      )}
                      onClick={() => vote.mutate({ comment, up: false })}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className={cn(
                        "flex items-center gap-1",
                        comment.isLiked && "text-accent",
                      )}
                      onClick={() => like.mutate(comment)}
                    >
                      <Heart className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setReplyTo(comment)}>
                      {t("Replies")} {comment.replyCount ?? 0}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <span className="text-[11px] text-muted">
            {page} / {query.data?.maxPage ?? 1}
          </span>
          <Button
            size="sm"
            disabled={page >= (query.data?.maxPage ?? 1)}
            onClick={() => setPage((value) => value + 1)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-3 border-t border-border pt-3">
          {replyTo ? (
            <div className="mb-2 flex items-center gap-2 rounded bg-surface2 px-2 py-1.5 text-[11px] text-muted">
              Replying to {replyTo.userName}
              <button className="ml-auto" onClick={() => setReplyTo(null)}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Textarea
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder={t("Write a comment…")}
              className="min-h-[44px] flex-1 py-2"
            />
            <Button
              variant="primary"
              className="shrink-0 self-end"
              loading={send.isPending}
              disabled={!content.trim()}
              onClick={() => send.mutate()}
            >
              {t("Send")}
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
