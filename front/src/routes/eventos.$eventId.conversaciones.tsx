import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  FileText,
  Play,
  Search,
  Send,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { WhatsAppFormattedText } from "@/components/whatsapp-formatted-text";
import { SendGuestInvitationDialog } from "@/components/send-guest-invitation-dialog";
import { useEvent, useStore } from "@/lib/mock/store";
import type { Guest } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PERMS } from "@/lib/permissions";
import { botApi } from "@/lib/api/bot";
import {
  buildConversationInboxRows,
  conversationHasMessages,
} from "@/lib/conversation-inbox";
import { matchesConversationSearch } from "@/lib/conversation-search";
import { formatChatDayLabel, formatMessageTime, getZonedDayKey } from "@/lib/datetime";

export const Route = createFileRoute("/eventos/$eventId/conversaciones")({
  validateSearch: (s: Record<string, unknown>) => ({
    guestId: typeof s["guestId"] === "string" ? s["guestId"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Conversaciones · Alanna Confirmaciones" },
      {
        name: "description",
        content: "Bandeja estilo WhatsApp con las conversaciones del evento.",
      },
      {
        property: "og:title",
        content: "Conversaciones · Alanna Confirmaciones",
      },
      {
        property: "og:description",
        content: "Bandeja de conversaciones asistidas por IA.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Conversaciones,
});

function Conversaciones() {
  const { eventId } = Route.useParams();
  const { guestId } = Route.useSearch();
  const { conversations, guests, event } = useEvent(eventId);
  const { sendMessage, toggleAI, updateGuest, hasPerm, refresh, syncEventLive } =
    useStore();
  const canReply = hasPerm(eventId, PERMS.REPLY);
  const canConfirm = hasPerm(eventId, PERMS.CONFIRM);
  const rows = useMemo(
    () => buildConversationInboxRows(guests, conversations),
    [conversations, guests],
  );
  const initial = guestId ?? rows[0]?.guest.id ?? null;
  const [activeGuestId, setActiveGuestId] = useState<string | null>(initial);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [simulateGuest, setSimulateGuest] = useState(false);
  const [devBot, setDevBot] = useState(false);
  const [guestToInvite, setGuestToInvite] = useState<Guest | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const prevActiveIdRef = useRef<string | null>(null);
  const nearBottomRef = useRef(true);
  const timeZone = event?.timezone;

  useEffect(() => {
    let cancelled = false;
    botApi.status().then((res) => {
      if (!cancelled) setDevBot(Boolean(res.enabled));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (guestId) {
      setActiveGuestId(guestId);
      return;
    }
    if (!activeGuestId && rows[0]) setActiveGuestId(rows[0].guest.id);
  }, [guestId, rows, activeGuestId]);

  const list = useMemo(
    () => rows.filter((x) => matchesConversationSearch(x.guest, q)),
    [rows, q],
  );

  const active = rows.find((x) => x.guest.id === activeGuestId) ?? rows[0];
  const hasThread = conversationHasMessages(active?.conv);
  const lastMessageId = hasThread
    ? active?.conv?.messages[active.conv.messages.length - 1]?.id
    : undefined;

  useEffect(() => {
    const switched = prevActiveIdRef.current !== activeGuestId;
    prevActiveIdRef.current = activeGuestId ?? null;
    if (!hasThread) return;
    if (!switched && !nearBottomRef.current) return;
    const behavior: ScrollBehavior = switched ? "auto" : "smooth";
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const el = messagesRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior });
        nearBottomRef.current = true;
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [active?.conv?.messages.length, lastMessageId, activeGuestId, hasThread]);

  if (!guests.length || !active) {
    return (
      <main className="flex h-full flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Aún no hay invitados en este evento. Agrégalos desde la lista de
        invitados.
      </main>
    );
  }

  const send = async () => {
    if (!draft.trim() || !active.conv) return;
    if (simulateGuest && devBot) {
      const text = draft.trim();
      setDraft("");
      try {
        await botApi.simulateGuest(active.conv.id, text);
        await refresh();
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No se pudo simular al invitado",
        );
      }
      return;
    }
    const now = new Date().toISOString();
    sendMessage(active.conv.id, {
      id: `m-${Date.now()}`,
      from: active.conv.aiPaused ? "planner" : "ai",
      text: draft,
      at: formatMessageTime(now, timeZone),
      createdAt: now,
    });
    setDraft("");
  };

  return (
    <main className="grid h-full min-h-0 flex-1 grid-cols-1 grid-rows-1 overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)_290px]">
      {/* Lista */}
      <aside className="hidden min-h-0 flex-col overflow-hidden border-r border-border bg-card lg:flex">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar"
              className="pl-9"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              Ninguna conversación coincide.
            </p>
          ) : null}
          {list.map(({ conv, guest }) => {
            const last = conv?.messages[conv.messages.length - 1];
            const started = conversationHasMessages(conv);
            return (
              <button
                key={guest.id}
                onClick={() => setActiveGuestId(guest.id)}
                className={cn(
                  "flex w-full gap-3 border-b border-border/60 p-3 text-left transition-colors hover:bg-secondary/60",
                  guest.id === active.guest.id && "bg-secondary",
                )}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-[11px] font-semibold text-gold-foreground">
                  {guest.rep
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">{guest.rep}</p>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {last
                        ? formatMessageTime(last.createdAt, timeZone, last.at)
                        : ""}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {guest.phone}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {started ? last?.text : "Aún no inicia una conversación"}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <StatusBadge status={guest.status} />
                    {started && conv && conv.unread > 0 ? (
                      <Badge className="h-4 rounded-full bg-whatsapp px-1.5 text-[10px] text-primary-foreground">
                        {conv.unread}
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Hilo */}
      <section className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
          <div>
            <p className="font-medium">{active.guest.rep}</p>
            <p className="text-[11px] text-muted-foreground">
              {active.guest.phone} · {event?.name}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {canReply && hasThread && active.conv ? (
              active.conv.aiPaused ? (
                <Button
                  size="sm"
                  onClick={() => {
                    const convId = active.conv?.id;
                    if (!convId) return;
                    toggleAI(convId, false);
                    toast.success("Automatización reactivada");
                  }}
                >
                  <Play className="size-4" /> Reactivar automatización
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const convId = active.conv?.id;
                    if (!convId) return;
                    toggleAI(convId, true);
                    toast.info("Ahora respondes personalmente");
                  }}
                >
                  <UserRound className="size-4" /> Responder personalmente
                </Button>
              )
            ) : null}
          </div>
        </div>

        {hasThread && active.conv ? (
          active.conv.aiPaused ? (
            <div className="flex items-center gap-2 border-b border-border bg-warning-soft px-4 py-2 text-xs text-warning">
              <ShieldAlert className="size-4" /> Conversación tomada por un
              miembro del equipo.
            </div>
          ) : (
            <div className="flex items-center gap-2 border-b border-border bg-success-soft px-4 py-2 text-xs text-success">
              <Bot className="size-4" /> El asistente está respondiendo
              automáticamente.
            </div>
          )
        ) : null}

        {hasThread && active.conv ? (
          <div
            ref={messagesRef}
            onScroll={() => {
              const el = messagesRef.current;
              if (!el) return;
              nearBottomRef.current =
                el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="chat-canvas min-h-0 flex-1 space-y-3 overflow-y-auto p-5"
          >
            {active.conv.messages.map((m, index, list) => {
              const isTemplate = m.from === "ai" && m.kind === "template";
              const dayKey = getZonedDayKey(m.createdAt, timeZone);
              const prevDayKey =
                index > 0
                  ? getZonedDayKey(list[index - 1]?.createdAt, timeZone)
                  : null;
              const showDaySeparator = Boolean(dayKey && dayKey !== prevDayKey);
              return (
                <Fragment key={m.id}>
                  {showDaySeparator ? (
                    <div className="flex justify-center py-1">
                      <span className="rounded-lg border border-border/50 bg-card/95 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-soft">
                        {formatChatDayLabel(m.createdAt, timeZone)}
                      </span>
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      "flex animate-in fade-in slide-in-from-bottom-1 duration-300",
                      m.from === "guest" ? "justify-start" : "justify-end",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-soft",
                        m.from === "guest"
                          ? "rounded-bl-sm bg-card"
                          : m.from === "planner"
                            ? "rounded-br-sm bg-gold-soft"
                            : isTemplate
                              ? "rounded-br-sm border border-border/60 bg-card"
                              : "rounded-br-sm bg-success-soft",
                      )}
                    >
                      {isTemplate ? (
                        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <FileText className="size-3" /> Plantilla
                        </p>
                      ) : m.from === "ai" ? (
                        <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-success">
                          <Bot className="size-3" /> Asistente
                        </p>
                      ) : m.from === "planner" ? (
                        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gold-foreground">
                          Equipo
                        </p>
                      ) : null}
                      <WhatsAppFormattedText text={m.text} />
                      <p className="mt-1 text-right text-[10px] text-muted-foreground">
                        {formatMessageTime(m.createdAt, timeZone, m.at)}
                      </p>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        ) : (
          <div className="chat-canvas flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-5 text-center">
            <p className="text-sm text-muted-foreground">
              Aún no inicia una conversación
            </p>
            {canReply ? (
              <Button onClick={() => setGuestToInvite(active.guest)}>
                <Send className="size-4" /> Enviar invitación inicial
              </Button>
            ) : null}
          </div>
        )}

        {hasThread && canReply ? (
          <div className="border-t border-border bg-card p-3">
            {devBot ? (
              <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={simulateGuest}
                  onChange={(e) => setSimulateGuest(e.target.checked)}
                />
                Simular respuesta del invitado
              </label>
            ) : null}
            <div className="flex items-center gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void send()}
                placeholder={
                  simulateGuest && devBot
                    ? "Escribe como el invitado…"
                    : active.conv?.aiPaused
                      ? "Escribe como parte del equipo…"
                      : "Escribe un mensaje…"
                }
              />
              <Button onClick={() => void send()} size="icon">
                <Send className="size-4" />
              </Button>
            </div>
          </div>
        ) : hasThread ? (
          <p className="border-t border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            Tienes acceso de solo lectura a estas conversaciones.
          </p>
        ) : null}
      </section>

      {/* Perfil */}
      <aside className="hidden min-h-0 overflow-y-auto border-l border-border bg-card p-5 lg:flex lg:flex-col">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-gold-soft font-display text-lg text-gold-foreground">
            {active.guest.rep
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)}
          </span>
          <p className="mt-3 font-medium">{active.guest.rep}</p>
          <p className="text-xs text-muted-foreground">{active.guest.phone}</p>
          <div className="mt-3">
            <StatusBadge status={active.guest.status} />
          </div>
        </div>
        <div className="mt-6 space-y-3 text-sm">
          {[
            ["Invitados asignados", String(active.guest.invited)],
            ["Confirmados", String(active.guest.confirmed)],
            ["Mesa", active.guest.table],
            ["Tipo", active.guest.guestType],
            ["Etiqueta", active.guest.tag],
          ].map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between border-b border-border/60 pb-2"
            >
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
          <div>
            <p className="text-muted-foreground">Notas</p>
            <p className="mt-1">{active.guest.notes || "Sin notas."}</p>
          </div>
        </div>
        {canConfirm ? (
          <Button
            className="mt-6 w-full"
            variant="outline"
            onClick={() => {
              updateGuest(active.guest.id, {
                status: "confirmado",
                confirmed: active.guest.invited,
              });
              toast.success("Confirmación registrada");
            }}
          >
            Confirmar {active.guest.invited} asistentes
          </Button>
        ) : null}
      </aside>

      <SendGuestInvitationDialog
        guest={guestToInvite}
        onClose={() => setGuestToInvite(null)}
        onSent={() => syncEventLive(eventId)}
      />
    </main>
  );
}
