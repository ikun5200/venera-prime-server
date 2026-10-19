import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckSquare, Copy, MoreHorizontal, RefreshCw, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../lib/store';
import { useT } from '../lib/i18n';
import type { Comic, HistoryItem } from '../lib/types';
import { cn, copyText } from '../lib/utils';
import { ComicCard } from '../components/ComicCard';
import { PageBody, PageHeader } from '../components/PageHeader';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  Menu,
  Skeleton,
} from '../components/ui';

export default function HistoryPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [clearOpen, setClearOpen] = useState(false);
  const [clearUnfavorited, setClearUnfavorited] = useState(false);

  const query = useQuery({
    queryKey: ['history', search, page],
    queryFn: () => api.history({ q: search || undefined, page }),
  });

  const items = query.data?.items ?? [];
  const selectedItems = items.filter((item) => selected.has(`${item.id}:${item.comicType}`));

  const remove = useMutation({
    mutationFn: (item: HistoryItem) => api.deleteHistory(item.comicType, item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const batchDelete = useMutation({
    mutationFn: async () => {
      for (const item of selectedItems) {
        await api.deleteHistory(item.comicType, item.id);
      }
    },
    onSuccess: () => {
      setSelected(new Set());
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const clear = useMutation({
    mutationFn: () => api.clearHistory(clearUnfavorited),
    onSuccess: () => {
      toast.success('Cleared');
      queryClient.invalidateQueries({ queryKey: ['history'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const refreshAll = useMutation({
    mutationFn: () => api.refreshHistory(),
    onSuccess: () => toast.success('Running in background'),
    onError: (error) => toast.error(error.message),
  });

  const refreshOne = useMutation({
    mutationFn: (item: HistoryItem) => api.refreshHistory([item]),
    onSuccess: () => toast.success('Running in background'),
    onError: (error) => toast.error(error.message),
  });

  const toggle = (item: HistoryItem) => {
    const key = `${item.id}:${item.comicType}`;
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / 60));

  return (
    <>
      <PageHeader
        title={t('History')}
        subtitle={`${query.data?.total ?? 0} comics`}
        actions={
          <>
            <IconButton label={t('Refresh All Histories')} onClick={() => refreshAll.mutate()}>
              <RefreshCw className={cn('h-4 w-4', refreshAll.isPending && 'animate-spin')} />
            </IconButton>
            <IconButton
              label={selectMode ? 'Exit Multi-Select' : 'Multi-Select'}
              onClick={() => {
                setSelectMode((value) => !value);
                setSelected(new Set());
              }}
              className={selectMode ? 'text-accent' : undefined}
            >
              <CheckSquare className="h-4 w-4" />
            </IconButton>
            <Menu
              trigger={({ onClick, ...rest }) => (
                <IconButton label="More" onClick={onClick} {...rest}>
                  <MoreHorizontal className="h-4 w-4" />
                </IconButton>
              )}
              items={[
                {
                  label: t('Clear Unfavorited'),
                  onSelect: () => {
                    setClearUnfavorited(true);
                    setClearOpen(true);
                  },
                },
                {
                  label: t('Clear History'),
                  danger: true,
                  onSelect: () => {
                    setClearUnfavorited(false);
                    setClearOpen(true);
                  },
                },
              ]}
            />
          </>
        }
      />
      <PageBody>
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder={t('Search')}
            className="pl-9"
          />
        </div>

        {selectMode && selected.size > 0 ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-accent/30 bg-accent/5 p-2">
            <span className="px-1 text-[12px] font-medium">{selected.size} selected</span>
            <Button
              size="sm"
              onClick={() =>
                setSelected(new Set(items.map((item) => `${item.id}:${item.comicType}`)))
              }
            >
              {t('Select All')}
            </Button>
            <Button size="sm" onClick={() => setSelected(new Set())}>
              {t('Deselect')}
            </Button>
            <Button
              size="sm"
              onClick={() =>
                setSelected(
                  new Set(
                    items
                      .filter((item) => !selected.has(`${item.id}:${item.comicType}`))
                      .map((item) => `${item.id}:${item.comicType}`),
                  ),
                )
              }
            >
              {t('Invert Selection')}
            </Button>
            <Button size="sm" variant="danger" onClick={() => batchDelete.mutate()}>
              <Trash2 className="h-3.5 w-3.5" /> {t('Delete')}
            </Button>
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index}>
                <Skeleton className="aspect-[2/3] w-full" />
                <Skeleton className="mt-2 h-3 w-3/4" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState title={t('No data')} />
        ) : (
          <div className="grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6">
            {items.map((item) => {
              const comic: Comic = {
                id: item.id,
                title: item.title,
                subtitle: item.subtitle,
                cover: item.cover,
                tags: [],
                description: '',
                sourceKey: item.sourceKey,
                comicType: item.comicType,
              };
              const key = `${item.id}:${item.comicType}`;
              return (
                <div key={key} className="relative">
                  <ComicCard
                    comic={comic}
                    progress={{ ep: item.ep, page: item.page, maxPage: item.maxPage }}
                    onClick={() =>
                      selectMode ? toggle(item) : navigate(`/comic/${item.sourceKey}/${item.id}`)
                    }
                    actions={
                      selectMode
                        ? undefined
                        : [
                            {
                              label: t('Details'),
                              onSelect: () => navigate(`/comic/${item.sourceKey}/${item.id}`),
                            },
                            {
                              label: t('Read'),
                              onSelect: () => navigate(`/reader/${item.sourceKey}/${item.id}`),
                            },
                            {
                              label: t('Refresh Info'),
                              icon: <RefreshCw className="h-3.5 w-3.5" />,
                              onSelect: () => refreshOne.mutate(item),
                            },
                            {
                              label: t('Copy Title'),
                              icon: <Copy className="h-3.5 w-3.5" />,
                              onSelect: () => copyText(item.title).then(() => toast.success('Copied')),
                            },
                            {
                              label: t('Remove'),
                              danger: true,
                              onSelect: () => remove.mutate(item),
                            },
                          ]
                    }
                  />
                  {selectMode ? (
                    <button
                      onClick={() => toggle(item)}
                      className={cn(
                        'absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded border',
                        selected.has(key)
                          ? 'border-accent bg-accent text-white'
                          : 'border-white/70 bg-black/40',
                      )}
                      aria-label="Select"
                    >
                      {selected.has(key) ? '✓' : ''}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-3">
          <Button size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            {t('Previous')}
          </Button>
          <span className="text-[13px] tabular text-muted">
            {t('Page')} {page} / {totalPages}
          </span>
          <Button
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((value) => value + 1)}
          >
            {t('Next')}
          </Button>
        </div>
      </PageBody>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title={t('Are you sure you want to clear your history?')}
        confirmLabel={t('Clear')}
        danger
        onConfirm={() => clear.mutate()}
      />
    </>
  );
}
