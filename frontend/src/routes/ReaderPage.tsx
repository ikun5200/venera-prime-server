import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bookmark,
  BookmarkPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Heart,
  Maximize2,
  MessageSquare,
  Minimize2,
  Moon,
  RotateCw,
  Settings,
  Share2,
  ThumbsUp,
  Timer,
  X,
} from "lucide-react";
import { api, imageUrl, localImageUrl } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import {
  comicSettingsKey,
  effectiveReaderSettings,
  getDeviceId,
  isComicSpecificEnabled,
  isDeviceSpecificEnabled,
  withComicSpecificSetting,
  withDeviceSpecificSetting,
  withoutComicSpecificSettings,
  withoutDeviceSpecificSettings,
} from "../lib/readerSettings";
import type { Chapter, Comment } from "../lib/types";
import {
  clamp,
  cn,
  copyText,
  flattenChapters,
  friendlyError,
} from "../lib/utils";
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
} from "../components/ui";

type Direction = "ltr" | "rtl" | "ttb";

export default function ReaderPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const params = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);

  const isLocal = location.pathname.startsWith("/reader/local/");
  const sourceKey = isLocal ? "local" : (params.source ?? "");
  const comicId = params.id ?? "";
  const localId = Number(comicId);
  const comicKey = comicSettingsKey(comicId, sourceKey);
  const deviceId = useMemo(() => getDeviceId(), []);
  const readerSettings = useMemo(
    () => effectiveReaderSettings(settings, comicKey, deviceId),
    [comicKey, deviceId, settings],
  );
  const comicSpecificEnabled = isComicSpecificEnabled(settings, comicKey);

  const sourcesQuery = useQuery({
    queryKey: ["sources"],
    queryFn: api.sources,
    enabled: !isLocal,
  });
  const sourceInfo = sourcesQuery.data?.items.find(
    (item) => item.key === sourceKey,
  );

  const comicQuery = useQuery({
    queryKey: ["comic", sourceKey, comicId],
    queryFn: () => api.comic(sourceKey, comicId),
    enabled: !isLocal && Boolean(sourceKey && comicId),
  });
  const localQuery = useQuery({
    queryKey: ["local-comic", localId],
    queryFn: () => api.localComic(localId),
    enabled: isLocal && Number.isFinite(localId),
  });

  const chapters = useMemo<Chapter[]>(() => {
    const raw = isLocal
      ? (localQuery.data?.chapterList ?? []).map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          group: chapter.group ?? undefined,
          index: chapter.index,
        }))
      : comicQuery.data
        ? flattenChapters(comicQuery.data.chapters)
        : [];
    if (readerSettings.hideDuplicateChapters === false) return raw;
    const seen = new Set<string>();
    return raw.filter((chapter) => {
      const key = chapter.title.trim().toLowerCase();
      if (!key) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [
    comicQuery.data,
    isLocal,
    localQuery.data,
    readerSettings.hideDuplicateChapters,
  ]);

  const groups = useMemo(() => {
    const map = new Map<string, Chapter[]>();
    for (const chapter of chapters) {
      const key = chapter.group ?? "";
      map.set(key, [...(map.get(key) ?? []), chapter]);
    }
    return [...map.entries()].map(([name, list]) => ({ name, chapters: list }));
  }, [chapters]);

  const [chapterId, setChapterId] = useState("");
  const [currentPage, setCurrentPage] = useState(() => {
    const requested = Number(searchParams.get("page") ?? "1");
    return Number.isFinite(requested) ? Math.max(0, requested - 1) : 0;
  });
  const [controlsVisible, setControlsVisible] = useState(false);
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
  const [clock, setClock] = useState("");
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [zoom, setZoom] = useState<{
    scale: number;
    x: number;
    y: number;
  } | null>(null);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [rotation, setRotation] = useState(0);
  const [swipeHint, setSwipeHint] = useState<string | null>(null);
  const [downloadedEpisodes, setDownloadedEpisodes] = useState<Set<string>>(
    new Set(),
  );
  const hintTimer = useRef<number | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressPanStart = useRef<{
    x: number;
    y: number;
    zoomX: number;
    zoomY: number;
  } | null>(null);
  const longPressActive = useRef(false);
  const suppressTapUntil = useRef(0);
  const galleryRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const showHint = (text: string) => {
    setSwipeHint(text);
    if (hintTimer.current) window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setSwipeHint(null), 1200);
  };

  const downloadsQuery = useQuery({
    queryKey: ["downloads"],
    queryFn: api.downloads,
    enabled: !isLocal,
  });
  useEffect(() => {
    const set = new Set<string>();
    for (const job of downloadsQuery.data?.items ?? []) {
      if (job.sourceKey !== sourceKey || job.comicId !== comicId) continue;
      for (const chapter of job.chapters ?? []) {
        if (
          chapter.status === "completed" ||
          (chapter.totalPages > 0 &&
            chapter.downloadedPages >= chapter.totalPages)
        ) {
          set.add(chapter.id);
        }
      }
    }
    setDownloadedEpisodes((previous) => new Set([...previous, ...set]));
  }, [comicId, downloadsQuery.data, sourceKey]);

  const localByComicQuery = useQuery({
    queryKey: ["local-by-comic", sourceKey, comicId],
    queryFn: () => api.localComics({ q: comicId }),
    enabled: !isLocal,
  });
  useEffect(() => {
    const match = (localByComicQuery.data?.items ?? []).find(
      (item) => item.comicId === comicId && item.sourceKey === sourceKey,
    );
    if (!match) return;
    setDownloadedEpisodes((previous) => {
      const next = new Set(previous);
      for (const chapter of match.downloadedChapters ?? [])
        next.add(String(chapter));
      return next;
    });
  }, [comicId, localByComicQuery.data, sourceKey]);

  const cycleRotation = () => setRotation((value) => (value + 90) % 360);

  const contextActions = [
    { label: t("Reading"), action: () => setSettingsOpen(true) },
    { label: t("Chapters"), action: () => setChaptersOpen(true) },
    {
      label: t("Full Screen"),
      action: () => {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          document.documentElement.requestFullscreen?.().catch(() => {});
        }
      },
    },
    { label: t("Exit"), action: () => navigate(-1) },
    {
      label: t("Copy Link"),
      action: () =>
        copyText(window.location.href).then(() => toast.success(t("Copied"))),
    },
    { label: t("Save Image"), action: () => void saveImage() },
  ];

  useEffect(() => {
    const read = comicQuery.data?.progress?.readEpisode;
    if (Array.isArray(read)) {
      setReadEpisodes(
        new Set(
          read
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value)),
        ),
      );
    }
  }, [comicQuery.data?.progress?.readEpisode]);

  const chapter = chapters.find((item) => item.id === chapterId);
  const chapterIndex = chapters.findIndex((item) => item.id === chapterId);

  useEffect(() => {
    if (chapterId || chapters.length === 0) return;
    const requested = searchParams.get("chapter");
    if (requested && chapters.some((item) => item.id === requested)) {
      setChapterId(requested);
      return;
    }
    const progress = comicQuery.data?.progress;
    const index = progress
      ? clamp((progress.ep ?? 1) - 1, 0, chapters.length - 1)
      : 0;
    setChapterId(chapters[index]?.id ?? chapters[0].id);
  }, [chapterId, chapters, comicQuery.data?.progress, searchParams]);

  const imagesQuery = useQuery({
    queryKey: ["reader-images", sourceKey, comicId, chapterId],
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

  const mode = String(readerSettings.readerMode ?? "galleryLeftToRight");
  const isContinuous = mode.startsWith("continuous");
  const direction: Direction = mode.endsWith("RightToLeft")
    ? "rtl"
    : mode.endsWith("TopToBottom")
      ? "ttb"
      : "ltr";
  const twoPage =
    !isContinuous &&
    direction !== "ttb" &&
    readerSettings.readerTwoPageSpread === true;
  const landscape = window.innerWidth > window.innerHeight;
  const configuredPerPage = Number(
    landscape
      ? (readerSettings.readerScreenPicNumberForLandscape ?? 1)
      : (readerSettings.readerScreenPicNumberForPortrait ?? 1),
  );
  const perPage = isContinuous
    ? 1
    : twoPage
      ? 2
      : clamp(configuredPerPage || 1, 1, 5);
  const singleFirst =
    readerSettings.showSingleImageOnFirstPage === true && perPage > 1;

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
    if (pages.length === 0) return;
    setCurrentPage((value) => clamp(value, 0, pages.length - 1));
  }, [pages.length]);
  const commentsAtEnd =
    !isLocal &&
    !isContinuous &&
    direction !== "ttb" &&
    readerSettings.showChapterComments === true &&
    readerSettings.showChapterCommentsAtEnd === true &&
    sourceInfo?.capabilities.chapterComments === true;
  const galleryPageCount = pages.length + (commentsAtEnd ? 1 : 0);
  const onCommentsPage = commentsAtEnd && currentPage >= pages.length;

  useEffect(() => {
    if (imagesQuery.data && pages.length > 0) {
      if (pendingLastPage) {
        setCurrentPage(pages.length - 1);
        setPendingLastPage(false);
        return;
      }
      const requested = Number(searchParams.get("page") ?? "1");
      setCurrentPage(clamp(requested - 1, 0, pages.length - 1));
    }
    // Only react to a new chapter's images.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagesQuery.data, chapterId]);

  useEffect(() => {
    if (!chapterId) return;
    if (
      searchParams.get("chapter") === chapterId &&
      searchParams.get("page") === String(currentPage + 1)
    ) {
      return;
    }
    setSearchParams(
      { chapter: chapterId, page: String(currentPage + 1) },
      { replace: true },
    );
  }, [chapterId, currentPage, searchParams, setSearchParams]);

  const title = isLocal
    ? (localQuery.data?.title ?? "")
    : (comicQuery.data?.title ?? "");
  const subtitle = isLocal
    ? (localQuery.data?.subtitle ?? "")
    : (comicQuery.data?.subtitle ?? "");
  const cover = isLocal ? "" : (comicQuery.data?.cover ?? "");
  const comicType = isLocal ? 0 : (comicQuery.data?.comicType ?? 0);
  const chapterTitle = chapter?.title ?? "";

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
          chapterGroup: chapter?.group
            ? groups.findIndex((group) => group.name === chapter.group) + 1
            : null,
          maxPage: imageKeys.length,
          readEpisode: [...nextRead],
        })
        .catch(() => {});
      if (nextRead.size !== readEpisodes.size) setReadEpisodes(nextRead);
      if (
        page >= pages.length - 1 &&
        chapterIndex === chapters.length - 1 &&
        readerSettings.removeReadLaterOnComplete !== false
      ) {
        api.removeReadLater(comicType, comicId).catch(() => {});
      }
      queryClient.invalidateQueries({ queryKey: ["history"] });
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
      if (seconds > 5 && readerSettings.recordReadingStatistics !== false) {
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

  const readingOrder = String(
    (settings.comicChapterReadingOrder as Record<string, string> | undefined)?.[
      `${comicId}@${sourceKey}`
    ] ?? "automatic",
  );
  const step = readingOrder === "reverse" ? -1 : 1;

  const nextChapter = chapters[chapterIndex + step];
  const prevChapter = chapters[chapterIndex - step];

  const goNext = useCallback(() => {
    if (currentPage < totalPages - 1) {
      setCurrentPage((value) => value + 1);
      setControlsVisible(false);
    } else if (commentsAtEnd && currentPage < totalPages) {
      setCurrentPage(totalPages);
      setControlsVisible(false);
    } else if (nextChapter) {
      showHint(nextChapter.title);
      goToChapter(chapterIndex + step, 0);
    } else if (chapterIndex === chapters.length - 1 || chapterIndex === 0) {
      showHint(t("This is the last chapter"));
    }
  }, [
    chapterIndex,
    chapters.length,
    commentsAtEnd,
    currentPage,
    nextChapter,
    step,
    totalPages,
  ]);

  const goPrev = useCallback(() => {
    if (commentsAtEnd && currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
      setControlsVisible(false);
    } else if (currentPage > 0) {
      setCurrentPage((value) => value - 1);
      setControlsVisible(false);
    } else if (prevChapter) {
      showHint(prevChapter.title);
      setPendingLastPage(true);
      goToChapter(chapterIndex - step, 0);
    } else if (chapterIndex === 0 || chapterIndex === chapters.length - 1) {
      showHint(t("This is the first chapter"));
    }
  }, [
    chapterIndex,
    chapters.length,
    commentsAtEnd,
    currentPage,
    prevChapter,
    step,
    totalPages,
  ]);

  const goToEnd = () => {
    setCurrentPage(Math.max(0, commentsAtEnd ? totalPages : totalPages - 1));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return;
      if (event.key === "f" || event.key === "F" || event.key === "F12") {
        event.preventDefault();
        toggleFullscreen();
        return;
      }
      if (event.key === "Escape") {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else if (contextMenu) {
          setContextMenu(null);
        } else if (settingsOpen) {
          setSettingsOpen(false);
        } else if (chaptersOpen) {
          setChaptersOpen(false);
        } else if (commentsOpen) {
          setCommentsOpen(false);
        } else if (controlsVisible) {
          setControlsVisible(false);
        } else {
          navigate(-1);
        }
        return;
      }
      if (event.key === "Home") {
        if (isContinuous) {
          const element = scrollRef.current;
          element?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
        } else {
          setCurrentPage(0);
        }
        return;
      }
      if (event.key === "End") {
        if (isContinuous) {
          const element = scrollRef.current;
          if (element) {
            element.scrollTo({
              top: element.scrollHeight,
              left: element.scrollWidth,
              behavior: "smooth",
            });
          }
        } else {
          goToEnd();
        }
        return;
      }
      const forwardKey =
        direction === "ttb"
          ? "ArrowDown"
          : direction === "rtl"
            ? "ArrowLeft"
            : "ArrowRight";
      const backwardKey =
        direction === "ttb"
          ? "ArrowUp"
          : direction === "rtl"
            ? "ArrowRight"
            : "ArrowLeft";
      if (isContinuous) {
        if (event.key === forwardKey || event.key === backwardKey) {
          event.preventDefault();
          const forward = event.key === forwardKey;
          const delta = forward ? 1 : -1;
          scrollRef.current?.scrollBy({
            top: direction === "ttb" ? delta * window.innerHeight * 0.8 : 0,
            left: direction !== "ttb" ? delta * window.innerWidth * 0.8 : 0,
            behavior: "smooth",
          });
        }
      } else if (event.key === forwardKey) {
        event.preventDefault();
        goNext();
      } else if (event.key === backwardKey) {
        event.preventDefault();
        goPrev();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [
    chaptersOpen,
    commentsOpen,
    contextMenu,
    controlsVisible,
    direction,
    goNext,
    goPrev,
    isContinuous,
    navigate,
    settingsOpen,
  ]);

  // Continuous mode keeps native scrolling, but the original app applies the
  // configured mouse scroll speed. A non-passive listener is required to
  // prevent the browser from also applying the raw delta.
  useEffect(() => {
    if (!isContinuous) return;
    const element = scrollRef.current;
    if (!element) return;
    const speed = Number(readerSettings.readerScrollSpeed ?? 1) || 1;
    if (speed === 1) return;
    const onWheelNative = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      if (direction === "ttb") {
        element.scrollTop += event.deltaY * speed;
      } else {
        element.scrollLeft += event.deltaY * speed;
      }
    };
    element.addEventListener("wheel", onWheelNative, { passive: false });
    return () => element.removeEventListener("wheel", onWheelNative);
  }, [direction, isContinuous, readerSettings.readerScrollSpeed]);

  useEffect(() => {
    if (!autoTurning) return;
    const seconds = Number(readerSettings.autoPageTurningInterval ?? 5);
    const timer = window.setInterval(
      () => {
        setCurrentPage((value) => {
          if (value < totalPages - 1) return value + 1;
          return value;
        });
      },
      Math.max(1, seconds) * 1000,
    );
    return () => window.clearInterval(timer);
  }, [autoTurning, readerSettings.autoPageTurningInterval, totalPages]);

  useEffect(() => {
    const count = Number(readerSettings.preloadImageCount ?? 4);
    const start = pages[currentPage]?.start ?? 0;
    for (let offset = 1; offset <= count; offset++) {
      for (const index of [start + offset, start - offset]) {
        const url = imageUrls[index];
        if (!url) continue;
        const image = new Image();
        image.src = url;
      }
    }
  }, [currentPage, imageUrls, pages, readerSettings.preloadImageCount]);

  // Ask the server to warm its disk cache for this chapter. The request is
  // fire-and-forget; repeated calls are deduplicated by the backend.
  const prefetchBucket = useRef("");
  useEffect(() => {
    if (isLocal || !chapterId || imageKeys.length === 0) return;
    const bucket = Math.floor(currentPage / 8);
    const limit = Number(readerSettings.serverPrefetchImageCount ?? -1);
    const token = `${chapterId}:${bucket}:${limit}`;
    if (prefetchBucket.current === token) return;
    prefetchBucket.current = token;
    api
      .prefetchChapter(sourceKey, comicId, chapterId, currentPage + 1, limit)
      .catch(() => {});
  }, [
    chapterId,
    comicId,
    currentPage,
    imageKeys.length,
    isLocal,
    readerSettings.serverPrefetchImageCount,
    sourceKey,
  ]);

  useEffect(() => {
    const onFullscreen = () =>
      setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  useEffect(() => {
    const update = () =>
      setClock(
        new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    type BatteryManager = {
      level: number;
      addEventListener: (type: string, listener: () => void) => void;
      removeEventListener: (type: string, listener: () => void) => void;
    };
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManager>;
    };
    if (!nav.getBattery) return;
    let battery: BatteryManager | null = null;
    let cancelled = false;
    const update = () => {
      if (battery && !cancelled) setBatteryLevel(battery.level);
    };
    nav
      .getBattery()
      .then((value) => {
        if (cancelled) return;
        battery = value;
        update();
        value.addEventListener("levelchange", update);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      battery?.removeEventListener("levelchange", update);
    };
  }, []);

  useEffect(() => {
    if (firstPageEffect.current) {
      firstPageEffect.current = false;
      return;
    }
    if (readerSettings.flashWhiteScreenOnPageTurn !== true) return;
    setFlash(true);
    const timer = window.setTimeout(() => setFlash(false), 120);
    return () => window.clearTimeout(timer);
  }, [currentPage, chapterId, readerSettings.flashWhiteScreenOnPageTurn]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  const onWheel = (event: React.WheelEvent) => {
    if (isContinuous || onCommentsPage || event.ctrlKey) return;
    const now = Date.now();
    if (now - lastWheel.current < 220) return;
    const speed = Number(readerSettings.readerScrollSpeed ?? 1) || 1;
    if (Math.abs(event.deltaY) * speed < 8) return;
    lastWheel.current = now;
    if (event.deltaY > 0) goNext();
    else goPrev();
  };

  useEffect(() => {
    setZoom(null);
    longPressActive.current = false;
    longPressPanStart.current = null;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }, [currentPage, chapterId]);

  const zoomOrigin = (event: React.PointerEvent): { x: number; y: number } => {
    if (readerSettings.longPressZoomPosition === "center")
      return { x: 50, y: 50 };
    const rect = galleryRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 50, y: 50 };
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
      y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100),
    };
  };

  const pageTrackTransform = (page: number, offset: number) => {
    if (direction === "ttb") {
      return `translate3d(0, calc(${-page * 100}% + ${offset}px), 0)`;
    }
    const sign = direction === "rtl" ? 1 : -1;
    return `translate3d(calc(${sign * page * 100}% + ${offset}px), 0, 0)`;
  };

  const pageTransition = () =>
    readerSettings.enablePageAnimation === false
      ? "none"
      : "transform 220ms cubic-bezier(0.215, 0.61, 0.355, 1)";

  // Drags are written straight to the track so a 100-page chapter does not
  // re-render every page item on each pointer move.
  const setTrack = (offset: number, animate: boolean) => {
    const element = trackRef.current;
    if (!element) return;
    element.style.transition = animate ? pageTransition() : "none";
    element.style.transform = pageTrackTransform(currentPage, offset);
  };

  const onGalleryPointerDown = (event: React.PointerEvent) => {
    if (isContinuous) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, button, a")) return;
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressStart.current = { x: event.clientX, y: event.clientY };
    longPressActive.current = false;
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
      pointerId: event.pointerId,
    };
    draggingRef.current = false;
    dragOffsetRef.current = 0;
    if (onCommentsPage || readerSettings.enableLongPressToZoom !== true) return;
    const origin = zoomOrigin(event);
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      longPressActive.current = true;
      suppressTapUntil.current = Date.now() + 600;
      dragStart.current = null;
      draggingRef.current = false;
      dragOffsetRef.current = 0;
      longPressPanStart.current = {
        x: event.clientX,
        y: event.clientY,
        zoomX: origin.x,
        zoomY: origin.y,
      };
      setZoom({ scale: 1.75, ...origin });
    }, 350);
  };

  const onGalleryPointerMove = (event: React.PointerEvent) => {
    const start = longPressStart.current;
    if (!start) return;
    if (longPressActive.current) {
      const panStart = longPressPanStart.current;
      const rect = galleryRef.current?.getBoundingClientRect();
      if (!panStart || !rect || rect.width === 0 || rect.height === 0) return;
      const dx = ((event.clientX - panStart.x) / rect.width) * 100;
      const dy = ((event.clientY - panStart.y) / rect.height) * 100;
      setZoom({
        scale: 1.75,
        x: clamp(panStart.zoomX - dx, 0, 100),
        y: clamp(panStart.zoomY - dy, 0, 100),
      });
      return;
    }
    const drag = dragStart.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const primary = direction === "ttb" ? dy : dx;
    const cross = direction === "ttb" ? dx : dy;
    if (!draggingRef.current) {
      if (Math.abs(primary) < 8 || Math.abs(primary) <= Math.abs(cross)) {
        if (Math.hypot(dx, dy) > 10 && longPressTimer.current) {
          window.clearTimeout(longPressTimer.current);
          longPressTimer.current = null;
        }
        return;
      }
      draggingRef.current = true;
      suppressTapUntil.current = Date.now() + 400;
      if (longPressTimer.current) {
        window.clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    }
    // The track follows the finger. In RTL the next page sits to the left of
    // the current one, so dragging right advances; TTB advances on drag up.
    let offset = primary;
    const advance = direction === "rtl" ? offset : -offset;
    if (
      (advance < 0 && currentPage <= 0) ||
      (advance > 0 && currentPage >= galleryPageCount - 1)
    ) {
      offset *= 0.35;
    }
    dragOffsetRef.current = offset;
    setTrack(offset, false);
  };

  const endLongPress = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
    longPressStart.current = null;
    longPressPanStart.current = null;
    dragStart.current = null;
    draggingRef.current = false;
    dragOffsetRef.current = 0;
    setTrack(0, true);
    if (longPressActive.current) {
      longPressActive.current = false;
      suppressTapUntil.current = Date.now() + 400;
      setZoom(null);
    }
  };

  const onGalleryPointerUp = (event: React.PointerEvent) => {
    if (longPressActive.current) {
      endLongPress();
      return;
    }
    const drag = dragStart.current;
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    longPressStart.current = null;
    dragStart.current = null;

    if (draggingRef.current) {
      const offset = dragOffsetRef.current;
      const elapsed = drag ? Math.max(1, Date.now() - drag.time) : 1;
      const size =
        direction === "ttb"
          ? (galleryRef.current?.clientHeight ?? window.innerHeight)
          : (galleryRef.current?.clientWidth ?? window.innerWidth);
      const velocity = Math.abs(offset) / elapsed;
      const threshold = Math.max(36, size * 0.18);
      const crossDistance = drag
        ? direction === "ttb"
          ? Math.abs(event.clientX - drag.x)
          : Math.abs(event.clientY - drag.y)
        : 0;
      const advance = direction === "rtl" ? offset : -offset;
      const animate = readerSettings.enablePageAnimation !== false;
      draggingRef.current = false;
      dragOffsetRef.current = 0;
      suppressTapUntil.current = Date.now() + 350;
      if (
        readerSettings.quickCollectImage === "Swipe" &&
        crossDistance > 150
      ) {
        setTrack(0, animate);
        collectRef.current();
        return;
      }
      if (advance > threshold || (advance > 20 && velocity > 0.45)) {
        if (currentPage < galleryPageCount - 1) {
          setTrack(0, animate);
          goNext();
        } else {
          setTrack(0, animate);
          showHint(t("This is the last chapter"));
        }
      } else if (advance < -threshold || (advance < -20 && velocity > 0.45)) {
        if (currentPage > 0) {
          setTrack(0, animate);
          goPrev();
        } else {
          setTrack(0, animate);
          showHint(t("This is the first chapter"));
        }
      } else {
        setTrack(0, animate);
      }
      return;
    }

    if (onCommentsPage) return;
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;
    const imageIndex = target.dataset?.imageIndex;
    if (
      imageIndex !== undefined &&
      (pages[currentPage]?.images.length ?? 0) > 1
    ) {
      setSelectedImage(Number(imageIndex));
      return;
    }

    const rect = galleryRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    let zone: "prev" | "center" | "next";
    if (direction === "ttb") {
      zone = y < 0.3 ? "prev" : y > 0.7 ? "next" : "center";
    } else {
      zone =
        x < 0.3
          ? direction === "rtl"
            ? "next"
            : "prev"
          : x > 0.7
            ? direction === "rtl"
              ? "prev"
              : "next"
            : "center";
    }
    scheduleTapZone(zone);
  };

  const onGalleryPointerCancel = () => {
    endLongPress();
    longPressActive.current = false;
    setZoom(null);
  };

  const zoneTapTimer = useRef<number | null>(null);
  const scheduleTapZone = (zone: "prev" | "center" | "next") => {
    if (Date.now() < suppressTapUntil.current) return;
    if (readerSettings.enableDoubleTapToZoom !== true) {
      tapZone(zone);
      return;
    }
    if (zoneTapTimer.current) window.clearTimeout(zoneTapTimer.current);
    zoneTapTimer.current = window.setTimeout(() => {
      zoneTapTimer.current = null;
      tapZone(zone);
    }, 220);
  };

  const onGalleryDoubleClick = (event: React.MouseEvent) => {
    if (zoneTapTimer.current) {
      window.clearTimeout(zoneTapTimer.current);
      zoneTapTimer.current = null;
    }
    if (onCommentsPage) return;
    if (readerSettings.quickCollectImage === "DoubleTap") {
      collectRef.current();
      return;
    }
    if (readerSettings.enableDoubleTapToZoom !== true || onCommentsPage) return;
    if (zoom) {
      setZoom(null);
      return;
    }
    const rect = galleryRef.current?.getBoundingClientRect();
    const x =
      rect && rect.width > 0
        ? clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100)
        : 50;
    const y =
      rect && rect.height > 0
        ? clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
        : 50;
    setZoom({ scale: 2, x, y });
  };

  const draggingRef = useRef(false);
  const dragOffsetRef = useRef(0);
  const dragStart = useRef<{
    x: number;
    y: number;
    time: number;
    pointerId: number;
  } | null>(null);
  const continuousTap = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );

  const tapZone = (zone: "prev" | "center" | "next") => {
    // The original reader closes the toolbar on any tap while it is open;
    // page turning only applies when the toolbar is hidden.
    if (controlsVisible) {
      setControlsVisible(false);
      return;
    }
    if (zone === "center") {
      setControlsVisible(true);
      return;
    }
    if (readerSettings.enableTapToTurnPages === false) {
      setControlsVisible(true);
      return;
    }
    const reverse = readerSettings.reverseTapToTurnPages === true;
    if (zone === "prev") {
      if (reverse) goNext();
      else goPrev();
    } else {
      if (reverse) goPrev();
      else goNext();
    }
  };

  const tapContinuous = (zone: "prev" | "center" | "next") => {
    if (controlsVisible) {
      setControlsVisible(false);
      return;
    }
    if (zone === "center") {
      setControlsVisible(true);
      return;
    }
    if (readerSettings.enableTapToTurnPages === false) {
      setControlsVisible(true);
      return;
    }
    const reverse = readerSettings.reverseTapToTurnPages === true;
    const forward = zone === "next" ? !reverse : reverse;
    const element = scrollRef.current;
    if (!element) return;
    const atEnd =
      direction === "ttb"
        ? element.scrollTop + element.clientHeight >= element.scrollHeight - 8
        : Math.abs(element.scrollLeft) + element.clientWidth >=
          element.scrollWidth - 8;
    const atStart =
      direction === "ttb"
        ? element.scrollTop <= 8
        : Math.abs(element.scrollLeft) <= 8;
    if (forward && atEnd) {
      if (nextChapter) {
        showHint(nextChapter.title);
        goToChapter(chapterIndex + step, 0);
      } else {
        showHint(t("This is the last chapter"));
      }
      return;
    }
    if (!forward && atStart) {
      if (prevChapter) {
        showHint(prevChapter.title);
        setPendingLastPage(true);
        goToChapter(chapterIndex - step, 0);
      } else {
        showHint(t("This is the first chapter"));
      }
      return;
    }
    element.scrollBy({
      top: direction === "ttb" ? (forward ? 1 : -1) * element.clientHeight * 0.8 : 0,
      left:
        direction !== "ttb"
          ? (forward ? 1 : -1) * element.clientWidth * 0.8
          : 0,
      behavior: "smooth",
    });
  };

  const onContinuousPointerDown = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest("button")) return;
    continuousTap.current = {
      x: event.clientX,
      y: event.clientY,
      time: Date.now(),
    };
  };

  const onContinuousPointerUp = (event: React.PointerEvent) => {
    const start = continuousTap.current;
    continuousTap.current = null;
    if (!start) return;
    if ((event.target as HTMLElement).closest("button")) return;
    if (Date.now() - start.time > 500) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) return;
    const element = scrollRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0.5;
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    let zone: "prev" | "center" | "next";
    if (direction === "ttb") {
      zone = y < 0.3 ? "prev" : y > 0.7 ? "next" : "center";
    } else {
      zone =
        x < 0.3
          ? direction === "rtl"
            ? "next"
            : "prev"
          : x > 0.7
            ? direction === "rtl"
              ? "prev"
              : "next"
            : "center";
    }
    tapContinuous(zone);
  };

  const updateSetting = async (patch: Record<string, unknown>) => {
    let payload: Record<string, unknown> = patch;
    if (comicSpecificEnabled) {
      let map = settings.comicSpecificSettings;
      for (const [key, value] of Object.entries(patch)) {
        map = withComicSpecificSetting(
          { ...settings, comicSpecificSettings: map },
          comicKey,
          key,
          value,
        );
      }
      payload = { comicSpecificSettings: map };
    } else if (isDeviceSpecificEnabled(settings, deviceId)) {
      let map = settings.deviceSpecificSettings;
      for (const [key, value] of Object.entries(patch)) {
        map = withDeviceSpecificSetting(
          { ...settings, deviceSpecificSettings: map },
          deviceId,
          key,
          value,
        );
      }
      payload = { deviceSpecificSettings: map };
    }
    try {
      setSettings(await api.updateSettings(payload));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const setComicSpecificEnabled = async (enabled: boolean) => {
    try {
      setSettings(
        await api.updateSettings({
          comicSpecificSettings: withComicSpecificSetting(
            settings,
            comicKey,
            "enabled",
            enabled,
          ),
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const clearComicSpecific = async () => {
    try {
      setSettings(
        await api.updateSettings({
          comicSpecificSettings: withoutComicSpecificSettings(
            settings,
            comicKey,
          ),
        }),
      );
      toast.success(t("Cleared"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const setDeviceSpecificEnabled = async (enabled: boolean) => {
    try {
      setSettings(
        await api.updateSettings({
          deviceSpecificSettings: withDeviceSpecificSetting(
            settings,
            deviceId,
            "enabled",
            enabled,
          ),
        }),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const clearDeviceSpecific = async () => {
    try {
      setSettings(
        await api.updateSettings({
          deviceSpecificSettings: withoutDeviceSpecificSettings(
            settings,
            deviceId,
          ),
        }),
      );
      toast.success(t("Cleared"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const collectImage = async () => {
    const page = pages[currentPage];
    if (!page || !chapter) return;
    const index = page.indexes[0] ?? page.start;
    const key = imageKeys[index] ?? imageUrls[index] ?? "";
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
      toast.success(t("Successfully collected"));
      queryClient.invalidateQueries({ queryKey: ["image-favorites"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    collectRef.current = collectImage;
  }, [collectImage]);

  const saveImage = async () => {
    const page = pages[currentPage];
    const index =
      selectedImage !== null && page?.images[selectedImage] ? selectedImage : 0;
    const url = page?.images[index];
    if (!url) return;
    try {
      const response = await fetch(url, { credentials: "include" });
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      const pageIndex = page?.indexes[index] ?? currentPage;
      anchor.download = `${title}-${chapterTitle}-${pageIndex + 1}.jpg`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
      setSelectedImage(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const shareImage = async () => {
    const page = pages[currentPage];
    const index =
      selectedImage !== null && page?.images[selectedImage] ? selectedImage : 0;
    const url = page?.images[index];
    if (!url) return;
    try {
      const response = await fetch(url, { credentials: "include" });
      const blob = await response.blob();
      const file = new File([blob], `${title}-${currentPage + 1}.jpg`, {
        type: blob.type || "image/jpeg",
      });
      const nav = navigator as Navigator & {
        canShare?: (data: { files?: File[] }) => boolean;
      };
      if (navigator.share && nav.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${title} ${chapterTitle}`,
        });
      } else {
        await copyText(window.location.href);
        toast.success(t("Copied"));
      }
      setSelectedImage(null);
    } catch {
      // Cancelled.
    }
  };

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `${title} ${chapterTitle}`,
          url: window.location.href,
        });
      } else {
        await copyText(window.location.href);
        toast.success(t("Copied"));
      }
    } catch {
      // Cancelled.
    }
  };

  const nightColor =
    readerSettings.readerNightMode === "warm"
      ? "255,147,41"
      : readerSettings.readerNightMode === "red"
        ? "255,0,0"
        : "0,0,0";
  const nightAlpha =
    readerSettings.readerNightMode && readerSettings.readerNightMode !== "none"
      ? Number(readerSettings.readerNightModeIntensity ?? 0.25)
      : 0;
  const background =
    readerSettings.readerBackground === "white"
      ? "#ffffff"
      : readerSettings.readerBackground === "gray"
        ? "#d0d0d0"
        : readerSettings.readerBackground === "sepia"
          ? "#f1e4c3"
          : readerSettings.readerBackground === "black"
            ? "#000000"
            : "#000000";
  const marginPercent = readerSettings.readerPageMarginEnabled
    ? Number(readerSettings.readerPageMarginPercent ?? 19.3)
    : 0;

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  const loading =
    comicQuery.isLoading || localQuery.isLoading || imagesQuery.isLoading;

  if (!loading && imagesQuery.isError) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black p-6 text-white">
        <EmptyState
          title={t("Error")}
          description={
            imagesQuery.error
              ? friendlyError(imagesQuery.error)
              : t("Failed to load this chapter")
          }
          action={
            <>
              <Button onClick={() => imagesQuery.refetch()}>
                {t("Retry")}
              </Button>
              <Button variant="secondary" onClick={() => navigate(-1)}>
                {t("Back")}
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (!loading && imageUrls.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black p-6 text-white">
        <EmptyState
          title={t("Failed to load this chapter")}
          description={t("The chapter does not exist or has no images.")}
          action={
            <>
              <Button onClick={() => imagesQuery.refetch()}>
                {t("Retry")}
              </Button>
              <Button variant="secondary" onClick={() => navigate(-1)}>
                {t("Back")}
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (!loading && chapters.length === 0) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-black p-6 text-white">
        <EmptyState
          title={t("Comic not found")}
          action={<Button onClick={() => navigate(-1)}>{t("Back")}</Button>}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-hidden text-white"
      style={{ background }}
    >
      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <Spinner className="h-7 w-7 text-white" />
          <p className="text-[12px] text-white/70">
            {t("Loading chapter…")}
          </p>
        </div>
      ) : isContinuous ? (
        <div
          ref={scrollRef}
          className={cn(
            "flex-1 scrollbar-thin",
            direction === "ttb"
              ? "overflow-y-auto overflow-x-hidden"
              : direction === "rtl"
                ? "flex flex-row-reverse overflow-x-auto overflow-y-hidden"
                : "flex flex-row overflow-x-auto overflow-y-hidden",
          )}
          onPointerDown={onContinuousPointerDown}
          onPointerUp={onContinuousPointerUp}
          onPointerCancel={() => {
            continuousTap.current = null;
          }}
          style={{
            paddingLeft: direction !== "ttb" ? `${marginPercent}%` : 0,
            paddingRight: direction !== "ttb" ? `${marginPercent}%` : 0,
            paddingTop: direction === "ttb" ? `${marginPercent / 2}%` : 0,
            paddingBottom: direction === "ttb" ? `${marginPercent / 2}%` : 0,
          }}
          onScroll={() => {
            const container = scrollRef.current;
            if (!container) return;
            const children = Array.from(
              container.querySelectorAll<HTMLElement>("[data-page-index]"),
            );
            const position =
              direction === "ttb"
                ? container.scrollTop
                : Math.abs(container.scrollLeft);
            let closest = 0;
            let distance = Infinity;
            for (const child of children) {
              const offset =
                direction === "ttb" ? child.offsetTop : child.offsetLeft;
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
              <Button
                variant="secondary"
                onClick={() => goToChapter(chapterIndex - step, 0)}
              >
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
                "relative flex shrink-0 items-center justify-center",
                direction === "ttb" ? "w-full" : "h-full",
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
                  {t("Retry")}
                </button>
              ) : (
                <img
                  src={url}
                  alt={`${title} page ${index + 1}`}
                  loading={
                    Math.abs(index - currentPage) <= 3 ? "eager" : "lazy"
                  }
                  decoding="async"
                  draggable={false}
                  onError={() =>
                    setFailed((value) => ({ ...value, [index]: true }))
                  }
                  className={cn(
                    "reader-page select-none object-contain",
                    direction === "ttb" ? "w-full" : "max-h-full",
                    readerSettings.limitImageWidth === false
                      ? "max-w-none"
                      : "max-w-full",
                  )}
                />
              )}
            </div>
          ))}
          {nextChapter ? (
            <div className="flex min-h-[80px] w-full items-center justify-center p-4">
              <Button
                variant="secondary"
                onClick={() => goToChapter(chapterIndex + step, 0)}
              >
                {nextChapter.title}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <div
          ref={galleryRef}
          className="relative flex-1 overflow-hidden"
          style={{
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            touchAction: direction === "ttb" ? "none" : "pan-y",
            overscrollBehavior: "contain",
          }}
          onWheel={onWheel}
          onPointerDown={onGalleryPointerDown}
          onPointerMove={onGalleryPointerMove}
          onPointerUp={onGalleryPointerUp}
          onPointerCancel={onGalleryPointerCancel}
          onPointerLeave={onGalleryPointerCancel}
          onDoubleClick={onGalleryDoubleClick}
          onContextMenu={handleContextMenu}
        >
          <div
            ref={trackRef}
            className={cn(
              "flex h-full w-full",
              direction === "ttb"
                ? "flex-col"
                : direction === "rtl"
                  ? "flex-row-reverse"
                  : "flex-row",
            )}
            style={{
              transform: pageTrackTransform(currentPage, 0),
              transition: pageTransition(),
              willChange: "transform",
            }}
          >
            {pages.map((page, pageIndex) => (
              <div
                key={`${chapterId}-${pageIndex}`}
                data-page-index={pageIndex}
                className={cn(
                  "relative flex h-full w-full shrink-0 items-center justify-center gap-px",
                  direction === "rtl" ? "flex-row-reverse" : "flex-row",
                )}
                style={{
                  paddingLeft: direction !== "ttb" ? `${marginPercent}%` : 0,
                  paddingRight: direction !== "ttb" ? `${marginPercent}%` : 0,
                  paddingTop: direction === "ttb" ? `${marginPercent / 2}%` : 0,
                  paddingBottom:
                    direction === "ttb" ? `${marginPercent / 2}%` : 0,
                  transform:
                    pageIndex === currentPage && zoom
                      ? `scale(${zoom.scale})`
                      : undefined,
                  transformOrigin:
                    pageIndex === currentPage && zoom
                      ? `${zoom.x}% ${zoom.y}%`
                      : undefined,
                  transition: longPressActive.current
                    ? "none"
                    : "transform 160ms ease-out",
                }}
              >
                {page.images.map((url, index) => {
                  const pageImageIndex = page.indexes[index] ?? 0;
                  return failed[pageImageIndex] ? (
                    <button
                      key={`${pageImageIndex}-${retryNonce}`}
                      className="m-4 rounded border border-white/20 px-4 py-3 text-sm"
                      onClick={() => {
                        setFailed((value) => ({
                          ...value,
                          [pageImageIndex]: false,
                        }));
                        setRetryNonce((value) => value + 1);
                      }}
                    >
                      {t("Retry")}
                    </button>
                  ) : (
                    <img
                      key={`${pageImageIndex}-${retryNonce}`}
                      src={url}
                      alt={`${title} page ${pageImageIndex + 1}`}
                      data-image-index={index}
                      draggable={false}
                      loading={
                        Math.abs(pageIndex - currentPage) <= 1
                          ? "eager"
                          : "lazy"
                      }
                      decoding="async"
                      onError={() =>
                        setFailed((value) => ({
                          ...value,
                          [pageImageIndex]: true,
                        }))
                      }
                      className={cn(
                        "reader-page max-h-full min-w-0 flex-1 select-none object-contain transition-opacity duration-150",
                        pageIndex === currentPage &&
                          selectedImage === index &&
                          "ring-2 ring-accent brightness-110",
                      )}
                    />
                  );
                })}
              </div>
            ))}
            {commentsAtEnd ? (
              <div className="h-full w-full shrink-0">
                {currentPage >= pages.length - 1 ? (
                  <ChapterCommentsEndPage
                    source={sourceKey}
                    comicId={comicId}
                    epId={chapterId}
                    comicTitle={title}
                    chapterTitle={chapterTitle}
                    onExit={() => setCurrentPage(Math.max(0, totalPages - 1))}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
          <div
            className="pointer-events-none absolute inset-0 bg-black"
            style={{
              opacity: nightAlpha,
              backgroundColor: `rgb(${nightColor})`,
            }}
          />
          {selectedImage !== null && pages[currentPage]?.images.length > 1 ? (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 backdrop-blur-sm">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void saveImage()}
              >
                {t("Save")}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void shareImage()}
              >
                {t("Share")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedImage(null)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}
          {swipeHint ? (
            <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/75 px-4 py-2 text-[13px] text-white backdrop-blur-sm">
              {swipeHint}
            </div>
          ) : null}
        </div>
      )}

      {/* Top controls */}
      <div
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-black/70 px-3 py-2 backdrop-blur-md transition-transform duration-200 ease-enter",
          controlsVisible ? "translate-y-0" : "-translate-y-full",
        )}
      >
        <IconButton
          label={t("Back")}
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{title}</p>
          <p className="truncate text-[11px] text-white/60">{chapterTitle}</p>
        </div>
        {!isLocal && readerSettings.showChapterComments !== false ? (
          <IconButton
            label={t("Chapter Comments")}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setCommentsOpen(true)}
          >
            <MessageSquare className="h-5 w-5" />
          </IconButton>
        ) : null}
        <IconButton
          label={t("Settings")}
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Bottom controls */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 bg-black/70 px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 backdrop-blur-md transition-transform duration-200 ease-enter",
          controlsVisible ? "translate-y-0" : "translate-y-full",
        )}
      >
        {!isContinuous ? (
          <div className="mb-2 flex items-center gap-3">
            <button
              className="text-[11px] text-white/70"
              onClick={() => setCurrentPage(0)}
            >
              {t("First")}
            </button>
            <input
              type="range"
              min={1}
              max={Math.max(1, totalPages)}
              value={Math.min(currentPage + 1, totalPages)}
              onChange={(event) =>
                setCurrentPage(Number(event.target.value) - 1)
              }
              className="h-1.5 flex-1 accent-white"
              aria-label={t("Page")}
            />
            <button className="text-[11px] text-white/70" onClick={goToEnd}>
              {t("Last")}
            </button>
            <span className="w-16 text-right text-[11px] tabular text-white/70">
              {Math.min(currentPage + 1, totalPages)} / {totalPages}
            </span>
          </div>
        ) : (
          <div className="mb-2 text-center text-[11px] text-white/60">
            {Math.min(currentPage + 1, imageUrls.length)} / {imageUrls.length}
          </div>
        )}
        <div className="flex items-center gap-1 overflow-x-auto">
          <IconButton
            label={t("Previous image")}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={goPrev}
          >
            <ChevronLeft className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t("Next image")}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={goNext}
          >
            <ChevronRight className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t("Chapters")}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() => setChaptersOpen(true)}
          >
            <Bookmark className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t("Collect the image")}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={collectImage}
          >
            <BookmarkPlus className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t("Share")}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={share}
          >
            <Share2 className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t("Save Image")}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={saveImage}
          >
            <Download className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t("Auto Page Turning")}
            className={cn(
              "text-white hover:bg-white/10 hover:text-white",
              autoTurning && "text-accent",
            )}
            onClick={() => setAutoTurning((value) => !value)}
          >
            <Timer className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t("Page margin")}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={() =>
              updateSetting({
                readerPageMarginEnabled:
                  !readerSettings.readerPageMarginEnabled,
              })
            }
          >
            <Maximize2 className="h-5 w-5" />
          </IconButton>
          {readerSettings.readerPageMarginEnabled ? (
            <div className="flex w-32 items-center gap-2 px-1">
              <input
                type="range"
                min={0}
                max={40}
                step={0.5}
                value={Number(readerSettings.readerPageMarginPercent ?? 19.3)}
                onChange={(event) =>
                  updateSetting({
                    readerPageMarginPercent: Number(event.target.value),
                  })
                }
                className="h-1.5 flex-1 accent-white"
                aria-label={t("Page margin size")}
              />
              <span className="text-[10px] tabular text-white/60">
                {Number(readerSettings.readerPageMarginPercent ?? 19.3)}%
              </span>
            </div>
          ) : null}
          <IconButton
            label={t("Rotate")}
            className="text-white hover:bg-white/10 hover:text-white"
            onClick={cycleRotation}
          >
            <RotateCw className="h-5 w-5" />
          </IconButton>
          <IconButton
            label={t("Full Screen")}
            className="ml-auto text-white hover:bg-white/10 hover:text-white"
            onClick={toggleFullscreen}
          >
            {fullscreen ? (
              <Minimize2 className="h-5 w-5" />
            ) : (
              <Maximize2 className="h-5 w-5" />
            )}
          </IconButton>
        </div>
      </div>

      {/* Page number overlay */}
      {readerSettings.showPageNumberInReader !== false ? (
        <div className="pointer-events-none absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/50 px-2.5 py-0.5 text-[10px] tabular text-white/80">
          {onCommentsPage
            ? t("Chapter Comments")
            : `${Math.min(currentPage + 1, totalPages)} / ${Math.max(1, totalPages)}`}
        </div>
      ) : null}

      {/* Night mode overlay (gallery handled inside, continuous needs this) */}
      {isContinuous && nightAlpha > 0 ? (
        <div
          className="pointer-events-none absolute inset-0 z-10"
          style={{ backgroundColor: `rgba(${nightColor},${nightAlpha})` }}
        />
      ) : null}

      {readerSettings.enableClockAndBatteryInfoInReader !== false ? (
        <div className="pointer-events-none absolute left-2 top-16 z-10 rounded bg-black/50 px-2 py-0.5 text-[10px] tabular text-white/80">
          {clock}
          {batteryLevel !== null ? ` · ${Math.round(batteryLevel * 100)}%` : ""}
        </div>
      ) : null}

      <div
        className={cn(
          "pointer-events-none absolute inset-0 z-30 bg-white transition-opacity duration-100",
          flash ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Context menu (right-click) */}
      {contextMenu ? (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
            onContextMenu={(event) => {
              event.preventDefault();
              closeContextMenu();
            }}
          />
          <div
            className="fixed z-50 min-w-[180px] overflow-hidden rounded-card border border-border bg-surface py-1 shadow-pop"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 200),
              top: Math.min(contextMenu.y, window.innerHeight - 260),
            }}
          >
            {contextActions.map((item) => (
              <button
                key={item.label}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface2"
                onClick={() => {
                  closeContextMenu();
                  item.action();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* Chapters drawer */}
      <Drawer
        open={chaptersOpen}
        onClose={() => setChaptersOpen(false)}
        title={t("Chapters")}
      >
        <div className="flex flex-col gap-3">
          {groups.length > 1 ? (
            <Tabs
              items={groups.map((group) => ({
                value: group.name,
                label: group.name || "Default",
              }))}
              value={chapter?.group ?? groups[0]?.name ?? ""}
              onChange={(value) => {
                const group = groups.find((item) => item.name === value);
                if (group?.chapters[0])
                  goToChapter(chapters.indexOf(group.chapters[0]));
              }}
            />
          ) : null}
          <div className="overflow-hidden rounded border border-border">
            {chapters.map((item, index) => (
              <button
                key={item.id}
                onClick={() => goToChapter(index)}
                className={cn(
                  "flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left text-[13px] last:border-b-0",
                  item.id === chapterId
                    ? "bg-accent/10 text-accent"
                    : "hover:bg-surface2",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {downloadedEpisodes.has(item.id) ? (
                  <span className="text-[10px] text-accent">
                    {t("Downloaded")}
                  </span>
                ) : null}
                {readEpisodes.has(index) ? (
                  <span className="text-[10px] text-muted">{t("Read")}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      </Drawer>

      {/* Settings drawer */}
      <Drawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t("Reading")}
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">
              {t("Enable comic specific settings")}
            </span>
            <Switch
              checked={comicSpecificEnabled}
              onChange={setComicSpecificEnabled}
            />
          </div>
          {comicSpecificEnabled ? (
            <Button size="sm" variant="secondary" onClick={clearComicSpecific}>
              {t("Clear specific reader settings for this comic")}
            </Button>
          ) : null}
          <div className="h-px bg-border" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">
              {t("Enable device specific settings")}
            </span>
            <Switch
              checked={isDeviceSpecificEnabled(settings, deviceId)}
              onChange={setDeviceSpecificEnabled}
            />
          </div>
          {isDeviceSpecificEnabled(settings, deviceId) ? (
            <Button size="sm" variant="secondary" onClick={clearDeviceSpecific}>
              {t("Clear specific reader settings for this device")}
            </Button>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t("Reading mode")}</span>
            <Select
              value={mode}
              onChange={(event) =>
                updateSetting({ readerMode: event.target.value })
              }
              className="w-[190px]"
            >
              <option value="galleryLeftToRight">
                {t("Gallery (Left to Right)")}
              </option>
              <option value="galleryRightToLeft">
                {t("Gallery (Right to Left)")}
              </option>
              <option value="galleryTopToBottom">
                {t("Gallery (Top to Bottom)")}
              </option>
              <option value="continuousLeftToRight">
                {t("Continuous (Left to Right)")}
              </option>
              <option value="continuousRightToLeft">
                {t("Continuous (Right to Left)")}
              </option>
              <option value="continuousTopToBottom">
                {t("Continuous (Top to Bottom)")}
              </option>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t("Two-page spread")}</span>
            <Switch
              checked={readerSettings.readerTwoPageSpread === true}
              onChange={(value) =>
                updateSetting({ readerTwoPageSpread: value })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t("Page margin")}</span>
            <Switch
              checked={readerSettings.readerPageMarginEnabled === true}
              onChange={(value) =>
                updateSetting({ readerPageMarginEnabled: value })
              }
            />
          </div>
          {readerSettings.readerPageMarginEnabled ? (
            <Slider
              label={t("Page margin size")}
              min={0}
              max={40}
              step={0.5}
              value={Number(readerSettings.readerPageMarginPercent ?? 19.3)}
              onChange={(value) =>
                updateSetting({ readerPageMarginPercent: value })
              }
              format={(value) => `${value}%`}
            />
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-[13px]">
              <Moon className="h-4 w-4" /> {t("Night mode")}
            </span>
            <Select
              value={String(readerSettings.readerNightMode ?? "none")}
              onChange={(event) =>
                updateSetting({ readerNightMode: event.target.value })
              }
              className="w-[140px]"
            >
              <option value="none">{t("Off")}</option>
              <option value="warm">{t("Warm")}</option>
              <option value="dark">{t("Dark")}</option>
              <option value="red">{t("Red")}</option>
            </Select>
          </div>
          <Slider
            label={t("Night mode intensity")}
            min={0}
            max={0.8}
            step={0.05}
            value={Number(readerSettings.readerNightModeIntensity ?? 0.25)}
            onChange={(value) =>
              updateSetting({ readerNightModeIntensity: value })
            }
            format={(value) => value.toFixed(2)}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t("Show Page Number")}</span>
            <Switch
              checked={readerSettings.showPageNumberInReader !== false}
              onChange={(value) =>
                updateSetting({ showPageNumberInReader: value })
              }
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">
              {t("Number of images preloaded")}
            </span>
            <span className="text-[13px] tabular text-muted">
              {String(readerSettings.preloadImageCount ?? 4)}
            </span>
          </div>
          <Slider
            label={t("Number of images preloaded")}
            min={1}
            max={16}
            value={Number(readerSettings.preloadImageCount ?? 4)}
            onChange={(value) => updateSetting({ preloadImageCount: value })}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px]">{t("Server chapter prefetch")}</span>
            <Select
              value={String(readerSettings.serverPrefetchImageCount ?? -1)}
              onChange={(event) =>
                updateSetting({
                  serverPrefetchImageCount: Number(event.target.value),
                })
              }
              className="w-[140px]"
            >
              <option value="0">{t("Off")}</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="30">30</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="-1">{t("Whole chapter")}</option>
            </Select>
          </div>
          <p className="-mt-3 text-[11px] leading-relaxed text-muted">
            {t("Prefetch hint")}
          </p>
          <Button
            variant="secondary"
            onClick={() => {
              setSettingsOpen(false);
              navigate("/settings/reading");
            }}
          >
            {t("Settings")}
          </Button>
        </div>
      </Drawer>

      {/* Chapter comments drawer */}
      {!isLocal && readerSettings.showChapterComments !== false ? (
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

function ChapterCommentsEndPage({
  source,
  comicId,
  epId,
  comicTitle,
  chapterTitle,
  onExit,
}: {
  source: string;
  comicId: string;
  epId: string;
  comicTitle: string;
  chapterTitle: string;
  onExit: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [content, setContent] = useState("");
  const [comments, setComments] = useState<Comment[]>([]);
  const query = useQuery({
    queryKey: ["chapter-comments-end", source, comicId, epId, page],
    queryFn: () => api.chapterComments(source, comicId, epId, page),
    enabled: Boolean(epId),
  });
  const send = useMutation({
    mutationFn: () => api.sendChapterComment(source, comicId, epId, content),
    onSuccess: () => {
      setContent("");
      setPage(1);
      queryClient.invalidateQueries({
        queryKey: ["chapter-comments-end", source, comicId, epId],
      });
      queryClient.invalidateQueries({
        queryKey: ["chapter-comments", source, comicId, epId],
      });
      toast.success(t("Comment sent"));
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (!query.data) return;
    setComments((previous) => {
      if (page === 1) return query.data.comments;
      const seen = new Set(previous.map((comment) => comment.id));
      return [
        ...previous,
        ...query.data.comments.filter((comment) => !seen.has(comment.id)),
      ];
    });
  }, [page, query.data]);

  const maxPage = query.data?.maxPage ?? 1;

  return (
    <div className="flex h-full w-full flex-col bg-[#111] text-white">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <IconButton
          label={t("Exit")}
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={onExit}
        >
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <MessageSquare className="h-5 w-5 shrink-0 text-white/70" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium">
            {t("Chapter Comments")}
          </p>
          <p className="truncate text-[11px] text-white/60">
            {comicTitle ? `${comicTitle} · ` : ""}
            {chapterTitle}
          </p>
        </div>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
        {query.isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner className="h-6 w-6 text-white" />
          </div>
        ) : query.isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-[13px] text-white/70">
              {query.error instanceof Error
                ? query.error.message
                : String(query.error)}
            </p>
            <Button variant="secondary" onClick={() => query.refetch()}>
              {t("Retry")}
            </Button>
          </div>
        ) : comments.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-white/60">
            {t("No comments yet")}
          </div>
        ) : (
          <>
            <div className="columns-1 gap-3 md:columns-2">
              {comments.map((comment) => (
                <div
                  key={comment.id}
                  className="mb-3 break-inside-avoid rounded-lg border border-white/10 bg-white/5 p-3"
                >
                  <div className="flex items-center gap-2">
                    {comment.avatar ? (
                      <img
                        src={comment.avatar}
                        alt=""
                        className="h-6 w-6 rounded-full object-cover"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
                      {comment.userName}
                    </span>
                    <span className="text-[10px] text-white/45">
                      {comment.time}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed">
                    {comment.content}
                  </p>
                  {comment.replyCount ? (
                    <p className="mt-1 text-[10px] text-white/45">
                      {comment.replyCount} {t("replies")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            {page < maxPage ? (
              <div className="flex justify-center py-3">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={query.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  {t("Load more")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div className="flex shrink-0 gap-2 border-t border-white/10 p-3">
        <Textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={t("Write a comment…")}
          className="min-h-[44px] flex-1 border-white/15 bg-white/5 py-2 text-white placeholder:text-white/35"
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
  const [content, setContent] = useState("");
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["chapter-comments", source, comicId, epId, page],
    queryFn: () => api.chapterComments(source, comicId, epId, page),
    enabled: open && Boolean(epId),
  });
  const send = useMutation({
    mutationFn: () => api.sendChapterComment(source, comicId, epId, content),
    onSuccess: () => {
      setContent("");
      queryClient.invalidateQueries({
        queryKey: ["chapter-comments", source, comicId, epId],
      });
      toast.success(t("Comment sent"));
    },
    onError: (error) => toast.error(error.message),
  });
  const like = useMutation({
    mutationFn: (comment: Comment) =>
      api.likeChapterComment(
        source,
        comicId,
        epId,
        comment.id,
        !comment.isLiked,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["chapter-comments", source, comicId, epId],
      }),
    onError: (error) => toast.error(error.message),
  });
  const vote = useMutation({
    mutationFn: ({ comment, up }: { comment: Comment; up: boolean }) =>
      api.voteChapterComment(
        source,
        comicId,
        epId,
        comment.id,
        up,
        comment.voteStatus === (up ? 1 : -1),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["chapter-comments", source, comicId, epId],
      }),
    onError: (error) => toast.error(error.message),
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`${t("Chapter Comments")} · ${title}`}
    >
      <div className="flex flex-col gap-3">
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
        ) : (query.data?.comments.length ?? 0) === 0 ? (
          <EmptyState title={t("No comments yet")} />
        ) : (
          query.data?.comments.map((comment: Comment) => (
            <div key={comment.id} className="rounded border border-border p-3">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-medium">
                  {comment.userName}
                </span>
                <span className="text-[10px] text-muted">{comment.time}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[13px]">
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
              </div>
            </div>
          ))
        )}
        <div className="flex items-center justify-center gap-2">
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
        <div className="mt-2 flex gap-2 border-t border-border pt-3">
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
    </Drawer>
  );
}
