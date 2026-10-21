import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Trash2,
} from "lucide-react";
import { api, imageUrl } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { ImageFavorite, ImageFavoritePage } from "../lib/types";
import { cn } from "../lib/utils";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
  Skeleton,
} from "../components/ui";
import { readerPath } from "../lib/links";

interface PhotoEntry extends ImageFavoritePage {
  comic: ImageFavorite;
  eid: string;
  epName: string;
  ep: number;
}

export default function ImageFavoritesPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [sort, setSort] = useState("Title");
  const [filter, setFilter] = useState("");
  const [minCount, setMinCount] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [photoIndex, setPhotoIndex] = useState<number | null>(null);
  const [photoBarVisible, setPhotoBarVisible] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const query = useQuery({
    queryKey: ["image-favorites", search, sort, filter, minCount],
    queryFn: () =>
      api.imageFavorites({ q: search || undefined, sort, filter, minCount }),
  });

  const items = query.data?.items ?? [];

  const photos = useMemo<PhotoEntry[]>(() => {
    const list: PhotoEntry[] = [];
    for (const comic of items) {
      for (const chapter of comic.chapters) {
        for (const image of chapter.images) {
          list.push({
            ...image,
            comic,
            eid: chapter.eid,
            epName: chapter.epName,
            ep: chapter.ep,
          });
        }
      }
    }
    return list;
  }, [items]);

  const removeComic = useMutation({
    mutationFn: (comic: ImageFavorite) =>
      api.removeImageFavorite(comic.id, comic.sourceKey),
    onSuccess: () => {
      toast.success(t("Deleted"));
      queryClient.invalidateQueries({ queryKey: ["image-favorites"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const removePage = useMutation({
    mutationFn: (entry: PhotoEntry) =>
      api.removeImageFavoritePage({
        comicId: entry.comic.id,
        sourceKey: entry.comic.sourceKey,
        eid: entry.eid,
        page: entry.page,
      }),
    onSuccess: () => {
      toast.success(t("Uncollected the image"));
      queryClient.invalidateQueries({ queryKey: ["image-favorites"] });
      setPhotoIndex(null);
    },
    onError: (error) => toast.error(error.message),
  });

  const batchDelete = useMutation({
    mutationFn: async () => {
      for (const comic of items.filter((item) =>
        selected.has(`${item.id}:${item.sourceKey}`),
      )) {
        await api.removeImageFavorite(comic.id, comic.sourceKey);
      }
    },
    onSuccess: () => {
      setSelected(new Set());
      toast.success(t("Deleted"));
      queryClient.invalidateQueries({ queryKey: ["image-favorites"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const photo = photoIndex !== null ? photos[photoIndex] : null;

  const coverFor = (comic: ImageFavorite) => {
    const first = comic.chapters[0]?.images[0];
    if (!first) return "";
    return imageUrl(
      comic.sourceKey,
      comic.id,
      comic.chapters[0].eid,
      first.imageKey,
    );
  };

  const savePhoto = async () => {
    if (!photo) return;
    const url = imageUrl(
      photo.comic.sourceKey,
      photo.comic.id,
      photo.eid,
      photo.imageKey,
    );
    try {
      const response = await fetch(url, { credentials: "include" });
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${photo.comic.title}-${photo.page}.jpg`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <PageHeader
        title={t("Image Favorites")}
        subtitle={t("@count comics", { count: query.data?.total ?? 0 })}
        actions={
          <>
            <IconButton
              label={
                selectMode ? t("Exit Multi-Select") : t("Multi-Select")
              }
              onClick={() => {
                setSelectMode((value) => !value);
                setSelected(new Set());
              }}
              className={selectMode ? "text-accent" : undefined}
            >
              <Search className="h-4 w-4" />
            </IconButton>
            <IconButton label={t("Sort")} onClick={() => setFilterOpen(true)}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </>
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("Search")}
              className="pl-9"
            />
          </div>
          <Button size="sm" onClick={() => setFilterOpen(true)}>
            {t("Sort")} / {t("Filter")}
          </Button>
        </div>

        {selectMode && selected.size > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-accent/30 bg-accent/5 p-2">
            <span className="px-1 text-[12px] font-medium">
              {t("@count selected", { count: selected.size })}
            </span>
            <Button
              size="sm"
              onClick={() =>
                setSelected(
                  new Set(items.map((item) => `${item.id}:${item.sourceKey}`)),
                )
              }
            >
              {t("Select All")}
            </Button>
            <Button size="sm" onClick={() => setSelected(new Set())}>
              {t("Deselect")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("Delete")}
            </Button>
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-40 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={t("No data")}
            description={t("Collect images while reading.")}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((comic) => {
              const key = `${comic.id}:${comic.sourceKey}`;
              return (
                <div
                  key={key}
                  className={cn(
                    "rounded-card border bg-surface p-3 transition-colors",
                    selected.has(key) ? "border-accent" : "border-border",
                  )}
                >
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        if (selectMode) {
                          const next = new Set(selected);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          setSelected(next);
                        } else {
                          const index = photos.findIndex(
                            (entry) =>
                              entry.comic.id === comic.id &&
                              entry.comic.sourceKey === comic.sourceKey,
                          );
                          setPhotoIndex(Math.max(0, index));
                        }
                      }}
                      className="h-24 w-16 shrink-0 overflow-hidden rounded border border-border bg-surface2"
                    >
                      {coverFor(comic) ? (
                        <img
                          src={coverFor(comic)}
                          alt=""
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium">
                        {comic.title}
                      </p>
                      <p className="truncate text-[12px] text-muted">
                        {comic.subtitle}
                      </p>
                      <p className="mt-1 text-[11px] text-muted">
                        {t("@count images", { count: comic.count })}
                      </p>
                      <div className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1">
                        {comic.chapters.flatMap((chapter) =>
                          chapter.images.slice(0, 6).map((image) => (
                            <button
                              key={`${chapter.eid}-${image.page}`}
                              className="h-12 w-9 shrink-0 overflow-hidden rounded border border-border"
                              onClick={() => {
                                const index = photos.findIndex(
                                  (entry) =>
                                    entry.comic.id === comic.id &&
                                    entry.comic.sourceKey === comic.sourceKey &&
                                    entry.eid === chapter.eid &&
                                    entry.page === image.page,
                                );
                                setPhotoIndex(Math.max(0, index));
                              }}
                            >
                              <img
                                src={imageUrl(
                                  comic.sourceKey,
                                  comic.id,
                                  chapter.eid,
                                  image.imageKey,
                                )}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </button>
                          )),
                        )}
                      </div>
                    </div>
                    {!selectMode ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeComic.mutate(comic)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PageBody>

      <Modal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        title={`${t("Sort")} / ${t("Filter")}`}
        footer={
          <Button variant="primary" onClick={() => setFilterOpen(false)}>
            {t("Confirm")}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t("Sort")}>
            <Select
              value={sort}
              onChange={(event) => setSort(event.target.value)}
            >
              <option value="Title">{t("Title")}</option>
              <option value="Time Asc">{t("Time Asc")}</option>
              <option value="Time Desc">{t("Time Desc")}</option>
              <option value="Favorite Num">{t("Favorite Num")}</option>
            </Select>
          </Field>
          <Field label={t("Time Filter")}>
            <Select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="">{t("All")}</option>
              <option value="lastWeek">{t("Last Week")}</option>
              <option value="lastMonth">{t("Last Month")}</option>
              <option value="lastHalfYear">{t("Last Half Year")}</option>
              <option value="lastYear">{t("Last Year")}</option>
            </Select>
          </Field>
          <Field label={t("Image Favorites Greater Than")}>
            <Select
              value={String(minCount)}
              onChange={(event) => setMinCount(Number(event.target.value))}
            >
              {[0, 1, 2, 5, 10, 20, 50, 100].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <Modal
        open={photo !== null}
        onClose={() => setPhotoIndex(null)}
        title={photo ? `${photo.comic.title} · ${photo.epName}` : ""}
        width="max-w-5xl"
      >
        {photo ? (
          <div className="flex flex-col gap-3">
            <div
              className="relative flex items-center justify-center bg-black"
              onTouchStart={(event) => {
                const touch = event.touches[0];
                (event.currentTarget as HTMLDivElement).dataset.touchX = String(
                  touch.clientX,
                );
              }}
              onTouchEnd={(event) => {
                const startX = Number(
                  (event.currentTarget as HTMLDivElement).dataset.touchX,
                );
                const touch = event.changedTouches[0];
                const dx = touch.clientX - startX;
                if (Math.abs(dx) > 60) {
                  if (dx < 0 && (photoIndex ?? 0) < photos.length - 1) {
                    setPhotoIndex((value) =>
                      Math.min(photos.length - 1, (value ?? 0) + 1),
                    );
                  } else if (dx > 0 && (photoIndex ?? 0) > 0) {
                    setPhotoIndex((value) => Math.max(0, (value ?? 0) - 1));
                  }
                }
              }}
              onClick={() => setPhotoBarVisible((value) => !value)}
            >
              <img
                src={imageUrl(
                  photo.comic.sourceKey,
                  photo.comic.id,
                  photo.eid,
                  photo.imageKey,
                )}
                alt=""
                className="max-h-[70dvh] max-w-full object-contain"
              />
              {photoBarVisible ? (
                <div className="absolute inset-x-0 bottom-2 flex items-center justify-between gap-2 px-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={(photoIndex ?? 0) <= 0}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPhotoIndex((value) => Math.max(0, (value ?? 0) - 1));
                    }}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="rounded-full bg-black/60 px-2.5 py-1 text-[12px] tabular text-white">
                    {(photoIndex ?? 0) + 1} / {photos.length} · page{" "}
                    {photo.page}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={(photoIndex ?? 0) >= photos.length - 1}
                    onClick={(event) => {
                      event.stopPropagation();
                      setPhotoIndex((value) =>
                        Math.min(photos.length - 1, (value ?? 0) + 1),
                      );
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => removePage.mutate(photo)}
              >
                <Trash2 className="h-3.5 w-3.5" /> {t("Delete")}
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  navigate(
                    readerPath(photo.comic.sourceKey, photo.comic.id, { chapter: photo.eid, page: photo.page }),
                  )
                }
              >
                {t("Read")}
              </Button>
              <Button size="sm" variant="primary" onClick={savePhoto}>
                <Download className="h-3.5 w-3.5" /> {t("Save Image")}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("Delete")}
        message={t("Delete @count image favorites?", {
          count: selected.size,
        })}
        confirmLabel={t("Delete")}
        danger
        onConfirm={() => batchDelete.mutate()}
      />
    </>
  );
}
