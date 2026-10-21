import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "../lib/api";
import { useT } from "../lib/i18n";
import type { Comic } from "../lib/types";
import { friendlyError } from "../lib/utils";
import { ComicGrid } from "../components/ComicCard";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button, EmptyState, Input, Skeleton } from "../components/ui";
import { comicPath } from "../lib/links";

interface SectionState {
  source: string;
  name: string;
  status: "loading" | "done" | "error";
  comics: Comic[];
  maxPage: number;
  error: string | null;
}

const SEARCH_TIMEOUT_MS = 15_000;

export default function AggregatedSearchPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const keyword = params.get("q") ?? "";
  const [input, setInput] = useState(keyword);
  const [sections, setSections] = useState<SectionState[]>([]);
  const [running, setRunning] = useState(false);

  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const searchSources = useMemo(
    () =>
      (sources.data?.items ?? []).filter(
        (source) => source.enabled && source.capabilities.search === true,
      ),
    [sources.data],
  );

  // Fan out one request per source so each section can render as soon as its
  // own source answers. The old aggregate endpoint waited for every source
  // (up to 40 s each) before rendering anything.
  useEffect(() => {
    if (!keyword || searchSources.length === 0) {
      setSections([]);
      setRunning(false);
      return;
    }
    let cancelled = false;
    const controllers: AbortController[] = [];
    setSections(
      searchSources.map((source) => ({
        source: source.key,
        name: source.name,
        status: "loading",
        comics: [],
        maxPage: 1,
        error: null,
      })),
    );
    setRunning(true);
    let remaining = searchSources.length;

    const update = (key: string, patch: Partial<SectionState>) => {
      if (cancelled) return;
      setSections((current) =>
        current.map((section) =>
          section.source === key ? { ...section, ...patch } : section,
        ),
      );
    };

    for (const source of searchSources) {
      const controller = new AbortController();
      controllers.push(controller);
      const timer = window.setTimeout(
        () => controller.abort(),
        SEARCH_TIMEOUT_MS,
      );
      api
        .search(source.key, keyword, [], 1, controller.signal)
        .then((result) => {
          update(source.key, {
            status: "done",
            comics: result.comics,
            maxPage: result.maxPage,
            error: null,
          });
        })
        .catch((error) => {
          update(source.key, {
            status: "error",
            error: friendlyError(error),
          });
        })
        .finally(() => {
          window.clearTimeout(timer);
          remaining -= 1;
          if (remaining === 0 && !cancelled) setRunning(false);
        });
    }

    return () => {
      cancelled = true;
      controllers.forEach((controller) => controller.abort());
    };
  }, [keyword, searchSources]);

  const submit = () => {
    if (!input.trim()) return;
    setParams({ q: input.trim() });
  };

  return (
    <>
      <PageHeader title={t("Aggregated Search")} subtitle={keyword} />
      <PageBody>
        <div className="mb-6 flex gap-2">
          <Input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            placeholder={t("Search comics")}
            className="h-11"
          />
          <Button variant="primary" className="h-11 shrink-0" onClick={submit}>
            <Search className="h-4 w-4" />
            {t("Search")}
          </Button>
        </div>

        {sources.isLoading ? (
          <div className="flex flex-col gap-8">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="mb-3 h-4 w-40" />
                <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                  {Array.from({ length: 6 }).map((__, item) => (
                    <Skeleton key={item} className="aspect-[2/3] w-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : sources.isError ? (
          <EmptyState
            title={t("Error")}
            description={friendlyError(sources.error)}
            action={
              <Button onClick={() => sources.refetch()}>{t("Retry")}</Button>
            }
          />
        ) : searchSources.length === 0 ? (
          <EmptyState title={t("No Search Sources")} />
        ) : !keyword ? (
          <EmptyState title={t("Search comics")} />
        ) : (
          <>
            {running ? (
              <p className="mb-4 text-[12px] text-muted">
                {t("Searching @count sources…", {
                  count: sections.filter((s) => s.status === "loading").length,
                })}
              </p>
            ) : null}
            <div className="flex flex-col gap-8">
              {sections.map((section) => (
                <section key={section.source}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h2 className="text-[15px] font-semibold">
                      {section.name}
                    </h2>
                    {section.status === "done" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          navigate(
                            `/search/result?source=${encodeURIComponent(section.source)}&q=${encodeURIComponent(keyword)}`,
                          )
                        }
                      >
                        {t("View more")}
                      </Button>
                    ) : section.status === "loading" ? (
                      <span className="text-[11px] text-muted">
                        {t("Loading")}
                      </span>
                    ) : null}
                  </div>
                  {section.status === "loading" ? (
                    <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                      {Array.from({ length: 6 }).map((_, index) => (
                        <Skeleton
                          key={index}
                          className="aspect-[2/3] w-full"
                        />
                      ))}
                    </div>
                  ) : section.status === "error" ? (
                    <p className="rounded border border-danger/20 bg-danger/5 px-3 py-2 text-[12px] text-danger">
                      {section.error}
                    </p>
                  ) : section.comics.length === 0 ? (
                    <p className="text-[13px] text-muted">
                      {t("No search results found")}
                    </p>
                  ) : (
                    <ComicGrid
                      comics={section.comics.slice(0, 12)}
                      onOpen={(comic: Comic) =>
                        navigate(comicPath(comic.sourceKey, comic.id))
                      }
                    />
                  )}
                </section>
              ))}
            </div>
          </>
        )}
      </PageBody>
    </>
  );
}
