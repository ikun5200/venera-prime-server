import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import type { Comic } from "../lib/types";
import { cn } from "../lib/utils";
import { ComicGrid } from "../components/ComicCard";
import { PageBody } from "../components/PageHeader";
import {
  Button,
  EmptyState,
  IconButton,
  Skeleton,
  Tabs,
} from "../components/ui";
import { comicPath } from "../lib/links";

interface Section {
  title?: string;
  comics: Comic[];
  viewMore?: unknown;
}

function isComic(value: unknown): value is Comic {
  return Boolean(
    value && typeof value === "object" && "id" in value && "title" in value,
  );
}

function parseJump(
  value: unknown,
): { page: string; attributes: Record<string, unknown> } | null {
  if (!value) return null;
  if (typeof value === "string") {
    const [page, rest] = value.split(":");
    if (!page) return null;
    if (page === "search") return { page, attributes: { keyword: rest ?? "" } };
    if (page === "category") {
      const [category, param] = (rest ?? "").split("@");
      return { page, attributes: { category, param } };
    }
    return { page, attributes: {} };
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.page === "string") {
      return {
        page: record.page,
        attributes:
          record.attributes && typeof record.attributes === "object"
            ? (record.attributes as Record<string, unknown>)
            : {},
      };
    }
    if (typeof record.action === "string") {
      return {
        page: record.action,
        attributes: {
          keyword: record.keyword,
          category: record.keyword,
          param: record.param,
        },
      };
    }
  }
  return null;
}

function extractSections(data: unknown): Section[] {
  if (Array.isArray(data)) {
    if (
      data.length > 0 &&
      data.every((item) => item && typeof item === "object" && "comics" in item)
    ) {
      return data.map((item) => {
        const section = item as {
          title?: string;
          comics?: Comic[];
          viewMore?: unknown;
        };
        return {
          title: section.title,
          comics: section.comics ?? [],
          viewMore: section.viewMore,
        };
      });
    }
    return [{ comics: data.filter(isComic) }];
  }
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    if ("items" in record && Array.isArray(record.items)) {
      const sections: Section[] = [];
      for (const item of record.items) {
        if (!item || typeof item !== "object") continue;
        const part = item as Record<string, unknown>;
        if (part.type === "comics" && Array.isArray(part.comics)) {
          sections.push({ comics: part.comics.filter(isComic) });
        } else if (part.type === "part") {
          sections.push({
            title: typeof part.title === "string" ? part.title : undefined,
            comics: Array.isArray(part.comics)
              ? part.comics.filter(isComic)
              : [],
            viewMore: part.viewMore,
          });
        }
      }
      return sections;
    }
    if ("data" in record) return extractSections(record.data);
    if ("comics" in record) {
      return [
        {
          comics: Array.isArray(record.comics)
            ? record.comics.filter(isComic)
            : [],
        },
      ];
    }
    const sections: Section[] = [];
    for (const [title, value] of Object.entries(record)) {
      if (Array.isArray(value) && value.some(isComic)) {
        sections.push({ title, comics: value.filter(isComic) });
      }
    }
    return sections;
  }
  return [];
}

