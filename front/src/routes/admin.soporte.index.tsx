import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import {
  CATEGORY_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  statusTone,
  type SupportTicket,
  type TicketStatus,
} from "@/lib/support";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/soporte/")({
  component: AdminSupportList,
});

function AdminSupportList() {
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("waiting_admin");

  const load = (nextStatus = status, q = search) => {
    const params = new URLSearchParams();
    if (nextStatus && nextStatus !== "all") params.set("status", nextStatus);
    if (q.trim()) params.set("search", q.trim());
    const query = params.toString();
    api<SupportTicket[]>(`/admin/support/tickets${query ? `?${query}` : ""}`)
      .then(setRows)
      .catch(() => toast.error("No se pudieron cargar los tickets"));
  };

  useEffect(() => {
    load("waiting_admin", "");
  }, []);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:px-8 md:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
        Backoffice
      </p>
      <h1 className="mt-1 font-display text-4xl">Soporte</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Tickets que levantan los clientes desde su panel. Responde aquí para que
        lo vean en su cuenta.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por cliente, correo o folio"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") load(status, search);
            }}
          />
        </div>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            load(value, search);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="waiting_admin">Esperando a Alanna</SelectItem>
            <SelectItem value="waiting_client">Esperando al cliente</SelectItem>
            <SelectItem value="closed">Cerrados</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            No hay tickets en este filtro.
          </div>
        ) : (
          rows.map((ticket) => (
            <Link
              key={ticket.id}
              to="/admin/soporte/$ticketId"
              params={{ ticketId: ticket.id }}
              className="block rounded-2xl border border-border bg-card px-5 py-4 shadow-soft transition-colors hover:border-gold/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{ticket.code}</p>
                  <h2 className="mt-0.5 font-display text-xl">
                    {ticket.subject}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {ticket.user?.name || "Cliente"}
                    {ticket.user?.businessName
                      ? ` · ${ticket.user.businessName}`
                      : ""}
                    {ticket.user?.email ? ` · ${ticket.user.email}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={statusTone(ticket.status)}>
                    {STATUS_LABEL[ticket.status as TicketStatus]}
                  </Badge>
                  <Badge variant="outline">
                    {CATEGORY_LABEL[ticket.category]}
                  </Badge>
                  <Badge variant="secondary">
                    {PRIORITY_LABEL[ticket.priority]}
                  </Badge>
                </div>
              </div>
              {ticket.lastMessagePreview ? (
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
                  {ticket.lastMessagePreview}
                </p>
              ) : null}
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
