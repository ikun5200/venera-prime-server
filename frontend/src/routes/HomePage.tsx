import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Bookmark,
  Clock,
  Download,
  HardDrive,
  Image,
  LayoutGrid,
  ListChecks,
  RefreshCw,
  Search,
  Shuffle,
  Sparkles,
  Upload,
} from "lucide-react";
import { api } from "../lib/api";
import { useAppStore, toast } from "../lib/store";
import { useT, formatDuration } from "../lib/i18n";
import type {
  Comic,
  HistoryItem,
  ReadLaterItem,
  FavoriteItem,
} from "../lib/types";
import { cn } from "../lib/utils";
import { Badge, Button, Card, Skeleton, Tabs } from "../components/ui";
import { ComicCard } from "../components/ComicCard";
import { SectionHeader } from "../components/PageHeader";

const defaultOrder = [
  "search",
  "sync",
  "random",
  "history",
  "readLater",
  "statistics",
  "local",
  "updates",
  "sources",
  "images",
];

export default function HomePage() {
  const t = useT();
  const settings = useAppStore((state) => state.settings);
  const navigate = useNavigate();

  const layout = (settings.homeLayout ?? {}) as {
    order?: string[];
    hidden?: string[];
  };
  const order = layout.order?.length ? layout.order : defaultOrder;
  const hidden = new Set(layout.hidden ?? []);

  const modules: Record<string, React.ReactNode> = {
    search: <SearchModule />,
    sync: <SyncModule />,
    random: <RandomModule />,
    history: <HistoryModule />,
    readLater: <ReadLaterModule />,
    statistics: <StatisticsModule />,
    local: <LocalModule />,
    updates: <UpdatesModule />,
    sources: <SourcesModule />,
    images: <ImagesModule />,
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-5 md:px-6 md:py-7">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">
            {t("Home")}
          </h1>
          <p className="text-[13px] text-muted">
            {new Date().toLocaleDateString("zh-CN", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate("/settings/home-layout")}
        >
          <LayoutGrid className="h-4 w-4" />
          {t("Customize home")}
        </Button>
      </div>
      <div className="flex flex-col gap-5">
        {order.map((id) =>
          hidden.has(id) && id !== "sync" ? null : (
            <div key={id}>{modules[id] ?? null}</div>
          ),
        )}
      </div>
    </div>
  );
}

function ModuleCard({
  title,
  subtitle,
  to,
  icon,
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  to?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  const tr = useT();
  return (
    <Card className="p-4 md:p-5">
      <SectionHeader
        title={
          <span className="flex items-center gap-2">
            {icon}
            {title}
            {subtitle ? (
              <span className="text-[12px] font-normal text-muted">
                {subtitle}
              </span>
            ) : null}
          </span>
        }
        action={
          <div className="flex items-center gap-1">
            {action}
            {to ? (
              <Link
                to={to}
                className="rounded px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent/10"
              >
                {tr("View more")}
              </Link>
            ) : null}
          </div>
        }
      />
      {children}
    </Card>
  );
}

function ComicRow({
  comics,
  onOpen,
}: {
  comics: Comic[];
  onOpen: (comic: Comic) => void;
}) {
  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-thin">
      {comics.map((comic) => (
        <div
          key={`${comic.sourceKey}:${comic.id}`}
          className="w-[112px] shrink-0 md:w-[124px]"
        >
          <ComicCard comic={comic} onClick={() => onOpen(comic)} compact />
          <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug">
            {comic.title}
          </p>
        </div>
      ))}
    </div>
  );
}

function SearchModule() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/search")}
      className="flex w-full items-center gap-3 rounded-card border border-border bg-surface px-4 py-3.5 text-left transition-colors duration-100 hover:bg-surface2"
    >
      <Search className="h-[18px] w-[18px] text-muted" />
      <span className="text-[14px] text-muted">{t("Search comics")}</span>
    </button>
  );
}

