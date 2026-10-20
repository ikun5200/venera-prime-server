import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Settings2 } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { Comic } from "../lib/types";
import { copyText, parseOption } from "../lib/utils";
import { ComicGrid } from "../components/ComicCard";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Button,
  EmptyState,
  Field,
  Modal,
  Select,
  Skeleton,
} from "../components/ui";
import { comicPath } from "../lib/links";

export default function SearchResultPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);

  const initialSource = params.get("source") ?? "";
  const initialKeyword = params.get("q") ?? "";
  const initialOptions = params.get("options") ?? "";

  const [sourceKey, setSourceKey] = useState(initialSource);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [options, setOptions] = useState(initialOptions);
  const [page, setPage] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftSource, setDraftSource] = useState(initialSource);
  const [draftOptions, setDraftOptions] = useState<string[]>(
    initialOptions ? initialOptions.split(",") : [],
  );

  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const folders = useQuery({
    queryKey: ["favorite-folders"],
    queryFn: api.favoriteFolders,
  });
  const searchable = (sources.data?.items ?? []).filter(
    (source) => source.enabled && source.capabilities.search === true,
  );
  const source = sources.data?.items.find((item) => item.key === sourceKey);
  const optionDefs = useMemo(() => {
    const raw = source?.capabilities.searchOptions;
    return Array.isArray(raw)
      ? (raw as { label?: string; type?: string; options?: string[] }[])
      : [];
  }, [source]);

  const result = useQuery({
    queryKey: ["search", sourceKey, keyword, options, page],
    queryFn: () =>
      api.search(sourceKey, keyword, options ? options.split(",") : [], page),
    enabled: Boolean(sourceKey && keyword),
  });

  useEffect(() => {
    if (!sources.data || sourceKey) return;
    const fallback = searchable[0];
    if (fallback) setSourceKey(fallback.key);
  }, [searchable, sourceKey, sources.data]);

  const addFavorite = useMutation({
    mutationFn: async (comic: Comic) => {
      let list = folders.data?.items ?? [];
      if (list.length === 0) {
        await api.createFavoriteFolder("Default");
        list = (await api.favoriteFolders()).items;
      }
      const quick = String(settings.quickFavorite ?? "");
      const folder = list.find((item) => item.name === quick) ?? list[0];
      await api.addFavorite(folder.id, comic);
      return folder.name;
    },
    onSuccess: (name) => {
      toast.success(t("Added to @name", { name: name }));
      queryClient.invalidateQueries({ queryKey: ["favorite-folders"] });
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const addReadLater = useMutation({
    mutationFn: (comic: Comic) => api.addReadLater(comic),
    onSuccess: () => {
      toast.success(t("Added to Read later"));
      queryClient.invalidateQueries({ queryKey: ["read-later"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const block = async (comic: Comic) => {
    const words = new Set<string>(
      [
        ...((settings.blockedWords as string[]) ?? []),
        comic.title,
        comic.subtitle,
        ...(comic.tags ?? []),
      ].filter(Boolean),
    );
    try {
      const updated = await api.updateSettings({ blockedWords: [...words] });
      setSettings(updated);
      toast.success(t("Blocked"));
      queryClient.invalidateQueries({ queryKey: ["search"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const applySettings = () => {
    setSourceKey(draftSource);
    setOptions(draftOptions.join(","));
    setPage(1);
    setSettingsOpen(false);
  };

  const suggestions = useQuery({
    queryKey: ["search-suggestions-result", sourceKey, keyword],
    queryFn: () => api.searchSuggestions(keyword, sourceKey),
    enabled:
      keyword.trim().length > 0 &&
      source?.capabilities.tagsSuggestions === true,
    staleTime: 15000,
  });

  const insertSuggestion = async (value: string, namespace?: string | null) => {
    let insert: string;
    try {
      insert = await api
        .selectSuggestion(sourceKey, namespace ?? "", value)
        .then((result) => result.result);
    } catch {
      insert = namespace
        ? `${namespace}:${value.includes(" ") ? `'${value}'` : value}`
        : value;
    }
    setKeyword(insert);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title={keyword || t("Search")}
        subtitle={`${source?.name ?? sourceKey} · ${t("Page")} ${page}`}
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
            {t("Settings")}
          </Button>
        }
      />
      <PageBody>
        {suggestions.data?.items.length ? (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-card border border-border bg-surface p-2">
            {(suggestions.data?.items ?? []).slice(0, 12).map((item) => (
              <button
                key={`${item.namespace ?? ""}:${item.value}`}
                onClick={() =>
                  void insertSuggestion(item.value, item.namespace)
                }
                className="rounded-full border border-border bg-surface2 px-2.5 py-1 text-[11px] text-muted hover:border-accent/40 hover:text-fg"
              >
                {item.value}
              </button>
            ))}
          </div>
        ) : null}
        {result.isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="aspect-[2/3] w-full" />
                <Skeleton className="mt-2 h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : result.isError ? (
          <EmptyState
            title={t("Error")}
            description={
              result.error instanceof Error
                ? result.error.message
                : String(result.error)
            }
            action={
              <Button onClick={() => result.refetch()}>{t("Retry")}</Button>
            }
          />
        ) : (result.data?.comics.length ?? 0) === 0 ? (
          <EmptyState title={t("No search results found")} />
        ) : (
          <ComicGrid
            comics={result.data?.comics ?? []}
            scale={Number(settings.comicTileScale ?? 1)}
            onOpen={(comic) =>
              navigate(comicPath(comic.sourceKey, comic.id))
            }
            renderAction={(comic) => [
              {
                label: t("Details"),
                onSelect: () =>
                  navigate(comicPath(comic.sourceKey, comic.id)),
              },
              {
                label: t("Copy Title"),
                icon: <Copy className="h-3.5 w-3.5" />,
                onSelect: () =>
                  copyText(comic.title).then(() => toast.success(t("Copied"))),
              },
              {
                label: t("Add to favorites"),
                onSelect: () => addFavorite.mutate(comic),
              },
              {
                label: t("Read later"),
                onSelect: () => addReadLater.mutate(comic),
              },
              { label: t("Block"), danger: true, onSelect: () => block(comic) },
            ]}
          />
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
            {t("Page")} {page} / {result.data?.maxPage ?? 1}
          </span>
          <Button
            size="sm"
            disabled={page >= (result.data?.maxPage ?? 1)}
            onClick={() => setPage((value) => value + 1)}
          >
            {t("Next")}
          </Button>
        </div>
      </PageBody>

      <Modal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t("Settings")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSettingsOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button variant="primary" onClick={applySettings}>
              {t("Confirm")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t("Search in")}>
            <Select
              value={draftSource}
              onChange={(event) => setDraftSource(event.target.value)}
            >
              {searchable.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          {optionDefs.map((option) => {
            const label = option.label ?? t("Option");
            return (
              <Field key={label} label={label}>
                <div className="flex flex-wrap gap-1.5">
                  {(option.options ?? []).map((raw) => {
                    const parsed = parseOption(raw);
                    const selected = draftOptions.includes(parsed.value);
                    return (
                      <button
                        key={parsed.value}
                        onClick={() =>
                          setDraftOptions((values) =>
                            selected
                              ? values.filter((value) => value !== parsed.value)
                              : [...values, parsed.value],
                          )
                        }
                        className={
                          selected
                            ? "rounded-full border border-accent bg-accent/10 px-2.5 py-1 text-[11px] text-accent"
                            : "rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] text-muted"
                        }
                      >
                        {parsed.text}
                      </button>
                    );
                  })}
                </div>
              </Field>
            );
          })}
        </div>
      </Modal>
    </>
  );
}
