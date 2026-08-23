import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEvent, useStore } from "@/lib/mock/store";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/$eventId/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración del evento · Alanna" },
      { name: "description", content: "Datos del evento, equipo y permisos por rol." },
      { property: "og:title", content: "Configuración del evento · Alanna" },
      { property: "og:description", content: "Datos del evento, equipo y permisos por rol." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Configuracion,
});

function Configuracion() {
  const { eventId } = Route.useParams();
  const { event, members, rolePermissions } = useEvent(eventId);
  const { updateEvent, inviteMember, updatePermission } = useStore();
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "Asistente" });
  if (!event) return null;
  const roles = [...new Set(rolePermissions.map((p) => p.role))];

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
          {roles.map((role) => {
            const perms = rolePermissions.filter((p) => p.role === role);
            return (
              <div key={role} className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{role}</p>
                  <Badge variant="outline" className="rounded-full text-[11px]">{perms.length} permisos</Badge>
                </div>
                <ul className="mt-3 space-y-2 text-sm">
                  {perms.map((p) => (
                    <li key={p.id} className="flex items-center gap-2">
                      <Check className="size-3.5 text-success" />
                      <span className="flex-1 text-muted-foreground">{p.permission}</span>
                      <Switch checked={p.enabled} onCheckedChange={(c) => updatePermission(eventId, p.id, c)} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Equipo del evento</h2>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">Invitar miembro</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invitar miembro</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input value={invite.name} onChange={(e) => setInvite((v) => ({ ...v, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Correo</Label>
                  <Input type="email" value={invite.email} onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Rol</Label>
                  <Input value={invite.role} onChange={(e) => setInvite((v) => ({ ...v, role: e.target.value }))} />
                </div>
                <Button
                  onClick={() => {
                    if (!invite.name.trim()) return;
                    inviteMember(eventId, invite);
                    setInvite({ name: "", email: "", role: "Asistente" });
                    setOpen(false);
                    toast.success("Miembro agregado");
                  }}
                >
                  Guardar
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        <div className="mt-4 divide-y divide-border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-gold-soft text-[11px] font-semibold text-gold-foreground">
                {m.initials}
              </span>
              <p className="flex-1 text-sm font-medium">{m.name}</p>
              <Badge variant="outline" className="rounded-full">{m.role}</Badge>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