function SyncModule() {
  const t = useT();
  const queryClient = useQueryClient();
  const webdav = useQuery({ queryKey: ["webdav"], queryFn: api.webdav });
  const upload = useMutation({
    mutationFn: api.uploadWebdav,
    onSuccess: () => {
      toast.success(t("Data uploaded"));
      queryClient.invalidateQueries({ queryKey: ["webdav"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const download = useMutation({
    mutationFn: api.downloadWebdav,
    onSuccess: () => {
      toast.success(t("Data restored"));
      queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  if (!webdav.data?.configured) return null;
  return (
    <ModuleCard
      title={t("Data Sync")}
      icon={<RefreshCw className="h-4 w-4 text-muted" />}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">{t("Connected")}</Badge>
        <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
          {webdav.data.url}
        </span>
        <Button
          size="sm"
          loading={upload.isPending}
          onClick={() => upload.mutate()}
        >
          <Upload className="h-3.5 w-3.5" /> {t("Upload")}
        </Button>
        <Button
          size="sm"
          loading={download.isPending}
          onClick={() => download.mutate()}
        >
          <Download className="h-3.5 w-3.5" /> {t("Download")}
        </Button>
      </div>
    </ModuleCard>
  );
}

function RandomModule() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <ModuleCard
      title={t("Random comic")}
      icon={<Shuffle className="h-4 w-4 text-muted" />}
    >
      <Button variant="secondary" onClick={() => navigate("/random")}>
        <Sparkles className="h-4 w-4" /> {t("Pick")}
      </Button>
    </ModuleCard>
  );
}

function HistoryModule() {
  const t = useT();
  const navigate = useNavigate();
  const history = useQuery({
    queryKey: ["history", "home"],
    queryFn: () => api.history({ page: 1 }),
  });
  const comics = useMemo<Comic[]>(
    () =>
      (history.data?.items ?? []).slice(0, 20).map((item: HistoryItem) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        cover: item.cover,
        tags: [],
        description: "",
        sourceKey: item.sourceKey,
        comicType: item.comicType,
      })),
    [history.data],
  );
  return (
    <ModuleCard
      title={t("History")}
      subtitle={history.data ? `${history.data.total}` : undefined}
      to="/history"
      icon={<Clock className="h-4 w-4 text-muted" />}
    >
      {history.isLoading ? (
        <div className="flex gap-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-[166px] w-[112px] shrink-0" />
          ))}
        </div>
      ) : comics.length === 0 ? (
        <p className="text-[13px] text-muted">{t("No history yet.")}</p>
      ) : (
        <ComicRow
          comics={comics}
          onOpen={(comic) => navigate(`/comic/${comic.sourceKey}/${comic.id}`)}
        />
      )}
    </ModuleCard>
  );
}

function ReadLaterModule() {
  const t = useT();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["read-later", "home"],
    queryFn: () => api.readLater(),
  });
  if (!query.data || query.data.count === 0) return null;
  const comics: Comic[] = query.data.items
    .slice(0, 20)
    .map((item: ReadLaterItem) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle,
      cover: item.cover,
      tags: item.tags ?? [],
      description: item.description,
      sourceKey: item.sourceKey,
      comicType: item.comicType,
    }));
  return (
    <ModuleCard
      title={t("Read later")}
      subtitle={`${query.data.count}`}
      to="/read-later"
      icon={<Bookmark className="h-4 w-4 text-muted" />}
    >
      <ComicRow
        comics={comics}
        onOpen={(comic) => navigate(`/comic/${comic.sourceKey}/${comic.id}`)}
      />
    </ModuleCard>
  );
}

function StatisticsModule() {
  const t = useT();
  const navigate = useNavigate();
  const recording = useAppStore(
    (state) => state.settings.recordReadingStatistics !== false,
  );
  const query = useQuery({
    queryKey: ["statistics", "home"],
    queryFn: () => api.statistics(7),
  });
  if (query.isLoading) return null;
  const data = query.data;
  const max = Math.max(1, ...(data?.daily.map((day) => day.seconds) ?? [1]));
  return (
    <ModuleCard
      title={t("Reading statistics")}
      to="/statistics"
      icon={<BookOpen className="h-4 w-4 text-muted" />}
    >
      {!recording ? (
        <p className="text-[13px] text-muted">
          {t("Reading statistics paused")}
        </p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex gap-6">
            <Stat
              label={t("Today")}
              value={formatDuration(data?.todaySeconds ?? 0)}
            />
            <Stat
              label={t("Last 7 days")}
              value={formatDuration(data?.weekSeconds ?? 0)}
            />
            <Stat
              label={t("Total")}
              value={formatDuration(data?.totalSeconds ?? 0)}
            />
          </div>
          <div className="flex h-14 flex-1 items-end gap-1">
            {(data?.daily ?? []).map((day) => (
              <div
                key={day.day}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className="w-full rounded-sm bg-accent/70"
                  style={{
                    height: `${Math.max(3, (day.seconds / max) * 44)}px`,
                  }}
                  title={`${day.day}: ${formatDuration(day.seconds)}`}
                />
                <span className="text-[9px] text-muted">
                  {day.day.slice(5)}
                </span>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate("/statistics")}
          >
            {t("Open")}
          </Button>
        </div>
      )}
    </ModuleCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="text-[18px] font-semibold tabular">{value}</p>
    </div>
  );
}

function LocalModule() {
  const t = useT();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["local-comics", "home"],
    queryFn: () => api.localComics(),
  });
  const items = query.data?.items ?? [];
  return (
    <ModuleCard
      title={t("Local")}
      subtitle={`${items.length}`}
      to="/local"
      icon={<HardDrive className="h-4 w-4 text-muted" />}
      action={
        <>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate("/downloads")}
          >
            <ListChecks className="h-3.5 w-3.5" /> {t("Tasks")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate("/local/import")}
          >
            <Upload className="h-3.5 w-3.5" /> {t("Import")}
          </Button>
        </>
      }
    >
      {items.length === 0 ? (
        <p className="text-[13px] text-muted">{t("No local comics yet.")}</p>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-thin">
          {items.slice(0, 20).map((comic) => (
            <div key={comic.id} className="w-[112px] shrink-0">
              <ComicCard
                comic={{
                  id: String(comic.id),
                  title: comic.title,
                  subtitle: comic.subtitle,
                  cover: comic.coverUrl ?? "",
                  tags: [],
                  description: comic.description,
                  sourceKey: "local",
                }}
                onClick={() => navigate(`/reader/local/${comic.id}`)}
                compact
              />
              <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug">
                {comic.title}
              </p>
            </div>
          ))}
        </div>
      )}
    </ModuleCard>
  );
}

