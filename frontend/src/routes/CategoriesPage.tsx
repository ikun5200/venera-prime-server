import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trophy } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { cn } from "../lib/utils";
import { PageBody } from "../components/PageHeader";
import {
  Button,
  EmptyState,
  IconButton,
  Skeleton,
  Tabs,
} from "../components/ui";

export default function CategoriesPage() {
  const t = useT();
  const navigate = useNavigate();
  const settings = useAppStore((state) => state.settings);
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const available = useMemo(
    () =>
      (sources.data?.items ?? []).filter(
        (source) => source.enabled && source.capabilities.category === true,
      ),
    [sources.data],
  );
  const configured = (settings.categories as string[]) ?? [];
  const ordered = useMemo(() => {
    if (configured.length === 0) return available;
    const map = new Map(available.map((source) => [source.key, source]));
    return configured
      .map((key) => map.get(key))
      .filter(Boolean) as typeof available;
  }, [available, configured]);

  const [sourceKey, setSourceKey] = useState("");
  useEffect(() => {
    if (!sourceKey && ordered.length > 0) setSourceKey(ordered[0].key);
  }, [ordered, sourceKey]);

  const query = useQuery({
    queryKey: ["categories", sourceKey],
    queryFn: () => api.categories(sourceKey),
    enabled: Boolean(sourceKey),
  });

  if (sources.isLoading) {
    return (
      <PageBody>
        <Skeleton className="mb-6 h-8 w-48" />
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      </PageBody>
    );
  }

  if (ordered.length === 0) {
    return (
      <PageBody>
        <EmptyState
          title={t("No Category Pages")}
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

  const openCategory = (label: string, target: unknown) => {
    navigate(
      `/categories/${encodeURIComponent(sourceKey)}/${encodeURIComponent(label)}` +
        `?param=${encodeURIComponent(JSON.stringify(target))}`,
    );
  };

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
            onChange={setSourceKey}
            className="flex-1"
          />
          <IconButton
            label={t("Add")}
            onClick={() => navigate("/settings/category-pages")}
          >
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <PageBody>
        {query.isLoading ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
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
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-[20px] font-semibold">{query.data?.title}</h1>
              {query.data?.enableRankingPage ? (
                <Button
                  size="sm"
                  onClick={() => navigate(`/categories/${sourceKey}/ranking`)}
                >
                  <Trophy className="h-4 w-4" />
                  {t("Ranking")}
                </Button>
              ) : null}
            </div>
            {(query.data?.parts ?? []).map((part, index) => (
              <section key={`${part.name}-${index}`}>
                <h2 className="mb-2 text-[14px] font-semibold">{part.name}</h2>
                <div className="flex flex-wrap gap-1.5">
                  {part.categories.map((category, categoryIndex) => (
                    <button
                      key={`${category.label}-${categoryIndex}`}
                      onClick={() =>
                        openCategory(category.label, category.target)
                      }
                      className={cn(
                        "rounded-full border border-border bg-surface px-3 py-1.5 text-[12px] text-fg transition-colors duration-100",
                        "hover:border-accent/40 hover:bg-accent/5",
                      )}
                    >
                      {category.label}
                    </button>
                  ))}
                  {part.categories.length === 0 ? (
                    <p className="text-[12px] text-muted">{t("No data")}</p>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageBody>
    </div>
  );
}
