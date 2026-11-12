import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CalendarHeart,
  CircleDollarSign,
  CreditCard,
  FileStack,
  Headset,
  LayoutDashboard,
  LogOut,
  MessagesSquare,
  Settings2,
  Shield,
  Smartphone,
} from "lucide-react";
import { PlanUsageHint } from "@/components/plan-limit";
import { api } from "@/lib/api/client";
import logo from "@/assets/alanna-logo.png";
import { initialsFrom, useStore } from "@/lib/mock/store";
import { coverStyle } from "@/lib/cover";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { HelpBot } from "@/components/help-bot";
import { NotificationBell } from "@/components/notification-bell";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  resolveSidebarMode,
  sidebarAsideVisible,
  sidebarIconOnly,
  sidebarNeedsBackdrop,
  sidebarNeedsHeaderBrand,
  sidebarShowsLabels,
} from "@/lib/sidebar-shell";

export const Route = createFileRoute("/eventos")({
  component: AppShell,
});

function AppShell() {
  const { session, hydrated, logout, events, eventAccess } = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [supportUnread, setSupportUnread] = useState(0);
  const eventSlug = pathname.match(/^\/eventos\/([^/]+)/)?.[1];
  const reservedShell = new Set([
    "nuevo",
    "whatsapp",
    "costos",
    "plantillas",
    "suscripcion",
    "soporte",
  ]);
  const sidebarRole =
    eventSlug && !reservedShell.has(eventSlug)
      ? eventAccess[eventSlug]?.role
      : null;

  useEffect(() => {
    if (hydrated && !session)
      navigate({ to: "/iniciar-sesion", search: { email: undefined } });
  }, [hydrated, session, navigate]);

  useEffect(() => {
    if (!session) return;
    api<{ count: number }>("/support/unread")
      .then((res) => setSupportUnread(res.count))
      .catch(() => undefined);
  }, [session, pathname]);

  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  const mode = resolveSidebarMode(isMobile, sidebarOpen);
  const showLabels = sidebarShowsLabels(mode);
  const iconOnly = sidebarIconOnly(mode);
  const showAside = sidebarAsideVisible(mode);
  const showBackdrop = sidebarNeedsBackdrop(mode);
  const showHeaderBrand = sidebarNeedsHeaderBrand(mode);

  const toggleSidebar = () => setSidebarOpen((value) => !value);
  const closeSidebar = () => setSidebarOpen(false);
  const onNavClick = () => {
    if (isMobile) closeSidebar();
  };

  if (!hydrated || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-4 px-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  const navItemClass = cn(
    "flex items-center rounded-lg text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
    iconOnly ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2",
  );
  const navActiveClass = "bg-sidebar-accent font-medium text-sidebar-foreground";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {showBackdrop ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40"
          aria-label="Cerrar menú"
          onClick={closeSidebar}
        />
      ) : null}

      {showAside ? (
        <aside
          id="app-sidebar"
          className={cn(
            "flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
            iconOnly && "sticky top-0 z-30 w-14",
            mode === "mobile-full" &&
              "fixed inset-y-0 left-0 z-50 w-64 shadow-lg",
            mode === "desktop-open" && "sticky top-0 w-64",
          )}
        >
          <div
            className={cn(
              "flex items-center py-6",
              iconOnly ? "flex-col gap-3 px-2" : "gap-2.5 px-5",
            )}
          >
            <button
              type="button"
              onClick={toggleSidebar}
              aria-expanded={sidebarOpen}
              aria-controls="app-sidebar"
              className={cn(
                "flex min-w-0 items-center rounded-lg text-left transition-colors hover:bg-sidebar-accent",
                iconOnly ? "justify-center p-1" : "flex-1 gap-2.5",
              )}
            >
              <img
                src={logo}
                alt="Logotipo de Alanna Confirmaciones"
                width={32}
                height={32}
                className="size-8 shrink-0 rounded-lg bg-primary object-contain p-1"
              />
              {showLabels ? (
                <div className="min-w-0 flex-1">
                  <span className="font-display text-xl leading-none">
                    Alanna
                  </span>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gold">
                    Confirmaciones
                  </p>
                </div>
              ) : null}
            </button>
            {showLabels ? <NotificationBell /> : null}
          </div>

          <nav className={cn("space-y-1", iconOnly ? "px-1.5" : "px-3")}>
            <Link
              to="/eventos"
              activeOptions={{ exact: true }}
              onClick={onNavClick}
              aria-label="Panel general"
              className={navItemClass}
              activeProps={{ className: navActiveClass }}
            >
              <LayoutDashboard className="size-4 shrink-0" />
              {showLabels ? <span>Panel general</span> : null}
            </Link>
            {session.isAdmin || session.usage?.canCreateEvent ? (
              <Link
                to="/eventos/nuevo"
                onClick={onNavClick}
                aria-label="Crear evento"
                className={navItemClass}
                activeProps={{ className: navActiveClass }}
              >
                <CalendarHeart className="size-4 shrink-0" />
                {showLabels ? <span>Crear evento</span> : null}
              </Link>
            ) : null}
            <Link
              to="/eventos/whatsapp"
              onClick={onNavClick}
              aria-label="WhatsApp"
              className={navItemClass}
              activeProps={{ className: navActiveClass }}
            >
              <Smartphone className="size-4 shrink-0" />
              {showLabels ? <span>WhatsApp</span> : null}
            </Link>
            <Link
              to="/eventos/costos"
              onClick={onNavClick}
              aria-label="Costos"
              className={navItemClass}
              activeProps={{ className: navActiveClass }}
            >
              <CircleDollarSign className="size-4 shrink-0" />
              {showLabels ? <span>Costos</span> : null}
            </Link>
            <Link
              to="/eventos/plantillas"
              onClick={onNavClick}
              aria-label="Plantillas"
              className={navItemClass}
              activeProps={{ className: navActiveClass }}
            >
              <FileStack className="size-4 shrink-0" />
              {showLabels ? <span>Plantillas</span> : null}
            </Link>
            {session.plan ? (
              <Link
                to="/eventos/suscripcion"
                onClick={onNavClick}
                aria-label="Suscripción"
                className={navItemClass}
                activeProps={{ className: navActiveClass }}
              >
                <CreditCard className="size-4 shrink-0" />
                {showLabels ? <span>Suscripción</span> : null}
                {showLabels && session.cancellation?.status === "pending" ? (
                  <span className="ml-auto rounded-full bg-gold px-1.5 text-[10px] font-semibold text-gold-foreground">
                    1
                  </span>
                ) : null}
              </Link>
            ) : null}
            <Link
              to="/eventos/soporte"
              onClick={onNavClick}
              aria-label="Soporte"
              className={navItemClass}
              activeProps={{ className: navActiveClass }}
            >
              <Headset className="size-4 shrink-0" />
              {showLabels ? <span>Soporte</span> : null}
              {showLabels && supportUnread > 0 ? (
                <span className="ml-auto rounded-full bg-gold px-1.5 text-[10px] font-semibold text-gold-foreground">
                  {supportUnread}
                </span>
              ) : null}
            </Link>
            {session.isAdmin ? (
              <Link
                to="/admin"
                onClick={onNavClick}
                aria-label="Backoffice"
                className={navItemClass}
                activeProps={{ className: navActiveClass }}
              >
                <Shield className="size-4 shrink-0" />
                {showLabels ? <span>Backoffice</span> : null}
              </Link>
            ) : null}
          </nav>

          {showLabels ? (
            <div className="mt-6 px-5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Mis eventos
            </div>
          ) : (
            <div className="mt-4 border-t border-sidebar-border" />
          )}
          <nav
            className={cn(
              "mt-2 flex-1 space-y-0.5 overflow-y-auto pb-4",
              iconOnly ? "px-1.5" : "px-3",
            )}
          >
            {events.map((e) => {
              const active = pathname.includes(`/eventos/${e.id}`);
              return (
                <Link
                  key={e.id}
                  to="/eventos/$eventId/resumen"
                  params={{ eventId: e.id }}
                  onClick={onNavClick}
                  aria-label={e.name}
                  className={cn(
                    "flex items-center rounded-lg text-sm transition-colors hover:bg-sidebar-accent",
                    iconOnly ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2",
                    active
                      ? "bg-sidebar-accent font-medium"
                      : "text-sidebar-foreground/75",
                  )}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-primary/70"
                    style={coverStyle(e.cover)}
                  >
                    {e.shortName}
                  </span>
                  {showLabels ? (
                    <span className="truncate">{e.name}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div
            className={cn(
              "border-t border-sidebar-border",
              iconOnly ? "p-1.5" : "p-3",
            )}
          >
            <div
              className={cn(
                "flex items-center rounded-lg",
                iconOnly
                  ? "flex-col gap-2 px-0 py-2"
                  : "gap-2.5 px-2 py-2",
              )}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-soft text-xs font-semibold text-gold-foreground">
                {initialsFrom(session.name)}
              </span>
              {showLabels ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{session.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {session.plan
                      ? `Plan ${session.plan.name}`
                      : sidebarRole || session.role}
                  </p>
                  <PlanUsageHint session={session} />
                  {!session.isAdmin && session.plan ? (
                    <Link
                      to="/eventos/suscripcion"
                      onClick={onNavClick}
                      className="mt-1 flex items-center gap-1 text-[11px] text-gold hover:underline"
                    >
                      <CreditCard className="size-3" /> Gestionar suscripción
                    </Link>
                  ) : null}
                </div>
              ) : null}
              <button
                onClick={() => {
                  logout();
                  navigate({ to: "/" });
                }}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label="Cerrar sesión"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          </div>
        </aside>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {showHeaderBrand ? (
          <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 py-3 backdrop-blur">
            <button
              type="button"
              onClick={toggleSidebar}
              aria-expanded={sidebarOpen}
              aria-controls="app-sidebar"
              className="flex items-center gap-2 rounded-md text-left transition-colors hover:bg-secondary/80"
            >
              <img
                src={logo}
                alt="Logotipo de Alanna Confirmaciones"
                width={20}
                height={20}
                className="size-5 rounded-md bg-primary object-contain p-0.5"
              />
              <span className="font-display text-lg">Alanna</span>
            </button>
            <div className="ml-auto flex items-center gap-2 text-muted-foreground">
              <NotificationBell side="bottom" tone="header" />
              <Link
                to="/eventos/soporte"
                className="relative rounded-md p-1 hover:text-foreground"
                aria-label="Soporte"
              >
                <Headset className="size-4" />
                {supportUnread > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 size-1.5 rounded-full bg-gold" />
                ) : null}
              </Link>
              <MessagesSquare className="size-4" />
              <Settings2 className="size-4" />
            </div>
          </header>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </div>
      </div>
      <HelpBot />
    </div>
  );
}
