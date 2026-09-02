import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { LaunchCampaignDialog } from "@/components/launch-campaign-dialog";
import { statsFor, useEvent, useStore } from "@/lib/mock/store";
import { daysUntil, formatShortDate } from "@/lib/mock/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PERMS } from "@/lib/permissions";
import { api, ApiError } from "@/lib/api/client";
import { IDLE_CAMPAIGN, type CampaignSnapshot } from "@/lib/mock/types";

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
  const { activity, launchCampaign, hasPerm, refresh } = useStore();
  const s = statsFor(guests);
  const eventActivity = activity.filter((a) => a.eventId === eventId);
  const pendingUncontacted = guests.filter(
    (g) => g.status === "sin_contactar",
  ).length;
  const [campaign, setCampaign] = useState<CampaignSnapshot>(
    event?.campaign ?? IDLE_CAMPAIGN,
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [launchError, setLaunchError] = useState("");

  useEffect(() => {
    setCampaign(event?.campaign ?? IDLE_CAMPAIGN);
  }, [event?.campaign]);

  useEffect(() => {
    if (!["running", "scheduled"].includes(campaign.status)) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const snap = await api<CampaignSnapshot>(
          `/events/${eventId}/campaigns/current`,
        );
        if (cancelled) return;
        setCampaign(snap);
        if (snap.status === "done") await refresh();
      } catch {
        /* el poll no debe romper la pantalla */
      }
    };
    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [campaign.status, eventId, refresh]);

  const running = campaign.status === "running";
  const complete =
    campaign.status === "done" && pendingUncontacted === 0;
  const eventFinished = event?.status === "finalizado";
  const canLaunch = !running && !complete && !eventFinished;
  const percent = complete ? 100 : campaign.percent;

  let label = "Iniciar campaña";
  if (eventFinished) {
    label = "Evento finalizado";
  } else if (campaign.status === "scheduled" && campaign.scheduledAt) {
    label = `Empieza el ${formatShortDate(campaign.scheduledAt)}`;
  } else if (running) {
    label =
      campaign.total > 0
        ? `Enviando ${campaign.processed}/${campaign.total}`
        : "Enviando…";
  } else if (complete) {
    label = "Campaña enviada";
  }

  return (
    <main className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col overflow-hidden px-5 py-8 md:px-8">
      <div className="grid shrink-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      <div className="mt-8 grid min-h-0 flex-1 gap-6 lg:grid-cols-[1fr_1.4fr] lg:grid-rows-1">
        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-soft">
          <h2 className="shrink-0 font-display text-2xl">Progreso general</h2>
          <div className="mt-3 flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden">
            <ProgressRing
              value={s.progress}
              size={96}
              stroke={8}
              caption={`${s.progress}% de invitados ya confirmaron`}
            />
            <div className="grid w-full grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-success-soft p-2">
                <p className="font-display text-lg leading-none text-success">
                  {s.confirmedPeople}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Confirmados
                </p>
              </div>
              <div className="rounded-lg bg-warning-soft p-2">
                <p className="font-display text-lg leading-none text-warning">
                  {s.pending}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  Pendientes
                </p>
              </div>
              <div className="rounded-lg bg-rose p-2">
                <p className="font-display text-lg leading-none text-rose-foreground">
                  {s.rejectedPeople}
                </p>
                <p className="mt-1 text-[10px] text-muted-foreground">
                  No asisten
                </p>
              </div>
            </div>
            <div className="flex w-full shrink-0 flex-col gap-1.5">
              {hasPerm(eventId, PERMS.REPLY) ? (
                <>
                  <Button
                    size="sm"
                    className="relative h-auto min-h-8 w-full overflow-hidden disabled:opacity-100"
                    disabled={running || submitting || complete || eventFinished}
                    onClick={() => {
                      if (canLaunch) {
                        setLaunchError("");
                        setModalOpen(true);
                      }
                    }}
                  >
                    <Send className="size-4" /> {label}
                    {running || complete ? (
                      <Progress
                        value={percent}
                        className="absolute inset-x-0 bottom-0 h-1 rounded-none"
                      />
                    ) : null}
                  </Button>
                  <LaunchCampaignDialog
                    open={modalOpen}
                    onOpenChange={(open) => {
                      setModalOpen(open);
                      if (!open) setLaunchError("");
                    }}
                    campaign={campaign}
                    {...(event?.date ? { eventDate: event.date } : {})}
                    submitting={submitting}
                    error={launchError}
                    onConfirm={async (payload) => {
                      setSubmitting(true);
                      setLaunchError("");
                      try {
                        const snap = await launchCampaign(eventId, payload);
                        setCampaign(snap);
                        setModalOpen(false);
                        toast.success(
                          payload.mode === "schedule"
                            ? "Campaña programada"
                            : "Campaña iniciada",
                          {
                            description:
                              payload.mode === "schedule" && payload.date
                                ? `El primer contacto se enviará el ${formatShortDate(payload.date)}.`
                                : "El asistente comenzó a enviar los mensajes iniciales.",
                          },
                        );
                      } catch (err) {
                        const message =
                          err instanceof ApiError
                            ? err.message
                            : "No se pudo iniciar la campaña";
                        setLaunchError(message);
                        toast.error(message);
                      } finally {
                        setSubmitting(false);
                      }
                    }}
                  />
                </>
              ) : null}
              {hasPerm(eventId, PERMS.EXPORT) ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/eventos/$eventId/lista-final" params={{ eventId }}>
                    Ver lista final
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="shrink-0 font-display text-2xl">Actividad del evento</h2>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
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

            <h3 className="mt-6 font-display text-xl">Últimas respuestas</h3>
            <div className="mt-3 space-y-3 pb-1">
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
          </div>
        </section>
      </div>
    </main>
  );
}
