import { Link } from "@tanstack/react-router";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { EventStatusBadge } from "@/components/event-status-badge";
import { formatDate, daysUntil } from "@/lib/mock/format";
import type { EventItem, Guest } from "@/lib/mock/types";
import { statsFor } from "@/lib/mock/store";
import { coverStyle } from "@/lib/cover";

export function EventCard({
  event,
  guests,
}: {
  event: EventItem;
  guests: Guest[];
}) {
  const s = statsFor(guests);
  return (
    <Link
      to="/eventos/$eventId/resumen"
      params={{ eventId: event.id }}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
    >
      <div className="relative h-28" style={coverStyle(event.cover)}>
        <span className="absolute left-4 top-4 font-display text-2xl text-primary/70">
          {event.shortName}
        </span>
        <EventStatusBadge
          status={event.status}
          className="absolute right-4 top-4 text-[11px] backdrop-blur"
        />
      </div>
      <div className="space-y-4 p-5">
        <div>
          <h3 className="font-display text-xl leading-tight">{event.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{event.hosts}</p>
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground">
          <p className="flex items-center gap-2">
            <CalendarDays className="size-3.5 text-gold" />{" "}
            {formatDate(event.date)} · {event.time}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="size-3.5 text-gold" /> {event.venue}
          </p>
          <p className="flex items-center gap-2">
            <Users className="size-3.5 text-gold" /> {s.invitations}{" "}
            invitaciones · {s.people} personas
          </p>
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Confirmación</span>
            <span className="font-medium">{s.progress}%</span>
          </div>
          <Progress value={s.progress} className="h-1.5" />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Faltan {daysUntil(event.date)} días
        </p>
      </div>
    </Link>
  );
}
