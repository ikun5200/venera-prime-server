import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Pause, Play, RotateCcw, Trash2 } from "lucide-react";
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
    refetchInterval: 2000,
  });

  const action = useMutation({
    mutationFn: ({
      id,
      name,
    }: {
      id: string;
      name: "pause" | "resume" | "retry" | "cancel" | "first";
    }) => api.downloadAction(id, name),
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
  onOpen,
}: {
  job: DownloadJob;
  onAction: (name: "pause" | "resume" | "retry" | "cancel" | "first") => void;
  onOpen: () => void;
}) {
  const t = useT();
  const tone =
    job.state === "completed"
      ? "success"
      : job.state === "error"
        ? "danger"
        : job.state === "paused"
          ? "warning"
          : "accent";
  return (
    <div className="rounded-card border border-border bg-surface p-3.5">
      <div className="flex items-start gap-3">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[14px] font-medium">{job.title}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {job.sourceKey} · {job.chapters.length} chapters
          </p>
        </button>
        <Badge tone={tone}>{job.state}</Badge>
        <div className="flex items-center gap-0.5">
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
          <IconButton
            label={t("Move To First")}
            onClick={() => onAction("first")}
          >
            <ArrowUp className="h-4 w-4" />
          </IconButton>
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
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
        <span className="truncate">
          {job.error ??
            job.chapters
              .map((chapter) => chapter.status)
              .slice(0, 3)
              .join(", ")}
        </span>
        <span className="tabular">
          {Math.round((job.progress ?? 0) * 100)}%
        </span>
      </div>
    </div>
  );
}
