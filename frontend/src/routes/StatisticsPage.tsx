import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore, toast } from '../lib/store';
import { useT, formatDuration, formatSecondsShort } from '../lib/i18n';
import { formatDate } from '../lib/utils';
import { PageBody, PageHeader } from '../components/PageHeader';
import {
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Menu,
  Select,
  Spinner,
  Switch,
} from '../components/ui';

export default function StatisticsPage() {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);
  const [sort, setSort] = useState('recent');
  const [clearOpen, setClearOpen] = useState(false);

  const query = useQuery({ queryKey: ['statistics'], queryFn: () => api.statistics(30) });

  const clear = useMutation({
    mutationFn: api.clearStatistics,
    onSuccess: () => {
      toast.success('Cleared');
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: ({ comicType, id }: { comicType: number; id: string }) =>
      api.deleteStatistics(comicType, id),
    onSuccess: () => {
      toast.success('Deleted');
      queryClient.invalidateQueries({ queryKey: ['statistics'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleRecording = async (value: boolean) => {
    try {
      setSettings(await api.updateSettings({ recordReadingStatistics: value }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const data = query.data;
  const recent = useMemo(() => {
    const items = [...(data?.recent ?? [])];
    if (sort === 'duration') items.sort((a, b) => b.seconds - a.seconds);
    else if (sort === 'name') items.sort((a, b) => a.title.localeCompare(b.title));
    else items.sort((a, b) => b.lastReadAt - a.lastReadAt);
    return items;
  }, [data?.recent, sort]);

  const max = Math.max(1, ...(data?.daily.map((day) => day.seconds) ?? [1]));

  return (
    <>
      <PageHeader
        title={t('Reading statistics')}
        actions={
          <IconButton
            label={t('Clear all statistics')}
            disabled={(data?.totalSeconds ?? 0) === 0}
            onClick={() => setClearOpen(true)}
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        }
      />
      <PageBody>
        <Card className="mb-6 flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-[13px] font-medium">{t('Record reading statistics')}</p>
            <p className="text-[11px] text-muted">
              {settings.recordReadingStatistics === false
                ? 'Paused; new reading activity will not be recorded.'
                : 'Reading sessions are recorded per day.'}
            </p>
          </div>
          <Switch
            checked={settings.recordReadingStatistics !== false}
            onChange={toggleRecording}
          />
        </Card>

        {query.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : !data ? (
          <EmptyState title={t('No reading data')} />
        ) : (
          <>
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label={t('Today')} value={formatDuration(data.todaySeconds)} />
              <StatCard label={t('Last 7 days')} value={formatDuration(data.weekSeconds)} />
              <StatCard label={t('Total')} value={formatDuration(data.totalSeconds)} />
            </div>

            <Card className="mb-6 p-4">
              <h2 className="mb-3 text-[15px] font-semibold">{t('Reading trend')}</h2>
              <div className="flex h-40 items-end gap-2">
                {data.daily.map((day) => (
                  <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[9px] tabular text-muted">
                      {day.seconds > 0 ? formatSecondsShort(day.seconds) : ''}
                    </span>
                    <div
                      className="w-full rounded-t bg-accent/70 transition-[height] duration-300"
                      style={{ height: `${Math.max(4, (day.seconds / max) * 120)}px` }}
                      title={formatDuration(day.seconds)}
                    />
                    <span className="text-[9px] text-muted">{day.day.slice(5)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold">{t('Recent comics')}</h2>
              <Select value={sort} onChange={(event) => setSort(event.target.value)} className="w-[150px]">
                <option value="recent">Recent</option>
                <option value="duration">Duration</option>
                <option value="name">Name</option>
              </Select>
            </div>

            {recent.length === 0 ? (
              <EmptyState title={t('No reading data')} />
            ) : (
              <div className="overflow-hidden rounded-card border border-border bg-surface">
                {recent.map((item) => (
                  <div
                    key={`${item.id}:${item.comicType}`}
                    className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() =>
                        item.comicType === 0
                          ? navigate(`/reader/local/${item.id}`)
                          : navigate(`/comic/${item.sourceKey ?? ''}/${item.id}`)
                      }
                    >
                      <p className="truncate text-[13px] font-medium">{item.title}</p>
                      <p className="truncate text-[11px] text-muted">
                        {item.author} · {formatDate(item.lastReadAt)}
                      </p>
                    </button>
                    <span className="text-[12px] tabular text-muted">
                      {formatDuration(item.seconds)}
                    </span>
                    <Menu
                      trigger={({ onClick, ...rest }) => (
                        <IconButton label="More" onClick={onClick} {...rest}>
                          <MoreHorizontal className="h-4 w-4" />
                        </IconButton>
                      )}
                      items={[
                        {
                          label: t('Delete statistics'),
                          danger: true,
                          onSelect: () =>
                            remove.mutate({ comicType: item.comicType, id: item.id }),
                        },
                      ]}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </PageBody>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title={t('Clear all reading statistics?')}
        confirmLabel={t('Clear all statistics')}
        danger
        onConfirm={() => clear.mutate()}
      />
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-[22px] font-semibold tabular">{value}</p>
    </Card>
  );
}
