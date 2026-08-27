import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Download,
  MessageSquare,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { useEvent, useStore } from "@/lib/mock/store";
import { STATUS_META, WHATSAPP_LABEL } from "@/lib/mock/format";
import type { Guest } from "@/lib/mock/types";
import { toast } from "sonner";
import { PlanLimitBanner } from "@/components/plan-limit";
import { PERMS } from "@/lib/permissions";
import { ApiError } from "@/lib/api/client";

export const Route = createFileRoute("/eventos/$eventId/invitados")({
  head: () => ({
    meta: [
      { title: "Invitados · Alanna Confirmaciones" },
      {
        name: "description",
        content:
          "Tabla CRM con todas las invitaciones y su estado de confirmación.",
      },
      { property: "og:title", content: "Invitados · Alanna Confirmaciones" },
      {
        property: "og:description",
        content: "Todas las invitaciones y su estado de confirmación.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Invitados,
});

function Invitados() {
  const { eventId } = Route.useParams();
  const { guests } = useEvent(eventId);
  const {
    updateGuest,
    remindGuest,
    exportGuests,
    session,
    hasPerm,
    deleteGuest,
  } = useStore();
  const canExport = hasPerm(eventId, PERMS.EXPORT);
  const canConfirm = hasPerm(eventId, PERMS.CONFIRM);
  const canEditGuest = hasPerm(eventId, PERMS.EDIT_ALL);
  const canRemind = hasPerm(eventId, PERMS.REPLY);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guestToDelete, setGuestToDelete] = useState<Guest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const selected = guests.find((g) => g.id === selectedId) ?? null;

  const rows = useMemo(
    () =>
      guests.filter(
        (g) =>
          (status === "todos" || g.status === status) &&
          (g.rep.toLowerCase().includes(q.toLowerCase()) ||
            g.phone.includes(q)),
      ),
    [guests, q, status],
  );

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1400px] flex-1 px-5 py-8 md:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar representante o teléfono"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56">
            <SlidersHorizontal className="size-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {Object.entries(STATUS_META).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canExport ? (
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await exportGuests(eventId, "xlsx");
                toast.success("Exportación generada");
              } catch {
                toast.error("No se pudo exportar");
              }
            }}
          >
            <Download className="size-4" /> Exportar
          </Button>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {rows.length} invitaciones · {rows.reduce((a, g) => a + g.invited, 0)}{" "}
        personas totales
      </p>
      <div className="mt-4">
        <PlanLimitBanner session={session} kind="guest" />
      </div>

      <div className="mt-4 min-w-0 max-w-full overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <Table className="min-w-[1200px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="whitespace-nowrap">Representante</TableHead>
              <TableHead className="whitespace-nowrap">Teléfono</TableHead>
              <TableHead className="whitespace-nowrap text-center">
                Invitados
              </TableHead>
              <TableHead className="whitespace-nowrap text-center">
                Confirmados
              </TableHead>
              <TableHead className="whitespace-nowrap">
                Estado WhatsApp
              </TableHead>
              <TableHead className="whitespace-nowrap">
                Último mensaje
              </TableHead>
              <TableHead className="max-w-56 whitespace-nowrap">
                Última respuesta
              </TableHead>
              <TableHead className="whitespace-nowrap">Confirmación</TableHead>
              <TableHead className="whitespace-nowrap">Seguimiento</TableHead>
              <TableHead className="whitespace-nowrap text-center">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => (
              <TableRow
                key={g.id}
                className="cursor-pointer transition-colors"
                onClick={() => setSelectedId(g.id)}
              >
                <TableCell className="whitespace-nowrap">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-gold-soft text-[11px] font-semibold text-gold-foreground">
                      {g.rep
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                    <div>
                      <p className="font-medium leading-tight">{g.rep}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {g.guestType} · {g.table}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {g.phone}
                </TableCell>
                <TableCell className="text-center font-medium">
                  {g.invited}
                </TableCell>
                <TableCell className="text-center font-medium text-success">
                  {g.confirmed}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {WHATSAPP_LABEL[g.whatsapp]}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {g.lastMessage || "—"}
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {g.lastReply || "—"}
                </TableCell>
                <TableCell>
                  <StatusBadge status={g.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {g.followUp || "—"}
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    {canRemind ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Enviar recordatorio a ${g.rep}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toast.success(`Mensaje enviado a ${g.rep}`);
                          remindGuest(g.id);
                        }}
                      >
                        <Send className="size-4" />
                      </Button>
                    ) : null}
                    {canEditGuest ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Eliminar a ${g.rep}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setGuestToDelete(g);
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-display text-2xl">
                  {selected.rep}
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6 text-sm">
                <StatusBadge status={selected.status} />
                {(
                  [
                    ["phone", "Teléfono"],
                    ["invited", "Invitados asignados"],
                    ["confirmed", "Confirmados"],
                    ["table", "Mesa"],
                    ["family", "Familia"],
                    ["guestType", "Tipo de invitado"],
                    ["tag", "Etiqueta"],
                    ["followUp", "Seguimiento"],
                    ["notes", "Notas"],
                  ] as const
                ).map(([key, label]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-6 border-b border-border/60 pb-2"
                  >
                    <span className="text-muted-foreground">{label}</span>
                    <Input
                      className="h-8 max-w-48 text-right"
                      type={
                        key === "invited" || key === "confirmed"
                          ? "number"
                          : "text"
                      }
                      value={String(selected[key] ?? "")}
                      disabled={
                        !canEditGuest && !(canConfirm && key === "confirmed")
                      }
                      onChange={(e) =>
                        updateGuest(selected.id, {
                          [key]:
                            key === "invited" || key === "confirmed"
                              ? Number(e.target.value) || 0
                              : e.target.value,
                        })
                      }
                    />
                  </div>
                ))}
                {selected.lastReply ? (
                  <div className="rounded-xl bg-secondary/60 p-3">
                    <p className="text-xs text-muted-foreground">
                      Última respuesta
                    </p>
                    <p className="mt-1">“{selected.lastReply}”</p>
                  </div>
                ) : null}
                <div className="flex gap-2 pt-2">
                  {canConfirm ? (
                    <Button
                      className="flex-1"
                      onClick={() => {
                        updateGuest(selected.id, {
                          status: "confirmado",
                          confirmed: selected.invited,
                          whatsapp: "respondido",
                        });
                        toast.success("Invitación confirmada manualmente");
                        setSelectedId(null);
                      }}
                    >
                      Marcar confirmado
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() =>
                      navigate({
                        to: "/eventos/$eventId/conversaciones",
                        params: { eventId },
                        search: { guestId: selected.id },
                      })
                    }
                  >
                    <MessageSquare className="size-4" /> Conversación
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!guestToDelete}
        onOpenChange={(open) => !open && !deleting && setGuestToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar a {guestToDelete?.rep}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Se quitará de la lista de invitados y se borrará su conversación.
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                if (!guestToDelete) return;
                setDeleting(true);
                try {
                  await deleteGuest(guestToDelete.id);
                  if (selectedId === guestToDelete.id) setSelectedId(null);
                  toast.success("Invitación eliminada");
                  setGuestToDelete(null);
                } catch (err) {
                  toast.error(
                    err instanceof ApiError
                      ? err.message
                      : "No se pudo eliminar al invitado",
                  );
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
