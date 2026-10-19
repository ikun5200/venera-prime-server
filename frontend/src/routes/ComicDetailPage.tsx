import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
} from 'lucide-react';
import { api, coverUrl, downloadUrl } from '../lib/api';
import { useAppStore, toast } from '../lib/store';
import { useT } from '../lib/i18n';
import type { Chapter, Comment, FavoriteFolder } from '../lib/types';
import {
  chapterGroups,
  cn,
  copyText,
  flattenChapters,
  sortChapters,
  type ChapterOrder,
} from '../lib/utils';
import { ComicGrid } from '../components/ComicCard';
import { PageBody, PageHeader } from '../components/PageHeader';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  IconButton,
  Menu,
  Modal,
  PromptDialog,
  Skeleton,
  Spinner,
  Textarea,
} from '../components/ui';

const chapterOrderOptions: { value: ChapterOrder; label: string }[] = [
  { value: 'source', label: 'Source order' },
  { value: 'reverse', label: 'Reversed source order' },
  { value: 'titleAscending', label: 'Chapter title ascending' },
  { value: 'titleDescending', label: 'Chapter title descending' },
];

const readingOrderOptions = [
  { value: 'automatic', label: 'Automatic (chapter links)' },
  { value: 'source', label: 'Source order (earliest first)' },
  { value: 'reverse', label: 'Source order (latest first)' },
];

