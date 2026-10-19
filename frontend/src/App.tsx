import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api } from './lib/api';
import { applyTheme, useAppStore } from './lib/store';
import { ToastHost, Spinner } from './components/ui';
import { AppShell } from './components/AppShell';
import InitPage from './routes/InitPage';
import LoginPage from './routes/LoginPage';
import HomePage from './routes/HomePage';
import SearchPage from './routes/SearchPage';
import SearchResultPage from './routes/SearchResultPage';
import AggregatedSearchPage from './routes/AggregatedSearchPage';
import ExplorePage from './routes/ExplorePage';
import CategoriesPage from './routes/CategoriesPage';
import CategoryComicsPage from './routes/CategoryComicsPage';
import RankingPage from './routes/RankingPage';
import ComicDetailPage from './routes/ComicDetailPage';
import ReaderPage from './routes/ReaderPage';
import FavoritesPage from './routes/FavoritesPage';
import HistoryPage from './routes/HistoryPage';
import ReadLaterPage from './routes/ReadLaterPage';
import FollowUpdatesPage from './routes/FollowUpdatesPage';
import DownloadsPage from './routes/DownloadsPage';
import LocalComicsPage from './routes/LocalComicsPage';
import ImageFavoritesPage from './routes/ImageFavoritesPage';
import StatisticsPage from './routes/StatisticsPage';
import SourcesPage from './routes/SourcesPage';
import SourceDetailPage from './routes/SourceDetailPage';
import SourceLibrariesPage from './routes/SourceLibrariesPage';
import SourceLibraryPage from './routes/SourceLibraryPage';
import SettingsPage from './routes/SettingsPage';
import SettingsCategoryPage from './routes/SettingsCategoryPage';
import HomeLayoutPage from './routes/HomeLayoutPage';
import PageFilterPage from './routes/PageFilterPage';
import BlockedWordsPage from './routes/BlockedWordsPage';
import WebDavPage from './routes/WebDavPage';
import LogsPage from './routes/LogsPage';
import AdminUsersPage from './routes/AdminUsersPage';
import TasksPage from './routes/TasksPage';
import ToolboxPage from './routes/ToolboxPage';
import AboutPage from './routes/AboutPage';
import RandomPage from './routes/RandomPage';
import NotFoundPage from './routes/NotFoundPage';

function Protected({ children }: { children: React.ReactNode }) {
  const initialized = useAppStore((state) => state.initialized);
  const user = useAppStore((state) => state.user);
  if (!initialized) return <Navigate to="/init" replace />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const bootstrapped = useAppStore((state) => state.bootstrapped);
  const initialized = useAppStore((state) => state.initialized);
  const user = useAppStore((state) => state.user);
  const settings = useAppStore((state) => state.settings);
  const setBootstrapped = useAppStore((state) => state.setBootstrapped);
  const setInitialized = useAppStore((state) => state.setInitialized);
  const setUser = useAppStore((state) => state.setUser);
  const setSettings = useAppStore((state) => state.setSettings);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.initStatus();
        if (cancelled) return;
        setInitialized(status.initialized);
        if (status.initialized) {
          try {
            const me = await api.me();
            if (cancelled) return;
            setUser(me.user);
            const loaded = await api.settings();
            if (!cancelled) setSettings(loaded);
          } catch {
            // Not logged in yet.
          }
        }
      } catch {
        // The server is unreachable; show the init screen with an error.
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setBootstrapped, setInitialized, setSettings, setUser]);

  useEffect(() => {
    applyTheme(settings);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => applyTheme(settings);
    media.addEventListener?.('change', listener);
    return () => media.removeEventListener?.('change', listener);
  }, [settings]);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('venera:unauthorized', onUnauthorized);
    return () => window.removeEventListener('venera:unauthorized', onUnauthorized);
  }, [setUser]);

  if (!bootstrapped) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-bg">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route
          path="/init"
          element={
            initialized && !user ? (
              <Navigate to="/login" replace />
            ) : initialized && user ? (
              <Navigate to="/" replace />
            ) : (
              <InitPage />
            )
          }
        />
        <Route
          path="/login"
          element={user ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/reader/:source/:id"
          element={
            <Protected>
              <ReaderPage />
            </Protected>
          }
        />
        <Route
          path="/reader/local/:id"
          element={
            <Protected>
              <ReaderPage />
            </Protected>
          }
        />
        <Route
          element={
            <Protected>
              <AppShell />
            </Protected>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="search/result" element={<SearchResultPage />} />
          <Route path="search/aggregated" element={<AggregatedSearchPage />} />
          <Route path="explore" element={<ExplorePage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="categories/:key/ranking" element={<RankingPage />} />
          <Route path="categories/:key/:category" element={<CategoryComicsPage />} />
          <Route path="comic/:source/:id" element={<ComicDetailPage />} />
          <Route path="favorites/*" element={<FavoritesPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="read-later" element={<ReadLaterPage />} />
          <Route path="follow-updates" element={<FollowUpdatesPage />} />
          <Route path="downloads" element={<DownloadsPage />} />
          <Route path="local" element={<LocalComicsPage />} />
          <Route path="local/import" element={<LocalComicsPage />} />
          <Route path="image-favorites" element={<ImageFavoritesPage />} />
          <Route path="statistics" element={<StatisticsPage />} />
          <Route path="random" element={<RandomPage />} />
          <Route path="sources" element={<SourcesPage />} />
          <Route path="sources/libraries" element={<SourceLibrariesPage />} />
          <Route path="sources/libraries/:id" element={<SourceLibraryPage />} />
          <Route path="sources/:key" element={<SourceDetailPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="settings/reading/image-processing"
            element={<SettingsCategoryPage />}
          />
          <Route path="settings/:category" element={<SettingsCategoryPage />} />
          <Route path="settings/home-layout" element={<HomeLayoutPage />} />
          <Route path="settings/explore-pages" element={<PageFilterPage kind="explore" />} />
          <Route path="settings/category-pages" element={<PageFilterPage kind="categories" />} />
          <Route path="settings/favorites-pages" element={<PageFilterPage kind="favorites" />} />
          <Route path="settings/search-sources" element={<PageFilterPage kind="search" />} />
          <Route path="settings/blocked-words" element={<BlockedWordsPage kind="words" />} />
          <Route path="settings/blocked-comments" element={<BlockedWordsPage kind="comments" />} />
          <Route path="settings/webdav" element={<WebDavPage />} />
          <Route path="settings/logs" element={<LogsPage />} />
          <Route path="settings/about" element={<AboutPage />} />
          <Route path="admin/users" element={<AdminUsersPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="toolbox" element={<ToolboxPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
      <ToastHost />
    </>
  );
}
