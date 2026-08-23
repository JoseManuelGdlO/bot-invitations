import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, FileText, Sheet as SheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { statsFor, useEvent } from "@/lib/mock/store";
import { formatDate } from "@/lib/mock/format";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/$eventId/lista-final")({
  head: () => ({
    meta: [
      { title: "Lista final de invitados · Alanna" },
      { name: "description", content: "Resumen final de confirmaciones y exportación de la lista del evento." },
      { property: "og:title", content: "Lista final de invitados · Alanna" },
      { property: "og:description", content: "Resumen final de confirmaciones del evento." },
    ],
  }),
  component: ListaFinal,
});

function ListaFinal() {
  const { eventId } = Route.useParams();
  const { event, guests } = useEvent(eventId);
  const s = statsFor(guests);
  const confirmed = guests.filter((g) => g.confirmed > 0);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:px-8">
      <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">Lista final de invitados</p>
        <h1 className="mt-2 font-display text-4xl">{event?.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {event ? `${formatDate(event.date)} · ${event.venue}` : null}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-4">
          {[
            ["Total invitados", s.people, "text-foreground"],
            ["Confirmados", s.confirmedPeople, "text-success"],
            ["No asistirán", s.rejectedPeople, "text-rose-foreground"],
            ["Pendientes", s.pending + s.noReply, "text-warning"],
          ].map(([label, value, tone]) => (
            <div key={String(label)} className="rounded-xl border border-border p-5">
              <p className={`font-display text-3xl ${tone}`}>{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button onClick={() => toast.success("Excel generado (demo)")}>
            <FileSpreadsheet className="size-4" /> Exportar Excel
          </Button>
          <Button variant="outline" onClick={() => toast.success("CSV generado (demo)")}>
            <SheetIcon className="size-4" /> Exportar CSV
          </Button>
          <Button variant="outline" onClick={() => toast.success("Lista final descargada (demo)")}>
            <Download className="size-4" /> Descargar lista final
          </Button>
          <Button variant="outline" onClick={() => toast.success("Reporte generado (demo)")}>
            <FileText className="size-4" /> Generar reporte
          </Button>
        </div>
      </div>

      <section className="mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="border-b border-border px-6 py-4">
          <h2 className="font-display text-2xl">Invitados que asistirán</h2>
          <p className="text-xs text-muted-foreground">{confirmed.length} invitaciones con al menos un asistente</p>
        </div>
        <ul className="divide-y divide-border">
          {confirmed.map((g) => (
            <li key={g.id} className="flex items-center gap-4 px-6 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-success-soft text-[11px] font-semibold text-success">
                {g.confirmed}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{g.rep}</p>
                <p className="text-[11px] text-muted-foreground">{g.table} · {g.guestType}</p>
              </div>
              <StatusBadge status={g.status} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
