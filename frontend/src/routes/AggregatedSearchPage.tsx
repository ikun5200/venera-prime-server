import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "../lib/api";
import { useT } from "../lib/i18n";
import type { Comic } from "../lib/types";
import { ComicGrid } from "../components/ComicCard";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button, EmptyState, Input, Skeleton } from "../components/ui";

export default function AggregatedSearchPage() {
  const t = useT();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const keyword = params.get("q") ?? "";
  const [input, setInput] = useState(keyword);

  const query = useQuery({
    queryKey: ["aggregated-search", keyword],
    queryFn: () => api.aggregatedSearch(keyword),
    enabled: Boolean(keyword),
  });

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

        {query.isLoading ? (
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
        ) : (query.data?.sections.length ?? 0) === 0 ? (
          <EmptyState title={t("No search results found")} />
        ) : (
          <div className="flex flex-col gap-8">
            {query.data?.sections.map((section) => (
              <section key={section.source}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="text-[15px] font-semibold">{section.name}</h2>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      navigate(
                        `/search/result?source=${encodeURIComponent(section.source)}&q=${encodeURIComponent(keyword)}`,
                      )
                    }
                  >
                    View more
                  </Button>
                </div>
                {section.error ? (
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
                      navigate(`/comic/${comic.sourceKey}/${comic.id}`)
                    }
                  />
                )}
              </section>
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}
