import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  FolderOpen,
  MoreHorizontal,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  api,
  completeUpload,
  downloadUrl,
  localCoverUrl,
  uploadFile,
} from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { LocalComic } from "../lib/types";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  Modal,
  Select,
  Skeleton,
  Switch,
} from "../components/ui";

export default function LocalComicsPage() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name");
  const [importOpen, setImportOpen] = useState(
    location.pathname.endsWith("/import"),
  );
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LocalComic | null>(null);
  const [removeFiles, setRemoveFiles] = useState(true);
  const [removeFavorites, setRemoveFavorites] = useState(true);
  const [chaptersTarget, setChaptersTarget] = useState<LocalComic | null>(null);
  const [chapterSelection, setChapterSelection] = useState<Set<string>>(
    new Set(),
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ["local-comics", search, sort],
    queryFn: () => api.localComics({ q: search || undefined, sort }),
  });
  const items = query.data?.items ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["local-comics"] });

  const remove = useMutation({
    mutationFn: (comic: LocalComic) =>
      api.deleteLocalComic(comic.id, { removeFiles, removeFavorites }),
    onSuccess: () => {
      toast.success("Deleted");
      setDeleteTarget(null);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteChapters = useMutation({
    mutationFn: ({
      comic,
      chapters,
    }: {
      comic: LocalComic;
      chapters: string[];
    }) => api.deleteLocalChapters(comic.id, chapters),
    onSuccess: () => {
      toast.success("Deleted");
      setChaptersTarget(null);
      setChapterSelection(new Set());
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (location.pathname.endsWith("/import")) setImportOpen(true);
  }, [location.pathname]);

  const doImport = async () => {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      const result = await uploadFile(file, setProgress);
      const completed = await completeUpload(result.uploadId, true);
      toast.success("Imported");
      setImportOpen(false);
      setFile(null);
      invalidate();
      if (completed.comic) navigate(`/reader/local/${completed.comic.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };

  const exportComic = async (
    comic: LocalComic,
    format: "cbz" | "pdf" | "epub",
  ) => {
    try {
      await downloadUrl(
        `/api/local-comics/${comic.id}/export?format=${format}`,
        `${comic.title}.${format}`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <PageHeader
        title={t("Local")}
        subtitle={`${items.length} comics`}
        actions={
          <>
            <IconButton label={t("Import")} onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={t("Downloading")}
              onClick={() => navigate("/downloads")}
            >
              <Download className="h-4 w-4" />
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
          <Select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
            className="w-[160px]"
          >
            <option value="name">Name</option>
            <option value="time_asc">Date</option>
            <option value="time_desc">Date Desc</option>
          </Select>
        </div>

        {query.isLoading ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="aspect-[2/3] w-full" />
                <Skeleton className="mt-2 h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={t("No data")}
            description="Upload a CBZ/ZIP archive or download a comic from a source."
            action={
              <Button variant="primary" onClick={() => setImportOpen(true)}>
                {t("Import")}
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
            {items.map((comic) => (
              <div key={comic.id} className="group relative">
                <button
                  onClick={() => navigate(`/reader/local/${comic.id}`)}
                  className="block w-full text-left"
                >
                  <div className="relative aspect-[2/3] w-full overflow-hidden rounded-card border border-border bg-surface2">
                    <img
                      src={localCoverUrl(comic.id)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        (event.target as HTMLImageElement).style.visibility =
                          "hidden";
                      }}
                    />
                    <span className="absolute left-1.5 top-1.5">
                      <Badge tone="accent">{comic.chapterList.length} ch</Badge>
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[13px] font-medium leading-snug">
                    {comic.title}
                  </p>
                  <p className="truncate text-[11px] text-muted">
                    {comic.subtitle}
                  </p>
                </button>
                <div className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                  <Menu
                    trigger={({ onClick, ...rest }) => (
                      <IconButton
                        label="More"
                        onClick={onClick}
                        className="h-8 w-8 bg-black/45 text-white hover:bg-black/65 hover:text-white"
                        {...rest}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </IconButton>
                    )}
                    items={[
                      {
                        label: t("Read"),
                        onSelect: () => navigate(`/reader/local/${comic.id}`),
                      },
                      {
                        label: t("Open Folder"),
                        icon: <FolderOpen className="h-3.5 w-3.5" />,
                        onSelect: () =>
                          navigator.clipboard
                            ?.writeText(comic.directory)
                            .then(() =>
                              toast.success("Path copied to clipboard"),
                            ),
                      },
                      {
                        label: t("Export as cbz"),
                        onSelect: () => exportComic(comic, "cbz"),
                      },
                      {
                        label: t("Export as pdf"),
                        onSelect: () => exportComic(comic, "pdf"),
                      },
                      {
                        label: t("Export as epub"),
                        onSelect: () => exportComic(comic, "epub"),
                      },
                      {
                        label: t("Delete Chapters"),
                        onSelect: () => {
                          setChaptersTarget(comic);
                          setChapterSelection(new Set());
                        },
                      },
                      {
                        label: t("Delete"),
                        danger: true,
                        icon: <Trash2 className="h-3.5 w-3.5" />,
                        onSelect: () => setDeleteTarget(comic),
                      },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={importOpen}
        onClose={() => !uploading && setImportOpen(false)}
        title={t("Import Comics")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setImportOpen(false)}
              disabled={uploading}
            >
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              loading={uploading}
              disabled={!file}
              onClick={doImport}
            >
              {t("Import")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field
            label={t("An archive file")}
            hint="CBZ, ZIP (7z/CB7 are not supported on this build)."
          >
            <input
              ref={fileRef}
              type="file"
              accept=".cbz,.zip,.7z,.cb7,application/zip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="block w-full text-[13px] text-muted file:mr-3 file:rounded file:border-0 file:bg-surface2 file:px-3 file:py-2 file:text-[13px] file:text-fg"
            />
          </Field>
          {uploading ? (
            <div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface2">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-200"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[11px] tabular text-muted">
                {Math.round(progress * 100)}%
              </p>
            </div>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`${t("Delete")} ${deleteTarget?.title ?? ""}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
            >
              {t("Delete")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <label className="flex items-center justify-between gap-3 text-[13px]">
            {t("Remove local favorite and history")}
            <Switch checked={removeFavorites} onChange={setRemoveFavorites} />
          </label>
          <label className="flex items-center justify-between gap-3 text-[13px]">
            {t("Also remove files on disk")}
            <Switch checked={removeFiles} onChange={setRemoveFiles} />
          </label>
        </div>
      </Modal>

      <Modal
        open={chaptersTarget !== null}
        onClose={() => setChaptersTarget(null)}
        title={t("Delete Chapters")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setChaptersTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              disabled={chapterSelection.size === 0}
              onClick={() =>
                chaptersTarget &&
                deleteChapters.mutate({
                  comic: chaptersTarget,
                  chapters: [...chapterSelection],
                })
              }
            >
              {t("Delete")}
            </Button>
          </>
        }
      >
        <div className="flex max-h-[50dvh] flex-col overflow-y-auto rounded border border-border">
          {(chaptersTarget?.chapterList ?? []).map((chapter) => (
            <label
              key={chapter.id}
              className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-2 text-[13px] last:border-b-0"
            >
              <input
                type="checkbox"
                checked={chapterSelection.has(chapter.id)}
                onChange={(event) => {
                  const next = new Set(chapterSelection);
                  if (event.target.checked) next.add(chapter.id);
                  else next.delete(chapter.id);
                  setChapterSelection(next);
                }}
                className="h-4 w-4 accent-[rgb(var(--accent))]"
              />
              {chapter.title}
            </label>
          ))}
        </div>
      </Modal>
    </>
  );
}
