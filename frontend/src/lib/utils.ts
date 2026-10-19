import type { Chapter, ChapterMap } from './types';

export function cn(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

export function formatDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

export function formatDay(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function parseOption(option: string): { value: string; text: string } {
  const index = option.indexOf('-');
  if (index < 0) return { value: option, text: option };
  return { value: option.slice(0, index), text: option.slice(index + 1) };
}

export function flattenChapters(chapters: ChapterMap): Chapter[] {
  const result: Chapter[] = [];
  let index = 0;
  for (const [key, value] of Object.entries(chapters ?? {})) {
    if (value && typeof value === 'object') {
      for (const [chapterId, title] of Object.entries(value)) {
        result.push({ id: chapterId, title: String(title), group: key, index: index++ });
      }
    } else {
      result.push({ id: key, title: String(value), index: index++ });
    }
  }
  return result;
}

export function chapterGroups(chapters: ChapterMap): { name: string; chapters: Chapter[] }[] {
  const groups: { name: string; chapters: Chapter[] }[] = [];
  const flat: Chapter[] = [];
  for (const [key, value] of Object.entries(chapters ?? {})) {
    if (value && typeof value === 'object') {
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
  if (flat.length > 0) groups.push({ name: '', chapters: flat });
  return groups;
}

export type ChapterOrder = 'source' | 'reverse' | 'titleAscending' | 'titleDescending';

export function sortChapters(chapters: Chapter[], order: ChapterOrder): Chapter[] {
  const copy = [...chapters];
  switch (order) {
    case 'reverse':
      return copy.reverse();
    case 'titleAscending':
      return copy.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }));
    case 'titleDescending':
      return copy.sort((a, b) => b.title.localeCompare(a.title, undefined, { numeric: true }));
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
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
  return Promise.resolve();
}

export function isTouchDevice(): boolean {
  return window.matchMedia?.('(hover: none)').matches ?? false;
}
