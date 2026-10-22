import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { DownloadJob } from "./types";

interface ServerEvent {
  type?: string;
  at?: number;
  task?: { status?: string };
  job?: {
    id?: string;
    state?: string;
    progress?: number;
    total?: number;
    error?: string | null;
    queueOrder?: number;
    updatedAt?: number;
  };
  refresh?: boolean;
}

/**
 * Subscribes to the server event stream and refreshes the affected React
 * Query caches. EventSource reconnects automatically; on every reconnect we
 * refresh everything once to cover events missed while offline.
 */
export function useServerEvents(enabled = true) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let source: EventSource | null = null;
    const lastInvalidated = new Map<string, number>();

    const invalidate = (key: string) => {
      const now = Date.now();
      if (now - (lastInvalidated.get(key) ?? 0) < 400) return;
      lastInvalidated.set(key, now);
      queryClient.invalidateQueries({ queryKey: [key] });
    };

    try {
      source = new EventSource("/api/events");
    } catch {
      return;
    }

    source.onopen = () => {
      queryClient.invalidateQueries();
    };

    source.onmessage = (message) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(message.data) as ServerEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case "task":
          invalidate("tasks");
          if (event.task?.status !== "running") {
            invalidate("follow-updates");
            invalidate("favorites");
            invalidate("history");
            invalidate("local-comics");
          }
          break;
        case "download":
          if (event.job?.id) {
            queryClient.setQueryData<{ items: DownloadJob[] }>(
              ["downloads"],
              (old) =>
                old
                  ? {
                      items: old.items.map((job) =>
                        job.id === event.job?.id ? { ...job, ...event.job } : job,
                      ),
                    }
                  : old,
            );
          }
          if (event.refresh) invalidate("downloads");
          if (event.job?.state === "completed") {
            invalidate("local-comics");
            invalidate("comic");
          }
          break;
        case "cache":
          invalidate("cache-stats");
          break;
        default:
          queryClient.invalidateQueries();
      }
    };

    return () => {
      source?.close();
    };
  }, [enabled, queryClient]);
}
