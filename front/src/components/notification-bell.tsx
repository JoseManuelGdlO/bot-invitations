import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { api } from "@/lib/api/client";
import { formatRelative } from "@/lib/event-ops";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export interface LaunchNotice {
  id: string;
  kind: "campaign" | "reminder" | "followup" | string;
  title: string;
  body: string;
  href: string | null;
  readAt: string | null;
  createdAt: string | null;
}

export function NotificationBell({
  side = "right",
  tone = "sidebar",
}: {
  side?: "right" | "bottom";
  tone?: "sidebar" | "header";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<LaunchNotice[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancel = false;
    const load = () => {
      api<{ count: number }>("/notifications/unread", { cache: "no-store" })
        .then((res) => {
          if (!cancel) setUnread(res.count || 0);
        })
        .catch(() => undefined);
    };
    load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
  }, []);

  async function loadList() {
    setLoading(true);
    try {
      const res = await api<{ items: LaunchNotice[]; unread: number }>("/notifications", { cache: "no-store" });
      setItems(res.items || []);
      setUnread(res.unread || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function markRead(id: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, readAt: item.readAt || new Date().toISOString() } : item)),
    );
    setUnread((count) => Math.max(0, count - 1));
    try {
      await api(`/notifications/${id}/read`, { method: "POST" });
    } catch {
      /* el listado se vuelve a pedir al abrir */
    }
  }

  async function markAll() {
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
    setUnread(0);
    try {
      await api("/notifications/read-all", { method: "POST" });
    } catch {
      /* noop */
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void loadList();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative rounded-md p-1.5 transition-colors",
            tone === "sidebar"
              ? "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : "Avisos"}
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-semibold leading-none text-gold-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent side={side} align={side === "bottom" ? "end" : "start"} className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-medium">Avisos</p>
          {unread > 0 ? (
            <button type="button" className="text-xs text-gold hover:underline" onClick={() => void markAll()}>
              Marcar leídos
            </button>
          ) : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">Cargando avisos…</p>
          ) : null}
          {!loading && items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No tienes avisos por ahora.</p>
          ) : null}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cn(
                "block w-full border-b px-3 py-2.5 text-left last:border-b-0 hover:bg-accent",
                !item.readAt && "bg-gold-soft/40",
              )}
              onClick={() => {
                if (!item.readAt) void markRead(item.id);
                setOpen(false);
                if (item.href) void router.history.push(item.href);
              }}
            >
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
              {item.createdAt ? (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatRelative(new Date(item.createdAt))}
                </p>
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
