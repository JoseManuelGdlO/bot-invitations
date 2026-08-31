import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

interface HelpReply {
  reply: string;
  title?: string;
  href?: string | null;
  suggestions?: string[];
}

interface ChatLine {
  id: string;
  from: "bot" | "me";
  text: string;
  href?: string | null;
}

const STARTER: ChatLine = {
  id: "hi",
  from: "bot",
  text: "Hola. Soy el asistente de Alanna. Pregúntame cómo crear un evento, importar tu Excel, enviar invitaciones, pagar o cancelar.",
};

export function HelpBot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [chips, setChips] = useState<string[]>([]);
  const [lines, setLines] = useState<ChatLine[]>([STARTER]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ suggestions: string[] }>("/help/suggestions")
      .then((res) => setChips(res.suggestions ?? []))
      .catch(() =>
        setChips([
          "¿Cómo creo un evento?",
          "¿Cómo importo mi Excel?",
          "¿Cómo envío las invitaciones?",
        ]),
      );
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, open]);

  const ask = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setLines((current) => [
      ...current,
      { id: `me-${Date.now()}`, from: "me", text: message },
    ]);
    setBusy(true);
    try {
      const res = await api<HelpReply>("/help/chat", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setLines((current) => [
        ...current,
        {
          id: `bot-${Date.now()}`,
          from: "bot",
          text: res.reply,
          href: res.href,
        },
      ]);
      if (res.suggestions?.length) setChips(res.suggestions);
    } catch {
      setLines((current) => [
        ...current,
        {
          id: `err-${Date.now()}`,
          from: "bot",
          text: "No pude responder ahora. Intenta de nuevo o abre un ticket en Soporte.",
          href: "/eventos/soporte",
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-40 flex flex-col items-end gap-3 md:bottom-6 md:right-6">
      {open ? (
        <div className="pointer-events-auto flex h-[min(32rem,calc(100vh-7rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lift">
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-gold-soft text-gold">
              <Bot className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Asistente Alanna</p>
              <p className="text-[11px] text-muted-foreground">
                Te digo cómo hacer las cosas aquí
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Cerrar chat"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {lines.map((line) => (
              <div
                key={line.id}
                className={cn(
                  "flex",
                  line.from === "me" ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm",
                    line.from === "me"
                      ? "bg-gold-soft text-gold-foreground"
                      : "bg-secondary",
                  )}
                >
                  {line.text}
                  {line.from === "bot" && line.href ? (
                    <a
                      href={line.href}
                      className="mt-2 block text-xs font-medium text-gold hover:underline"
                    >
                      Ir a esa pantalla
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
            {busy ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-gold" />{" "}
                Escribiendo…
              </div>
            ) : null}
            <div ref={endRef} />
          </div>

          <div className="border-t border-border p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => void ask(chip)}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-[11px] hover:border-gold/50 hover:text-foreground"
                >
                  {chip}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="¿Qué quieres hacer?"
                className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button type="submit" size="sm" disabled={busy || !input.trim()}>
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift transition-transform hover:scale-105"
        aria-label={open ? "Cerrar asistente" : "Abrir asistente de Alanna"}
      >
        {open ? <X className="size-5" /> : <Bot className="size-6" />}
      </button>
    </div>
  );
}
