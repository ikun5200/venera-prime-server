import { useState, type ReactNode } from "react";
import { Bookmark, MoreVertical } from "lucide-react";
import { coverUrl } from "../lib/api";
import { useT } from "../lib/i18n";
import type { Comic } from "../lib/types";
import { cn } from "../lib/utils";
import { IconButton, Menu } from "./ui";

export interface ComicAction {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
}

export function ComicCard({
  comic,
  onClick,
  actions,
  favorite,
  progress,
  sourceName,
  className,
  compact = false,
}: {
  comic: Comic;
  onClick?: () => void;
  actions?: ComicAction[];
  favorite?: boolean;
  progress?: { ep: number; page: number; maxPage?: number | null } | null;
  sourceName?: string;
  className?: string;
  compact?: boolean;
}) {
  const t = useT();
  const [broken, setBroken] = useState(false);
  const cover = comic.cover
    ? coverUrl(comic.cover, comic.sourceKey, comic.id)
    : "";

  return (
    <div className={cn("group relative", className)}>
      <button
        type="button"
        onClick={onClick}
        className="block w-full text-left"
        aria-label={comic.title}
      >
        <div className="relative aspect-[2/3] w-full overflow-hidden rounded-card border border-border bg-surface2">
          {cover && !broken ? (
            <img
              src={cover}
              alt=""
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
              className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-semibold text-muted">
              {(comic.title || "?").slice(0, 1).toUpperCase()}
            </div>
          )}
          {favorite ? (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white">
              <Bookmark className="h-3 w-3" fill="currentColor" aria-hidden />
            </span>
          ) : null}
          {progress && progress.page > 0 ? (
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular text-white">
              {progress.ep}:{progress.page}
            </span>
          ) : null}
          {comic.stars ? (
            <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular text-white">
              ★ {comic.stars.toFixed(1)}
            </span>
          ) : null}
        </div>
        {!compact ? (
          <div className="mt-2 min-w-0">
            <p className="line-clamp-2 text-[13px] font-medium leading-snug text-fg">
              {comic.title}
            </p>
            {comic.subtitle ? (
              <p className="mt-0.5 truncate text-[11px] text-muted">
                {comic.subtitle}
              </p>
            ) : null}
            {sourceName ? (
              <p className="mt-0.5 truncate text-[10px] uppercase tracking-wide text-muted/80">
                {sourceName}
              </p>
            ) : null}
          </div>
        ) : null}
      </button>
      {actions && actions.length > 0 ? (
        <div className="absolute right-1 top-1 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
          <Menu
            trigger={({ onClick: open, ...rest }) => (
              <IconButton
                label={t("More")}
                onClick={(event) => {
                  event.stopPropagation();
                  open();
                }}
                className="h-8 w-8 bg-black/45 text-white hover:bg-black/65 hover:text-white"
                {...rest}
              >
                <MoreVertical className="h-4 w-4" />
              </IconButton>
            )}
            items={actions}
          />
        </div>
      ) : null}
    </div>
  );
}

export function ComicGrid({
  comics,
  renderAction,
  onOpen,
  getFavorite,
  getProgress,
  getSourceName,
  scale = 1,
  className,
}: {
  comics: Comic[];
  onOpen: (comic: Comic) => void;
  renderAction?: (comic: Comic) => ComicAction[];
  getFavorite?: (comic: Comic) => boolean;
  getProgress?: (
    comic: Comic,
  ) => { ep: number; page: number; maxPage?: number | null } | null;
  getSourceName?: (comic: Comic) => string | undefined;
  scale?: number;
  className?: string;
}) {
  const min = Math.round(132 * scale);
  return (
    <div
      className={cn("grid gap-x-3 gap-y-5", className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
      }}
    >
      {comics.map((comic) => (
        <ComicCard
          key={`${comic.sourceKey}:${comic.id}`}
          comic={comic}
          onClick={() => onOpen(comic)}
          actions={renderAction?.(comic)}
          favorite={getFavorite?.(comic)}
          progress={getProgress?.(comic)}
          sourceName={getSourceName?.(comic)}
        />
      ))}
    </div>
  );
}
