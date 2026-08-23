import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
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
import { useEvent } from "@/lib/mock/store";
import { coverStyle } from "@/lib/cover";
import { formatDate } from "@/lib/mock/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/eventos/$eventId")({
  component: EventLayout,
});

const tabs = [
  { to: "/eventos/$eventId/resumen", label: "Resumen", icon: LayoutList },
  { to: "/eventos/$eventId/invitados", label: "Invitados", icon: Users },
  { to: "/eventos/$eventId/conversaciones", label: "Conversaciones", icon: MessageSquareText },
  { to: "/eventos/$eventId/automatizacion", label: "Automatización IA", icon: Bot },
  { to: "/eventos/$eventId/mensajes", label: "Mensajes", icon: Sparkles },
  { to: "/eventos/$eventId/importar", label: "Importar Excel", icon: FileSpreadsheet },
  { to: "/eventos/$eventId/estadisticas", label: "Estadísticas", icon: BarChart3 },
  { to: "/eventos/$eventId/configuracion", label: "Configuración", icon: Settings },
] as const;

function EventLayout() {
  const { eventId } = Route.useParams();
  const { event } = useEvent(eventId);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (!event) {
    return (
      <main className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Este evento no existe.
      </main>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <header className="shrink-0 border-b border-border bg-card/70 backdrop-blur">
        <div className="flex flex-wrap items-center gap-4 px-5 pb-4 pt-6 md:px-8">
          <span
            className="flex size-12 items-center justify-center rounded-xl font-display text-lg text-primary/70"
            style={coverStyle(event.cover)}
          >
            {event.shortName}
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-tight">{event.name}</h1>
            <p className="text-sm text-muted-foreground">
              {formatDate(event.date)} · {event.time} · {event.venue}
            </p>
          </div>
          <Badge variant="outline" className="ml-auto rounded-full capitalize">
            {event.status}
          </Badge>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 md:px-6">
          {tabs.map((t) => {
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
      </header>
      <Outlet />
    </div>
  );
}
