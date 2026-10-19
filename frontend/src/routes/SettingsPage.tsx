import { Link } from 'react-router-dom';
import {
  AppWindow,
  Bug,
  Compass,
  Info,
  LayoutGrid,
  Network,
  Palette,
  ScrollText,
  Server,
  Settings2,
  Star,
  Users,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import { useT } from '../lib/i18n';
import { PageBody, PageHeader } from '../components/PageHeader';
import { Card } from '../components/ui';

export default function SettingsPage() {
  const t = useT();
  const user = useAppStore((state) => state.user);

  const categories = [
    { to: '/settings/explore', title: t('Explore'), description: 'Search, tile layout, blocking, page filters', icon: Compass },
    { to: '/settings/reading', title: t('Reading'), description: 'Reader modes, gestures, appearance, preload', icon: ScrollText },
    { to: '/settings/appearance', title: t('Appearance'), description: 'Theme mode, accent color, home layout', icon: Palette },
    { to: '/settings/local-favorites', title: t('Local Favorites'), description: 'Folders, quick favorite, click behavior', icon: Star },
    { to: '/settings/app', title: t('APP'), description: 'Language, cache, backup, sync, statistics', icon: AppWindow },
    { to: '/settings/network', title: t('Network'), description: 'Proxy, DNS overrides, download threads', icon: Network },
    { to: '/settings/home-layout', title: t('Customize home'), description: 'Reorder and hide home modules', icon: LayoutGrid },
    { to: '/settings/webdav', title: t('Data Sync'), description: 'WebDAV backup and restore', icon: Server },
    { to: '/settings/about', title: t('About'), description: 'Version, links, updates', icon: Info },
    { to: '/settings/logs', title: t('Logs'), description: 'Request and application logs', icon: Settings2 },
    { to: '/settings/debug', title: t('Debug'), description: 'Reload sources, JS evaluator, certificates', icon: Bug },
    ...(user?.role === 'admin'
      ? [{ to: '/admin/users', title: t('Admin'), description: 'Create, disable and delete users', icon: Users }]
      : []),
  ];

  return (
    <>
      <PageHeader title={t('Settings')} back={false} />
      <PageBody className="max-w-[900px]">
        <div className="flex flex-col gap-2">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Link key={category.to} to={category.to}>
                <Card className="flex items-center gap-3 p-4 transition-colors duration-100 hover:border-accent/40 hover:bg-accent/5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface2 text-muted">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{category.title}</p>
                    <p className="truncate text-[12px] text-muted">{category.description}</p>
                  </div>
                  <span className="text-muted">›</span>
                </Card>
              </Link>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}
