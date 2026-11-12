import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Bot,
  FileSpreadsheet,
  LayoutList,
  MessageSquareText,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { useEvent, useStore } from "@/lib/mock/store";
import { coverStyle } from "@/lib/cover";
import { formatDate } from "@/lib/mock/format";
import { cn } from "@/lib/utils";
import { EventStatusBadge } from "@/components/event-status-badge";
import { eventTabAllowed } from "@/lib/permissions";
import { useIsShortHeight } from "@/hooks/use-short-height";

export const Route = createFileRoute("/eventos/$eventId")({
  component: EventLayout,
});

const tabs = [
  {
    key: "resumen",
    to: "/eventos/$eventId/resumen",
    label: "Resumen",
    icon: LayoutList,
  },
  {
    key: "invitados",
    to: "/eventos/$eventId/invitados",
    label: "Invitados",
    icon: Users,
  },
  {
    key: "conversaciones",
    to: "/eventos/$eventId/conversaciones",
    label: "Conversaciones",
    icon: MessageSquareText,
  },
  {
    key: "automatizacion",
    to: "/eventos/$eventId/automatizacion",
    label: "Automatización IA",
    icon: Bot,
  },
  {
    key: "mensajes",
    to: "/eventos/$eventId/mensajes",
    label: "Mensajes",
    icon: Sparkles,
  },
  {
    key: "importar",
    to: "/eventos/$eventId/importar",
    label: "Importar Excel",
    icon: FileSpreadsheet,
  },
  {
    key: "estadisticas",
    to: "/eventos/$eventId/estadisticas",
    label: "Estadísticas",
    icon: BarChart3,
  },
  {
    key: "configuracion",
    to: "/eventos/$eventId/configuracion",
    label: "Configuración",
    icon: Settings,
  },
] as const;

function EventLayout() {
  const { eventId } = Route.useParams();
  const { event, access } = useEvent(eventId);
  const { syncEventLive } = useStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isShortHeight = useIsShortHeight();
  const [headerExpanded, setHeaderExpanded] = useState(true);
  const visibleTabs = tabs.filter((t) => eventTabAllowed(access, t.key));
  const currentKey =
    tabs.find((t) => pathname.endsWith(t.to.replace("/eventos/$eventId", "")))
      ?.key ?? pathname.split("/").pop();
  const showHeaderDetails = !isShortHeight || headerExpanded;

  useEffect(() => {
    setHeaderExpanded(!isShortHeight);
  }, [isShortHeight]);

  useEffect(() => {
    if (!event || !access) return;
    if (currentKey && !eventTabAllowed(access, currentKey)) {
      navigate({
        to: "/eventos/$eventId/resumen",
        params: { eventId },
        replace: true,
      });
    }
  }, [access, currentKey, event, eventId, navigate]);

  useEffect(() => {
    if (!event) return;
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      void syncEventLive(eventId);
    };
    tick();
    const id = window.setInterval(tick, 8000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [event, eventId, syncEventLive]);

  if (!event) {
    return (
      <main className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Este evento no existe.
      </main>
    );
  }

  const titleBlock = (
    <>
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl font-display text-primary/70",
          isShortHeight && !headerExpanded
            ? "size-8 text-sm"
            : "size-10 text-base sm:size-12 sm:text-lg",
        )}
        style={coverStyle(event.cover)}
      >
        {event.shortName}
      </span>
      <div className="min-w-0 flex-1 text-left">
        <h1
          className={cn(
            "truncate font-display leading-tight",
            isShortHeight && !headerExpanded
              ? "text-xl"
              : "text-2xl sm:text-3xl",
          )}
        >
          {event.name}
        </h1>
        {showHeaderDetails ? (
          <p className="truncate text-xs text-muted-foreground sm:text-sm">
            {formatDate(event.date)} · {event.time} · {event.venue}
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        id="event-page-header"
        className="shrink-0 border-b border-border bg-card/70 backdrop-blur"
      >
        <div
          className={cn(
            "flex flex-wrap items-center gap-3 px-4 sm:gap-4 sm:px-5 md:px-8",
            isShortHeight && !headerExpanded
              ? "py-2"
              : "pb-3 pt-4 sm:pb-4 sm:pt-6",
          )}
        >
          {isShortHeight ? (
            <button
              type="button"
              onClick={() => setHeaderExpanded((value) => !value)}
              aria-expanded={headerExpanded}
              aria-controls="event-page-header-details"
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:bg-secondary/60"
            >
              {titleBlock}
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
              {titleBlock}
            </div>
          )}
          {showHeaderDetails ? (
            <EventStatusBadge status={event.status} className="ml-auto" />
          ) : null}
        </div>
        {showHeaderDetails ? (
          <nav
            id="event-page-header-details"
            className="-mb-px flex gap-1 overflow-x-auto px-3 md:px-6"
          >
            {visibleTabs.map((t) => {
              const active = pathname === t.to.replace("$eventId", eventId);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  params={{ eventId }}
                  className={cn(
                    "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition-colors",
                    active
                      ? "border-gold font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className="size-4" />
                  {t.label}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
