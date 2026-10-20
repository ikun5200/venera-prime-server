import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { parseOption } from "../lib/utils";
import { ComicGrid } from "../components/ComicCard";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button, EmptyState, Skeleton } from "../components/ui";
import { comicPath } from "../lib/links";

export default function RankingPage() {
  const t = useT();
  const navigate = useNavigate();
  const settings = useAppStore((state) => state.settings);
  const { key = "" } = useParams();
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const source = sources.data?.items.find((item) => item.key === key);

  const options = useMemo(() => {
    const raw = source?.capabilities.categoryComicsData;
    if (!raw || typeof raw !== "object") return [];
    const ranking = (raw as { rankingOptions?: unknown }).rankingOptions;
    return Array.isArray(ranking) ? (ranking as string[]) : [];
  }, [source]);

  const [option, setOption] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (!option && options.length > 0) setOption(parseOption(options[0]).value);
  }, [option, options]);

  const query = useQuery({
    queryKey: ["ranking", key, option, page],
    queryFn: () => api.ranking(key, option, page),
    enabled: Boolean(key && option),
  });

  return (
    <>
      <PageHeader title={t("Ranking")} subtitle={source?.name} />
      <PageBody>
        <div className="mb-5 flex flex-wrap gap-1.5">
          {options.map((raw) => {
            const parsed = parseOption(raw);
            return (
              <button
                key={parsed.value}
                onClick={() => {
                  setOption(parsed.value);
                  setPage(1);
                }}
                className={
                  option === parsed.value
                    ? "rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-[12px] text-accent"
                    : "rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-muted"
                }
              >
                {parsed.text}
              </button>
            );
          })}
        </div>

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
        ) : (
          <ComicGrid
            comics={query.data?.comics ?? []}
            scale={Number(settings.comicTileScale ?? 1)}
            onOpen={(comic) =>
              navigate(comicPath(comic.sourceKey, comic.id))
            }
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
            {t("Page")} {page} / {query.data?.maxPage ?? 1}
          </span>
          <Button
            size="sm"
            disabled={page >= (query.data?.maxPage ?? 1)}
            onClick={() => setPage((value) => value + 1)}
          >
            {t("Next")}
          </Button>
        </div>
      </PageBody>
    </>
  );
}
