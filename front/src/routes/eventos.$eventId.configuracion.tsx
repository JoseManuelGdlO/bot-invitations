import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEvent, useStore } from "@/lib/mock/store";
import { toast } from "sonner";
import { hasEventPerm, PERMS } from "@/lib/permissions";
import { ApiError } from "@/lib/api/client";
import { TimezoneSelect } from "@/components/timezone-select";

export const Route = createFileRoute("/eventos/$eventId/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración del evento · Alanna" },
      {
        name: "description",
        content: "Datos del evento, equipo y permisos por rol.",
      },
      { property: "og:title", content: "Configuración del evento · Alanna" },
      {
        property: "og:description",
        content: "Datos del evento, equipo y permisos por rol.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Configuracion,
});

function Configuracion() {
  const { eventId } = Route.useParams();
  const { event, members, rolePermissions, access } = useEvent(eventId);
  const {
    session,
    updateEvent,
    inviteMember,
    updateMember,
    removeMember,
    updatePermission,
    deleteEvent,
  } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [invite, setInvite] = useState({
    name: "",
    email: "",
    role: "Asistente",
  });
  const [memberToRemove, setMemberToRemove] = useState<string | null>(null);
  const [deleteEventOpen, setDeleteEventOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inviting, setInviting] = useState(false);
  const invitingRef = useRef(false);
  if (!event) return null;
  const roles = [...new Set(rolePermissions.map((p) => p.role))];
  const defaultRole = roles.includes("Asistente")
    ? "Asistente"
    : roles[0] || "Asistente";
  const canEditEvent = hasEventPerm(access, PERMS.EDIT_EVENT);
  const canManageTeam = hasEventPerm(access, PERMS.MANAGE_TEAM);
  const isOwner = Boolean(session?.isAdmin || access?.isOwner);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-5 py-8 md:px-8">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl">Datos del evento</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              value={event.name}
              disabled={!canEditEvent}
              onChange={(e) => updateEvent(eventId, { name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Anfitriones</Label>
            <Input
              value={event.hosts}
              disabled={!canEditEvent}
              onChange={(e) => updateEvent(eventId, { hosts: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Fecha</Label>
            <Input
              type="date"
              value={event.date}
              disabled={!canEditEvent}
              onChange={(e) => updateEvent(eventId, { date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Hora</Label>
            <Input
              type="time"
              value={event.time}
              disabled={!canEditEvent}
              onChange={(e) => updateEvent(eventId, { time: e.target.value })}
            />
          </div>
          <TimezoneSelect
            value={event.timezone}
            disabled={!canEditEvent}
            onChange={(timezone) => updateEvent(eventId, { timezone })}
          />
          <div className="space-y-2">
            <Label>Lugar</Label>
            <Input
              value={event.venue}
              disabled={!canEditEvent}
              onChange={(e) => updateEvent(eventId, { venue: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Nombre corto</Label>
            <Input
              value={event.shortName}
              disabled={!canEditEvent}
              onChange={(e) =>
                updateEvent(eventId, { shortName: e.target.value })
              }
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Dirección</Label>
            <Textarea
              value={event.address}
              rows={2}
              disabled={!canEditEvent}
              onChange={(e) =>
                updateEvent(eventId, { address: e.target.value })
              }
            />
          </div>
        </div>
        {canEditEvent ? (
          <Button
            className="mt-5"
            onClick={() => toast.success("Configuración guardada")}
          >
            Guardar cambios
          </Button>
        ) : (
          <p className="mt-5 text-sm text-muted-foreground">
            Solo puedes consultar los datos de este evento.
          </p>
        )}
      </section>

      {canManageTeam ? (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Roles y permisos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Define qué puede hacer cada miembro del equipo en este evento.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {roles.map((role) => {
              const perms = rolePermissions.filter((p) => p.role === role);
              return (
                <div key={role} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{role}</p>
                    <Badge
                      variant="outline"
                      className="rounded-full text-[11px]"
                    >
                      {perms.length} permisos
                    </Badge>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm">
                    {perms.map((p) => (
                      <li key={p.id} className="flex items-center gap-2">
                        <Check className="size-3.5 text-success" />
                        <span className="flex-1 text-muted-foreground">
                          {p.permission}
                        </span>
                        <Switch
                          checked={p.enabled}
                          onCheckedChange={(c) =>
                            updatePermission(eventId, p.id, c)
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Equipo del evento</h2>
          {canManageTeam ? (
            <Dialog
              open={open}
              onOpenChange={(next) => {
                if (!inviting) setOpen(next);
              }}
            >
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
                    <Input
                      value={invite.name}
                      onChange={(e) =>
                        setInvite((v) => ({ ...v, name: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Correo</Label>
                    <Input
                      type="email"
                      value={invite.email}
                      onChange={(e) =>
                        setInvite((v) => ({ ...v, email: e.target.value }))
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Rol</Label>
                    <Select
                      value={
                        roles.includes(invite.role) ? invite.role : defaultRole
                      }
                      onValueChange={(role) =>
                        setInvite((v) => ({ ...v, role }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un rol" />
                      </SelectTrigger>
                      <SelectContent>
                        {roles.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    disabled={inviting}
                    onClick={async () => {
                      if (invitingRef.current) return;
                      if (!invite.name.trim()) {
                        toast.error("El nombre es requerido");
                        return;
                      }
                      if (!invite.email.trim()) {
                        toast.error("El correo es requerido");
                        return;
                      }
                      const role = roles.includes(invite.role)
                        ? invite.role
                        : defaultRole;
                      invitingRef.current = true;
                      setInviting(true);
                      try {
                        const member = await inviteMember(eventId, {
                          ...invite,
                          role,
                        });
                        setInvite({ name: "", email: "", role: defaultRole });
                        setOpen(false);
                        if (member.emailSent === false) {
                          toast.error(
                            "Miembro guardado, pero no se envió el correo",
                            {
                              description:
                                member.emailError ||
                                "Revisa SMTP_USER y SMTP_PASS en el servidor.",
                            },
                          );
                        } else {
                          toast.success(
                            "Miembro agregado e invitación enviada",
                          );
                        }
                      } catch (err) {
                        toast.error(
                          err instanceof ApiError
                            ? err.message
                            : "Error al guardar el miembro",
                        );
                      } finally {
                        invitingRef.current = false;
                        setInviting(false);
                      }
                    }}
                  >
                    {inviting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {inviting ? "Enviando…" : "Guardar"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
        <div className="mt-4 divide-y divide-border">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 py-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-gold-soft text-[11px] font-semibold text-gold-foreground">
                {m.initials}
              </span>
              <p className="min-w-0 flex-1 text-sm font-medium">{m.name}</p>
              {canManageTeam && !m.isOwner ? (
                <Select
                  value={m.role}
                  onValueChange={async (role) => {
                    try {
                      await updateMember(eventId, m.id, { role });
                      toast.success(`Rol actualizado a ${role}`);
                    } catch (err) {
                      toast.error(
                        err instanceof ApiError
                          ? err.message
                          : "No se pudo cambiar el rol",
                      );
                    }
                  }}
                >
                  <SelectTrigger className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="outline" className="rounded-full">
                  {m.role}
                </Badge>
              )}
              {canManageTeam && !m.isOwner ? (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Quitar del equipo"
                  onClick={() => setMemberToRemove(m.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {isOwner ? (
        <section className="rounded-2xl border border-destructive/30 bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Zona de peligro</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Eliminar el evento borra invitados, conversaciones y configuración.
            Esta acción no se puede deshacer.
          </p>
          <Button
            className="mt-4"
            variant="destructive"
            onClick={() => setDeleteEventOpen(true)}
          >
            Eliminar evento
          </Button>
        </section>
      ) : null}

      <AlertDialog
        open={!!memberToRemove}
        onOpenChange={(next) => !next && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Quitar a este miembro del equipo?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Dejará de ver este evento. Puedes volver a invitarlo más adelante.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!memberToRemove) return;
                try {
                  await removeMember(eventId, memberToRemove);
                  toast.success("Miembro dado de baja");
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.message
                      : "No se pudo dar de baja",
                  );
                } finally {
                  setMemberToRemove(null);
                }
              }}
            >
              Quitar del equipo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteEventOpen} onOpenChange={setDeleteEventOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar este evento por completo?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán invitados, conversaciones, mensajes, equipo y
              configuración. Esta baja es total y no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await deleteEvent(eventId);
                  toast.success("Evento eliminado");
                  navigate({ to: "/eventos" });
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.message
                      : "No se pudo eliminar el evento",
                  );
                } finally {
                  setBusy(false);
                  setDeleteEventOpen(false);
                }
              }}
            >
              Eliminar todo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
