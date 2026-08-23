import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  STATUS_LABEL,
  statusTone,
  type SupportTicket,
  type TicketCategory,
  type TicketStatus,
} from "@/lib/support";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/soporte/")({
  component: ClientSupportList,
});

function ClientSupportList() {
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [openForm, setOpenForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<TicketCategory>("otro");
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () =>
    api<SupportTicket[]>("/support/tickets")
      .then(setRows)
      .catch(() => toast.error("No se pudieron cargar tus tickets"));

  useEffect(() => {
    load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const ticket = await api<SupportTicket>("/support/tickets", {
        method: "POST",
        body: JSON.stringify({ subject, category, body }),
      });
      toast.success("Ticket enviado", { description: `${ticket.code} · te respondemos aquí mismo.` });
      setSubject("");
      setBody("");
      setOpenForm(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear el ticket");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8 md:px-8 md:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">Ayuda</p>
          <h1 className="mt-1 font-display text-4xl">Soporte</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Levanta un ticket y el equipo de Alanna te responde en esta misma conversación.
          </p>
        </div>
        <Button type="button" onClick={() => setOpenForm((v) => !v)}>
          <Plus className="size-4" /> Nuevo ticket
        </Button>
      </div>

      {openForm ? (
        <form onSubmit={create} className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="space-y-2">
            <Label htmlFor="subject">Asunto</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej. No puedo importar mi lista de invitados"
            />
          </div>
          <div className="space-y-2">
            <Label>Tema</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as TicketCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">¿Qué está pasando?</Label>
            <Textarea
              id="body"
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Cuéntanos el evento, lo que intentaste y el error que viste."
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Enviar ticket
          </Button>
        </form>
      ) : null}

      <div className="mt-8 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            Aún no tienes tickets. Si algo no funciona, ábrelo aquí y te respondemos.
          </div>
        ) : (
          rows.map((ticket) => (
            <Link
              key={ticket.id}
              to="/eventos/soporte/$ticketId"
              params={{ ticketId: ticket.id }}
              className="block rounded-2xl border border-border bg-card px-5 py-4 shadow-soft transition-colors hover:border-gold/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{ticket.code}</p>
                  <h2 className="mt-0.5 font-display text-xl">{ticket.subject}</h2>
                </div>
                <Badge variant={statusTone(ticket.status)}>{STATUS_LABEL[ticket.status as TicketStatus]}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{CATEGORY_LABEL[ticket.category]}</p>
              {ticket.lastMessagePreview ? (
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{ticket.lastMessagePreview}</p>
              ) : null}
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
