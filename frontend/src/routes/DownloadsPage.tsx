import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { DownloadJob } from "../lib/types";
import { cn } from "../lib/utils";
import { PageBody, PageHeader } from "../components/PageHeader";
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Skeleton,
} from "../components/ui";
import { comicPath } from "../lib/links";

export default function DownloadsPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["downloads"],
    queryFn: api.downloads,
  });

  const action = useMutation({
    mutationFn: ({
      id,
      name,
    }: {
      id: string;
      name:
        | "pause"
        | "resume"
        | "retry"
        | "cancel"
        | "first"
        | "up"
        | "down"
        | "last";
    }) => api.downloadAction(id, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["downloads"] }),
    onError: (error) => toast.error(error.message),
  });

  const chapterRetry = useMutation({
    mutationFn: ({ id, chapterId }: { id: string; chapterId: string }) =>
      api.retryDownloadChapter(id, chapterId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["downloads"] }),
    onError: (error) => toast.error(error.message),
  });

  const jobs = query.data?.items ?? [];
  const active = jobs.find((job) => job.state === "running");

  return (
    <>
      <PageHeader
        title={t("Downloading")}
        subtitle={t("@count tasks", { count: jobs.length })}
        actions={
          active ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => action.mutate({ id: active.id, name: "pause" })}
              >
                <Pause className="h-3.5 w-3.5" /> {t("Pause")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => action.mutate({ id: active.id, name: "resume" })}
              >
                <Play className="h-3.5 w-3.5" /> {t("Start")}
              </Button>
            </>
          ) : undefined
        }
      />
      <PageBody>
        {query.isLoading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-24 w-full" />
            ))}
          </div>
        ) : jobs.length === 0 ? (
          <EmptyState
            title={t("No data")}
            description={t("Start a download from a comic detail page.")}
            action={
              <Button onClick={() => navigate("/sources")}>
                {t("Explore")}
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onAction={(name) => action.mutate({ id: job.id, name })}
                onRetryChapter={(chapterId) =>
                  chapterRetry.mutate({ id: job.id, chapterId })
                }
                onOpen={() =>
                  navigate(comicPath(job.sourceKey, job.comicId))
                }
              />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}

function JobCard({
  job,
  onAction,
  onRetryChapter,
  onOpen,
}: {
  job: DownloadJob;
  onAction: (
    name:
      | "pause"
      | "resume"
      | "retry"
      | "cancel"
      | "first"
      | "up"
      | "down"
      | "last",
  ) => void;
  onRetryChapter: (chapterId: string) => void;
  onOpen: () => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const tone =
    job.state === "completed"
      ? "success"
      : job.state === "error"
        ? "danger"
        : job.state === "paused"
          ? "warning"
          : "accent";
  const canReorder = job.state === "queued" || job.state === "paused";
  const stateLabel = (state: string) => {
    if (state === "queued") return t("Queued");
    if (state === "running") return t("Running");
    if (state === "paused") return t("Paused");
    if (state === "completed") return t("Completed");
    if (state === "error") return t("Error");
    if (state === "cancelled") return t("Cancelled");
    return state;
  };
  const statusLabel = (status: string) => {
    if (status === "completed") return t("Completed");
    if (status === "error") return t("Error");
    if (status === "running") return t("Running");
    if (status === "pending") return t("Queued");
    return status;
  };
  return (
    <div className="rounded-card border border-border bg-surface p-3.5">
      <div className="flex flex-wrap items-start gap-2">
        <button
          onClick={onOpen}
          className="min-w-0 flex-1 basis-full text-left sm:basis-0"
        >
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate text-[14px] font-medium">{job.title}</p>
            <Badge tone={tone}>{stateLabel(job.state)}</Badge>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {job.sourceKey} · {job.chapters.length} {t("Chapters")}
          </p>
        </button>
        <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-0.5">
          {job.state === "running" ? (
            <IconButton label={t("Pause")} onClick={() => onAction("pause")}>
              <Pause className="h-4 w-4" />
            </IconButton>
          ) : job.state === "paused" ? (
            <IconButton label={t("Start")} onClick={() => onAction("resume")}>
              <Play className="h-4 w-4" />
            </IconButton>
          ) : null}
          {job.state === "error" || job.state === "cancelled" ? (
            <IconButton label={t("Retry")} onClick={() => onAction("retry")}>
              <RotateCcw className="h-4 w-4" />
            </IconButton>
          ) : null}
          {canReorder ? (
            <>
              <IconButton label={t("Move Up")} onClick={() => onAction("up")}>
                <ArrowUp className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={t("Move Down")}
                onClick={() => onAction("down")}
              >
                <ArrowDown className="h-4 w-4" />
              </IconButton>
              <IconButton
                label={t("Move To First")}
                onClick={() => onAction("first")}
              >
                <ArrowUp className="h-4 w-4" />
              </IconButton>
            </>
          ) : null}
          <IconButton
            label={t("Cancel")}
            onClick={() => onAction("cancel")}
            className="hover:text-danger"
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface2">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300 ease-enter",
            job.state === "error" ? "bg-danger" : "bg-accent",
          )}
          style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="truncate">
          {job.error ??
            job.chapters
              .map((chapter) => statusLabel(chapter.status))
              .slice(0, 3)
              .join(", ")}
        </span>
        <span className="tabular shrink-0">
          {Math.round((job.progress ?? 0) * 100)}%
        </span>
      </div>
      {job.chapters.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted transition-colors hover:text-text"
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {t("Chapters")} · {job.chapters.length}
          </button>
          {expanded ? (
            <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-border">
              {job.chapters.map((chapter) => (
                <div
                  key={chapter.id}
                  className="flex items-center gap-2 border-b border-border px-2.5 py-1.5 text-[11px] last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate" title={chapter.name}>
                    {chapter.name}
                  </span>
                  <span
                    className={cn(
                      "shrink-0",
                      chapter.status === "error"
                        ? "text-danger"
                        : chapter.status === "completed"
                          ? "text-success"
                          : "text-muted",
                    )}
                  >
                    {statusLabel(chapter.status)}
                  </span>
                  <span className="tabular shrink-0 text-muted">
                    {chapter.downloadedPages}/{chapter.totalPages}
                  </span>
                  {chapter.status === "error" ? (
                    <IconButton
                      label={t("Retry Chapter")}
                      onClick={() => onRetryChapter(chapter.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </IconButton>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
