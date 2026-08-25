import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Pause, Play, Search, Send, ShieldAlert, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/status-badge";
import { useEvent, useStore } from "@/lib/mock/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PERMS } from "@/lib/permissions";
import { botApi } from "@/lib/api/bot";

export const Route = createFileRoute("/eventos/$eventId/conversaciones")({
  validateSearch: (s: Record<string, unknown>) => ({
    guestId: typeof s.guestId === "string" ? s.guestId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Conversaciones · Alanna Confirmaciones" },
      { name: "description", content: "Bandeja estilo WhatsApp con las conversaciones del evento." },
      { property: "og:title", content: "Conversaciones · Alanna Confirmaciones" },
      { property: "og:description", content: "Bandeja de conversaciones asistidas por IA." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Conversaciones,
});

function Conversaciones() {
  const { eventId } = Route.useParams();
  const { guestId } = Route.useSearch();
  const { conversations, guests, event } = useEvent(eventId);
  const { sendMessage, toggleAI, updateGuest, hasPerm, refresh } = useStore();
  const canReply = hasPerm(eventId, PERMS.REPLY);
  const canConfirm = hasPerm(eventId, PERMS.CONFIRM);
  const initial = conversations.find((c) => c.guestId === guestId)?.id ?? conversations[0]?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(initial);
  const [q, setQ] = useState("");
  const [draft, setDraft] = useState("");
  const [simulateGuest, setSimulateGuest] = useState(false);
  const [devBot, setDevBot] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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
    const found = guestId ? conversations.find((c) => c.guestId === guestId) : null;
    if (found) setActiveId(found.id);
    else if (!activeId && conversations[0]) setActiveId(conversations[0].id);
  }, [guestId, conversations, activeId]);

  const list = useMemo(() => {
    return conversations
      .map((c) => ({ conv: c, guest: guests.find((g) => g.id === c.guestId)! }))
      .filter((x) => x.guest && x.guest.rep.toLowerCase().includes(q.toLowerCase()));
  }, [conversations, guests, q]);

  const active = list.find((x) => x.conv.id === activeId) ?? list[0];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [active?.conv.messages.length, activeId]);

  if (!active) {
    return (
      <main className="flex flex-1 items-center justify-center p-10 text-sm text-muted-foreground">
        Aún no hay conversaciones en este evento. Inicia las confirmaciones desde el resumen.
      </main>
    );
  }

  const send = async () => {
    if (!draft.trim()) return;
    if (simulateGuest && devBot) {
      const text = draft.trim();
      setDraft("");
      try {
        await botApi.simulateGuest(active.conv.id, text);
        await refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "No se pudo simular al invitado");
      }
      return;
    }
    sendMessage(active.conv.id, {
      id: `m-${Date.now()}`,
      from: active.conv.aiPaused ? "planner" : "ai",
      text: draft,
      at: new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" }),
    });
    setDraft("");
  };

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_1fr_290px]">
      {/* Lista */}
      <aside className="hidden min-h-0 flex-col border-r border-border bg-card lg:flex">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar" className="pl-9" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {list.map(({ conv, guest }) => (
            <button
              key={conv.id}
              onClick={() => setActiveId(conv.id)}
              className={cn(
                "flex w-full gap-3 border-b border-border/60 p-3 text-left transition-colors hover:bg-secondary/60",
                conv.id === active.conv.id && "bg-secondary",
              )}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gold-soft text-[11px] font-semibold text-gold-foreground">
                {guest.rep.split(" ").map((p) => p[0]).join("").slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">{guest.rep}</p>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {conv.messages[conv.messages.length - 1]?.at}
                  </span>
                </div>
                <p className="truncate text-[11px] text-muted-foreground">{guest.phone}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {conv.messages[conv.messages.length - 1]?.text}
                </p>
                <div className="mt-1 flex items-center gap-1.5">
                  <StatusBadge status={guest.status} />
                  {conv.unread > 0 ? (
                    <Badge className="h-4 rounded-full bg-whatsapp px-1.5 text-[10px] text-primary-foreground">
                      {conv.unread}
                    </Badge>
                  ) : null}
                </div>
              </div>
            </button>
          ))}
        </div>
      </aside>

      {/* Hilo */}
      <section className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
          <div>
            <p className="font-medium">{active.guest.rep}</p>
            <p className="text-[11px] text-muted-foreground">
              {active.guest.phone} · {event?.name}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            {canReply ? (
              active.conv.aiPaused ? (
              <Button
                size="sm"
                onClick={() => {
                  toggleAI(active.conv.id, false);
                  toast.success("Automatización reactivada");
                }}
              >
                <Play className="size-4" /> Reactivar automatización
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    toggleAI(active.conv.id, true);
                    toast.info("IA pausada en esta conversación");
                  }}
                >
                  <Pause className="size-4" /> Pausar IA
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    toggleAI(active.conv.id, true);
                    toast.info("Ahora respondes personalmente");
                  }}
                >
                  <UserRound className="size-4" /> Responder personalmente
                </Button>
              </>
            )
            ) : null}
          </div>
        </div>

        {active.conv.aiPaused ? (
          <div className="flex items-center gap-2 border-b border-border bg-warning-soft px-4 py-2 text-xs text-warning">
            <ShieldAlert className="size-4" /> Conversación tomada por un miembro del equipo.
          </div>
        ) : (
          <div className="flex items-center gap-2 border-b border-border bg-success-soft px-4 py-2 text-xs text-success">
            <Bot className="size-4" /> El asistente está respondiendo automáticamente.
          </div>
        )}

        <div className="chat-canvas min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {active.conv.messages.map((m) => (
            <div
              key={m.id}
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
                      : "rounded-br-sm bg-success-soft",
                )}
              >
                <p className="whitespace-pre-line">{m.text}</p>
                <p className="mt-1 text-right text-[10px] text-muted-foreground">
                  {m.from === "planner" ? "Equipo · " : m.from === "ai" ? "Asistente · " : ""}
                  {m.at}
                </p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {canReply ? (
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
                  : active.conv.aiPaused
                    ? "Escribe como parte del equipo…"
                    : "Escribe un mensaje…"
              }
            />
            <Button onClick={() => void send()} size="icon">
              <Send className="size-4" />
            </Button>
          </div>
        </div>
        ) : (
          <p className="border-t border-border bg-card px-4 py-3 text-xs text-muted-foreground">
            Tienes acceso de solo lectura a estas conversaciones.
          </p>
        )}
      </section>

      {/* Perfil */}
      <aside className="hidden border-l border-border bg-card p-5 lg:block">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-gold-soft font-display text-lg text-gold-foreground">
            {active.guest.rep.split(" ").map((p) => p[0]).join("").slice(0, 2)}
          </span>
          <p className="mt-3 font-medium">{active.guest.rep}</p>
          <p className="text-xs text-muted-foreground">{active.guest.phone}</p>
          <div className="mt-3"><StatusBadge status={active.guest.status} /></div>
        </div>
        <div className="mt-6 space-y-3 text-sm">
          {[
            ["Invitados asignados", String(active.guest.invited)],
            ["Confirmados", String(active.guest.confirmed)],
            ["Mesa", active.guest.table],
            ["Tipo", active.guest.guestType],
            ["Etiqueta", active.guest.tag],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-border/60 pb-2">
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
            updateGuest(active.guest.id, { status: "confirmado", confirmed: active.guest.invited });
            toast.success("Confirmación registrada");
          }}
        >
          Confirmar {active.guest.invited} asistentes
        </Button>
        ) : null}
      </aside>
    </main>
  );
}
