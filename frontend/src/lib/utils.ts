import type { Chapter, ChapterMap } from "./types";
import { useAppStore } from "./store";

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

/// The interface is Chinese-first; dates follow the selected Chinese locale
/// instead of the browser's en-US default.
export function appLocale(): string {
  const language = String(
    useAppStore.getState().settings.language ?? "system",
  );
  return language === "zh-TW" ? "zh-TW" : "zh-CN";
}

export function formatDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const date = typeof value === "number" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(appLocale(), {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(appLocale(), {
    month: "long",
    day: "numeric",
  });
}

/// Source scripts and proxies expose raw status codes and QuickJS stack
/// frames. Users should see a short, actionable Chinese message instead.
export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/RATE_LIMITED|请求过于频繁|\b429\b/.test(message)) {
    return "请求过于频繁，请稍后重试";
  }
  if (/SOURCE_ERROR|eval_script|Invalid status code|Dns Failed/i.test(message)) {
    if (/Dns Failed/i.test(message)) return "源站域名解析失败，请稍后重试";
    const status =
      message.match(/Invalid status code:\s*(\d+)/i)?.[1] ??
      message.match(/SOURCE_ERROR\((\d+)\)/)?.[1];
    if (status) return `源站返回异常（HTTP ${status}），请稍后重试`;
    return "漫画源暂时不可用，请稍后重试";
  }
  if (
    /Connection Failed|Connection refused|Connect error|tls connection|TLS handshake/i.test(
      message,
    )
  ) {
    return "源站连接失败，请稍后重试";
  }
  if (/Login expired|Not logged in|Unauthorized|登录已过期/i.test(message)) {
    return "登录状态已过期，请重新登录";
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "网络连接失败，请稍后重试";
  }
  if (/timeout|timed out|aborted|abort|超时/i.test(message)) {
    return "请求超时，请稍后重试";
  }
  return message || "操作失败，请稍后重试";
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function parseOption(option: string): { value: string; text: string } {
  const index = option.indexOf("-");
  if (index < 0) return { value: option, text: option };
  return { value: option.slice(0, index), text: option.slice(index + 1) };
}

export function flattenChapters(chapters: ChapterMap): Chapter[] {
  const result: Chapter[] = [];
  let index = 0;
  for (const [key, value] of Object.entries(chapters ?? {})) {
    if (value && typeof value === "object") {
      for (const [chapterId, title] of Object.entries(value)) {
        result.push({
          id: chapterId,
          title: String(title),
          group: key,
          index: index++,
        });
      }
    } else {
      result.push({ id: key, title: String(value), index: index++ });
    }
  }
  return result;
}

export function chapterGroups(
  chapters: ChapterMap,
): { name: string; chapters: Chapter[] }[] {
  const groups: { name: string; chapters: Chapter[] }[] = [];
  const flat: Chapter[] = [];
  for (const [key, value] of Object.entries(chapters ?? {})) {
    if (value && typeof value === "object") {
      groups.push({
        name: key,
        chapters: Object.entries(value).map(([id, title], index) => ({
          id,
          title: String(title),
          group: key,
          index,
        })),
      });
    } else {
      flat.push({ id: key, title: String(value), index: flat.length });
    }
  }
  if (flat.length > 0) groups.push({ name: "", chapters: flat });
  return groups;
}

export type ChapterOrder =
  "source" | "reverse" | "titleAscending" | "titleDescending";

export function sortChapters(
  chapters: Chapter[],
  order: ChapterOrder,
): Chapter[] {
  const copy = [...chapters];
  switch (order) {
    case "reverse":
      return copy.reverse();
    case "titleAscending":
      return copy.sort((a, b) =>
        a.title.localeCompare(b.title, undefined, { numeric: true }),
      );
    case "titleDescending":
      return copy.sort((a, b) =>
        b.title.localeCompare(a.title, undefined, { numeric: true }),
      );
    default:
      return copy;
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function safeJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function useDebouncedCallback<T extends (...args: never[]) => void>(
  callback: T,
  delay: number,
): T {
  let timer: number | undefined;
  return ((...args: never[]) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => callback(...args), delay);
  }) as T;
}

export function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
  return Promise.resolve();
}

export function isTouchDevice(): boolean {
  return window.matchMedia?.("(hover: none)").matches ?? false;
}