export default function ExplorePage() {
  const t = useT();
  const navigate = useNavigate();
  const settings = useAppStore((state) => state.settings);
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const available = useMemo(
    () =>
      (sources.data?.items ?? []).filter(
        (source) => source.enabled && source.capabilities.explore === true,
      ),
    [sources.data],
  );
  const configured = (settings.explore_pages as string[]) ?? [];
  const ordered = useMemo(() => {
    if (configured.length === 0) return available;
    const map = new Map(available.map((source) => [source.key, source]));
    return configured
      .map((key) => map.get(key))
      .filter(Boolean) as typeof available;
  }, [available, configured]);

  const [sourceKey, setSourceKey] = useState("");
  const [page, setPage] = useState(1);
  const refreshRequested = useRef(false);

  useEffect(() => {
    if (!sourceKey && ordered.length > 0) setSourceKey(ordered[0].key);
  }, [ordered, sourceKey]);

  const query = useQuery({
    queryKey: ["explore", sourceKey, page],
    queryFn: () => {
      const refresh = refreshRequested.current;
      refreshRequested.current = false;
      return api.explore(sourceKey, page, refresh);
    },
    enabled: Boolean(sourceKey),
  });

  const pages = query.data?.pages ?? [];
  const maxPage = Math.max(
    1,
    ...pages.map((entry) => {
      const data = entry.data as Record<string, unknown> | null;
      const value = data && typeof data === "object" ? data.maxPage : undefined;
      return typeof value === "number" ? value : 1;
    }),
  );

  if (sources.isLoading) {
    return (
      <PageBody>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="aspect-[2/3] w-full" />
          ))}
        </div>
      </PageBody>
    );
  }

  if (ordered.length === 0) {
    return (
      <PageBody>
        <EmptyState
          title={t("No Explore Pages")}
          description={t("Please add some sources")}
          action={
            <Button variant="primary" onClick={() => navigate("/sources")}>
              {t("Manage")}
            </Button>
          }
        />
      </PageBody>
    );
  }

  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-border bg-bg/85 px-4 pt-4 backdrop-blur-md md:px-6">
        <div className="mx-auto flex max-w-[1200px] items-center gap-2">
          <Tabs
            items={ordered.map((source) => ({
              value: source.key,
              label: source.name,
            }))}
            value={sourceKey}
            onChange={(value) => {
              setSourceKey(value);
              setPage(1);
            }}
            className="flex-1"
          />
          <IconButton
            label={t("Refresh")}
            onClick={() => {
              refreshRequested.current = true;
              void query.refetch();
            }}
          >
            <RefreshCw
              className={cn("h-4 w-4", query.isFetching && "animate-spin")}
            />
          </IconButton>
          <IconButton
            label={t("Add")}
            onClick={() => navigate("/settings/explore-pages")}
          >
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <PageBody>
        {query.isLoading ? (
          <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <Skeleton key={index} className="aspect-[2/3] w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            title={t("Error")}
            description={
              query.error instanceof Error
                ? query.error.message
                : String(query.error)
            }
            action={
              <Button onClick={() => query.refetch()}>{t("Retry")}</Button>
            }
          />
        ) : pages.length === 0 ? (
          <EmptyState title={t("Empty Page")} />
        ) : (
          <div className="flex flex-col gap-8">
            {pages.map((entry) => {
              const sections = extractSections(entry.data);
              return (
                <section key={entry.index}>
                  <h2 className="mb-3 text-[15px] font-semibold">
                    {entry.title}
                  </h2>
                  {entry.error ? (
                    <p className="rounded border border-danger/20 bg-danger/5 px-3 py-2 text-[12px] text-danger">
                      {entry.error}
                    </p>
                  ) : sections.length === 0 ? (
                    <p className="text-[13px] text-muted">{t("No data")}</p>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {sections.map((section, index) => (
                        <div key={`${entry.index}-${index}`}>
                          {section.title ? (
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <h3 className="text-[13px] font-semibold text-muted">
                                {section.title}
                              </h3>
                              {section.viewMore ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const jump = parseJump(section.viewMore);
                                    if (!jump) return;
                                    const attributes = jump.attributes;
                                    if (jump.page === "search") {
                                      navigate(
                                        `/search/result?source=${encodeURIComponent(sourceKey)}&q=${encodeURIComponent(String(attributes.keyword ?? attributes.text ?? ""))}`,
                                      );
                                    } else if (jump.page === "category") {
                                      const param = attributes.param
                                        ? `?param=${encodeURIComponent(JSON.stringify(attributes.param))}`
                                        : "";
                                      navigate(
                                        `/categories/${encodeURIComponent(sourceKey)}/${encodeURIComponent(String(attributes.category ?? ""))}${param}`,
                                      );
                                    }
                                  }}
                                >
                                  {t("View more")}
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                              ) : null}
                            </div>
                          ) : null}
                          <ComicGrid
                            comics={section.comics}
                            scale={Number(settings.comicTileScale ?? 1)}
                            fallbackSourceKey={sourceKey}
                            onOpen={(comic) =>
                              navigate(
                                comicPath(comic.sourceKey || sourceKey, comic.id),
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {maxPage > 1 ? (
          <div className="mt-8 flex items-center justify-center gap-3">
            <Button
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {t("Previous")}
            </Button>
            <span className="text-[13px] tabular text-muted">
              {t("Page")} {page} / {maxPage}
            </span>
            <Button
              size="sm"
              disabled={page >= maxPage}
              onClick={() => setPage((value) => value + 1)}
            >
              {t("Next")}
            </Button>
          </div>
        ) : null}
      </PageBody>
    </div>
  );
}
