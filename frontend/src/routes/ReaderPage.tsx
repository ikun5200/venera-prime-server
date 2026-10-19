import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  MessageSquare,
  Minimize2,
  Moon,
  Settings,
  Share2,
  Timer,
} from 'lucide-react';
import {
  api,
  imageUrl,
  localImageUrl,
} from '../lib/api';
import { useAppStore, toast } from '../lib/store';
import { useT } from '../lib/i18n';
import type { Chapter, Comment } from '../lib/types';
import {
  chapterGroups,
  clamp,
  cn,
  copyText,
  flattenChapters,
} from '../lib/utils';
import {
  Button,
  Drawer,
  EmptyState,
  IconButton,
  Select,
  Slider,
  Spinner,
  Switch,
  Tabs,
  Textarea,
} from '../components/ui';

type Direction = 'ltr' | 'rtl' | 'ttb';

export default function ReaderPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);

  const isLocal = location.pathname.startsWith('/reader/local/');
  const sourceKey = isLocal ? 'local' : params.source ?? '';
  const comicId = params.id ?? '';
  const localId = Number(comicId);

  const comicQuery = useQuery({
    queryKey: ['comic', sourceKey, comicId],
    queryFn: () => api.comic(sourceKey, comicId),
    enabled: !isLocal && Boolean(sourceKey && comicId),
  });
  const localQuery = useQuery({
    queryKey: ['local-comic', localId],
    queryFn: () => api.localComic(localId),
    enabled: isLocal && Number.isFinite(localId),
  });

  const chapters = useMemo<Chapter[]>(() => {
    if (isLocal) {
      return (localQuery.data?.chapterList ?? []).map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        group: chapter.group ?? undefined,
        index: chapter.index,
      }));
    }
    return comicQuery.data ? flattenChapters(comicQuery.data.chapters) : [];
  }, [comicQuery.data, isLocal, localQuery.data]);

  const groups = useMemo(() => {
    if (isLocal) {
      const map = new Map<string, Chapter[]>();
      for (const chapter of chapters) {
        const key = chapter.group ?? '';
        map.set(key, [...(map.get(key) ?? []), chapter]);
      }
      return [...map.entries()].map(([name, list]) => ({ name, chapters: list }));
    }
    return comicQuery.data ? chapterGroups(comicQuery.data.chapters) : [];
  }, [chapters, comicQuery.data, isLocal]);

  const [chapterId, setChapterId] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [autoTurning, setAutoTurning] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const [pendingLastPage, setPendingLastPage] = useState(false);
  const [readEpisodes, setReadEpisodes] = useState<Set<number>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastWheel = useRef(0);
  const sessionStart = useRef(Date.now());
  const lastProgressSave = useRef(0);
  const collectRef = useRef<() => void>(() => {});
  const firstPageEffect = useRef(true);
  const [flash, setFlash] = useState(false);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const read = comicQuery.data?.progress?.readEpisode;
    if (Array.isArray(read)) {
      setReadEpisodes(new Set(read.map((value) => Number(value)).filter((value) => Number.isFinite(value))));
    }
  }, [comicQuery.data?.progress?.readEpisode]);

  const chapter = chapters.find((item) => item.id === chapterId);
  const chapterIndex = chapters.findIndex((item) => item.id === chapterId);

  useEffect(() => {
    if (chapterId || chapters.length === 0) return;
    const requested = searchParams.get('chapter');
    if (requested && chapters.some((item) => item.id === requested)) {
      setChapterId(requested);
      return;
    }
    const progress = comicQuery.data?.progress;
    const index = progress ? clamp((progress.ep ?? 1) - 1, 0, chapters.length - 1) : 0;
    setChapterId(chapters[index]?.id ?? chapters[0].id);
  }, [chapterId, chapters, comicQuery.data?.progress, searchParams]);

  const imagesQuery = useQuery({
    queryKey: ['reader-images', sourceKey, comicId, chapterId],
    queryFn: () =>
      isLocal
        ? api.localChapterImages(localId, chapterId)
        : api.chapterImages(sourceKey, comicId, chapterId),
    enabled: Boolean(chapterId),
  });

  const imageKeys = imagesQuery.data?.images ?? [];
  const imageUrls = useMemo(
    () =>
      imageKeys.map((key, index) =>
        isLocal
          ? localImageUrl(localId, chapterId, index)
          : imageUrl(sourceKey, comicId, chapterId, key),
      ),
    [chapterId, comicId, imageKeys, isLocal, localId, sourceKey],
  );

  const mode = String(settings.readerMode ?? 'galleryLeftToRight');
  const isContinuous = mode.startsWith('continuous');
  const direction: Direction = mode.endsWith('RightToLeft')
    ? 'rtl'
    : mode.endsWith('TopToBottom')
      ? 'ttb'
      : 'ltr';
  const twoPage =
    !isContinuous && direction !== 'ttb' && settings.readerTwoPageSpread === true;
  const landscape = window.innerWidth > window.innerHeight;
  const configuredPerPage = Number(
    landscape
      ? settings.readerScreenPicNumberForLandscape ?? 1
      : settings.readerScreenPicNumberForPortrait ?? 1,
  );
  const perPage = isContinuous ? 1 : twoPage ? 2 : clamp(configuredPerPage || 1, 1, 5);
  const singleFirst = settings.showSingleImageOnFirstPage === true && perPage > 1;

  const pages = useMemo(() => {
    const result: { start: number; images: string[]; indexes: number[] }[] = [];
    let index = 0;
    if (singleFirst && imageUrls.length > 0) {
      result.push({ start: 0, images: [imageUrls[0]], indexes: [0] });
      index = 1;
    }
    while (index < imageUrls.length) {
      const slice = imageUrls.slice(index, index + perPage);
      result.push({
        start: index,
        images: slice,
        indexes: slice.map((_, offset) => index + offset),
      });
      index += perPage;
    }
    return result;
  }, [imageUrls, perPage, singleFirst]);

  const totalPages = pages.length;

  useEffect(() => {
    if (imagesQuery.data && pages.length > 0) {
      if (pendingLastPage) {
        setCurrentPage(pages.length - 1);
        setPendingLastPage(false);
        return;
      }
      const requested = Number(searchParams.get('page') ?? '1');
      setCurrentPage(clamp(requested - 1, 0, pages.length - 1));
    }
    // Only react to a new chapter's images.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesQuery.data, chapterId]);

  useEffect(() => {
    if (!chapterId) return;
    if (
      searchParams.get('chapter') === chapterId &&
      searchParams.get('page') === String(currentPage + 1)
    ) {
      return;
    }
    setSearchParams(
      { chapter: chapterId, page: String(currentPage + 1) },
      { replace: true },
    );
  }, [chapterId, currentPage, searchParams, setSearchParams]);

  const title = isLocal ? localQuery.data?.title ?? '' : comicQuery.data?.title ?? '';
  const subtitle = isLocal
    ? localQuery.data?.subtitle ?? ''
    : comicQuery.data?.subtitle ?? '';
  const cover = isLocal ? '' : comicQuery.data?.cover ?? '';
  const comicType = isLocal ? 0 : comicQuery.data?.comicType ?? 0;
  const chapterTitle = chapter?.title ?? '';

  const saveProgress = useCallback(
    (page: number) => {
      if (!chapterId || chapters.length === 0) return;
      const now = Date.now();
      if (now - lastProgressSave.current < 800) return;
      lastProgressSave.current = now;
      const nextRead = new Set(readEpisodes);
      if (page >= pages.length - 1) nextRead.add(chapterIndex);
      api
        .saveProgress({
          comicId,
          comicType,
          sourceKey,
          title,
          subtitle,
          cover,
          ep: chapterIndex + 1,
          page: Math.min(page + 1, Math.max(1, imageKeys.length)),
          chapterGroup: chapter?.group ? groups.findIndex((group) => group.name === chapter.group) + 1 : null,
          maxPage: imageKeys.length,
          readEpisode: [...nextRead],
        })
        .catch(() => {});
      if (nextRead.size !== readEpisodes.size) setReadEpisodes(nextRead);
      if (
        page >= pages.length - 1 &&
        chapterIndex === chapters.length - 1 &&
        settings.removeReadLaterOnComplete !== false
      ) {
        api.removeReadLater(comicType, comicId).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
    [
      chapter,
      chapterId,
      chapterIndex,
      chapters.length,
      comicId,
      comicType,
      cover,
      groups,
      imageKeys.length,
      pages.length,
      queryClient,
      readEpisodes,
      sourceKey,
      subtitle,
      title,
    ],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => saveProgress(currentPage), 1000);
    return () => window.clearTimeout(timer);
  }, [currentPage, saveProgress]);

  useEffect(() => {
    return () => {
      const seconds = Math.round((Date.now() - sessionStart.current) / 1000);
      if (seconds > 5 && settings.recordReadingStatistics !== false) {
        api
          .recordStatistics({
            comicId,
            comicType,
            title,
            author: subtitle,
            cover,
            sourceKey,
            seconds,
          })
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToChapter = (index: number, page = 0) => {
    const target = chapters[index];
    if (!target) return;
    setChapterId(target.id);
    setCurrentPage(page);
    setChaptersOpen(false);
    if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, left: 0 });
  };

  const readingOrder = String((settings.comicChapterReadingOrder as Record<string, string> | undefined)?.[`${comicId}@${sourceKey}`] ?? 'automatic');
  const step = readingOrder === 'reverse' ? -1 : 1;

  const nextChapter = chapters[chapterIndex + step];
  const prevChapter = chapters[chapterIndex - step];

  const goNext = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((value) => value + 1);
      setControlsVisible(false);
    } else if (nextChapter) {
      goToChapter(chapterIndex + step, 0);
    }
  }, [chapterIndex, currentPage, nextChapter, step, totalPages]);

  const goPrev = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage((value) => value - 1);
      setControlsVisible(false);
    } else if (prevChapter) {
      setPendingLastPage(true);
      goToChapter(chapterIndex - step, 0);
    }
  }, [chapterIndex, currentPage, prevChapter, step]);

  const goToEnd = () => {
    setCurrentPage(Math.max(0, totalPages - 1));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === 'f' || event.key === 'F') {
        toggleFullscreen();
        return;
      }
      if (event.key === 'Escape') {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else navigate(-1);
        return;
      }
      if (event.key === 'Home') {
        setCurrentPage(0);
        return;
      }
      if (event.key === 'End') {
        goToEnd();
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (direction === 'rtl') goPrev();
        else goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (direction === 'rtl') goNext();
        else goPrev();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (isContinuous) scrollRef.current?.scrollBy({ top: window.innerHeight * 0.25, behavior: 'smooth' });
        else goNext();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (isContinuous) scrollRef.current?.scrollBy({ top: -window.innerHeight * 0.25, behavior: 'smooth' });
        else goPrev();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [direction, goNext, goPrev, isContinuous, navigate]);

  useEffect(() => {
    if (!autoTurning) return;
    const seconds = Number(settings.autoPageTurningInterval ?? 5);
    const timer = window.setInterval(() => {
      setCurrentPage((value) => {
        if (value < totalPages - 1) return value + 1;
        return value;
      });
    }, Math.max(1, seconds) * 1000);
    return () => window.clearInterval(timer);
  }, [autoTurning, settings.autoPageTurningInterval, totalPages]);

  useEffect(() => {
    const count = Number(settings.preloadImageCount ?? 4);
    const start = pages[currentPage]?.start ?? 0;
    for (let offset = 1; offset <= count; offset++) {
      const url = imageUrls[start + offset];
      if (url) {
        const image = new Image();
        image.src = url;
      }
    }
  }, [currentPage, imageUrls, pages, settings.preloadImageCount]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => {
    const update = () =>
      setClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (firstPageEffect.current) {
      firstPageEffect.current = false;
      return;
    }
    if (settings.flashWhiteScreenOnPageTurn !== true) return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 120);
    return () => window.clearTimeout(timer);
  }, [currentPage, chapterId, settings.flashWhiteScreenOnPageTurn]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    if (isContinuous || event.ctrlKey) return;
    const now = Date.now();
    if (now - lastWheel.current < 220) return;
    if (Math.abs(event.deltaY) < 8) return;
    lastWheel.current = now;
    if (event.deltaY > 0) goNext();
    else goPrev();
  };

  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if (settings.quickCollectImage === 'Swipe') {
      const perpendicular = direction === 'ttb' ? Math.abs(dx) : Math.abs(dy);
      if (perpendicular > 150) {
        collectRef.current();
        return;
      }
    }
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        if (direction === 'rtl') goPrev();
        else goNext();
      } else {
        if (direction === 'rtl') goNext();
        else goPrev();
      }
    } else if (Math.abs(dy) > 80 && direction === 'ttb' && !isContinuous) {
      if (dy < 0) goNext();
      else goPrev();
    }
  };

  const tapZone = (zone: 'left' | 'center' | 'right') => {
    if (zone === 'center') {
      setControlsVisible((value) => !value);
      return;
    }
    if (zone === 'left') {
      if (direction === 'rtl') goNext();
      else goPrev();
    } else {
      if (direction === 'rtl') goPrev();
      else goNext();
    }
  };

  const updateSetting = async (patch: Record<string, unknown>) => {
    try {
      setSettings(await api.updateSettings(patch));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const collectImage = async () => {
    const page = pages[currentPage];
    if (!page || !chapter) return;
    const index = page.indexes[0] ?? page.start;
    const key = imageKeys[index] ?? imageUrls[index] ?? '';
    try {
      await api.addImageFavorite({
        sourceKey,
        comic: {
          id: comicId,
          title,
          subtitle,
          cover,
          tags: [],
          maxPage: imageKeys.length,
        },
        ep: chapterIndex + 1,
        eid: chapter.id,
        epName: chapter.title,
        page: index + 1,
        imageKey: key,
        auto: false,
      });
      toast.success('Successfully collected');
      queryClient.invalidateQueries({ queryKey: ['image-favorites'] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    collectRef.current = collectImage;
  }, [collectImage]);

  const saveImage = async () => {
    const page = pages[currentPage];
    const url = page?.images[0];
    if (!url) return;
    try {
      const response = await fetch(url, { credentials: 'include' });
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `${title}-${chapterTitle}-${currentPage + 1}.jpg`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `${title} ${chapterTitle}`, url: window.location.href });
      } else {
        await copyText(window.location.href);
        toast.success('Copied');
      }
    } catch {
      // Cancelled.
    }
  };

  const nightColor =
    settings.readerNightMode === 'warm'
      ? '255,147,41'
      : settings.readerNightMode === 'red'
        ? '255,0,0'
        : '0,0,0';
  const nightAlpha =
    settings.readerNightMode && settings.readerNightMode !== 'none'
      ? Number(settings.readerNightModeIntensity ?? 0.25)
      : 0;
  const background =
    settings.readerBackground === 'white'
      ? '#ffffff'
      : settings.readerBackground === 'gray'
        ? '#d0d0d0'
        : settings.readerBackground === 'sepia'
          ? '#f1e4c3'
          : settings.readerBackground === 'black'
            ? '#000000'
            : '#000000';
  const marginPercent = settings.readerPageMarginEnabled
    ? Number(settings.readerPageMarginPercent ?? 19.3)
    : 0;

  const loading = comicQuery.isLoading || localQuery.isLoading || imagesQuery.isLoading;

  if (!loading && chapters.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black p-6 text-white">
        <EmptyState title="Comic not found" action={<Button onClick={() => navigate(-1)}>Back</Button>} />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden text-white"
      style={{ background }}
    >
      {loading ? (
        <div className="flex flex-1 items-center justify-center">
          <Spinner className="h-7 w-7 text-white" />
        </div>
      ) : isContinuous ? (
        <div
          ref={scrollRef}
          className={cn(
            'flex-1 scrollbar-thin',
            direction === 'ttb'
              ? 'overflow-y-auto overflow-x-hidden'
              : direction === 'rtl'
                ? 'flex flex-row-reverse overflow-x-auto overflow-y-hidden'
                : 'flex flex-row overflow-x-auto overflow-y-hidden',
          )}
          style={{
            paddingLeft: direction !== 'ttb' ? `${marginPercent}%` : 0,
            paddingRight: direction !== 'ttb' ? `${marginPercent}%` : 0,
            paddingTop: direction === 'ttb' ? `${marginPercent / 2}%` : 0,
            paddingBottom: direction === 'ttb' ? `${marginPercent / 2}%` : 0,
          }}
          onScroll={() => {
            const container = scrollRef.current;
            if (!container) return;
            const children = Array.from(container.querySelectorAll<HTMLElement>('[data-page-index]'));
            const position = direction === 'ttb' ? container.scrollTop : Math.abs(container.scrollLeft);
            let closest = 0;
            let distance = Infinity;
            for (const child of children) {
              const offset = direction === 'ttb' ? child.offsetTop : child.offsetLeft;
              const delta = Math.abs(offset - position);
              if (delta < distance) {
                distance = delta;
                closest = Number(child.dataset.pageIndex ?? 0);
              }
            }
            setCurrentPage(closest);
          }}
        >
          {prevChapter ? (
            <div className="flex min-h-[80px] w-full items-center justify-center p-4">
              <Button variant="secondary" onClick={() => goToChapter(chapterIndex - step, 0)}>
                <ChevronLeft className="h-4 w-4" />
                {prevChapter.title}
              </Button>
            </div>
          ) : null}
          {imageUrls.map((url, index) => (
            <div
              key={`${url}-${retryNonce}-${index}`}
              data-page-index={index}
              className={cn(
                'relative flex shrink-0 items-center justify-center',
                direction === 'ttb' ? 'w-full' : 'h-full',
              )}
            >
              {failed[index] ? (
                <button
                  className="m-4 rounded border border-white/20 px-4 py-3 text-sm"
                  onClick={() => {
                    setFailed((value) => ({ ...value, [index]: false }));
                    setRetryNonce((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              ) : (
                <img
                  src={url}
                  alt={`${title} page ${index + 1}`}
                  loading={Math.abs(index - currentPage) <= 3 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                  onError={() => setFailed((value) => ({ ...value, [index]: true }))}
                  onClick={() => setControlsVisible((value) => !value)}
                  className={cn(
                    'reader-page select-none object-contain',
                    direction === 'ttb' ? 'w-full' : 'max-h-full',
                    settings.limitImageWidth === false && direction === 'ttb' ? 'max-w-none' : 'max-w-full',
                  )}
                />
              )}
            </div>
          ))}
          {nextChapter ? (
            <div className="flex min-h-[80px] w-full items-center justify-center p-4">
              <Button variant="secondary" onClick={() => goToChapter(chapterIndex + step, 0)}>
                {nextChapter.title}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          className="relative flex flex-1 items-center justify-center overflow-hidden"
          onWheel={onWheel}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onDoubleClick={() => {
            if (settings.quickCollectImage === 'DoubleTap') collectRef.current();
          }}
        >
          <button
            className="absolute inset-y-0 left-0 z-10 w-[30%] cursor-default"
            aria-label="Previous"
            onClick={() => tapZone('left')}
          />
          <button
            className="absolute inset-y-0 left-[30%] z-10 w-[40%] cursor-default"
            aria-label="Toggle controls"
            onClick={() => tapZone('center')}
          />
          <button
            className="absolute inset-y-0 right-0 z-10 w-[30%] cursor-default"
            aria-label="Next"
            onClick={() => tapZone('right')}
          />
          <div
            className={cn(
              'flex h-full w-full items-center justify-center gap-px',
              direction === 'rtl' ? 'flex-row-reverse' : 'flex-row',
            )}
            style={{
              paddingLeft: `${marginPercent}%`,
              paddingRight: `${marginPercent}%`,
            }}
          >
            {pages[currentPage]?.images.map((url, index) => {
              const pageIndex = pages[currentPage]?.indexes[index] ?? 0;
              return failed[pageIndex] ? (
                <button
                  key={`${pageIndex}-${retryNonce}`}
                  className="m-4 rounded border border-white/20 px-4 py-3 text-sm"
                  onClick={() => {
                    setFailed((value) => ({ ...value, [pageIndex]: false }));
                    setRetryNonce((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              ) : (
                <img
                  key={`${pageIndex}-${retryNonce}`}
                  src={url}
                  alt={`${title} page ${pageIndex + 1}`}
                  draggable={false}
                  onError={() => setFailed((value) => ({ ...value, [pageIndex]: true }))}
                  className="reader-page max-h-full min-w-0 flex-1 select-none object-contain transition-opacity duration-150"
                />
              );
            })}
          </div>
          <div className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: nightAlpha, backgroundColor: `rgb(${nightColor})` }} />
        </div>
      )}

      {/* Top controls */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-black/70 px-3 py-2 backdrop-blur-md transition-transform duration-200 ease-enter',
          controlsVisible ? 'translate-y-0' : '-translate-y-full',
        )}
      >
        <IconButton
          label="Back"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{title}</p>
          <p className="truncate text-[11px] text-white/60">{chapterTitle}</p>
        </div>
        {!isLocal && settings.showChapterComments !== false ? (
          <IconButton
            label={t('Chapter Comments')}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setCommentsOpen(true)}
          >
            <MessageSquare className="h-5 w-5" />
          </IconButton>
        ) : null}
        <IconButton
          label={t('Settings')}
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Bottom controls */}
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 bg-black/70 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md transition-transform duration-200 ease-enter',
          controlsVisible ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        {!isContinuous ? (
          <div className="mb-2 flex items-center gap-3">
            <button className="text-[11px] text-white/70" onClick={() => setCurrentPage(0)}>
              {t('First')}
            </button>
            <input
              type="range"
              min={1}
              max={Math.max(1, totalPages)}
              value={currentPage + 1}
              onChange={(event) => setCurrentPage(Number(event.target.value) - 1)}
              className="h-1.5 flex-1 accent-white"
              aria-label="Page"
            />
            <button
              className="text-[11px] text-white/70"
              onClick={goToEnd}
            >
              {t('Last')}
            </button>
            <span className="w-16 text-right text-[11px] tabular text-white/70">
              {currentPage + 1} / {totalPages}
            </span>
          </div>
        ) : (
          <div className="mb-2 text-center text-[11px] text-white/60">
            {currentPage + 1} / {imageUrls.length}
          </div>
        )}
        <div className="flex items-center gap-1 overflow-x-auto">
          <IconButton
            label="Previous image"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={goPrev}
          >
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <IconButton
            label="Next image"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={goNext}
          >
            <ChevronRight className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t('Chapters')}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setChaptersOpen(true)}
          >
            <Bookmark className="h-5 w-5" />
          </IconButton>
          <IconButton
            label="Collect the image"
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={collectImage}
          >
            <BookmarkPlus className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t('Share')}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={share}
          >
            <Share2 className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t('Save Image')}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={saveImage}
          >
            <Download className="h-5 w-5" />
          </IconButton>
          <IconButton
            label="Auto Page Turning"
            className={cn('text-white hover:bg-white/10 hover:text-white', autoTurning && 'text-accent')}
            onClick={() => setAutoTurning((value) => !value)}
          >
            <Timer className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t('Page margin')}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() =>
              updateSetting({ readerPageMarginEnabled: !settings.readerPageMarginEnabled })
            }
          >
            <Maximize2 className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t('Full Screen')}
            className="ml-auto text-white hover:bg-white/10 hover:text-white"
            onClick={toggleFullscreen}
          >
            {fullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </IconButton>
        </div>
      </div>

      {/* Page number overlay */}
      {settings.showPageNumberInReader !== false ? (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-0.5 text-[10px] tabular text-white/80">
          {currentPage + 1} / {Math.max(1, totalPages)}
        </div>
      ) : null}

      {/* Night mode overlay (gallery handled inside, continuous needs this) */}
      {isContinuous && nightAlpha > 0 ? (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{ backgroundColor: `rgba(${nightColor},${nightAlpha})` }}
        />
      ) : null}

      {settings.enableClockAndBatteryInfoInReader !== false ? (
        <div className="pointer-events-none absolute left-2 top-16 z-10 rounded bg-black/50 px-2 py-0.5 text-[10px] tabular text-white/80">
          {clock}
        </div>
      ) : null}

      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-30 bg-white transition-opacity duration-100',
          flash ? 'opacity-100' : 'opacity-0',
        )}
      />

      {/* Chapters drawer */}
      <Drawer open={chaptersOpen} onClose={() => setChaptersOpen(false)} title={t('Chapters')}>
        <div className="flex flex-col gap-3">
          {groups.length > 1 ? (
            <Tabs
              items={groups.map((group) => ({ value: group.name, label: group.name || 'Default' }))}
              value={chapter?.group ?? groups[0]?.name ?? ''}
              onChange={(value) => {
                const group = groups.find((item) => item.name === value);
                if (group?.chapters[0]) goToChapter(chapters.indexOf(group.chapters[0]));
              }}
            />
          ) : null}
          <div className="overflow-hidden rounded border border-border">
            {chapters.map((item, index) => (
              <button
                key={item.id}
                onClick={() => goToChapter(index)}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left text-[13px] last:border-b-0',
                  item.id === chapterId ? 'bg-accent/10 text-accent' : 'hover:bg-surface2',
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {readEpisodes.has(index) ? (
                  <span className="text-[10px] text-muted">read</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </Drawer>

      {/* Settings drawer */}
      <Drawer open={settingsOpen} onClose={() => setSettingsOpen(false)} title={t('Reading')}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t('Reading mode')}</span>
            <Select
              value={mode}
              onChange={(event) => updateSetting({ readerMode: event.target.value })}
              className="w-[190px]"
            >
              <option value="galleryLeftToRight">Gallery (Left to Right)</option>
              <option value="galleryRightToLeft">Gallery (Right to Left)</option>
              <option value="galleryTopToBottom">Gallery (Top to Bottom)</option>
              <option value="continuousLeftToRight">Continuous (Left to Right)</option>
              <option value="continuousRightToLeft">Continuous (Right to Left)</option>
              <option value="continuousTopToBottom">Continuous (Top to Bottom)</option>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t('Two-page spread')}</span>
            <Switch
              checked={settings.readerTwoPageSpread === true}
              onChange={(value) => updateSetting({ readerTwoPageSpread: value })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t('Page margin')}</span>
            <Switch
              checked={settings.readerPageMarginEnabled === true}
              onChange={(value) => updateSetting({ readerPageMarginEnabled: value })}
            />
          </div>
          {settings.readerPageMarginEnabled ? (
            <Slider
              label={t('Page margin size')}
              min={0}
              max={40}
              step={0.5}
              value={Number(settings.readerPageMarginPercent ?? 19.3)}
              onChange={(value) => updateSetting({ readerPageMarginPercent: value })}
              format={(value) => `${value}%`}
            />
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[13px]">
              <Moon className="h-4 w-4" /> {t('Night mode')}
            </span>
            <Select
              value={String(settings.readerNightMode ?? 'none')}
              onChange={(event) => updateSetting({ readerNightMode: event.target.value })}
              className="w-[140px]"
            >
              <option value="none">Off</option>
              <option value="warm">Warm</option>
              <option value="dark">Dark</option>
              <option value="red">Red</option>
            </Select>
          </div>
          <Slider
            label={t('Night mode intensity')}
            min={0}
            max={0.8}
            step={0.05}
            value={Number(settings.readerNightModeIntensity ?? 0.25)}
            onChange={(value) => updateSetting({ readerNightModeIntensity: value })}
            format={(value) => value.toFixed(2)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t('Show Page Number')}</span>
            <Switch
              checked={settings.showPageNumberInReader !== false}
              onChange={(value) => updateSetting({ showPageNumberInReader: value })}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t('Number of images preloaded')}</span>
            <span className="text-[13px] tabular text-muted">{String(settings.preloadImageCount ?? 4)}</span>
          </div>
          <Slider
            label={t('Number of images preloaded')}
            min={1}
            max={16}
            value={Number(settings.preloadImageCount ?? 4)}
            onChange={(value) => updateSetting({ preloadImageCount: value })}
          />
          <Button
            variant="secondary"
            onClick={() => {
              setSettingsOpen(false);
              navigate('/settings/reading');
            }}
          >
            {t('Settings')}
          </Button>
        </div>
      </Drawer>

      {/* Chapter comments drawer */}
      {!isLocal && settings.showChapterComments !== false ? (
        <ChapterCommentsDrawer
          open={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          source={sourceKey}
          comicId={comicId}
          epId={chapterId}
          title={chapterTitle}
        />
      ) : null}
    </div>
  );
}

function ChapterCommentsDrawer({
  open,
  onClose,
  source,
  comicId,
  epId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  source: string;
  comicId: string;
  epId: string;
  title: string;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['chapter-comments', source, comicId, epId, page],
    queryFn: () => api.chapterComments(source, comicId, epId, page),
    enabled: open && Boolean(epId),
  });
  const send = useMutation({
    mutationFn: () => api.sendChapterComment(source, comicId, epId, content),
    onSuccess: () => {
      setContent('');
      queryClient.invalidateQueries({ queryKey: ['chapter-comments', source, comicId, epId] });
      toast.success('Comment sent');
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Drawer open={open} onClose={onClose} title={`${t('Chapter Comments')} · ${title}`}>
      <div className="flex flex-col gap-3">
        {query.isLoading ? (
          <Spinner />
        ) : (query.data?.comments.length ?? 0) === 0 ? (
          <EmptyState title={t('No comments yet')} />
        ) : (
          query.data?.comments.map((comment: Comment) => (
            <div key={comment.id} className="rounded border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium">{comment.userName}</span>
                <span className="text-[10px] text-muted">{comment.time}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px]">{comment.content}</p>
            </div>
          ))
        )}
        <div className="flex items-center justify-center gap-2">
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
        <div className="mt-2 flex gap-2 border-t border-border pt-3">
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
    </Drawer>
  );
}
