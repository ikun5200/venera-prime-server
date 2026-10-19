import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Copy, Download } from 'lucide-react';
import { api } from '../lib/api';
import { useAppStore, toast } from '../lib/store';
import { useT } from '../lib/i18n';
import { copyText } from '../lib/utils';
import { PageBody, PageHeader } from '../components/PageHeader';
import { Button, Card, EmptyState, Select, Spinner, Tabs } from '../components/ui';

export default function LogsPage() {
  const t = useT();
  const user = useAppStore((state) => state.user);
  const [tab, setTab] = useState<'app' | 'requests'>('app');
  const [level, setLevel] = useState('');
  const query = useQuery({
    queryKey: ['logs'],
    queryFn: api.logs,
    enabled: user?.role === 'admin',
  });

  const items = useMemo(() => {
    const source = tab === 'app' ? query.data?.items ?? [] : query.data?.requests ?? [];
    return level ? source.filter((item) => item.level === level) : source;
  }, [level, query.data?.items, query.data?.requests, tab]);

  const exportLogs = () => {
    const blob = new Blob([JSON.stringify(items, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'venera-logs.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (user?.role !== 'admin') {
    return (
      <PageBody>
        <EmptyState title={t('Logs')} description="Only administrators can view server logs." />
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        title={t('Logs')}
        actions={
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => copyText(JSON.stringify(items, null, 2)).then(() => toast.success('Copied'))}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={exportLogs}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </>
        }
      />
      <PageBody className="max-w-[1000px]">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Tabs
            items={[
              { value: 'app', label: 'Application', count: query.data?.items.length },
              { value: 'requests', label: 'Requests', count: query.data?.requests.length },
            ]}
            value={tab}
            onChange={setTab}
          />
          <Select value={level} onChange={(event) => setLevel(event.target.value)} className="ml-auto w-[140px]">
            <option value="">All levels</option>
            <option value="debug">debug</option>
            <option value="info">info</option>
            <option value="warning">warning</option>
            <option value="error">error</option>
          </Select>
        </div>
        {query.isLoading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : query.isError ? (
          <EmptyState
            title={t('Error')}
            description={query.error instanceof Error ? query.error.message : String(query.error)}
          />
        ) : items.length === 0 ? (
          <EmptyState title={t('No data')} />
        ) : (
          <Card className="divide-y divide-border overflow-hidden font-mono text-[11px]">
            {items.map((item, index) => (
              <div key={index} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 break-all">
                  <span
                    className={
                      item.level === 'error'
                        ? 'text-danger'
                        : item.level === 'warning'
                          ? 'text-warning'
                          : 'text-muted'
                    }
                  >
                    {String(item.level)}
                  </span>
                  <span className="text-muted">{String(item.ts ?? '')}</span>
                  {item.route ? <span>{String(item.route)}</span> : null}
                  {item.status ? <span>{String(item.status)}</span> : null}
                  {item.durationMs !== undefined ? (
                    <span className="text-muted">{String(item.durationMs)}ms</span>
                  ) : null}
                  {item.requestId ? (
                    <span className="ml-auto break-all text-muted">{String(item.requestId)}</span>
                  ) : null}
                </div>
                <p className="mt-0.5 min-w-0 break-all text-fg">
                  {String(item.msg ?? item.message ?? '')}
                  {item.error ? ` — ${String(item.error)}` : ''}
                </p>
              </div>
            ))}
          </Card>
        )}
      </PageBody>
    </>
  );
}
