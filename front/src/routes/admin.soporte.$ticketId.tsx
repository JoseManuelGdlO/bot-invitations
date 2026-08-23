import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api/client";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  statusTone,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/soporte/$ticketId")({
  component: AdminSupportThread,
});

function AdminSupportThread() {
  const { ticketId } = Route.useParams();
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const load = () =>
    api<SupportTicket>(`/admin/support/tickets/${ticketId}`)
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
      const updated = await api<SupportTicket>(`/admin/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
      setTicket(updated);
      setBody("");
      toast.success("Respuesta enviada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo responder");
    } finally {
      setSending(false);
    }
  };

  const patch = async (payload: { status?: TicketStatus; priority?: TicketPriority }) => {
    try {
      const updated = await api<SupportTicket>(`/admin/support/tickets/${ticketId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setTicket(updated);
      toast.success("Ticket actualizado");
    } catch {
      toast.error("No se pudo actualizar el ticket");
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
      <Link to="/admin/soporte" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Todos los tickets
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">{ticket.code}</p>
          <h1 className="mt-1 font-display text-3xl">{ticket.subject}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {ticket.user?.name} · {ticket.user?.email}
            {ticket.user?.businessName ? ` · ${ticket.user.businessName}` : ""}
          </p>
        </div>
        <Badge variant={statusTone(ticket.status)}>{STATUS_LABEL[ticket.status]}</Badge>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Badge variant="outline">{CATEGORY_LABEL[ticket.category]}</Badge>
        <Select value={ticket.priority} onValueChange={(priority) => patch({ priority: priority as TicketPriority })}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ticket.status} onValueChange={(status) => patch({ status: status as TicketStatus })}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-8 flex-1 space-y-3">
        {(ticket.messages ?? []).map((message) => (
          <div
            key={message.id}
            className={cn(
              "max-w-[90%] rounded-2xl px-4 py-3",
              message.from === "admin"
                ? "ml-auto bg-gold-soft text-gold-foreground"
                : "bg-secondary",
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {message.from === "admin" ? "Tú · Soporte" : message.authorName}
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

      <form onSubmit={reply} className="mt-8 space-y-3 border-t border-border pt-6">
        <Label htmlFor="reply">Responder al cliente</Label>
        <Textarea
          id="reply"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escribe la respuesta. El cliente la verá en su panel."
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={sending || !body.trim()}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : null}
            Enviar respuesta
          </Button>
          {ticket.status !== "closed" ? (
            <Button type="button" variant="outline" onClick={() => patch({ status: "closed" })}>
              Cerrar ticket
            </Button>
          ) : null}
        </div>
      </form>
    </main>
  );
}
