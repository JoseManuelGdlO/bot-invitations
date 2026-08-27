import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  botApi,
  type BotPlaygroundLog,
  type BotPlaygroundMessage,
} from "@/lib/api/bot";
import type { Guest } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  eventId: string;
  guests: Guest[];
};

type PlaygroundRow =
  | { kind: "msg"; role: "user" | "assistant"; text: string }
  | { kind: "logs"; items: BotPlaygroundLog[] };

function messagesToRows(messages: BotPlaygroundMessage[]): PlaygroundRow[] {
  return messages.map((msg) => ({
    kind: "msg",
    role: msg.role,
    text: msg.text,
  }));
}

export function BotPlayground({ eventId, guests }: Props) {
  const [guestId, setGuestId] = useState(guests[0]?.id ?? "");
  const [rows, setRows] = useState<PlaygroundRow[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!guestId && guests[0]) setGuestId(guests[0].id);
  }, [guests, guestId]);

  useEffect(() => {
    if (!guestId) {
      setRows([]);
      return;
    }
    let cancelled = false;
    botApi
      .getPlayground(eventId, guestId)
      .then((res) => {
        if (!cancelled) setRows(messagesToRows(res.messages || []));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, guestId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [rows.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !guestId || busy) return;
    setBusy(true);
    setRows((prev) => [...prev, { kind: "msg", role: "user", text }]);
    setDraft("");
    try {
      const result = await botApi.chat(eventId, { guestId, message: text });
      if (result.messages?.length) {
        const next = messagesToRows(result.messages);
        if (result.logs?.length)
          next.push({ kind: "logs", items: result.logs });
        setRows(next);
      } else if (result.reply) {
        setRows((prev) => {
          const next: PlaygroundRow[] = [
            ...prev,
            { kind: "msg", role: "assistant", text: result.reply || "" },
          ];
          if (result.logs?.length)
            next.push({ kind: "logs", items: result.logs });
          return next;
        });
      }
      if (result.locked)
        toast.info("Espera a que termine la respuesta anterior.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo hablar con el bot",
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!guestId) return;
    try {
      const result = await botApi.chat(eventId, {
        guestId,
        message: "",
        reset: true,
      });
      setRows(messagesToRows(result.messages || []));
      setDraft("");
      toast.success("Conversación de prueba reiniciada");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo reiniciar",
      );
    }
  };

  if (!guests.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Agrega un invitado para probar el bot de este evento.
      </p>
    );
  }

  return (
    <div className="flex min-h-[420px] flex-col">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label className="text-xs">Invitado de prueba</Label>
          <Select value={guestId} onValueChange={setGuestId}>
            <SelectTrigger>
              <SelectValue placeholder="Elige un invitado" />
            </SelectTrigger>
            <SelectContent>
              {guests.map((guest) => (
                <SelectItem key={guest.id} value={guest.id}>
                  {guest.rep}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-5"
          onClick={() => void reset()}
        >
          <RotateCcw className="size-4" /> Nueva
        </Button>
      </div>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl border border-border bg-secondary/30 p-3">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">
            Cargando la invitación inicial…
          </p>
        ) : (
          rows.map((row, i) =>
            row.kind === "logs" ? (
              <div
                key={`logs-${i}`}
                className="rounded-lg border border-dashed border-border/80 bg-background/60 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground"
              >
                <p className="mb-1 text-[9px] font-semibold tracking-wide text-muted-foreground/80 uppercase">
                  Log del turno
                </p>
                <ul className="space-y-0.5">
                  {row.items.map((log, j) => (
                    <li key={`${log.kind}-${j}`}>
                      <span className="text-foreground/80">[{log.kind}]</span>{" "}
                      {log.label}
                      {log.detail ? (
                        <span className="opacity-80"> — {log.detail}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div
                key={`${row.role}-${i}`}
                className={cn(
                  "flex",
                  row.role === "user" ? "justify-start" : "justify-end",
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-xs shadow-soft",
                    row.role === "user"
                      ? "rounded-bl-sm bg-card"
                      : "rounded-br-sm bg-success-soft",
                  )}
                >
                  <p className="whitespace-pre-line">{row.text}</p>
                </div>
              </div>
            ),
          )
        )}

        <div ref={endRef} />
      </div>
      <div className="mt-3 flex items-end gap-2">
        <Textarea
          value={draft}
          rows={2}
          disabled={busy}
          placeholder="Responde como el invitado…"
          className="min-h-0 resize-none text-sm"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="button"
          size="icon"
          disabled={busy || !draft.trim()}
          onClick={() => void send()}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  );
}
