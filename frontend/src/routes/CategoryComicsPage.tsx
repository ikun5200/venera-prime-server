import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { parseOption, friendlyError } from "../lib/utils";
import { ComicGrid } from "../components/ComicCard";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button, EmptyState, Field, Select, Skeleton } from "../components/ui";
import { comicPath } from "../lib/links";

interface OptionDef {
  label?: string;
  type?: string;
  options?: string[];
  default?: string;
  showWhen?: string[] | null;
  notShowWhen?: string[] | null;
}

export default function CategoryComicsPage() {
  const t = useT();
  const navigate = useNavigate();
  const settings = useAppStore((state) => state.settings);
  const { key = "", category = "" } = useParams();
  const [params] = useSearchParams();
  const param = (() => {
    const raw = params.get("param");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return raw;
    }
  })();

  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const source = sources.data?.items.find((item) => item.key === key);
  const optionDefs = useMemo<OptionDef[]>(() => {
    const raw = source?.capabilities.categoryComicsData;
    if (!raw || typeof raw !== "object") return [];
    const list = (raw as { optionList?: unknown }).optionList;
    return Array.isArray(list) ? (list as OptionDef[]) : [];
  }, [source]);

  const categoryLabel = decodeURIComponent(category);
  const visibleOptionDefs = useMemo(
    () =>
      optionDefs.filter((option) => {
        if (
          option.showWhen &&
          option.showWhen.length > 0 &&
          !option.showWhen.includes(categoryLabel)
        ) {
          return false;
        }
        if (
          option.notShowWhen &&
          option.notShowWhen.length > 0 &&
          option.notShowWhen.includes(categoryLabel)
        ) {
          return false;
        }
        return true;
      }),
    [categoryLabel, optionDefs],
  );

  const [optionValues, setOptionValues] = useState<Record<string, string[]>>(
    {},
  );
  const [page, setPage] = useState(1);

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const option of visibleOptionDefs) {
      const label = option.label ?? "";
      if (option.type === "multi-select") {
        next[label] = option.default ? option.default.split("|") : [];
      } else if (option.default !== undefined) {
        next[label] = [String(option.default)];
      } else if (option.options && option.options.length > 0) {
        next[label] = [parseOption(option.options[0]).value];
      } else {
        next[label] = [];
      }
    }
    setOptionValues(next);
  }, [visibleOptionDefs]);

  const options = visibleOptionDefs
    .map((option) => (optionValues[option.label ?? ""] ?? []).join("|"))
    .filter(Boolean);

  const query = useQuery({
    queryKey: [
      "category-comics",
      key,
      category,
      JSON.stringify(param),
      options.join(","),
      page,
    ],
    queryFn: () => api.categoryComics(key, category, param, options, page),
    enabled: Boolean(key && category),
  });
  const lastMaxPage = useRef(1);
  useEffect(() => {
    if (query.data?.maxPage) lastMaxPage.current = query.data.maxPage;
  }, [query.data?.maxPage]);

  return (
    <>
      <PageHeader
        title={decodeURIComponent(category)}
        subtitle={source?.name}
      />
      <PageBody>
        {visibleOptionDefs.length > 0 ? (
          <div className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-border bg-surface p-4">
            {visibleOptionDefs.map((option) => {
              const label = option.label ?? t("Option");
              const values = optionValues[label] ?? [];
              if (
                option.type === "dropdown" ||
                (option.options?.length ?? 0) > 8
              ) {
                return (
                  <div key={label} className="min-w-[160px] flex-1">
                    <Field label={label}>
                      <Select
                        value={values[0] ?? ""}
                        onChange={(event) =>
                          setOptionValues({
                            ...optionValues,
                            [label]: [event.target.value],
                          })
                        }
                      >
                        <option value="">{t("Any")}</option>
                        {(option.options ?? []).map((raw) => {
                          const parsed = parseOption(raw);
                          return (
                            <option key={parsed.value} value={parsed.value}>
                              {parsed.text}
                            </option>
                          );
                        })}
                      </Select>
                    </Field>
                  </div>
                );
              }
              return (
                <div
                  key={label}
                  className="flex min-w-[200px] flex-1 flex-col gap-1.5"
                >
                  <span className="text-[12px] font-medium text-muted">
                    {label}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(option.options ?? []).map((raw) => {
                      const parsed = parseOption(raw);
                      const selected = values.includes(parsed.value);
                      return (
                        <button
                          key={parsed.value}
                          onClick={() => {
                            if (option.type === "multi-select") {
                              setOptionValues({
                                ...optionValues,
                                [label]: selected
                                  ? values.filter(
                                      (value) => value !== parsed.value,
                                    )
                                  : [...values, parsed.value],
                              });
                            } else {
                              setOptionValues({
                                ...optionValues,
                                [label]: [parsed.value],
                              });
                            }
                            setPage(1);
                          }}
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
                </div>
              );
            })}
          </div>
        ) : null}

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
              query.error ? friendlyError(query.error) : t("Unknown error")
            }
            action={
              <Button onClick={() => query.refetch()}>{t("Retry")}</Button>
            }
          />
        ) : (query.data?.comics.length ?? 0) === 0 ? (
          <EmptyState title={t("No data")} />
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
            {t("Page")} {page} / {query.data?.maxPage ?? lastMaxPage.current}
          </span>
          <Button
            size="sm"
            disabled={page >= (query.data?.maxPage ?? lastMaxPage.current)}
            onClick={() => setPage((value) => value + 1)}
          >
            {t("Next")}
          </Button>
        </div>
      </PageBody>
    </>
  );
}
