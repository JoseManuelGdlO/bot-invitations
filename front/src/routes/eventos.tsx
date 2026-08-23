import { Link, Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { CalendarHeart, LayoutDashboard, LogOut, MessagesSquare, Settings2 } from "lucide-react";
import logo from "@/assets/alanna-logo.png";
import { useStore } from "@/lib/mock/store";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/eventos")({
  component: AppShell,
});

function AppShell() {
  const { session, hydrated, logout, events } = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (hydrated && !session) navigate({ to: "/" });
  }, [hydrated, session, navigate]);

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

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-5 py-6">
          <img
            src={logo}
            alt="Alanna"
            width={32}
            height={32}
            className="size-8 rounded-lg bg-primary object-contain p-1"
          />
          <div>
            <span className="font-display text-xl leading-none">Alanna</span>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gold">
              Confirmaciones
            </p>
          </div>
        </div>

        <nav className="space-y-1 px-3">
          <Link
            to="/eventos"
            activeOptions={{ exact: true }}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
            )}
            activeProps={{ className: "bg-sidebar-accent font-medium text-sidebar-foreground" }}
          >
            <LayoutDashboard className="size-4" /> Panel general
          </Link>
          <Link
            to="/eventos/nuevo"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
            activeProps={{ className: "bg-sidebar-accent font-medium text-sidebar-foreground" }}
          >
            <CalendarHeart className="size-4" /> Crear evento
          </Link>
        </nav>

        <div className="mt-6 px-5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Mis eventos
        </div>
        <nav className="mt-2 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {events.map((e) => {
            const active = pathname.includes(`/eventos/${e.id}`);
            return (
              <Link
                key={e.id}
                to="/eventos/$eventId/resumen"
                params={{ eventId: e.id }}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
                  active ? "bg-sidebar-accent font-medium" : "text-sidebar-foreground/75",
                )}
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-primary/70"
                  style={{ background: e.cover }}
                >
                  {e.shortName}
                </span>
                <span className="truncate">{e.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-gold-soft text-xs font-semibold text-gold-foreground">
              JM
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{session.role}</p>
            </div>
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-card/60 px-4 py-3 backdrop-blur md:hidden">
          <img
            src={logo}
            alt="Alanna"
            width={20}
            height={20}
            className="size-5 rounded-md bg-primary object-contain p-0.5"
          />
          <span className="font-display text-lg">Alanna</span>
          <div className="ml-auto flex items-center gap-2 text-muted-foreground">
            <MessagesSquare className="size-4" />
            <Settings2 className="size-4" />
          </div>
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
