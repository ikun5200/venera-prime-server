import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, RefreshCw, Settings2 } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../lib/store';
import { useT } from '../lib/i18n';
import type { FavoriteItem } from '../lib/types';
import { ComicGrid } from '../components/ComicCard';
import { PageBody, PageHeader } from '../components/PageHeader';
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Switch,
} from '../components/ui';

const intervals = [1, 6, 12, 24, 48, 72, 168];

export default function FollowUpdatesPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [folderId, setFolderId] = useState<number | null>(null);
  const [fixedTime, setFixedTime] = useState('');

  const overview = useQuery({ queryKey: ['follow-updates'], queryFn: api.followUpdates });
  const config = useQuery({ queryKey: ['follow-updates-config'], queryFn: api.followUpdatesConfig });
  const folders = useQuery({ queryKey: ['favorite-folders'], queryFn: api.favoriteFolders });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.saveFollowUpdatesConfig(body),
    onSuccess: () => {
      toast.success('Saved');
      queryClient.invalidateQueries({ queryKey: ['follow-updates'] });
      queryClient.invalidateQueries({ queryKey: ['follow-updates-config'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const check = useMutation({
    mutationFn: api.checkFollowUpdates,
    onSuccess: () => {
      toast.success('Running in background');
      queryClient.invalidateQueries({ queryKey: ['follow-updates'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const markAll = useMutation({
    mutationFn: () => api.markFollowUpdatesRead(),
    onSuccess: () => {
      toast.success('Marked as read');
      queryClient.invalidateQueries({ queryKey: ['follow-updates'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const markOne = useMutation({
    mutationFn: (item: FavoriteItem) => api.markFollowUpdatesRead([item]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['follow-updates'] });
    },
    onError: (error) => toast.error(error.message),
  });

  if (overview.isLoading || config.isLoading) {
    return (
      <PageBody>
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      </PageBody>
    );
  }

  const data = overview.data;
  const current = config.data;

  if (!data?.configured) {
    return (
      <>
        <PageHeader title={t('Follow Updates')} />
        <PageBody>
          <Card className="max-w-xl p-5">
            <h2 className="text-[15px] font-semibold">{t('Not Configured')}</h2>
            <p className="mt-1 text-[13px] text-muted">{t('Choose a folder to follow updates.')}</p>
            <div className="mt-4 flex flex-col gap-3">
              <Field label={t('Folder')}>
                <Select
                  value={folderId ?? ''}
                  onChange={(event) => setFolderId(Number(event.target.value))}
                >
                  <option value="">Select a folder</option>
                  {(folders.data?.items ?? []).map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                variant="primary"
                disabled={folderId === null}
                loading={save.isPending}
                onClick={() => save.mutate({ folderId })}
              >
                {t('Confirm')}
              </Button>
            </div>
          </Card>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('Follow Updates')}
        subtitle={data.folder?.name}
        actions={
          <Button size="sm" loading={check.isPending} onClick={() => check.mutate()}>
            <RefreshCw className="h-3.5 w-3.5" />
            {t('Check Now')}
          </Button>
        }
      />
      <PageBody>
        <Card className="mb-6 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-[13px]">
              <Switch
                checked={current?.checkOnStart !== false}
                onChange={(value) => save.mutate({ checkOnStart: value })}
              />
              {t('Check follow updates on startup')}
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              {t('Follow updates check interval')}
              <Select
                value={String(current?.intervalHours ?? 24)}
                onChange={(event) => save.mutate({ intervalHours: Number(event.target.value) })}
                className="w-[130px]"
              >
                {intervals.map((hours) => (
                  <option key={hours} value={hours}>
                    Every {hours} hours
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex items-center gap-2 text-[13px]">
              {t('Fixed check time')}
              <Input
                type="time"
                value={fixedTime || current?.fixedTime || ''}
                onChange={(event) => setFixedTime(event.target.value)}
                onBlur={() => save.mutate({ fixedTime })}
                className="w-[130px]"
              />
            </label>
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const next = folderId ?? (folders.data?.items[0]?.id ?? null);
                  setFolderId(next);
                }}
              >
                <Settings2 className="h-3.5 w-3.5" /> {t('Change Folder')}
              </Button>
              <Button size="sm" variant="danger" onClick={() => save.mutate({ folderId: null })}>
                {t('Disable')}
              </Button>
            </div>
          </div>
          {folderId !== null ? (
            <div className="mt-3 flex items-end gap-2 border-t border-border pt-3">
              <Field label={t('Change Folder')}>
                <Select
                  value={folderId}
                  onChange={(event) => setFolderId(Number(event.target.value))}
                >
                  {(folders.data?.items ?? []).map((folder) => (
                    <option key={folder.id} value={folder.id}>
                      {folder.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button size="sm" variant="primary" onClick={() => save.mutate({ folderId })}>
                {t('Save')}
              </Button>
            </div>
          ) : null}
        </Card>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Updates ({data.count})</h2>
          <Button
            size="sm"
            variant="ghost"
            disabled={data.updates.length === 0}
            onClick={() => markAll.mutate()}
          >
            <Check className="h-3.5 w-3.5" /> {t('Mark all as read')}
          </Button>
        </div>
        {data.updates.length === 0 ? (
          <EmptyState title={t('No updates found')} />
        ) : (
          <div className="flex flex-col gap-2">
            {data.updates.map((item) => (
              <div
                key={`${item.id}:${item.comicType}`}
                className="flex items-center gap-3 rounded-card border border-border bg-surface p-3"
              >
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/comic/${item.sourceKey}/${item.id}`)}
                >
                  <p className="truncate text-[13px] font-medium">{item.title}</p>
                  <p className="truncate text-[11px] text-muted">
                    {item.lastUpdateTime ?? item.favoritedAt}
                  </p>
                </button>
                <Button size="sm" variant="ghost" onClick={() => markOne.mutate(item)}>
                  {t('Mark latest as read')}
                </Button>
              </div>
            ))}
          </div>
        )}

        <h2 className="mb-3 mt-8 text-[15px] font-semibold">{t('All Comics')}</h2>
        {data.comics.length === 0 ? (
          <EmptyState title={t('No data')} />
        ) : (
          <ComicGrid
            comics={data.comics.map((item) => ({
              id: item.id,
              title: item.title,
              subtitle: item.subtitle,
              cover: item.cover,
              tags: [],
              description: '',
              sourceKey: item.sourceKey ?? '',
              comicType: item.comicType,
            }))}
            onOpen={(comic) => navigate(`/comic/${comic.sourceKey}/${comic.id}`)}
          />
        )}
      </PageBody>
    </>
  );
}
