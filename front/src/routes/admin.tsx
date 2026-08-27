import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Ban,
  Headset,
  LayoutDashboard,
  LogOut,
  Package,
  Users,
  Wallet,
} from "lucide-react";
import logo from "@/assets/alanna-logo.png";
import { initialsFrom, useStore } from "@/lib/mock/store";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { pageHead } from "@/lib/seo";
import { api } from "@/lib/api/client";

export const Route = createFileRoute("/admin")({
  head: () =>
    pageHead({
      title: "Backoffice · Alanna Confirmaciones",
      description: "Administración de clientes y planes de Alanna.",
      path: "/admin",
      noindex: true,
    }),
  component: AdminShell,
});

function AdminShell() {
  const { session, hydrated, logout } = useStore();
  const navigate = useNavigate();
  const [supportUnread, setSupportUnread] = useState(0);
  const [cancelUnread, setCancelUnread] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) navigate({ to: "/iniciar-sesion" });
    else if (!session.isAdmin) navigate({ to: "/eventos" });
  }, [hydrated, session, navigate]);

  useEffect(() => {
    if (!session?.isAdmin) return;
    api<{ count: number }>("/admin/support/unread")
      .then((res) => setSupportUnread(res.count))
      .catch(() => undefined);
    api<{ count: number }>("/admin/cancellations/unread")
      .then((res) => setCancelUnread(res.count))
      .catch(() => undefined);
  }, [session?.isAdmin]);

  if (!hydrated || !session?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-md space-y-4 px-6">
          <Skeleton className="h-8 w-40" />
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
            alt="Logotipo de Alanna Confirmaciones"
            width={32}
            height={32}
            className="size-8 rounded-lg bg-primary object-contain p-1"
          />
          <div>
            <span className="font-display text-xl leading-none">Alanna</span>
            <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-gold">
              Backoffice
            </p>
          </div>
        </div>
        <nav className="space-y-1 px-3">
          <Link
            to="/admin"
            activeOptions={{ exact: true }}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent",
            )}
            activeProps={{
              className:
                "bg-sidebar-accent font-medium text-sidebar-foreground",
            }}
          >
            <LayoutDashboard className="size-4" /> Resumen
          </Link>
          <Link
            to="/admin/clientes"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
            activeProps={{
              className:
                "bg-sidebar-accent font-medium text-sidebar-foreground",
            }}
          >
            <Users className="size-4" /> Clientes
          </Link>
          <Link
            to="/admin/finanzas"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
            activeProps={{
              className:
                "bg-sidebar-accent font-medium text-sidebar-foreground",
            }}
          >
            <Wallet className="size-4" /> Finanzas
          </Link>
          <Link
            to="/admin/cancelaciones"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
            activeProps={{
              className:
                "bg-sidebar-accent font-medium text-sidebar-foreground",
            }}
          >
            <Ban className="size-4" /> Cancelaciones
            {cancelUnread > 0 ? (
              <span className="ml-auto rounded-full bg-gold px-1.5 text-[10px] font-semibold text-gold-foreground">
                {cancelUnread}
              </span>
            ) : null}
          </Link>
          <Link
            to="/admin/soporte"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
            activeProps={{
              className:
                "bg-sidebar-accent font-medium text-sidebar-foreground",
            }}
          >
            <Headset className="size-4" /> Soporte
            {supportUnread > 0 ? (
              <span className="ml-auto rounded-full bg-gold px-1.5 text-[10px] font-semibold text-gold-foreground">
                {supportUnread}
              </span>
            ) : null}
          </Link>
          <Link
            to="/admin/planes"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent"
            activeProps={{
              className:
                "bg-sidebar-accent font-medium text-sidebar-foreground",
            }}
          >
            <Package className="size-4" /> Planes y precios
          </Link>
        </nav>
        <div className="mt-auto border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex size-8 items-center justify-center rounded-full bg-gold-soft text-xs font-semibold text-gold-foreground">
              {initialsFrom(session.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                Administrador
              </p>
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
