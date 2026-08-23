import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api/client";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  statusTone,
  type SupportTicket,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/soporte/$ticketId")({
  component: ClientSupportThread,
});

function ClientSupportThread() {
  const { ticketId } = Route.useParams();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    api<SupportTicket>(`/support/tickets/${ticketId}`)
      .then(setTicket)
      .catch(() => toast.error("No se pudo abrir el ticket"));

  useEffect(() => {
    load();
  }, [ticketId]);

  const reply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      const updated = await api<SupportTicket>(`/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setTicket(updated);
      setBody("");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo enviar el mensaje");
    } finally {
      setSending(false);
    }
  };

  const close = async () => {
    try {
      const updated = await api<SupportTicket>(`/support/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "closed" }),
      });
      setTicket(updated);
      toast.success("Ticket cerrado");
    } catch {
      toast.error("No se pudo cerrar el ticket");
    }
  };

  if (!ticket) {
    return (
      <div className="flex flex-1 items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8 md:px-8 md:py-10">
      <Link to="/eventos/soporte" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Mis tickets
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{ticket.code}</p>
          <h1 className="mt-1 font-display text-3xl">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{CATEGORY_LABEL[ticket.category]}</p>
        </div>
        <Badge variant={statusTone(ticket.status)}>{STATUS_LABEL[ticket.status]}</Badge>
      </div>

      <div className="mt-8 flex-1 space-y-3">
        {(ticket.messages ?? []).map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[90%] rounded-2xl px-4 py-3",
              message.from === "client" ? "ml-auto bg-gold-soft text-gold-foreground" : "bg-secondary",
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {message.from === "client" ? "Tú" : "Soporte Alanna"}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{message.body}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {new Date(message.createdAt).toLocaleString("es-MX", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        ))}
      </div>

      {ticket.status === "closed" ? (
        <p className="mt-8 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
          Este ticket está cerrado. Si el tema sigue, abre uno nuevo desde Soporte.
        </p>
      ) : (
        <form onSubmit={reply} className="mt-8 space-y-3 border-t border-border pt-6">
          <Label htmlFor="reply">Tu respuesta</Label>
          <Textarea
            id="reply"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Escribe aquí y el equipo de Alanna lo verá en el backoffice."
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={sending || !body.trim()}>
              {sending ? <Loader2 className="size-4 animate-spin" /> : null}
              Enviar
            </Button>
            <Button type="button" variant="outline" onClick={close}>
              Cerrar ticket
            </Button>
          </div>
        </form>
      )}
    </main>
  );
}