function UpdatesModule() {
  const t = useT();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["follow-updates"],
    queryFn: api.followUpdates,
  });
  if (query.isLoading) return null;
  if (!query.data?.configured) {
    return (
      <ModuleCard
        title={t("Follow Updates")}
        icon={<RefreshCw className="h-4 w-4 text-muted" />}
      >
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-muted">{t("Not Configured")}</p>
          <Button size="sm" onClick={() => navigate("/follow-updates")}>
            {t("Choose Folder")}
          </Button>
        </div>
      </ModuleCard>
    );
  }
  return (
    <ModuleCard
      title={t("Follow Updates")}
      subtitle={t("@count updates", { count: query.data.count })}
      to="/follow-updates"
      icon={<RefreshCw className="h-4 w-4 text-muted" />}
    >
      {query.data.updates.length === 0 ? (
        <p className="text-[13px] text-muted">{t("No updates found")}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {query.data.updates.slice(0, 8).map((item: FavoriteItem) => (
            <button
              key={`${item.id}:${item.comicType}`}
              onClick={() =>
                navigate(`/comic/${item.sourceKey ?? ""}/${item.id}`)
              }
              className="max-w-[220px] truncate rounded-full border border-border bg-surface2 px-3 py-1.5 text-[12px] hover:border-accent/40"
            >
              {item.title}
            </button>
          ))}
        </div>
      )}
    </ModuleCard>
  );
}

function SourcesModule() {
  const t = useT();
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const items = query.data?.items ?? [];
  return (
    <ModuleCard
      title={t("Comic Source")}
      subtitle={`${items.length}`}
      to="/sources"
      icon={<Sparkles className="h-4 w-4 text-muted" />}
    >
      {items.length === 0 ? (
        <div className="flex items-center gap-3">
          <p className="text-[13px] text-muted">
            {t("Please add some sources")}
          </p>
          <Button size="sm" onClick={() => navigate("/sources")}>
            {t("Add")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((source) => (
            <button
              key={source.key}
              onClick={() => navigate(`/sources/${source.key}`)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12px] transition-colors duration-100",
                source.enabled
                  ? "border-border bg-surface2 text-fg hover:border-accent/40"
                  : "border-dashed border-border text-muted",
              )}
            >
              {source.name}
            </button>
          ))}
        </div>
      )}
    </ModuleCard>
  );
}

function ImagesModule() {
  const t = useT();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"tags" | "authors" | "comics">("tags");
  const query = useQuery({
    queryKey: ["image-favorites-stats"],
    queryFn: api.imageFavoriteStats,
  });
  if (query.isLoading) return null;
  const data = query.data;
  if (!data || data.total === 0) return null;
  const rows = (
    (
      data as unknown as Record<
        string,
        { label?: string; title?: string; count: number }[]
      >
    )[tab] ?? []
  ).map((row) => ({
    label: row.label ?? row.title ?? "",
    count: row.count,
  }));
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ModuleCard
      title={t("Image Favorites")}
      subtitle={`${data.total}`}
      to="/image-favorites"
      icon={<Image className="h-4 w-4 text-muted" />}
    >
      <Tabs
        items={[
          { value: "tags", label: t("Tags") },
          { value: "authors", label: t("Authors") },
          { value: "comics", label: t("Comics") },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-3"
      />
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">{t("No data")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.slice(0, 6).map((row) => (
            <button
              key={row.label}
              onClick={() =>
                navigate(`/image-favorites?q=${encodeURIComponent(row.label)}`)
              }
              className="flex items-center gap-3 text-left"
            >
              <span className="w-28 truncate text-[12px] text-fg">
                {row.label}
              </span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                <span
                  className="block h-full rounded-full bg-accent/70"
                  style={{ width: `${(row.count / max) * 100}%` }}
                />
              </span>
              <span className="w-8 text-right text-[11px] tabular text-muted">
                {row.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </ModuleCard>
  );
}
