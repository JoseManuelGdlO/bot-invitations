import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  MessageCircle,
  Plus,
  UserRoundX,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/stat-card";
import { EventCard } from "@/components/event-card";
import { statsFor, useStore } from "@/lib/mock/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/eventos/")({
  head: () => ({
    meta: [
      { title: "Panel general · Alanna Confirmaciones" },
      {
        name: "description",
        content: "Todos tus eventos, confirmaciones y conversaciones en un solo panel.",
      },
      { property: "og:title", content: "Panel general · Alanna Confirmaciones" },
      { property: "og:description", content: "Todos tus eventos y confirmaciones en un panel." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EventsDashboard,
});

const kindTone: Record<string, string> = {
  confirm: "bg-success",
  reject: "bg-destructive",
  message: "bg-gold",
  system: "bg-muted-foreground",
};

function EventsDashboard() {
  const { events, guests, conversations, activity } = useStore();
  const s = statsFor(guests);
  const active = events.filter((e) => e.status === "activo").length;
  const upcoming = events.filter((e) => new Date(`${e.date}T12:00:00`) > new Date()).length;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">Panel general</p>
          <h1 className="mt-1 font-display text-4xl">Tus eventos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cada evento mantiene sus invitados, conversaciones y configuración por separado.
          </p>
        </div>
        <Button asChild size="lg">
          <Link to="/eventos/nuevo">
            <Plus className="size-4" /> Crear nuevo evento
          </Link>
        </Button>
      </div>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Eventos activos" value={active} hint={`${upcoming} próximos`} icon={CalendarCheck2} />
        <StatCard label="Total de invitados" value={s.people} hint={`${s.invitations} invitaciones`} icon={Users} />
        <StatCard label="Confirmados" value={s.confirmedPeople} tone="success" hint={`${s.progress}% del total`} icon={CheckCircle2} />
        <StatCard label="Confirmaciones pendientes" value={s.pending + s.noReply} tone="warning" hint="Requieren seguimiento" icon={CalendarClock} />
      </section>

      <section className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Rechazaron" value={s.rejected} tone="rose" icon={UserRoundX} />
        <StatCard label="Conversaciones pendientes" value={conversations.filter((c) => c.unread > 0).length} tone="gold" icon={MessageCircle} />
        <StatCard label="Sin respuesta" value={s.noReply} hint="Aún no contestan" />
        <StatCard label="Tasa de respuesta" value={`${s.responseRate}%`} tone="gold" />
      </section>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <h2 className="font-display text-2xl">Eventos</h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {events.map((e) => (
              <EventCard key={e.id} event={e} guests={guests.filter((g) => g.eventId === e.id)} />
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl">Actividad reciente</h2>
          <div className="mt-4 space-y-1 rounded-2xl border border-border bg-card p-5 shadow-soft">
            {activity.map((a) => {
              const ev = events.find((e) => e.id === a.eventId);
              return (
                <div key={a.id} className="flex gap-3 border-b border-border/60 py-3 last:border-0">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", kindTone[a.kind])} />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug">{a.text}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {ev?.name ?? "General"} · {a.at}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
