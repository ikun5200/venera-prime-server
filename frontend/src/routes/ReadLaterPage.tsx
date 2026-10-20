import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, CheckSquare, Search, Trash2 } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { Comic, ReadLaterItem } from "../lib/types";
import { cn } from "../lib/utils";
import { ComicCard } from "../components/ComicCard";
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

export default function ReadLaterPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const query = useQuery({
    queryKey: ["read-later", search],
    queryFn: () => api.readLater(search || undefined),
  });
  const folders = useQuery({
    queryKey: ["favorite-folders"],
    queryFn: api.favoriteFolders,
  });

  const items = query.data?.items ?? [];
  const selectedItems = items.filter((item) =>
    selected.has(`${item.id}:${item.comicType}`),
  );

  const remove = useMutation({
    mutationFn: (itemsToRemove: ReadLaterItem[]) =>
      api.batchDeleteReadLater(
        itemsToRemove.map((item) => ({
          comicId: item.id,
          comicType: item.comicType,
        })),
      ),
    onSuccess: (_, removed) => {
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["read-later"] });
      toast.success(t("Removed @count items", { count: removed.length }), {
        label: t("Undo"),
        onClick: () => {
          api.restoreReadLater(removed).then(() => {
            queryClient.invalidateQueries({ queryKey: ["read-later"] });
          });
        },
      });
    },
    onError: (error) => toast.error(error.message),
  });

  const addToFavorites = useMutation({
    mutationFn: async () => {
      if (folderId === null) return;
      for (const item of selectedItems) {
        await api.addFavorite(
          folderId,
          {
            id: item.id,
            title: item.title,
            subtitle: item.subtitle,
            cover: item.cover,
            tags: item.tags,
            sourceKey: item.sourceKey,
            comicType: item.comicType,
          },
          useAppStore.getState().settings.newFavoriteAddTo === "start",
        );
      }
    },
    onSuccess: () => {
      toast.success(t("Added"));
      setSelected(new Set());
      setFavoriteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const clear = useMutation({
    mutationFn: api.clearReadLater,
    onSuccess: () => {
      toast.success(t("Cleared"));
      queryClient.invalidateQueries({ queryKey: ["read-later"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const toggle = (item: ReadLaterItem) => {
    const key = `${item.id}:${item.comicType}`;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  return (
    <>
      <PageHeader
        title={t("Read later")}
        subtitle={`${query.data?.count ?? 0} comics`}
        actions={
          <>
            <IconButton
              label={selectMode ? "Exit Multi-Select" : "Multi-Select"}
              onClick={() => {
                setSelectMode((value) => !value);
                setSelected(new Set());
              }}
              className={selectMode ? "text-accent" : undefined}
            >
              <CheckSquare className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={t("Clear")}
              onClick={() => setClearOpen(true)}
              disabled={(query.data?.count ?? 0) === 0}
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </>
        }
      />
      <PageBody>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("Search")}
            className="pl-9"
          />
        </div>

        {selectMode && selected.size > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-accent/30 bg-accent/5 p-2">
            <span className="px-1 text-[12px] font-medium">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              onClick={() =>
                setSelected(
                  new Set(items.map((item) => `${item.id}:${item.comicType}`)),
                )
              }
            >
              {t("Select All")}
            </Button>
            <Button size="sm" onClick={() => setSelected(new Set())}>
              {t("Deselect")}
            </Button>
            <Button size="sm" onClick={() => setFavoriteOpen(true)}>
              <Bookmark className="h-3.5 w-3.5" /> {t("Add to favorites")}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => remove.mutate(selectedItems)}
            >
              <Trash2 className="h-3.5 w-3.5" /> {t("Delete")}
            </Button>
          </div>
        ) : null}

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
          <EmptyState title={t("No data")} />
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => {
              const comic: Comic = {
                id: item.id,
                title: item.title,
                subtitle: item.subtitle,
                cover: item.cover,
                tags: item.tags ?? [],
                description: item.description,
                sourceKey: item.sourceKey,
                comicType: item.comicType,
              };
              const key = `${item.id}:${item.comicType}`;
              return (
                <div key={key} className="relative">
                  <ComicCard
                    comic={comic}
                    onClick={() =>
                      selectMode
                        ? toggle(item)
                        : navigate(`/comic/${item.sourceKey}/${item.id}`)
                    }
                    actions={
                      selectMode
                        ? undefined
                        : [
                            {
                              label: t("Details"),
                              onSelect: () =>
                                navigate(`/comic/${item.sourceKey}/${item.id}`),
                            },
                            {
                              label: t("Remove"),
                              danger: true,
                              onSelect: () => remove.mutate([item]),
                            },
                          ]
                    }
                  />
                  {selectMode ? (
                    <button
                      onClick={() => toggle(item)}
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
                </div>
              );
            })}
          </div>
        )}
      </PageBody>

      <Modal
        open={favoriteOpen}
        onClose={() => setFavoriteOpen(false)}
        title={t("Add to favorites")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setFavoriteOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={folderId === null}
              loading={addToFavorites.isPending}
              onClick={() => addToFavorites.mutate()}
            >
              {t("Confirm")}
            </Button>
          </>
        }
      >
        <Field label={t("Folder")}>
          <Select
            value={folderId ?? ""}
            onChange={(event) => setFolderId(Number(event.target.value))}
          >
            <option value="">{t("Select a folder")}</option>
            {(folders.data?.items ?? []).map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title={t("Clear")}
        message="Remove all comics from Read later?"
        confirmLabel={t("Clear")}
        danger
        onConfirm={() => clear.mutate()}
      />
    </>
  );
}
