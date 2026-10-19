import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Github, RefreshCw, Send } from 'lucide-react';
import { api } from '../lib/api';
import { toast } from '../lib/store';
import { useT } from '../lib/i18n';
import { PageBody, PageHeader } from '../components/PageHeader';
import { Badge, Button, Card } from '../components/ui';

export default function AboutPage() {
  const t = useT();
  const health = useQuery({ queryKey: ['health'], queryFn: api.health });

  return (
    <>
      <PageHeader title={t('About')} />
      <PageBody className="max-w-[700px]">
        <Card className="mb-4 flex items-center gap-4 p-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-card bg-accent text-2xl font-bold text-white">
            V
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[18px] font-semibold">Venera Prime Server</h1>
            <p className="text-[12px] text-muted">
              Multi-user web comic reader · server {health.data?.version ?? '…'}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge tone="success">Online</Badge>
              <Badge>Uptime {health.data?.uptime ?? 0}s</Badge>
              <Badge>{health.data?.initialized ? 'Initialized' : 'Not initialized'}</Badge>
            </div>
          </div>
        </Card>

        <Card className="mb-4 p-4">
          <h2 className="mb-2 text-[15px] font-semibold">Features</h2>
          <ul className="grid grid-cols-1 gap-1 text-[13px] text-muted sm:grid-cols-2">
            <li>• Multi-user accounts and isolation</li>
            <li>• JavaScript comic sources (QuickJS)</li>
            <li>• Search, explore, categories and ranking</li>
            <li>• Favorites, history, read later, statistics</li>
            <li>• Server-side downloads and local library</li>
            <li>• Upload, CBZ/PDF/EPUB export</li>
            <li>• WebDAV backup and restore</li>
            <li>• Reader: gallery and continuous modes</li>
          </ul>
        </Card>

        <Card className="mb-4 p-4">
          <h2 className="mb-3 text-[15px] font-semibold">Links</h2>
          <div className="flex flex-col gap-2">
            <a
              className="flex items-center gap-2 text-[13px] text-accent hover:underline"
              href="https://github.com/venera-app/venera-prime"
              target="_blank"
              rel="noreferrer"
            >
              <Github className="h-4 w-4" /> Original Venera Prime project
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              className="flex items-center gap-2 text-[13px] text-accent hover:underline"
              href="https://t.me/venera_app"
              target="_blank"
              rel="noreferrer"
            >
              <Send className="h-4 w-4" /> Telegram group chat
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </Card>

        <Card className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="text-[13px] font-medium">{t('Check for updates')}</p>
            <p className="text-[11px] text-muted">
              Server updates are deployed by pulling a new container image.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => toast.success('You are on the latest version')}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Check
          </Button>
        </Card>

        <p className="mt-6 text-center text-[11px] text-muted">
          Original app © venera-app contributors. This server port keeps the original labels and
          behavior; see README for deployment details.
        </p>
      </PageBody>
    </>
  );
}
