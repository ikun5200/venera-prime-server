import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Search, Tag, Trash2, X } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import { cn, copyText, parseOption } from "../lib/utils";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
} from "../components/ui";
import { PageBody } from "../components/PageHeader";

interface SearchOption {
  label?: string;
  type?: "select" | "multi-select" | "dropdown";
  options?: string[];
  default?: string;
}

export default function SearchPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settings = useAppStore((state) => state.settings);
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const history = useQuery({
    queryKey: ["search-history"],
    queryFn: api.searchHistory,
  });

  const searchable = useMemo(() => {
    const available = (sources.data?.items ?? []).filter(
      (source) => source.enabled && source.capabilities.search === true,
    );
    const configured =
      (settings.searchSources as string[] | null | undefined) ?? [];
    if (configured.length === 0) return available;
    const map = new Map(available.map((source) => [source.key, source]));
    const ordered = configured
      .map((key) => map.get(key))
      .filter(Boolean) as typeof available;
    return ordered.length > 0 ? ordered : available;
  }, [settings.searchSources, sources.data]);

  const defaultTarget = String(settings.defaultSearchTarget ?? "");
  const [aggregated, setAggregated] = useState(
    defaultTarget === "_aggregated_",
  );
  const [sourceKey, setSourceKey] = useState("");
  const [keyword, setKeyword] = useState("");
  const [optionValues, setOptionValues] = useState<Record<string, string[]>>(
    {},
  );
  const [suggestOpen, setSuggestOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (sourceKey || searchable.length === 0) return;
    const preferred = searchable.find((source) => source.key === defaultTarget);
    setSourceKey((preferred ?? searchable[0]).key);
  }, [defaultTarget, searchable, sourceKey]);

  const source = searchable.find((item) => item.key === sourceKey);
  const optionDefs = useMemo<SearchOption[]>(() => {
    const raw = source?.capabilities.searchOptions;
    return Array.isArray(raw) ? (raw as SearchOption[]) : [];
  }, [source]);

  useEffect(() => {
    const next: Record<string, string[]> = {};
    for (const option of optionDefs) {
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
  }, [optionDefs]);

  const addHistory = useMutation({
    mutationFn: (value: string) => api.addSearchHistory(value),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["search-history"] }),
  });
  const clearHistory = useMutation({
    mutationFn: api.clearSearchHistory,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["search-history"] }),
  });
  const deleteHistory = useMutation({
    mutationFn: (value: string) => api.deleteSearchHistory(value),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["search-history"] }),
  });

  const suggestions = useQuery({
    queryKey: [
      "search-suggestions",
      keyword.split(" ").slice(-1)[0],
      aggregated ? "" : sourceKey,
    ],
    queryFn: () =>
      api.searchSuggestions(
        keyword.split(" ").slice(-1)[0] ?? "",
        aggregated ? undefined : sourceKey,
      ),
    enabled: suggestOpen && keyword.trim().length > 0 && !aggregated,
    staleTime: 15000,
  });

  const insertSuggestion = async (value: string, namespace?: string | null) => {
    const words = keyword.split(" ");
    words.pop();
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
    const prefix = words.filter(Boolean).join(" ");
    setKeyword(`${prefix ? `${prefix} ` : ""}${insert} `);
    setSuggestOpen(false);
    inputRef.current?.focus();
  };

  const openSuggestion = (value: string, namespace?: string | null) => {
    if (namespace === "__url__") {
      navigate(`/toolbox?url=${encodeURIComponent(value)}`);
      setSuggestOpen(false);
      return;
    }
    void insertSuggestion(value, namespace);
  };

  const submit = () => {
    const value = keyword.trim();
    if (!value) return;
    addHistory.mutate(value);
    if (aggregated) {
      navigate(`/search/aggregated?q=${encodeURIComponent(value)}`);
      return;
    }
    if (!sourceKey) {
      toast.error(t("Select a source first"));
      return;
    }
    const options = optionDefs
      .map((option) => (optionValues[option.label ?? ""] ?? []).join("|"))
      .filter(Boolean);
    const params = new URLSearchParams({
      source: sourceKey,
      q: value,
      page: "1",
    });
    if (options.length) params.set("options", options.join(","));
    navigate(`/search/result?${params}`);
  };

  if (sources.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (searchable.length === 0) {
    return (
      <PageBody>
        <EmptyState
          title={t("No Search Sources")}
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
    <PageBody className="max-w-[900px]">
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold tracking-[-0.01em]">
          {t("Search")}
        </h1>
        <p className="text-[13px] text-muted">
          {t("Search across your installed comic sources.")}
        </p>
      </div>

      <Card className="p-4 md:p-5">
        <div className="relative flex gap-2">
          <Input
            ref={inputRef}
            autoFocus
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setSuggestOpen(true);
            }}
            onFocus={() => setSuggestOpen(true)}
            onBlur={() => window.setTimeout(() => setSuggestOpen(false), 150)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
              if (event.key === "Escape") setSuggestOpen(false);
            }}
            placeholder={t("Search comics")}
            className="h-11 text-[15px]"
          />
          <Button variant="primary" className="h-11 shrink-0" onClick={submit}>
            <Search className="h-4 w-4" />
            {t("Search")}
          </Button>
          {suggestOpen && (suggestions.data?.items.length ?? 0) > 0 ? (
            <div className="absolute inset-x-0 top-[52px] z-30 max-h-[320px] overflow-y-auto rounded-card border border-border bg-surface shadow-pop">
              {(suggestions.data?.items ?? []).map((item) => (
                <button
                  key={`${item.namespace ?? ""}:${item.value}`}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-surface2"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => openSuggestion(item.value, item.namespace)}
                >
                  {item.namespace === "__url__" ? (
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                  ) : (
                    <Tag className="h-3.5 w-3.5 shrink-0 text-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.value}</span>
                  {item.namespace && !item.namespace.startsWith("__") ? (
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                      {item.namespace}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-[12px] font-medium text-muted">
            {t("Search in")}
          </span>
          {searchable.map((item) => (
            <button
              key={item.key}
              onClick={() => {
                setAggregated(false);
                setSourceKey(item.key);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] transition-colors duration-100",
                !aggregated && item.key === sourceKey
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-surface2 text-muted hover:text-fg",
              )}
            >
              {item.name}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[12px] text-muted">
            <input
              type="checkbox"
              checked={aggregated}
              onChange={(event) => setAggregated(event.target.checked)}
              className="h-4 w-4 rounded border-border accent-[rgb(var(--accent))]"
            />
            {t("Aggregated Search")}
          </label>
        </div>

        {!aggregated && optionDefs.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
            {optionDefs.map((option) => {
              const label = option.label ?? "";
              const values = optionValues[label] ?? [];
              if (option.type === "dropdown") {
                return (
                  <Field key={label} label={label || "Option"}>
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
                );
              }
              return (
                <div
                  key={label}
                  className="flex flex-wrap items-center gap-1.5"
                >
                  <span className="mr-1 text-[12px] font-medium text-muted">
                    {label}
                  </span>
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
                        }}
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-[11px] transition-colors duration-100",
                          selected
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border bg-surface text-muted hover:text-fg",
                        )}
                      >
                        {parsed.text}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold">{t("Search History")}</h2>
          {(history.data?.items.length ?? 0) > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => clearHistory.mutate()}
              loading={clearHistory.isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("Clear Search History")}
            </Button>
          ) : null}
        </div>
        {history.isLoading ? (
          <Spinner />
        ) : (history.data?.items.length ?? 0) === 0 ? (
          <p className="text-[13px] text-muted">
            {t("No search history yet.")}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {history.data?.items.map((item) => (
              <div
                key={item.keyword}
                className="group flex items-center gap-2 rounded px-2 py-2 hover:bg-surface2"
              >
                <button
                  className="flex-1 truncate text-left text-[13px]"
                  onClick={() => {
                    setKeyword(item.keyword);
                    setAggregated(false);
                  }}
                >
                  {item.keyword}
                </button>
                <button
                  aria-label={t("Copy")}
                  className="rounded p-1.5 text-muted opacity-0 hover:text-fg group-hover:opacity-100"
                  onClick={() =>
                    copyText(item.keyword).then(() =>
                      toast.success(t("Copied")),
                    )
                  }
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  aria-label={t("Delete")}
                  className="rounded p-1.5 text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                  onClick={() => deleteHistory.mutate(item.keyword)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageBody>
  );
}
