import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownUp,
  CheckCircle2,
  FolderGit2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { Source } from "../lib/types";
import type { SourceUrlResult } from "../lib/api";
import { cn } from "../lib/utils";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  Modal,
  Spinner,
  Switch,
  Tabs,
  Textarea,
} from "../components/ui";

export default function SourcesPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const query = useQuery({ queryKey: ["sources"], queryFn: api.sources });
  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"paste" | "url" | "file">("paste");
  const [script, setScript] = useState("");
  const [url, setUrl] = useState("");
  const [reorderOpen, setReorderOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Source | null>(null);
  const [check, setCheck] = useState<{
    open: boolean;
    key: string;
    data: unknown;
    loading: boolean;
  }>({
    open: false,
    key: "",
    data: null,
    loading: false,
  });

  const sources = query.data?.items ?? [];

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["sources"] });

  const importSource = useMutation({
    mutationFn: async () => {
      if (mode === "url") return api.addSourceUrl(url.trim());
      if (mode === "file") return api.importSourceFile(script);
      return api.importSource(script);
    },
    onSuccess: (result: SourceUrlResult | { source: Source }) => {
      setAddOpen(false);
      setScript("");
      setUrl("");
      const library = "library" in result ? result.library : null;
      if (result.source?.key) {
        toast.success(t("Added"));
        refresh();
        navigate(`/sources/${result.source.key}`);
        return;
      }
      if (library) {
        toast.success(t("Added as a source library"));
        queryClient.invalidateQueries({ queryKey: ["source-libraries"] });
        navigate(`/sources/libraries/${library.id}`);
        return;
      }
      toast.success(t("Added"));
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const updateSource = useMutation({
    mutationFn: (source: Source) => api.updateSourceFromUrl(source.key),
    onSuccess: () => {
      toast.success(t("Updated"));
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const deleteSource = useMutation({
    mutationFn: (source: Source) => api.deleteSource(source.key),
    onSuccess: () => {
      toast.success(t("Deleted"));
      setDeleteTarget(null);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleSource = useMutation({
    mutationFn: ({ source, enabled }: { source: Source; enabled: boolean }) =>
      api.patchSource(source.key, { enabled }),
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });

  const updateAll = useMutation({
    mutationFn: async () => {
      for (const source of sources.filter((item) => item.url)) {
        try {
          await api.updateSourceFromUrl(source.key);
        } catch {
          // One failed source must not stop the others.
        }
      }
    },
    onSuccess: () => {
      toast.success(t("Update check completed"));
      refresh();
    },
  });

  const saveOrder = useMutation({
    mutationFn: () => api.reorderSources(order),
    onSuccess: () => {
      toast.success(t("Saved"));
      setReorderOpen(false);
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const runCheck = async (source: Source) => {
    setCheck({ open: true, key: source.key, data: null, loading: true });
    try {
      const result = await api.checkSource(source.key);
      setCheck({ open: true, key: source.key, data: result, loading: false });
    } catch (error) {
      setCheck({
        open: true,
        key: source.key,
        data: {
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        },
        loading: false,
      });
    }
  };

  const openReorder = () => {
    setOrder(sources.map((source) => source.key));
    setReorderOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t("Comic Source")}
        subtitle={t("@count sources", { count: sources.length })}
        actions={
          <>
            <IconButton
              label={t("Update all")}
              onClick={() => updateAll.mutate()}
              disabled={sources.length === 0}
            >
              <RefreshCw
                className={cn("h-4 w-4", updateAll.isPending && "animate-spin")}
              />
            </IconButton>
            <IconButton
              label={t("Reorder")}
              onClick={openReorder}
              disabled={sources.length < 2}
            >
              <ArrowDownUp className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={t("Source libraries")}
              onClick={() => navigate("/sources/libraries")}
            >
              <FolderGit2 className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={t("Add comic source")}
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-4 w-4" />
            </IconButton>
          </>
        }
      />
      <PageBody>
        {query.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : sources.length === 0 ? (
          <EmptyState
            title={t("No Search Sources")}
            description={t("Please add some sources")}
            action={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                {t("Add comic source")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {sources.map((source) => (
              <Card key={source.key} className="flex items-center gap-3 p-3.5">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/sources/${source.key}`)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-[14px] font-medium">
                      {source.name}
                    </p>
                    <Badge>v{source.version}</Badge>
                    {!source.enabled ? (
                      <Badge tone="warning">{t("Disabled")}</Badge>
                    ) : null}
                    {source.account.loggedIn ? (
                      <Badge tone="success">{t("Logged in")}</Badge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-muted">
                    {source.key} · {capabilitySummary(source)}
                  </p>
                </button>
                <Switch
                  checked={source.enabled}
                  onChange={(enabled) =>
                    toggleSource.mutate({ source, enabled })
                  }
                />
                <Menu
                  trigger={({ onClick, ...rest }) => (
                    <IconButton label={t("More")} onClick={onClick} {...rest}>
                      <MoreHorizontal className="h-4 w-4" />
                    </IconButton>
                  )}
                  items={[
                    {
                      label: t("Edit"),
                      onSelect: () =>
                        navigate(`/sources/${source.key}?tab=edit`),
                    },
                    {
                      label: t("Source settings"),
                      onSelect: () =>
                        navigate(`/sources/${source.key}?tab=settings`),
                    },
                    {
                      label: t("Log in"),
                      onSelect: () =>
                        navigate(`/sources/${source.key}?tab=account`),
                    },
                    {
                      label: t("Update"),
                      icon: <RefreshCw className="h-3.5 w-3.5" />,
                      disabled: !source.url,
                      onSelect: () => updateSource.mutate(source),
                    },
                    {
                      label: t("Check readability"),
                      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
                      onSelect: () => runCheck(source),
                    },
                    {
                      label: t("Delete"),
                      danger: true,
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      onSelect: () => setDeleteTarget(source),
                    },
                  ]}
                />
              </Card>
            ))}
          </div>
        )}
      </PageBody>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("Add comic source")}
        width="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              loading={importSource.isPending}
              disabled={mode === "url" ? !url.trim() : !script.trim()}
              onClick={() => importSource.mutate()}
            >
              {t("Add")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Tabs
            items={[
              { value: "paste", label: t("Paste script") },
              { value: "url", label: t("URL") },
              { value: "file", label: t("Use a config file") },
            ]}
            value={mode}
            onChange={(value) => setMode(value)}
          />
          {mode === "url" ? (
            <Field
              label={t("Source URL")}
              hint={t("The script is downloaded and validated on the server.")}
            >
              <Input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://example.com/source.js"
              />
              <p className="mt-1.5 text-[11px] text-muted">
                {t(
                  "You can also paste a source catalog URL (index.json); it will be added as a source library.",
                )}
              </p>
            </Field>
          ) : mode === "file" ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".js,application/javascript,text/javascript"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) setScript(await file.text());
                }}
                className="block w-full text-[13px] text-muted file:mr-3 file:rounded file:border-0 file:bg-surface2 file:px-3 file:py-2 file:text-[13px] file:text-fg"
              />
              {script ? (
                <p className="text-[12px] text-muted">
                  {script.length} characters loaded.
                </p>
              ) : null}
            </>
          ) : (
            <Field
              label={t("Source script")}
              hint={t("A JavaScript class extending ComicSource.")}
            >
              <Textarea
                value={script}
                onChange={(event) => setScript(event.target.value)}
                className="min-h-[280px] font-mono text-[12px]"
                placeholder="class MySource extends ComicSource { ... }"
              />
            </Field>
          )}
        </div>
      </Modal>

      <Modal
        open={reorderOpen}
        onClose={() => setReorderOpen(false)}
        title={t("Reorder comic sources")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setReorderOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="primary"
              loading={saveOrder.isPending}
              onClick={() => saveOrder.mutate()}
            >
              {t("Confirm")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          {order.map((key) => {
            const source = sources.find((item) => item.key === key);
            if (!source) return null;
            return (
              <div
                key={key}
                draggable
                onDragStart={() => setDragging(key)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (!dragging || dragging === key) return;
                  const next = order.filter((value) => value !== dragging);
                  next.splice(next.indexOf(key), 0, dragging);
                  setOrder(next);
                  setDragging(null);
                }}
                className="flex cursor-grab items-center gap-2 rounded border border-border px-3 py-2 text-[13px]"
              >
                <ArrowDownUp className="h-3.5 w-3.5 text-muted" />
                {source.name}
              </div>
            );
          })}
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={`Delete comic source '${deleteTarget?.name ?? ""}' ?`}
        confirmLabel={t("Delete")}
        danger
        onConfirm={() => deleteTarget && deleteSource.mutate(deleteTarget)}
      />

      <Modal
        open={check.open}
        onClose={() => setCheck({ ...check, open: false })}
        title={t("Check readability")}
        footer={
          <Button
            variant="ghost"
            onClick={() => setCheck({ ...check, open: false })}
          >
            {t("Close")}
          </Button>
        }
      >
        {check.loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <CheckResult data={check.data} />
        )}
      </Modal>
    </>
  );
}

function capabilitySummary(source: Source): string {
  const labels: [string, string][] = [
    ["search", "search"],
    ["explore", "explore"],
    ["category", "categories"],
    ["favorites", "favorites"],
    ["comments", "comments"],
    ["imageLoad", "images"],
    ["login", "login"],
  ];
  const active = labels
    .filter(([key]) => source.capabilities[key] === true)
    .map(([, label]) => label);
  return active.join(" · ") || "no capabilities";
}

function CheckResult({ data }: { data: unknown }) {
  const t = useT();
  if (!data || typeof data !== "object") {
    return <p className="text-[13px] text-muted">{t("No data")}</p>;
  }
  const result = data as {
    status?: string;
    stage?: string;
    message?: string;
    stages?: Record<string, unknown>;
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge tone={result.status === "readable" ? "success" : "danger"}>
          {t(result.status ?? "unknown")}
        </Badge>
        {result.stage ? (
          <span className="text-[12px] text-muted">
            {t("stage")}: {t(result.stage)}
          </span>
        ) : null}
      </div>
      {result.message ? (
        <p className="rounded bg-danger/10 px-3 py-2 text-[12px] text-danger">
          {result.message}
        </p>
      ) : null}
      <div className="flex flex-col gap-1">
        {Object.entries(result.stages ?? {}).map(([stage, value]) => (
          <div
            key={stage}
            className="flex items-center justify-between rounded border border-border px-3 py-2 text-[12px]"
          >
            <span>{stage}</span>
            <span
              className={cn(
                value === "ok"
                  ? "text-success"
                  : value === "failed"
                    ? "text-danger"
                    : "text-muted",
              )}
            >
              {t(String(value))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
