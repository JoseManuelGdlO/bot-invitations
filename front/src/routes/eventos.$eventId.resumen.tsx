import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  MessageCircle,
  Send,
  Users,
  UserRoundX,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { ProgressRing } from "@/components/progress-ring";
import { Button } from "@/components/ui/button";
import { statsFor, useEvent, useStore } from "@/lib/mock/store";
import { daysUntil } from "@/lib/mock/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PERMS } from "@/lib/permissions";
import { ApiError } from "@/lib/api/client";

export const Route = createFileRoute("/eventos/$eventId/resumen")({
  head: () => ({
    meta: [
      { title: "Resumen del evento · Alanna Confirmaciones" },
      {
        name: "description",
        content: "KPIs, progreso de confirmación y actividad del evento.",
      },
      {
        property: "og:title",
        content: "Resumen del evento · Alanna Confirmaciones",
      },
      {
        property: "og:description",
        content: "KPIs y progreso de confirmación del evento.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Resumen,
});

const kindTone: Record<string, string> = {
  confirm: "bg-success",
  reject: "bg-destructive",
  message: "bg-gold",
  system: "bg-muted-foreground",
};

function Resumen() {
  const { eventId } = Route.useParams();
  const { event, guests } = useEvent(eventId);
  const { activity, launchCampaign, hasPerm } = useStore();
  const s = statsFor(guests);
  const eventActivity = activity.filter((a) => a.eventId === eventId);
  const [launching, setLaunching] = useState(false);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invitaciones registradas"
          value={s.invitations}
          icon={Users}
        />
        <StatCard label="Personas invitadas" value={s.people} />
        <StatCard
          label="Personas confirmadas"
          value={s.confirmedPeople}
          tone="success"
          icon={CheckCircle2}
        />
        <StatCard
          label="Pendientes"
          value={s.pending}
          tone="warning"
          icon={Clock}
        />
        <StatCard
          label="No asistirán"
          value={s.rejected}
          tone="rose"
          icon={UserRoundX}
        />
        <StatCard label="Sin respuesta" value={s.noReply} />
        <StatCard
          label="Conversaciones activas"
          value={s.active}
          tone="gold"
          icon={MessageCircle}
        />
        <StatCard
          label="Días restantes"
          value={event ? daysUntil(event.date) : 0}
          tone="gold"
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Progreso general</h2>
          <div className="mt-6 flex flex-col items-center gap-4">
            <ProgressRing
              value={s.progress}
              caption={`${s.progress}% de invitados ya confirmaron`}
            />
            <div className="grid w-full grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-success-soft p-3">
                <p className="font-display text-xl text-success">
                  {s.confirmedPeople}
                </p>
                <p className="text-[11px] text-muted-foreground">Confirmados</p>
              </div>
              <div className="rounded-xl bg-warning-soft p-3">
                <p className="font-display text-xl text-warning">{s.pending}</p>
                <p className="text-[11px] text-muted-foreground">Pendientes</p>
              </div>
              <div className="rounded-xl bg-rose p-3">
                <p className="font-display text-xl text-rose-foreground">
                  {s.rejectedPeople}
                </p>
                <p className="text-[11px] text-muted-foreground">No asisten</p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 pt-2">
              {hasPerm(eventId, PERMS.REPLY) ? (
                <Button
                  disabled={launching}
                  onClick={async () => {
                    setLaunching(true);
                    try {
                      await launchCampaign(eventId);
                      toast.success("Campaña iniciada", {
                        description:
                          "El asistente comenzó a enviar los mensajes iniciales.",
                      });
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? err.message
                          : "No se pudo iniciar la campaña",
                      );
                    } finally {
                      setLaunching(false);
                    }
                  }}
                >
                  <Send className="size-4" /> Iniciar confirmaciones
                </Button>
              ) : null}
              {hasPerm(eventId, PERMS.EXPORT) ? (
                <Button variant="outline" asChild>
                  <Link to="/eventos/$eventId/lista-final" params={{ eventId }}>
                    Ver lista final
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Actividad del evento</h2>
          <div className="mt-4">
            {eventActivity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay actividad registrada.
              </p>
            ) : (
              eventActivity.map((a) => (
                <div
                  key={a.id}
                  className="flex gap-3 border-b border-border/60 py-3 last:border-0"
                >
                  <span
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      kindTone[a.kind],
                    )}
                  />
                  <div>
                    <p className="text-sm">{a.text}</p>
                    <p className="text-[11px] text-muted-foreground">{a.at}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <h3 className="mt-8 font-display text-xl">Últimas respuestas</h3>
          <div className="mt-3 space-y-3">
            {guests
              .filter((g) => g.lastReply)
              .slice(0, 4)
              .map((g) => (
                <div
                  key={g.id}
                  className="rounded-xl border border-border bg-secondary/40 p-3"
                >
                  <p className="text-sm">“{g.lastReply}”</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {g.rep} · {g.lastReplyAt}
                  </p>
                </div>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}
