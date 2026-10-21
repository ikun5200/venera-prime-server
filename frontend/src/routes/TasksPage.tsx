import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "../lib/api";
import { toast } from "../lib/store";
import { useT } from "../lib/i18n";
import type { TaskItem } from "../lib/types";
import { cn, formatDate } from "../lib/utils";
import { PageBody, PageHeader } from "../components/PageHeader";
import { Badge, Button, Card, EmptyState, Spinner } from "../components/ui";

export default function TasksPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["tasks"],
    queryFn: api.tasks,
    refetchInterval: 2000,
  });
  const clear = useMutation({
    mutationFn: api.clearTasks,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (error) => toast.error(error.message),
  });
  const cancel = useMutation({
    mutationFn: api.cancelTask,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (error) => toast.error(error.message),
  });

  const tasks = query.data?.items ?? [];

  return (
    <>
      <PageHeader
        title={t("Tasks")}
        subtitle={t("@count running", {
          count: tasks.filter((task) => task.status === "running").length,
        })}
        actions={
          <Button size="sm" variant="ghost" onClick={() => clear.mutate()}>
            {t("Clear finished tasks")}
          </Button>
        }
      />
      <PageBody className="max-w-[800px]">
        {query.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState title={t("No background tasks")} />
        ) : (
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onCancel={() => cancel.mutate(task.id)}
              />
            ))}
          </div>
        )}
      </PageBody>
    </>
  );
}

function TaskCard({
  task,
  onCancel,
}: {
  task: TaskItem;
  onCancel: () => void;
}) {
  const t = useT();
  const tone =
    task.status === "completed"
      ? "success"
      : task.status === "failed"
        ? "danger"
        : task.status === "cancelled"
          ? "warning"
          : "accent";
  return (
    <Card className="p-3.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium">
          {task.title}
        </p>
        <Badge tone={tone}>{t(task.status)}</Badge>
        {task.status === "running" ? (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface2">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-300",
            task.status === "failed" ? "bg-danger" : "bg-accent",
          )}
          style={{ width: `${Math.round((task.progress ?? 0) * 100)}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
        <span className="truncate">
          {task.message || task.error || task.type}
        </span>
        <span className="tabular">
          {Math.round((task.progress ?? 0) * 100)}%
        </span>
      </div>
      {task.error ? (
        <p className="mt-2 rounded bg-danger/10 px-2 py-1.5 text-[11px] text-danger">
          {task.error}
        </p>
      ) : null}
      {task.result ? (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-surface2 p-2 text-[10px]">
          {JSON.stringify(task.result, null, 2)}
        </pre>
      ) : null}
      <p className="mt-1 text-[10px] text-muted">
        {formatDate(task.updatedAt)}
      </p>
    </Card>
  );
}
