import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  CheckSquare,
  Download,
  FolderPlus,
  Import,
  MoreHorizontal,
  Search,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { Comic, FavoriteFolder, FavoriteItem } from "../lib/types";
import { cn, copyText } from "../lib/utils";
import { ComicCard, ComicGrid } from "../components/ComicCard";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  Modal,
  PromptDialog,
  Select,
  Skeleton,
} from "../components/ui";
import { comicPath, readerPath } from "../lib/links";

function toComic(item: FavoriteItem): Comic {
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    cover: item.cover,
    tags: [],
    description: item.description ?? "",
    sourceKey: item.sourceKey ?? "",
    comicType: item.comicType,
  };
}

export default function FavoritesPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const params = useParams();
  const settings = useAppStore((state) => state.settings);
  const rest = params["*"] ?? "";
  const segments = rest.split("/").filter(Boolean);
  const view = segments[0] ?? "overview";
  const localFolderId =
    view === "local" && segments[1] ? Number(segments[1]) : undefined;
  const networkSource = view === "network" ? (segments[1] ?? "") : "";
  const networkFolder =
    view === "network" && segments[2]
      ? decodeURIComponent(segments[2])
      : undefined;

  const folders = useQuery({
    queryKey: ["favorite-folders"],
    queryFn: api.favoriteFolders,
    staleTime: 5 * 60 * 1000,
  });
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const networkSources = (sources.data?.items ?? []).filter(
    (source) => source.enabled && source.capabilities.favorites === true,
  );

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState<"move" | "copy" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [targetFolder, setTargetFolder] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [networkImportOpen, setNetworkImportOpen] = useState(false);
  const [networkImportName, setNetworkImportName] = useState("");
  const [networkImportPages, setNetworkImportPages] = useState(20);
  const [syncPages, setSyncPages] = useState(
    Number(settings.local_favorites_update_page_num ?? 20) || 20,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  const localFavorites = useQuery({
    queryKey: ["favorites", localFolderId, search, status, page],
    queryFn: () =>
      api.favorites({
        folderId: localFolderId === 0 ? undefined : localFolderId,
        q: search || undefined,
        status: status || undefined,
        page,
      }),
    enabled: view === "local",
    staleTime: 5 * 60 * 1000,
  });

  const networkFolders = useQuery({
    queryKey: ["network-folders", networkSource],
    queryFn: () => api.networkFolders(networkSource),
    enabled: view === "network" && Boolean(networkSource) && !networkFolder,
    staleTime: 5 * 60 * 1000,
  });
  const networkComics = useQuery({
    queryKey: ["network-comics", networkSource, networkFolder, page],
    queryFn: () =>
      api.networkComics(networkSource, networkFolder ?? null, page),
    enabled:
      view === "network" && Boolean(networkSource) && Boolean(networkFolder),
    staleTime: 5 * 60 * 1000,
  });

  const currentFolder = folders.data?.items.find(
    (folder) => folder.id === localFolderId,
  );
  const networkSourceName =
    (sources.data?.items ?? []).find(
      (source) => source.key === networkSource,
    )?.name ?? networkSource;
  const items = localFavorites.data?.items ?? [];

  const selectedItems = items.filter((item) =>
    selected.has(`${item.id}:${item.comicType}`),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["favorites"] });
    queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
    queryClient.invalidateQueries({ queryKey: ["comic"] });
  };

  const createFolder = useMutation({
    mutationFn: (name: string) => api.createFavoriteFolder(name),
    onSuccess: (result) => {
      toast.success(t("Created successfully"));
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
      navigate(`/favorites/local/${result.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const renameFolder = useMutation({
    mutationFn: (name: string) =>
      api.renameFavoriteFolder(localFolderId!, name),
    onSuccess: () => {
      toast.success(t("Updated"));
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteFolder = useMutation({
    mutationFn: () => api.deleteFavoriteFolder(localFolderId!),
    onSuccess: () => {
      toast.success(t("Deleted"));
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
      navigate("/favorites");
    },
    onError: (error) => toast.error(error.message),
  });

  const batchDelete = useMutation({
    mutationFn: () =>
      api.batchDeleteFavorites(
        selectedItems.map((item) => ({
          comicId: item.id,
          comicType: item.comicType,
          folderId: item.folderId,
        })),
      ),
    onSuccess: () => {
      toast.success(t("Deleted"));
      setSelected(new Set());
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const moveOrCopy = useMutation({
    mutationFn: ({
      mode,
      target,
    }: {
      mode: "move" | "copy";
      target: number;
    }) =>
      mode === "move"
        ? api.moveFavorites(
            localFolderId!,
            target,
            selectedItems.map((item) => ({
              comicId: item.id,
              comicType: item.comicType,
            })),
          )
        : api.copyFavorites(
            localFolderId!,
            target,
            selectedItems.map((item) => ({
              comicId: item.id,
              comicType: item.comicType,
            })),
          ),
    onSuccess: () => {
      toast.success(t("Updated"));
      setSelected(new Set());
      setMoveOpen(null);
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateInfo = useMutation({
    mutationFn: () => api.updateFavoriteInfo(localFolderId),
    onSuccess: () => {
      toast.success(t("Running in background"));
      window.setTimeout(invalidate, 3000);
      window.setTimeout(invalidate, 15000);
    },
    onError: (error) => toast.error(error.message),
  });

  const syncFolder = useMutation({
    mutationFn: () => api.syncFavoriteFolder(localFolderId!, syncPages),
    onSuccess: (result) => {
      toast.success(
        t("Imported @count comics from @pages page(s)", {
          count: result.imported,
          pages: result.pages,
        }),
      );
      invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const importNetwork = useMutation({
    mutationFn: () =>
      api.importNetworkFolder(
        networkSource,
        networkFolder ?? null,
        networkImportName.trim() || undefined,
        networkImportPages,
      ),
    onSuccess: (result) => {
      setNetworkImportOpen(false);
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
      toast.success(t("Imported @count comics", { count: result.imported }));
      if (result.folder?.id) navigate(`/favorites/local/${result.folder.id}`);
    },
    onError: (error) => toast.error(error.message),
  });

  const sortFolders = useMutation({
    mutationFn: (ids: number[]) => api.sortFavoriteFolders(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
      setSortOpen(false);
    },
    onError: (error) => toast.error(error.message),
  });

  const removeNetworkFavorite = useMutation({
    mutationFn: (comic: Comic) =>
      api.toggleNetworkFavorite(networkSource, comic.id, networkFolder, false),
    onSuccess: () => {
      toast.success(t("Removed"));
      queryClient.invalidateQueries({ queryKey: ["network-comics"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleSelected = (item: FavoriteItem) => {
    const key = `${item.id}:${item.comicType}`;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const importFavorites = async (file: File) => {
    setImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as unknown;
      await api.importFavorites(data);
      toast.success(t("Imported"));
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setImporting(false);
    }
  };

  const exportFolder = async () => {
    if (!currentFolder) return;
    try {
      const data = await api.exportFavorites(currentFolder.id);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${currentFolder.name}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const downloadSelected = async () => {
    for (const item of selectedItems) {
      if (!item.sourceKey) continue;
      try {
        await api.createDownload({ source: item.sourceKey, comicId: item.id });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    }
    toast.success(t("Added to download queue"));
    navigate("/downloads");
  };

  return (
    <>
      <PageHeader
        title={
          view === "overview"
            ? t("Favorites")
            : view === "local"
              ? (currentFolder?.name ?? t("Local"))
              : networkFolder
                ? networkFolder
                : networkSourceName
        }
        subtitle={
          view === "overview"
            ? t("@count folders", { count: folders.data?.items.length ?? 0 })
            : view === "local"
              ? t("@count comics", {
                  count: localFavorites.data?.total ?? 0,
                })
              : undefined
        }
        back={view !== "overview"}
        actions={
          <>
            {view === "overview" ? (
              <>
                <IconButton
                  label={t("New Folder")}
                  onClick={() => setNewFolderOpen(true)}
                >
                  <FolderPlus className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={t("Import from file")}
                  onClick={() => fileRef.current?.click()}
                >
                  <Import className="h-4 w-4" />
                </IconButton>
              </>
            ) : view === "local" ? (
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
                  <CheckSquare className="h-4 w-4" />
                </IconButton>
                <IconButton label={t("Export")} onClick={exportFolder}>
                  <Download className="h-4 w-4" />
                </IconButton>
                <Menu
                  trigger={({ onClick, ...rest }) => (
                    <IconButton label={t("More")} onClick={onClick} {...rest}>
                      <MoreHorizontal className="h-4 w-4" />
                    </IconButton>
                  )}
                  items={[
                    ...(localFolderId !== 0
                      ? [
                          {
                            label: t("Rename"),
                            onSelect: () => setRenameOpen(true),
                          },
                        ]
                      : []),
                    { label: t("Sort"), onSelect: () => setSortOpen(true) },
                    {
                      label: t("Update Comics Info"),
                      onSelect: () => updateInfo.mutate(),
                    },
                    {
                      label: t("Import from file"),
                      onSelect: () => fileRef.current?.click(),
                    },
                    ...(localFolderId !== 0
                      ? [
                          {
                            label: t("Delete Folder"),
                            danger: true,
                            onSelect: () => setDeleteOpen(true),
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            ) : view === "network" && networkSource ? (
              <IconButton
                label={t("Import network folder")}
                onClick={() => {
                  setNetworkImportName("");
                  setNetworkImportOpen(true);
                }}
              >
                <Import className="h-4 w-4" />
              </IconButton>
            ) : null}
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) importFavorites(file);
          event.target.value = "";
        }}
      />

      <PageBody>
        <div className="flex flex-col gap-5 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-[220px]">
            <div className="rounded-card border border-border bg-surface p-2">
              <FolderLink
                to="/favorites"
                label={t("Overview")}
                active={view === "overview"}
              />
              <FolderLink
                to="/favorites/local/0"
                label={`${t("All")} (${folders.data?.items.reduce((sum, folder) => sum + folder.count, 0) ?? 0})`}
                active={false}
                onClick={() => navigate("/favorites/local/0")}
              />
              <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {t("Local")}
              </p>
              {(folders.data?.items ?? []).map((folder) => (
                <FolderLink
                  key={folder.id}
                  to={`/favorites/local/${folder.id}`}
                  label={`${folder.name} (${folder.count})`}
                  active={localFolderId === folder.id}
                />
              ))}
              <p className="px-2 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-muted">
                {t("Network")}
              </p>
              {networkSources.map((source) => (
                <FolderLink
                  key={source.key}
                  to={`/favorites/network/${source.key}`}
                  label={source.name}
                  active={networkSource === source.key}
                />
              ))}
              {networkSources.length === 0 ? (
                <p className="px-2 py-1 text-[11px] text-muted">
                  {t("No folders available")}
                </p>
              ) : (
                <button
                  onClick={() => navigate("/settings/favorites-pages")}
                  className="mt-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[11px] text-muted hover:bg-surface2 hover:text-fg"
                >
                  <Settings2 className="h-3.5 w-3.5" />
                  {t("Network settings")}
                </button>
              )}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {view === "overview" ? (
              <Overview
                folders={folders.data?.items ?? []}
                onOpen={(folder) => navigate(`/favorites/local/${folder.id}`)}
                onNew={() => setNewFolderOpen(true)}
              />
            ) : view === "local" ? (
              <>
                {currentFolder?.sourceKey ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface2/60 p-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium">
                        {t("Linked network folder")}:{" "}
                        {(sources.data?.items ?? []).find(
                          (source) => source.key === currentFolder.sourceKey,
                        )?.name ?? currentFolder.sourceKey}
                        {currentFolder.sourceFolder
                          ? ` / ${currentFolder.sourceFolder}`
                          : ""}
                      </p>
                      <p className="text-[11px] text-muted">
                        {t("Update imports new comics from the linked folder")}
                      </p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={syncPages}
                      onChange={(event) =>
                        setSyncPages(
                          Math.max(1, Number(event.target.value) || 1),
                        )
                      }
                      className="w-[90px]"
                      aria-label={t("Pages to update")}
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={syncFolder.isPending}
                      onClick={() => syncFolder.mutate()}
                    >
                      {t("Update")}
                    </Button>
                  </div>
                ) : null}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[180px] flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <Input
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(1);
                      }}
                      placeholder={t("Search")}
                      className="pl-9"
                    />
                  </div>
                  <Select
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value);
                      setPage(1);
                    }}
                    className="w-[160px]"
                  >
                    <option value="">{t("All")}</option>
                    <option value="uncompleted">{t("UnCompleted")}</option>
                    <option value="completed">{t("Completed")}</option>
                  </Select>
                </div>

                {selectMode && selected.size > 0 ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-accent/30 bg-accent/5 p-2">
                    <span className="px-1 text-[12px] font-medium">
                      {t("@count selected", { count: selected.size })}
                    </span>
                    {localFolderId !== 0 ? (
                      <>
                        <Button size="sm" onClick={() => setMoveOpen("move")}>
                          {t("Move to folder")}
                        </Button>
                        <Button size="sm" onClick={() => setMoveOpen("copy")}>
                          {t("Copy to folder")}
                        </Button>
                      </>
                    ) : null}
                    <Button size="sm" onClick={downloadSelected}>
                      <Download className="h-3.5 w-3.5" /> {t("Download")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        setSelected(
                          new Set(
                            items.map((item) => `${item.id}:${item.comicType}`),
                          ),
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
                      onClick={() => batchDelete.mutate()}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> {t("Delete")}
                    </Button>
                  </div>
                ) : null}

                {localFavorites.isLoading ? (
                  <GridSkeleton />
                ) : items.length === 0 ? (
                  <EmptyState
                    title={t("No data")}
                    description={t("Add comics from a comic detail page.")}
                  />
                ) : (
                  <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
                    {items.map((item) => {
                      const comic = toComic(item);
                      const key = `${item.id}:${item.comicType}`;
                      return (
                        <div key={key} className="relative">
                          <ComicCard
                            comic={comic}
                            favorite
                            onClick={() =>
                              selectMode
                                ? toggleSelected(item)
                                : settings.onClickFavorite === "read"
                                  ? navigate(
                                      readerPath(item.sourceKey ?? "", item.id),
                                    )
                                  : navigate(
                                      comicPath(item.sourceKey ?? "", item.id),
                                    )
                            }
                            actions={
                              selectMode
                                ? undefined
                                : [
                                    {
                                      label: t("Details"),
                                      onSelect: () =>
                                        navigate(
                                          comicPath(item.sourceKey ?? "", item.id),
                                        ),
                                    },
                                    {
                                      label: t("Read"),
                                      onSelect: () =>
                                        navigate(
                                          readerPath(item.sourceKey ?? "", item.id),
                                        ),
                                    },
                                    {
                                      label: t("Copy Title"),
                                      onSelect: () =>
                                        copyText(item.title).then(() =>
                                          toast.success(t("Copied")),
                                        ),
                                    },
                                    {
                                      label: t("Remove"),
                                      danger: true,
                                      onSelect: () =>
                                        api
                                          .removeFavorite(
                                            item.folderId,
                                            item.comicType,
                                            item.id,
                                          )
                                          .then(invalidate)
                                          .catch((error) =>
                                            toast.error(error.message),
                                          ),
                                    },
                                  ]
                            }
                          />
                          {selectMode ? (
                            <button
                              onClick={() => toggleSelected(item)}
                              className={cn(
                                "absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border",
                                selected.has(key)
                                  ? "border-accent bg-accent text-white"
                                  : "border-white/70 bg-black/40",
                              )}
                              aria-label={t("Select")}
                            >
                              {selected.has(key) ? "✓" : ""}
                            </button>
                          ) : null}
                          {item.hasNewUpdate ? (
                            <span className="absolute right-1.5 top-1.5">
                              <Badge tone="accent">{t("New")}</Badge>
                            </span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="mt-8 flex items-center justify-center gap-3">
                  <Button
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((value) => value - 1)}
                  >
                    {t("Previous")}
                  </Button>
                  <span className="text-[13px] tabular text-muted">
                    {t("Page")} {page} /{" "}
                    {Math.max(
                      1,
                      Math.ceil((localFavorites.data?.total ?? 0) / 60),
                    )}
                  </span>
                  <Button
                    size="sm"
                    disabled={
                      page >= Math.ceil((localFavorites.data?.total ?? 0) / 60)
                    }
                    onClick={() => setPage((value) => value + 1)}
                  >
                    {t("Next")}
                  </Button>
                </div>
              </>
            ) : (
              <NetworkView
                source={networkSource}
                folder={networkFolder}
                folders={networkFolders.data?.folders ?? {}}
                comics={networkComics.data?.comics ?? []}
                loading={networkFolders.isLoading || networkComics.isLoading}
                page={page}
                maxPage={networkComics.data?.maxPage ?? 1}
                onPage={setPage}
                onOpenFolder={(id) =>
                  navigate(
                    `/favorites/network/${networkSource}/${encodeURIComponent(id)}`,
                  )
                }
                onRemove={(comic) => removeNetworkFavorite.mutate(comic)}
                onBack={() => navigate(`/favorites/network/${networkSource}`)}
              />
            )}
          </div>
        </div>
      </PageBody>

      <Modal
        open={networkImportOpen}
        onClose={() => setNetworkImportOpen(false)}
        title={t("Import network folder")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setNetworkImportOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              loading={importNetwork.isPending}
              onClick={() => importNetwork.mutate()}
            >
              {t("Import")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-[12px] text-muted">
            {networkFolder
              ? `${networkSource} / ${networkFolder}`
              : networkSource}
          </p>
          <Field label={t("Folder Name")}>
            <Input
              value={networkImportName}
              onChange={(event) => setNetworkImportName(event.target.value)}
              placeholder={t("Source name")}
            />
          </Field>
          <Field label={t("Pages to import")}>
            <Input
              type="number"
              min={1}
              max={10000}
              value={networkImportPages}
              onChange={(event) =>
                setNetworkImportPages(
                  Math.max(1, Number(event.target.value) || 1),
                )
              }
            />
          </Field>
        </div>
      </Modal>

      <PromptDialog
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title={t("New Folder")}
        label={t("Folder Name")}
        onConfirm={(value) => createFolder.mutate(value)}
      />
      <PromptDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title={t("Rename")}
        label={t("Folder Name")}
        initialValue={currentFolder?.name ?? ""}
        onConfirm={(value) => renameFolder.mutate(value)}
      />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t("Delete folder?")}
        message={`${currentFolder?.name ?? ""} (${currentFolder?.count ?? 0})`}
        confirmLabel={t("Delete")}
        danger
        onConfirm={() => deleteFolder.mutate()}
      />
      <Modal
        open={moveOpen !== null}
        onClose={() => setMoveOpen(null)}
        title={moveOpen === "copy" ? t("Copy to folder") : t("Move to folder")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(null)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={targetFolder === null}
              onClick={() =>
                moveOrCopy.mutate({
                  mode: moveOpen ?? "move",
                  target: targetFolder!,
                })
              }
            >
              {t("Confirm")}
            </Button>
          </>
        }
      >
        <Field label={t("Folder")}>
          <Select
            value={targetFolder ?? ""}
            onChange={(event) => setTargetFolder(Number(event.target.value))}
          >
            <option value="">{t("Select a folder")}</option>
            {(folders.data?.items ?? [])
              .filter((folder) => folder.id !== localFolderId)
              .map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.name}
                </option>
              ))}
          </Select>
        </Field>
      </Modal>
      <Modal
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        title={t("Sort")}
      >
        <SortFolderList
          folders={folders.data?.items ?? []}
          onSave={(ids) => sortFolders.mutate(ids)}
        />
      </Modal>
      {importing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="rounded-card bg-surface px-6 py-4 text-sm">
            Importing…
          </div>
        </div>
      ) : null}
    </>
  );
}

function FolderLink({
  to,
  label,
  active,
  onClick,
}: {
  to: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => (onClick ? onClick() : navigate(to))}
      className={cn(
        "block w-full truncate rounded px-2 py-1.5 text-left text-[13px] transition-colors duration-100",
        active ? "bg-accent/10 text-accent" : "text-fg hover:bg-surface2",
      )}
    >
      {label}
    </button>
  );
}

function Overview({
  folders,
  onOpen,
  onNew,
}: {
  folders: FavoriteFolder[];
  onOpen: (folder: FavoriteFolder) => void;
  onNew: () => void;
}) {
  const t = useT();
  if (folders.length === 0) {
    return (
      <EmptyState
        title={t("No folders available")}
        action={
          <Button variant="primary" onClick={onNew}>
            {t("Create Folder")}
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {folders.map((folder) => (
        <button
          key={folder.id}
          onClick={() => onOpen(folder)}
          className="rounded-card border border-border bg-surface p-4 text-left transition-colors duration-100 hover:border-accent/40 hover:bg-accent/5"
        >
          <p className="truncate text-[14px] font-medium">{folder.name}</p>
          <p className="mt-1 text-[12px] text-muted">{folder.count} comics</p>
        </button>
      ))}
    </div>
  );
}

function NetworkView({
  source,
  folder,
  folders,
  comics,
  loading,
  page,
  maxPage,
  onPage,
  onOpenFolder,
  onRemove,
  onBack,
}: {
  source: string;
  folder?: string;
  folders: Record<string, string>;
  comics: Comic[];
  loading: boolean;
  page: number;
  maxPage: number;
  onPage: (page: number) => void;
  onOpenFolder: (id: string) => void;
  onRemove: (comic: Comic) => void;
  onBack: () => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  if (loading) return <GridSkeleton />;
  if (!folder) {
    const entries = Object.entries(folders);
    return entries.length === 0 ? (
      <EmptyState title={t("No folders available")} />
    ) : (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map(([id, name]) => (
          <button
            key={id}
            onClick={() => onOpenFolder(id)}
            className="rounded-card border border-border bg-surface p-4 text-left hover:border-accent/40"
          >
            <p className="truncate text-[14px] font-medium">{name}</p>
          </button>
        ))}
      </div>
    );
  }
  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <X className="h-3.5 w-3.5" /> {t("Back")}
        </Button>
        <span className="text-[12px] text-muted">{folder}</span>
      </div>
      {comics.length === 0 ? (
        <EmptyState title={t("No data")} />
      ) : (
        <ComicGrid
          comics={comics}
          onOpen={(comic) => navigate(comicPath(source, comic.id))}
          renderAction={(comic) => [
            {
              label: t("Details"),
              onSelect: () => navigate(comicPath(source, comic.id)),
            },
            {
              label: t("Remove"),
              danger: true,
              onSelect: () => onRemove(comic),
            },
          ]}
        />
      )}
      <div className="mt-8 flex items-center justify-center gap-3">
        <Button size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          {t("Previous")}
        </Button>
        <span className="text-[13px] tabular text-muted">
          {t("Page")} {page} / {maxPage}
        </span>
        <Button
          size="sm"
          disabled={page >= maxPage}
          onClick={() => onPage(page + 1)}
        >
          {t("Next")}
        </Button>
      </div>
    </>
  );
}

function SortFolderList({
  folders,
  onSave,
}: {
  folders: FavoriteFolder[];
  onSave: (ids: number[]) => void;
}) {
  const t = useT();
  const [order, setOrder] = useState(folders.map((folder) => folder.id));
  const [dragging, setDragging] = useState<number | null>(null);
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        {order.map((id) => {
          const folder = byId.get(id);
          if (!folder) return null;
          return (
            <div
              key={id}
              draggable
              onDragStart={() => setDragging(id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragging === null || dragging === id) return;
                const next = order.filter((value) => value !== dragging);
                next.splice(next.indexOf(id), 0, dragging);
                setOrder(next);
                setDragging(null);
              }}
              className="flex cursor-grab items-center gap-2 rounded border border-border bg-surface px-3 py-2 text-[13px]"
            >
              <ArrowDownUp className="h-3.5 w-3.5 text-muted" />
              {folder.name}
            </div>
          );
        })}
      </div>
      <Button variant="primary" onClick={() => onSave(order)}>
        {t("Confirm")}
      </Button>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index}>
          <Skeleton className="aspect-[2/3] w-full" />
          <Skeleton className="mt-2 h-3 w-3/4" />
        </div>
      ))}
    </div>
  );
}
