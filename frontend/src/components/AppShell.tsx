import { useEffect } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bookmark,
  Shapes,
  Compass,
  Home,
  Info,
  ListChecks,
  LogOut,
  Search,
  Settings,
  Wrench,
  Users,
} from "lucide-react";
import { api } from "../lib/api";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";
import { cn } from "../lib/utils";
import { Badge, IconButton } from "./ui";

const navItems = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/favorites", label: "Favorites", icon: Bookmark },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/categories", label: "Categories", icon: Shapes },
];

export function AppShell() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAppStore((state) => state.user);
  const setUser = useAppStore((state) => state.setUser);
  const settings = useAppStore((state) => state.settings);
  const showTasks = settings.showBackgroundTaskButton !== false;
  const tasks = useQuery({
    queryKey: ["tasks"],
    queryFn: api.tasks,
    refetchInterval: (query) => {
      const items =
        (query.state.data as { items?: { status: string }[] } | undefined)
          ?.items ?? [];
      return items.some((task) => task.status === "running") ? 5000 : 60000;
    },
    enabled: showTasks,
  });
  const running = (tasks.data?.items ?? []).filter(
    (task) => task.status === "running",
  ).length;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      navigate("/login");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col border-r border-border bg-surface md:flex xl:w-[240px]">
        <div className="flex h-16 items-center gap-2.5 px-4 xl:px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-accent text-sm font-bold text-white">
            V
          </div>
          <div className="hidden min-w-0 xl:block">
            <p className="truncate text-[14px] font-semibold leading-tight">
              {t("Venera Prime")}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted">
              {t("Comic reader")}
            </p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-2 py-2">
          {navItems.map((item) => (
            <SidebarLink key={item.to} {...item} label={t(item.label)} />
          ))}
          <div className="my-2 border-t border-border" />
          <SidebarAction to="/search" icon={Search} label={t("Search")} />
          <SidebarAction to="/toolbox" icon={Wrench} label={t("Toolbox")} />
          <SidebarAction
            to="/tasks"
            icon={ListChecks}
            label={t("Tasks")}
            badge={running > 0 ? running : undefined}
            hidden={!showTasks}
          />
          <SidebarAction to="/settings" icon={Settings} label={t("Settings")} />
          {user?.role === "admin" ? (
            <SidebarAction to="/admin/users" icon={Users} label={t("Admin")} />
          ) : null}
          <SidebarAction to="/settings/about" icon={Info} label={t("About")} />
        </nav>
        <div className="border-t border-border p-2">
          <div className="flex items-center gap-2 rounded p-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[13px] font-semibold text-accent">
              {user?.username.slice(0, 1).toUpperCase() ?? "?"}
            </div>
            <div className="hidden min-w-0 flex-1 xl:block">
              <p className="truncate text-[13px] font-medium">
                {user?.username}
              </p>
              <p className="text-[10px] uppercase tracking-wide text-muted">
                {user?.role === "admin" ? t("Administrator") : t("Reader")}
              </p>
            </div>
            <IconButton
              label={t("Log out")}
              onClick={logout}
              className="hidden xl:inline-flex"
            >
              <LogOut className="h-4 w-4" />
            </IconButton>
          </div>
          <button
            className="mt-1 flex w-full items-center justify-center rounded p-2 text-muted hover:bg-surface2 hover:text-fg xl:hidden"
            onClick={logout}
            aria-label={t("Log out")}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur-md md:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-accent text-xs font-bold text-white">
          V
        </div>
        <span className="text-[14px] font-semibold">{t("Venera Prime")}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton label={t("Search")} onClick={() => navigate("/search")}>
            <Search className="h-4 w-4" />
          </IconButton>
          {showTasks ? (
            <IconButton
              label={t("Tasks")}
              onClick={() => navigate("/tasks")}
              className="relative"
            >
              <ListChecks className="h-4 w-4" />
              {running > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
              ) : null}
            </IconButton>
          ) : null}
          <IconButton
            label={t("Settings")}
            onClick={() => navigate("/settings")}
          >
            <Settings className="h-4 w-4" />
          </IconButton>
        </div>
      </header>

      <main className="pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0 md:pl-[72px] xl:pl-[240px]">
        <Outlet />
      </main>

      {/* Mobile bottom navigation */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
        aria-label={t("Primary")}
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium",
                  isActive ? "text-accent" : "text-muted",
                )
              }
            >
              <Icon className="h-5 w-5" aria-hidden />
              {t(item.label)}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

function SidebarLink({
  to,
  label,
  icon: Icon,
  end,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded px-3 py-2.5 text-[13px] font-medium transition-colors duration-100",
          isActive
            ? "bg-accent/10 text-accent"
            : "text-muted hover:bg-surface2 hover:text-fg",
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className="hidden xl:block">{label}</span>
    </NavLink>
  );
}

function SidebarAction({
  to,
  label,
  icon: Icon,
  badge,
  hidden = false,
}: {
  to: string;
  label: string;
  icon: typeof Home;
  badge?: number;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded px-3 py-2.5 text-[13px] font-medium transition-colors duration-100",
          isActive
            ? "bg-accent/10 text-accent"
            : "text-muted hover:bg-surface2 hover:text-fg",
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
      <span className="hidden flex-1 xl:block">{label}</span>
      {badge ? (
        <span className="hidden xl:block">
          <Badge tone="accent">{badge}</Badge>
        </span>
      ) : null}
      {badge ? (
        <span className="absolute ml-6 mt-[-18px] h-1.5 w-1.5 rounded-full bg-accent xl:hidden" />
      ) : null}
    </NavLink>
  );
}