export default function ComicDetailPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { source = '', id = '' } = useParams();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);

  const comicKey = `${id}@${source}`;
  const [order, setOrder] = useState<ChapterOrder>(
    ((settings.comicChapterOrder as Record<string, ChapterOrder>)?.[comicKey]) ??
      (settings.reverseChapterOrder ? 'reverse' : 'source'),
  );
  const [readingOrder, setReadingOrder] = useState(
    (settings.comicChapterReadingOrder as Record<string, string>)?.[comicKey] ?? 'automatic',
  );
  const [group, setGroup] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [ratingOpen, setRatingOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [browserDownloading, setBrowserDownloading] = useState(false);

  const comic = useQuery({
    queryKey: ['comic', source, id],
    queryFn: () => api.comic(source, id),
    enabled: Boolean(source && id),
  });
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.sources });
  const sourceInfo = sources.data?.items.find((item) => item.key === source);
  const folders = useQuery({ queryKey: ['favorite-folders'], queryFn: api.favoriteFolders });
  const readLater = useQuery({ queryKey: ['read-later'], queryFn: () => api.readLater() });
  const commentsPreview = useQuery({
    queryKey: ['comic-comments-preview', source, id],
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
  const ordered = useMemo(() => sortChapters(chapterList, order), [chapterList, order]);
  const groups = useMemo(() => (data ? chapterGroups(data.chapters) : []), [data]);
  const isGrouped = groups.some((item) => item.name);
  const currentGroup = group || (isGrouped ? groups[0]?.name ?? '' : '');
  const groupChapters = isGrouped
    ? sortChapters(groups.find((item) => item.name === currentGroup)?.chapters ?? [], order)
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
    navigate(
      `/reader/${encodeURIComponent(source)}/${encodeURIComponent(id)}` +
        `?chapter=${encodeURIComponent(chapter.id)}&page=${page}`,
    );
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
      comicChapterOrder: { ...((settings.comicChapterOrder as object) ?? {}), [comicKey]: value },
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
      queryClient.invalidateQueries({ queryKey: ['comic', source, id] });
      toast.success('Updated');
    },
    onError: (error) => toast.error(error.message),
  });

  const rate = useMutation({
    mutationFn: (value: number) => api.rateComic(source, id, value),
    onSuccess: () => {
      toast.success('Success');
      setRatingOpen(false);
      queryClient.invalidateQueries({ queryKey: ['comic', source, id] });
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
      queryClient.invalidateQueries({ queryKey: ['read-later'] });
      toast.success(inReadLater ? 'Removed' : 'Added to Read later');
    },
    onError: (error) => toast.error(error.message),
  });

  const browserDownload = async (chapters?: string[]) => {
    setBrowserDownloading(true);
    try {
      const params = new URLSearchParams({ source, comicId: id });
      if (chapters && chapters.length > 0) params.set('chapters', chapters.join(','));
      await downloadUrl(`/api/downloads/browser?${params}`, `${data?.title ?? 'comic'}.zip`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBrowserDownloading(false);
    }
  };

  const createDownload = useMutation({
    mutationFn: (chapters?: string[]) =>
      api.createDownload({ source, comicId: id, chapters }),
    onSuccess: () => {
      toast.success('Added to download queue');
      setDownloadOpen(false);
      queryClient.invalidateQueries({ queryKey: ['downloads'] });
      navigate('/downloads');
    },
    onError: (error) => toast.error(error.message),
  });

  const addToFolder = useMutation({
    mutationFn: (folder: FavoriteFolder) =>
      api.addFavorite(folder.id, data!, settings.newFavoriteAddTo === 'start'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comic', source, id] });
      queryClient.invalidateQueries({ queryKey: ['favorite-folders'] });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      if (settings.autoCloseFavoritePanel === true) setFavoriteOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const removeFromFolder = useMutation({
    mutationFn: (folder: FavoriteFolder) =>
      api.removeFavorite(folder.id, data?.comicType ?? 0, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comic', source, id] });
      queryClient.invalidateQueries({ queryKey: ['favorite-folders'] });
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      if (settings.autoCloseFavoritePanel === true) setFavoriteOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const createFolder = useMutation({
    mutationFn: async (name: string) => {
      const created = await api.createFavoriteFolder(name);
      const folder = created.items.find((item) => item.name === name);
      if (folder && data) await api.addFavorite(folder.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorite-folders'] });
      queryClient.invalidateQueries({ queryKey: ['comic', source, id] });
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
        toast.success('Copied');
      }
    } catch {
      // User cancelled the share sheet.
    }
  };

  if (comic.isLoading) {
    return (
      <>
        <PageHeader title="Comic details" />
        <PageBody>
          <div className="flex flex-col gap-6 md:flex-row">
            <Skeleton className="aspect-[2/3] w-[180px] shrink-0 rounded-card md:w-[220px]" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-10 w-64" />
            </div>
          </div>
        </PageBody>
      </>
    );
  }

  if (comic.isError || !data) {
    return (
      <>
        <PageHeader title="Comic details" />
        <PageBody>
          <EmptyState
            title={t('Error')}
            description={comic.error instanceof Error ? comic.error.message : String(comic.error)}
            action={<Button onClick={() => comic.refetch()}>{t('Retry')}</Button>}
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
              <IconButton label="More" onClick={onClick} {...rest}>
                <MoreHorizontal className="h-4 w-4" />
              </IconButton>
            )}
            items={[
              {
                label: inReadLater ? t('Remove from Read Later') : t('Read later'),
                onSelect: () => toggleReadLater.mutate(),
              },
              {
                label: t('Copy Title'),
                icon: <Copy className="h-3.5 w-3.5" />,
                onSelect: () => copyText(data.title).then(() => toast.success('Copied')),
              },
              {
                label: t('Copy ID'),
                onSelect: () => copyText(data.id).then(() => toast.success('Copied')),
              },
              ...(data.url
                ? [
                    {
                      label: t('Copy URL'),
                      onSelect: () => copyText(data.url!).then(() => toast.success('Copied')),
                    },
                    {
                      label: t('Open in Browser'),
                      icon: <ExternalLink className="h-3.5 w-3.5" />,
                      onSelect: () => window.open(data.url!, '_blank', 'noopener'),
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
              className="relative aspect-[2/3] w-[150px] shrink-0 overflow-hidden rounded-card border border-border bg-surface2 sm:w-[180px]"
            >
              {data.cover ? (
                <img
                  src={coverUrl(data.cover)}
                  alt={data.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl text-muted">
                  {data.title.slice(0, 1)}
                </div>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.01em]">
                {data.title}
              </h1>
              {data.subtitle ? (
                <button
                  className="mt-1 text-[13px] text-accent hover:underline"
                  onClick={() =>
                    navigate(`/search/result?source=${encodeURIComponent(source)}&q=${encodeURIComponent(data.subtitle)}`)
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
                  {data.progress ? t('Continue') : t('Start')}
                </Button>
                {isDownloaded ? (
                  <Button
                    variant="secondary"
                    onClick={() => navigate(`/reader/local/${data.localComicId}`)}
                  >
                    <Download className="h-4 w-4" />
                    Read local
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setDownloadOpen(true)}>
                    <Download className="h-4 w-4" />
                    {t('Download')}
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setFavoriteOpen(true)}>
                  <Bookmark className="h-4 w-4" fill={favoriteFolders.length ? 'currentColor' : 'none'} />
                  {t('Favorite')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => (canComments ? setCommentsOpen(true) : toast.info('Comments are not supported by this source'))}
                >
                  <MessageSquare className="h-4 w-4" />
                  {t('Comments')}
                  {data.commentCount ? ` ${data.commentCount}` : ''}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => like.mutate()}
                  disabled={!sourceInfo?.capabilities.like}
                >
                  <Heart className="h-4 w-4" fill={data.isLiked ? 'currentColor' : 'none'} />
                  {data.isLiked ? t('Liked') : t('Like')}
                  {data.likesCount ? ` ${data.likesCount}` : ''}
                </Button>
                <Button variant="secondary" onClick={share}>
                  <Share2 className="h-4 w-4" />
                  {t('Share')}
                </Button>
              </div>
              {data.progress ? (
                <p className="mt-3 flex items-center gap-1.5 text-[12px] text-muted">
                  <Clock className="h-3.5 w-3.5" />
                  {t('Last Reading')}: {data.progress.ep}:{data.progress.page}
                </p>
              ) : null}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {data.description ? (
              <section className="mb-6">
                <h2 className="mb-2 text-[15px] font-semibold">{t('Description')}</h2>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-muted">
                  {data.description}
                </p>
              </section>
            ) : null}

            {Object.keys(data.tags ?? {}).length > 0 ? (
              <section className="mb-6">
                <h2 className="mb-2 text-[15px] font-semibold">{t('Information')}</h2>
                <div className="flex flex-col gap-2">
                  {Object.entries(data.tags).map(([namespace, values]) => (
                    <div key={namespace} className="flex flex-wrap items-center gap-1.5">
                      <span className="w-20 shrink-0 text-[11px] uppercase tracking-wide text-muted">
                        {namespace}
                      </span>
                      {values.map((value) => (
                        <button
                          key={value}
                          title="Click to search"
                          onClick={() =>
                            navigate(
                              `/search/result?source=${encodeURIComponent(source)}&q=${encodeURIComponent(
                                namespace.toLowerCase() === 'tags' ? `tag:${value}` : value,
                              )}`,
                            )
                          }
                          className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-fg hover:border-accent/40"
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-muted sm:grid-cols-4">
                  {data.uploader ? <span>Uploader: {data.uploader}</span> : null}
                  {data.uploadTime ? <span>Uploaded: {data.uploadTime}</span> : null}
                  {data.updateTime ? <span>Updated: {data.updateTime}</span> : null}
                  <span>Pages: {data.chapterCount}</span>
                </div>
              </section>
            ) : null}

            <section className="mb-6">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold">{t('Chapters')}</h2>
                <span className="text-[12px] text-muted">{data.chapterCount}</span>
                <div className="ml-auto flex items-center gap-1">
                  <Menu
                    trigger={({ onClick, ...rest }) => (
                      <Button size="sm" variant="ghost" onClick={onClick} {...rest}>
                        <ListOrdered className="h-3.5 w-3.5" />
                        {chapterOrderOptions.find((item) => item.value === order)?.label}
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    items={chapterOrderOptions.map((item) => ({
                      label: item.label,
                      onSelect: () => changeOrder(item.value),
                    }))}
                  />
                  <Menu
                    trigger={({ onClick, ...rest }) => (
                      <IconButton
                        label={`Reading order: ${readingOrderOptions.find((item) => item.value === readingOrder)?.label ?? readingOrder}`}
                        onClick={onClick}
                        {...rest}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </IconButton>
                    )}
                    items={readingOrderOptions.map((item) => ({
                      label: item.label,
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
                        'shrink-0 rounded-full border px-3 py-1.5 text-[12px]',
                        currentGroup === item.name
                          ? 'border-accent bg-accent/10 text-accent'
                          : 'border-border bg-surface text-muted',
                      )}
                    >
                      {item.name || 'Default'}
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
                    <span className="min-w-0 flex-1 truncate text-[13px]">{chapter.title}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
                  </button>
                ))}
                {groupChapters.length === 0 ? (
                  <p className="px-3 py-6 text-center text-[13px] text-muted">No chapters</p>
                ) : null}
              </div>
              {groupChapters.length > 60 ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() => setShowAll((value) => !value)}
                >
                  {showAll ? 'Show less' : `Show all (${groupChapters.length})`}
                </Button>
              ) : null}
            </section>

            {canComments && (commentsPreview.data?.comments.length ?? 0) > 0 ? (
              <section className="mb-6">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold">{t('Comments')}</h2>
                  <Button size="sm" variant="ghost" onClick={() => setCommentsOpen(true)}>
                    View more
                  </Button>
                </div>
                <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-thin">
                  {commentsPreview.data?.comments.slice(0, 6).map((comment) => (
                    <div
                      key={comment.id}
                      className="w-[240px] shrink-0 rounded-card border border-border bg-surface p-3"
                    >
                      <p className="truncate text-[12px] font-medium">{comment.userName}</p>
                      <p className="mt-1 line-clamp-2 text-[12px] text-muted">{comment.content}</p>
                      <p className="mt-1 text-[10px] text-muted">{comment.time}</p>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {(data.recommend?.length ?? 0) > 0 ? (
              <section>
                <h2 className="mb-3 text-[15px] font-semibold">{t('Related')}</h2>
                <ComicGrid
                  comics={data.recommend}
                  onOpen={(item) => navigate(`/comic/${item.sourceKey}/${item.id}`)}
                />
              </section>
            ) : null}
          </div>
        </div>
      </PageBody>

      {/* Cover viewer */}
      <Modal open={coverOpen} onClose={() => setCoverOpen(false)} width="max-w-3xl">
        <div className="flex items-center justify-center">
          {data.cover ? (
            <img
              src={coverUrl(data.cover)}
              alt={data.title}
              className="max-h-[80dvh] max-w-full object-contain"
            />
          ) : null}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              data.cover
                ? downloadUrl(coverUrl(data.cover), 'cover.jpg').catch((error) =>
                    toast.error(error instanceof Error ? error.message : String(error)),
                  )
                : undefined
            }
          >
            {t('Save Image')}
          </Button>
          <Button size="sm" onClick={() => setCoverOpen(false)}>
            {t('Close')}
          </Button>
        </div>
      </Modal>

      {/* Favorite drawer */}
      <Drawer
        open={favoriteOpen}
        onClose={() => setFavoriteOpen(false)}
        title={t('Favorite')}
        footer={
          <Button variant="secondary" className="w-full" onClick={() => setNewFolderOpen(true)}>
            {t('New Folder')}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
              {t('Local')}
            </h3>
            <div className="flex flex-col gap-1">
              {(folders.data?.items ?? []).map((folder) => {
                const active = favoriteFolders.includes(folder.id);
                return (
                  <button
                    key={folder.id}
                    onClick={() =>
                      active ? removeFromFolder.mutate(folder) : addToFolder.mutate(folder)
                    }
                    className="flex items-center justify-between rounded px-2 py-2 text-left hover:bg-surface2"
                  >
                    <span className="truncate text-[13px]">{folder.name}</span>
                    <span className="text-[11px] text-muted">
                      {active ? t('Added') : folder.count}
                    </span>
                  </button>
                );
              })}
              {(folders.data?.items.length ?? 0) === 0 ? (
                <p className="px-2 text-[12px] text-muted">{t('No folders available')}</p>
              ) : null}
            </div>
          </div>
          {sourceInfo?.capabilities.favorites === true ? (
            <NetworkFavoriteSection source={source} comicId={id} />
          ) : null}
        </div>
      </Drawer>

      <PromptDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title={t('New Folder')}
        label={t('Folder Name')}
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
        title={t('Download')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDownloadOpen(false)}>
              {t('Cancel')}
            </Button>
            <Button
              variant="ghost"
              loading={browserDownloading}
              onClick={() =>
                browserDownload(selectedChapters.size > 0 ? [...selectedChapters] : undefined)
              }
            >
              Download to browser
            </Button>
            <Button
              variant="secondary"
              loading={createDownload.isPending}
              onClick={() => createDownload.mutate([...selectedChapters])}
              disabled={selectedChapters.size === 0}
            >
              {t('Download Selected')}
            </Button>
            <Button
              variant="primary"
              loading={createDownload.isPending}
              onClick={() => createDownload.mutate(undefined)}
            >
              {t('Download All')}
            </Button>
          </>
        }
      >
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
      </Modal>

      {/* Rating dialog */}
      <Modal open={ratingOpen} onClose={() => setRatingOpen(false)} title="Rate this comic">
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
            This source does not support ratings.
          </p>
        ) : null}
      </Modal>
    </>
  );
}

function NetworkFavoriteSection({ source, comicId }: { source: string; comicId: string }) {
  const t = useT();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['network-favorites', source, comicId],
    queryFn: () => api.networkFolders(source, comicId),
  });
  const toggle = useMutation({
    mutationFn: ({ folderId, add }: { folderId: unknown; add: boolean }) =>
      api.toggleNetworkFavorite(source, comicId, folderId, add),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['network-favorites', source, comicId] });
      toast.success('Updated');
    },
    onError: (error) => toast.error(error.message),
  });
  const folders = Object.entries(query.data?.folders ?? {});
  const favorited = new Set(query.data?.favorited ?? []);
  if (query.isLoading) return <Spinner />;
  return (
    <div>
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
        {t('Network')}
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
              <span className="text-[11px] text-muted">{active ? t('Added') : ''}</span>
            </button>
          );
        })}
        {folders.length === 0 ? (
          <p className="px-2 text-[12px] text-muted">{t('No folders available')}</p>
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
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  const query = useQuery({
    queryKey: ['comic-comments', source, comicId, subId, page],
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
    mutationFn: () => api.sendComment(source, comicId, content, subId, replyTo?.id),
    onSuccess: () => {
      setContent('');
      setReplyTo(null);
      queryClient.invalidateQueries({ queryKey: ['comic-comments', source, comicId] });
      queryClient.invalidateQueries({ queryKey: ['comic-comments-preview', source, comicId] });
      toast.success('Comment sent');
    },
    onError: (error) => toast.error(error.message),
  });

  const like = useMutation({
    mutationFn: (comment: Comment) =>
      api.likeComment(source, comicId, comment.id, !comment.isLiked, subId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comic-comments', source, comicId] }),
    onError: (error) => toast.error(error.message),
  });

  const vote = useMutation({
    mutationFn: ({ comment, up }: { comment: Comment; up: boolean }) =>
      api.voteComment(source, comicId, comment.id, up, comment.voteStatus === (up ? 1 : -1), subId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comic-comments', source, comicId] }),
    onError: (error) => toast.error(error.message),
  });

  const comments = query.data?.comments ?? [];

  return (
    <Drawer open={open} onClose={onClose} title={t('Comments')} width="sm:max-w-lg">
      <div className="flex h-full flex-col">
        <div className="flex-1">
          {query.isLoading ? (
            <Spinner />
          ) : comments.length === 0 ? (
            <EmptyState title={t('No comments yet')} />
          ) : (
            <div className="flex flex-col gap-3">
              {comments.map((comment) => (
                <div key={comment.id} className="rounded-card border border-border bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-medium">{comment.userName}</span>
                    <span className="text-[10px] text-muted">{comment.time}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-fg">{comment.content}</p>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
                    <button
                      className={cn('flex items-center gap-1', comment.voteStatus === 1 && 'text-accent')}
                      onClick={() => vote.mutate({ comment, up: true })}
                    >
                      <ThumbsUp className="h-3.5 w-3.5" /> {comment.score ?? ''}
                    </button>
                    <button
                      className={cn('flex items-center gap-1', comment.voteStatus === -1 && 'text-accent')}
                      onClick={() => vote.mutate({ comment, up: false })}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className={cn('flex items-center gap-1', comment.isLiked && 'text-accent')}
                      onClick={() => like.mutate(comment)}
                    >
                      <Heart className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => setReplyTo(comment)}>{t('Replies')} {comment.replyCount ?? 0}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
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
              placeholder="Write a comment…"
              className="min-h-[44px] flex-1 py-2"
            />
            <Button
              variant="primary"
              className="shrink-0 self-end"
              loading={send.isPending}
              disabled={!content.trim()}
              onClick={() => send.mutate()}
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
