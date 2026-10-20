import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { api } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { Source } from "../lib/types";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Button, Card, IconButton, Spinner } from "../components/ui";

const kinds = {
  explore: {
    key: "explore_pages",
    capability: "explore",
    title: "Explore Pages",
  },
  categories: {
    key: "categories",
    capability: "category",
    title: "Category Pages",
  },
  favorites: {
    key: "favorites",
    capability: "favorites",
    title: "Network Favorite Pages",
  },
  search: {
    key: "searchSources",
    capability: "search",
    title: "Search Sources",
  },
} as const;

type Kind = keyof typeof kinds;

export default function PageFilterPage({
  kind = "explore" as Kind,
}: {
  kind?: Kind;
}) {
  const t = useT();
  const navigate = useNavigate();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const config = kinds[kind];
  const sources = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const capable = useMemo(
    () =>
      (sources.data?.items ?? []).filter(
        (source) =>
          source.enabled && source.capabilities[config.capability] === true,
      ),
    [config.capability, sources.data],
  );
  const stored = settings[config.key];
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (Array.isArray(stored)) setSelected(stored as string[]);
    else setSelected(capable.map((source) => source.key));
  }, [capable, stored]);

  const persist = async (next: string[]) => {
    setSelected(next);
    try {
      setSettings(await api.updateSettings({ [config.key]: next }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const selectedSources = selected
    .map((key) => capable.find((source) => source.key === key))
    .filter(Boolean) as Source[];
  const available = capable.filter((source) => !selected.includes(source.key));

  if (sources.isLoading) {
    return (
      <PageBody>
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader title={t(config.title)} />
      <PageBody className="max-w-[700px]">
        <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Selected
        </h2>
        <Card className="divide-y divide-border">
          {selectedSources.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-muted">{t("No data")}</p>
          ) : (
            selectedSources.map((source, index) => (
              <div
                key={source.key}
                className="flex items-center gap-2 px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {source.name}
                </span>
                <IconButton
                  label="Up"
                  disabled={index === 0}
                  onClick={() => {
                    const next = [...selected];
                    [next[index - 1], next[index]] = [
                      next[index],
                      next[index - 1],
                    ];
                    persist(next);
                  }}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label="Down"
                  disabled={index === selected.length - 1}
                  onClick={() => {
                    const next = [...selected];
                    [next[index + 1], next[index]] = [
                      next[index],
                      next[index + 1],
                    ];
                    persist(next);
                  }}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </IconButton>
                <IconButton
                  label="Remove"
                  onClick={() =>
                    persist(selected.filter((key) => key !== source.key))
                  }
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            ))
          )}
        </Card>

        <h2 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">
          Available
        </h2>
        <Card className="divide-y divide-border">
          {available.length === 0 ? (
            <p className="px-4 py-3 text-[13px] text-muted">{t("No data")}</p>
          ) : (
            available.map((source) => (
              <div
                key={source.key}
                className="flex items-center gap-2 px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {source.name}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => persist([...selected, source.key])}
                >
                  <Plus className="h-3.5 w-3.5" /> {t("Add")}
                </Button>
              </div>
            ))
          )}
        </Card>

        <div className="mt-4 flex justify-end">
          <Button
            variant="secondary"
            onClick={() => navigate("/settings/explore")}
          >
            {t("Back")}
          </Button>
        </div>
      </PageBody>
    </>
  );
}
