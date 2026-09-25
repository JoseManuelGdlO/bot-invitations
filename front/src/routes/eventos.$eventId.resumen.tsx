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
import { ReminderCalendarDialog } from "@/components/reminder-calendar-dialog";
import { integrationsApi } from "@/lib/api/integrations";
import {
  campaignTemplateStatus as campaignStatusFromList,
  unapprovedSecondaryCampaignPurposes,
  type SecondaryCampaignPurpose,
} from "@/lib/whatsapp-templates";
import { buildUpcomingReminders, BOT_OFF_REMINDER_WARNING } from "@/lib/event-ops";
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
  const { event, guests, data } = useEvent(eventId);
  const { activity, launchCampaign, hasPerm, refresh } = useStore();
  const reminders = event
    ? buildUpcomingReminders([event], { [event.id]: data }, guests, new Date(), activity)
    : [];
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
  const [campaignTemplateStatus, setCampaignTemplateStatus] = useState<
    string | null
  >(null);
  const [campaignTemplatesLoadError, setCampaignTemplatesLoadError] =
    useState(false);
  const [unapprovedSecondaryPurposes, setUnapprovedSecondaryPurposes] =
    useState<SecondaryCampaignPurpose[]>([]);
  const [whatsappConfigured, setWhatsappConfigured] = useState(true);

  useEffect(() => {
    setCampaign(event?.campaign ?? IDLE_CAMPAIGN);
  }, [event?.campaign]);

  useEffect(() => {
    let cancelled = false;
    setCampaignTemplatesLoadError(false);
    setCampaignTemplateStatus(null);
    setUnapprovedSecondaryPurposes([]);
    void Promise.allSettled([
      integrationsApi.getWhatsAppStatus(),
      integrationsApi.listEventWhatsappTemplates(eventId),
    ]).then(([statusResult, templatesResult]) => {
      if (cancelled) return;
      setWhatsappConfigured(
        statusResult.status === "fulfilled"
          ? Boolean(statusResult.value.configured)
          : false,
      );
      if (templatesResult.status === "fulfilled") {
        const templates = templatesResult.value.templates || [];
        setCampaignTemplatesLoadError(false);
        setCampaignTemplateStatus(campaignStatusFromList(templates));
        setUnapprovedSecondaryPurposes(
          unapprovedSecondaryCampaignPurposes(templates),
        );
        return;
      }
      setCampaignTemplatesLoadError(true);
      setCampaignTemplateStatus(null);
      setUnapprovedSecondaryPurposes([]);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

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
    <main className="mx-auto w-full min-w-0 max-w-7xl px-4 py-6 pb-10 sm:px-6 md:px-8 md:py-8 md:pb-12">
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
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

      <div className="mt-6 grid grid-cols-1 gap-6 lg:mt-8 lg:grid-cols-2 xl:grid-cols-[minmax(260px,22rem)_minmax(0,1fr)]">
        <section className="w-full min-w-0 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
          <h2 className="font-display text-xl sm:text-2xl">Progreso general</h2>
          <div className="mt-5 flex flex-col items-center gap-5">
            <ProgressRing
              value={s.progress}
              size={132}
              stroke={10}
              caption={`${s.progress}% de invitados ya confirmaron`}
            />
            <div className="grid w-full grid-cols-2 gap-2 text-center sm:grid-cols-4">
              <div className="flex min-w-0 flex-col items-center justify-center rounded-lg bg-success-soft px-1.5 py-2.5 sm:px-2 sm:py-3">
                <p className="font-display text-lg leading-none text-success sm:text-xl">
                  {s.confirmedPeople}
                </p>
                <p className="mt-1.5 text-[10px] leading-none whitespace-nowrap text-muted-foreground">
                  Confirmados
                </p>
              </div>
              <div className="flex min-w-0 flex-col items-center justify-center rounded-lg bg-warning-soft px-1.5 py-2.5 sm:px-2 sm:py-3">
                <p className="font-display text-lg leading-none text-warning sm:text-xl">
                  {s.pending}
                </p>
                <p className="mt-1.5 text-[10px] leading-none whitespace-nowrap text-muted-foreground">
                  Pendientes
                </p>
              </div>
              <div className="flex min-w-0 flex-col items-center justify-center rounded-lg bg-rose px-1.5 py-2.5 sm:px-2 sm:py-3">
                <p className="font-display text-lg leading-none text-rose-foreground sm:text-xl">
                  {s.rejectedPeople}
                </p>
                <p className="mt-1.5 text-[10px] leading-none whitespace-nowrap text-muted-foreground">
                  No asisten
                </p>
              </div>
              <div className="flex min-w-0 flex-col items-center justify-center rounded-lg bg-secondary px-1.5 py-2.5 sm:px-2 sm:py-3">
                <p className="font-display text-lg leading-none text-foreground sm:text-xl">
                  {s.noReply}
                </p>
                <p className="mt-1.5 text-[10px] leading-none whitespace-nowrap text-muted-foreground">
                  Sin respuesta
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2">
              {hasPerm(eventId, PERMS.REPLY) ? (
                <>
                  <Button
                    className="relative h-auto min-h-9 w-full overflow-hidden whitespace-normal disabled:opacity-100"
                    disabled={running || submitting || complete || eventFinished}
                    onClick={() => {
                      if (canLaunch) {
                        setLaunchError("");
                        setModalOpen(true);
                      }
                    }}
                  >
                    <Send className="size-4 shrink-0" /> {label}
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
                    campaignTemplateStatus={campaignTemplateStatus}
                    campaignTemplatesLoadError={campaignTemplatesLoadError}
                    whatsappConfigured={whatsappConfigured}
                    unapprovedSecondaryPurposes={unapprovedSecondaryPurposes}
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
                <Button variant="outline" asChild>
                  <Link to="/eventos/$eventId/lista-final" params={{ eventId }}>
                    Ver lista final
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="flex max-h-[min(28rem,55vh)] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6 lg:h-0 lg:max-h-none lg:min-h-full">
          <h2 className="shrink-0 font-display text-xl sm:text-2xl">
            Actividad del evento
          </h2>
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
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
                  <div className="min-w-0">
                    <p className="text-sm break-words">{a.text}</p>
                    <p className="text-[11px] text-muted-foreground">{a.at}</p>
                  </div>
                </div>
              ))
            )}

            <h3 className="mt-6 font-display text-lg sm:text-xl">
              Últimas respuestas
            </h3>
            <div className="mt-3 space-y-3 pb-1">
              {guests
                .filter((g) => g.lastReply)
                .slice(0, 4)
                .map((g) => (
                  <div
                    key={g.id}
                    className="rounded-xl border border-border bg-secondary/40 p-3"
                  >
                    <p className="text-sm break-words">“{g.lastReply}”</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {g.rep} · {g.lastReplyAt}
                    </p>
                  </div>
                ))}
            </div>
          </div>
        </section>
      </div>

      <section className="mt-6 lg:mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-xl sm:text-2xl">Recordatorios</h2>
          <ReminderCalendarDialog
            reminders={reminders.filter((reminder) => reminder.status === "upcoming")}
            events={event ? [event] : []}
          />
        </div>
        <div className="mt-4 rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
          {data.ai.botEnabled === false && data.ai.followUpsEnabled !== false ? (
            <p className="mb-4 text-sm text-warning">{BOT_OFF_REMINDER_WARNING}</p>
          ) : null}
          {data.ai.followUpsEnabled === false ? (
            <p className="text-sm text-muted-foreground">
              Los recordatorios están desactivados para este evento.
            </p>
          ) : reminders.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No hay recordatorios para este evento. Se agendan al lanzar la
              campaña y según las reglas de seguimiento.
            </p>
          ) : (
            <div className="space-y-1">
              {reminders.map((reminder) => (
                <div
                  key={reminder.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/60 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{reminder.label}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {reminder.detail}
                    </p>
                  </div>
                  <p
                    className={cn(
                      "text-xs",
                      reminder.status === "sent"
                        ? "text-success"
                        : "text-muted-foreground",
                    )}
                  >
                    {reminder.status === "sent"
                      ? "Enviado"
                      : reminder.status === "upcoming"
                        ? reminder.dateLabel
                        : "Pendiente"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
