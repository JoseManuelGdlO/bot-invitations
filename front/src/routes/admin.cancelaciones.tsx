import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import type { CancellationRequest } from "@/lib/mock/types";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/cancelaciones")({
  component: AdminCancellations,
});

const STATUS_LABEL: Record<CancellationRequest["status"], string> = {
  pending: "Pendiente de tu visto bueno",
  approved: "Aceptada y cancelada",
  rejected: "Rechazada",
  withdrawn: "Retirada por el cliente",
};

function AdminCancellations() {
  const [rows, setRows] = useState<CancellationRequest[]>([]);
  const [status, setStatus] = useState("pending");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = (next = status) => {
    const query = next && next !== "all" ? `?status=${encodeURIComponent(next)}` : "";
    api<CancellationRequest[]>(`/admin/cancellations${query}`)
      .then(setRows)
      .catch(() => toast.error("No se pudieron cargar las solicitudes"));
  };

  useEffect(() => {
    load("pending");
  }, []);

  const decide = async (id: string, action: "approve" | "reject") => {
    setBusy(id);
    try {
      await api(`/admin/cancellations/${id}/${action}`, {
        method: "POST",
        body: JSON.stringify({ note: notes[id] || "" }),
      });
      toast.success(action === "approve" ? "Suscripción cancelada" : "Solicitud rechazada");
      load(status);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo resolver la solicitud");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8 md:px-8 md:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">Backoffice</p>
      <h1 className="mt-1 font-display text-4xl">Cancelaciones</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        El cliente solo pide la baja. La suscripción se cancela en Stripe cuando tú la aceptas.
      </p>

      <div className="mt-6 max-w-xs">
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            load(value);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pendientes</SelectItem>
            <SelectItem value="approved">Aceptadas</SelectItem>
            <SelectItem value="rejected">Rechazadas</SelectItem>
            <SelectItem value="withdrawn">Retiradas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 space-y-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
            No hay solicitudes en este filtro.
          </div>
        ) : (
          rows.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {row.user?.plan?.name || "Sin plan"} ·{" "}
                    {new Date(row.createdAt).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <h2 className="mt-1 font-display text-2xl">{row.user?.name || "Cliente"}</h2>
                  <p className="text-sm text-muted-foreground">
                    {row.user?.businessName ? `${row.user.businessName} · ` : ""}
                    {row.user?.email}
                  </p>
                </div>
                <Badge variant={row.status === "pending" ? "destructive" : "secondary"}>
                  {STATUS_LABEL[row.status]}
                </Badge>
              </div>
              <p className="mt-4 text-sm">{row.reason}</p>
              {row.adminNote ? (
                <p className="mt-3 text-sm text-muted-foreground">Nota: {row.adminNote}</p>
              ) : null}
              {row.status === "pending" ? (
                <div className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor={`note-${row.id}`}>Nota para el cliente (opcional)</Label>
                    <Textarea
                      id={`note-${row.id}`}
                      rows={2}
                      value={notes[row.id] || ""}
                      onChange={(e) => setNotes((current) => ({ ...current, [row.id]: e.target.value }))}
                      placeholder="Ej. Aceptamos la baja a partir de hoy."
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => decide(row.id, "approve")} disabled={busy === row.id}>
                      {busy === row.id ? <Loader2 className="size-4 animate-spin" /> : null}
                      Aceptar y cancelar
                    </Button>
                    <Button variant="outline" onClick={() => decide(row.id, "reject")} disabled={busy === row.id}>
                      Rechazar
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </main>
  );
}
