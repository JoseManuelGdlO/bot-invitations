import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useEvent, useStore } from "@/lib/mock/store";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/$eventId/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración del evento · Alanna" },
      { name: "description", content: "Datos del evento, equipo y permisos por rol." },
      { property: "og:title", content: "Configuración del evento · Alanna" },
      { property: "og:description", content: "Datos del evento, equipo y permisos por rol." },
    ],
  }),
  component: Configuracion,
});

const roles = [
  { role: "Administrador", perms: ["Crear eventos", "Editar todo", "Gestionar equipo", "Exportar datos"] },
  { role: "Wedding Planner", perms: ["Editar evento", "Configurar asistente", "Responder conversaciones", "Exportar datos"] },
  { role: "Coordinador", perms: ["Ver invitados", "Responder conversaciones", "Registrar confirmaciones"] },
  { role: "Asistente", perms: ["Ver invitados", "Ver conversaciones"] },
];

function Configuracion() {
  const { eventId } = Route.useParams();
  const { event } = useEvent(eventId);
  const { updateEvent } = useStore();
  if (!event) return null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-5 py-8 md:px-8">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl">Datos del evento</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input value={event.name} onChange={(e) => updateEvent(eventId, { name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Anfitriones</Label>
            <Input value={event.hosts} onChange={(e) => updateEvent(eventId, { hosts: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input type="date" value={event.date} onChange={(e) => updateEvent(eventId, { date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Hora</Label>
            <Input type="time" value={event.time} onChange={(e) => updateEvent(eventId, { time: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Lugar</Label>
            <Input value={event.venue} onChange={(e) => updateEvent(eventId, { venue: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Nombre corto</Label>
            <Input value={event.shortName} onChange={(e) => updateEvent(eventId, { shortName: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Dirección</Label>
            <Textarea value={event.address} rows={2} onChange={(e) => updateEvent(eventId, { address: e.target.value })} />
          </div>
        </div>
        <Button className="mt-5" onClick={() => toast.success("Configuración guardada")}>Guardar cambios</Button>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl">Roles y permisos</h2>
        <p className="mt-1 text-sm text-muted-foreground">Define qué puede hacer cada miembro del equipo en este evento.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {roles.map((r) => (
            <div key={r.role} className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">{r.role}</p>
                <Badge variant="outline" className="rounded-full text-[11px]">{r.perms.length} permisos</Badge>
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {r.perms.map((p) => (
                  <li key={p} className="flex items-center gap-2">
                    <Check className="size-3.5 text-success" />
                    <span className="flex-1 text-muted-foreground">{p}</span>
                    <Switch defaultChecked />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl">Equipo del evento</h2>
        <div className="mt-4 divide-y divide-border">
          {[
            ["Jose Manuel García", "Administrador", "JG"],
            ["Andrea Peña", "Wedding Planner", "AP"],
            ["Luis Torres", "Coordinador", "LT"],
            ["Sara Ríos", "Asistente", "SR"],
          ].map(([name, role, initials]) => (
            <div key={name} className="flex items-center gap-3 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-gold-soft text-[11px] font-semibold text-gold-foreground">
                {initials}
              </span>
              <p className="flex-1 text-sm font-medium">{name}</p>
              <Badge variant="outline" className="rounded-full">{role}</Badge>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
