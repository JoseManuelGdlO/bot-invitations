import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useEvent, useStore } from "@/lib/mock/store";
import {
  GUEST_TYPE,
  STATUS_FILTER_OPTIONS,
  WHATSAPP_LABEL,
} from "@/lib/mock/format";
import type { Guest } from "@/lib/mock/types";
import { toast } from "sonner";
import { PlanLimitBanner } from "@/components/plan-limit";
import { SendGuestInvitationDialog } from "@/components/send-guest-invitation-dialog";
import { PERMS } from "@/lib/permissions";
import { ApiError } from "@/lib/api/client";

const TAG_OPTIONS = [
  "Sin etiqueta",
  "VIP",
  "Hospedaje",
  "Foráneo",
  "Mesa principal",
] as const;

const EMPTY_GUEST_FORM = {
  rep: "",
  phone: "",
  invited: "1",
  table: "",
  family: "",
  guestType: "",
  tag: "Sin etiqueta" as string,
  notes: "",
};

const PAGE_SIZES = [20, 30, 40, 50] as const;

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
    createGuest,
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(20);
  const [guestToDelete, setGuestToDelete] = useState<Guest | null>(null);
  const [guestToMessage, setGuestToMessage] = useState<Guest | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_GUEST_FORM);
  const showTableColumn = guests.some((g) => (g.table ?? "").trim() !== "");

  const rows = useMemo(
    () =>
      guests.filter(
        (g) =>
          (status === "todos" || g.tag === (status) || g.status === status) &&
          (g.rep.toLowerCase().includes(q.toLowerCase()) ||
            g.phone.includes(q)),
      ),
    [guests, q, status],
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, safePage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [q, status, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <main className="mx-auto flex h-full min-h-0 w-full min-w-0 max-w-[1400px] flex-1 flex-col overflow-hidden px-5 py-8 md:px-8">
      <div className="flex shrink-0 flex-wrap items-center gap-3">
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
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {STATUS_FILTER_OPTIONS.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
            {Object.entries(GUEST_TYPE).map(([ky, vl]) => (
              <SelectItem key={ky} value={ky}>
                {vl.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(pageSize)}
          onValueChange={(value) =>
            setPageSize(Number(value) as (typeof PAGE_SIZES)[number])
          }
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size} por página
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
        { canEditGuest ? (
          <Dialog
            open={addOpen}
            onOpenChange={(next) => {
              if (!saving) {
                setAddOpen(next);
                if (!next) setForm(EMPTY_GUEST_FORM);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> Agregar invitado
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Agregar invitado</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-3"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const rep = form.rep.trim();
                  const phone = form.phone.trim();
                  if (!rep || !phone) {
                    toast.error("Nombre y teléfono son requeridos");
                    return;
                  }
                  const invited = Number(form.invited) || 1;
                  setSaving(true);
                  try {
                    await createGuest(eventId, {
                      rep,
                      phone,
                      invited,
                      table: form.table.trim(),
                      family: form.family.trim(),
                      guestType: form.guestType.trim(),
                      tag: form.tag.trim(),
                      notes: form.notes.trim(),
                    });
                    toast.success("Invitado agregado");
                    setForm(EMPTY_GUEST_FORM);
                    setAddOpen(false);
                  } catch (err) {
                    toast.error(
                      err instanceof ApiError
                        ? err.message
                        : "No se pudo agregar al invitado",
                    );
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="guest-rep">Nombre</Label>
                  <Input
                    id="guest-rep"
                    value={form.rep}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, rep: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-phone">Teléfono</Label>
                  <Input
                    id="guest-phone"
                    value={form.phone}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-invited">Invitados</Label>
                  <Input
                    id="guest-invited"
                    type="number"
                    min={1}
                    value={form.invited}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, invited: e.target.value }))
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="guest-table">Mesa</Label>
                    <Input
                      id="guest-table"
                      value={form.table}
                      disabled={saving}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, table: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest-family">Familia</Label>
                    <Input
                      id="guest-family"
                      value={form.family}
                      disabled={saving}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, family: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest-type">Tipo</Label>
                    <Input
                      id="guest-type"
                      value={form.guestType}
                      disabled={saving}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, guestType: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Etiqueta</Label>
                    <Select
                      value={form.tag}
                      disabled={saving}
                      onValueChange={(value) =>
                        setForm((f) => ({ ...f, tag: value }))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Etiqueta" />
                      </SelectTrigger>
                      <SelectContent>
                        {TAG_OPTIONS.map((tag) => (
                          <SelectItem key={tag} value={tag}>
                            {tag}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest-notes">Notas</Label>
                  <Textarea
                    id="guest-notes"
                    rows={3}
                    value={form.notes}
                    disabled={saving}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, notes: e.target.value }))
                    }
                  />
                </div>
                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>

      <p className="mt-3 shrink-0 text-xs text-muted-foreground">
        {rows.length} invitaciones · {rows.reduce((a, g) => a + g.invited, 0)}{" "}
        personas totales
      </p>
      <div className="mt-4 shrink-0">
        <PlanLimitBanner session={session} kind="guest" />
      </div>

      <div className="mt-4 min-h-0 min-w-0 max-w-full flex-1 overflow-auto rounded-2xl border border-border bg-card shadow-soft [&_.relative]:overflow-visible">
        <Table className="min-w-[980px]">
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow className="hover:bg-transparent">
              <TableHead className="whitespace-nowrap">Representante</TableHead>
              {showTableColumn ? (
                <TableHead className="whitespace-nowrap">Mesa</TableHead>
              ) : null}
              <TableHead className="whitespace-nowrap">
                WhatsApp
              </TableHead>
              <TableHead className="whitespace-nowrap">Confirmación</TableHead>
              <TableHead className="max-w-56 whitespace-nowrap">
                Última respuesta
              </TableHead>
              <TableHead className="whitespace-nowrap text-center">
                Invitados confirmados
              </TableHead>
              <TableHead className="whitespace-nowrap"> Mensajes de seguimiento</TableHead>
              <TableHead className="whitespace-nowrap text-center">
                Acciones
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={showTableColumn ? 8 : 7}
                  className="py-10 text-center text-sm text-muted-foreground"
                >
                  No hay invitados que coincidan con el filtro.
                </TableCell>
              </TableRow>
            ) : null}
            {pageRows.map((g) => (
              <TableRow
                key={g.id}
                className="cursor-pointer transition-colors"
                onClick={() =>
                  navigate({
                    to: "/eventos/$eventId/conversaciones",
                    params: { eventId },
                    search: { guestId: g.id },
                  })
                }
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
                        {g.phone}
                      </p>
                    </div>
                  </div>
                </TableCell>
                {showTableColumn ? (
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {(g.table ?? "").trim() || "—"}
                  </TableCell>
                ) : null}
                <TableCell className="text-muted-foreground">
                  {WHATSAPP_LABEL[g.whatsapp]}
                </TableCell>
                <TableCell>
                  <StatusBadge status={g.status} />
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {g.lastReply || "—"}
                </TableCell>
                <TableCell className="text-center font-medium">
                  <span className="text-success">{g.confirmed}</span>
                  <span className="text-muted-foreground"> / {g.invited}</span>
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
                        aria-label={
                          g.status === "sin_contactar"
                            ? `Enviar invitación a ${g.rep}`
                            : `Enviar recordatorio a ${g.rep}`
                        }
                        onClick={(e) => {
                          e.stopPropagation();
                          setGuestToMessage(g);
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

      {rows.length > 0 ? (
        <div className="mt-4 flex shrink-0 flex-col gap-3">
          <p className="text-sm text-muted-foreground items-start justify-start">
            Mostrando {(safePage - 1) * pageSize + 1}–
            {Math.min(safePage * pageSize, rows.length)} de {rows.length}{" "}
            invitaciones
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <span className="min-w-24 text-center text-sm text-muted-foreground">
              Página {safePage} de {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {/*<Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
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
                <div className="flex items-center justify-between gap-6 border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">Etiqueta</span>
                  <Select
                    value={
                      TAG_OPTIONS.includes(
                        selected.tag as (typeof TAG_OPTIONS)[number],
                      )
                        ? selected.tag
                        : "Sin etiqueta"
                    }
                    disabled={!canEditGuest}
                    onValueChange={(value) =>
                      updateGuest(selected.id, { tag: value })
                    }
                  >
                    <SelectTrigger className="h-8 max-w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TAG_OPTIONS.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 border-b border-border/60 pb-2">
                  <span className="text-muted-foreground">Notas</span>
                  <Textarea
                    rows={3}
                    value={selected.notes ?? ""}
                    disabled={!canEditGuest}
                    onChange={(e) =>
                      updateGuest(selected.id, { notes: e.target.value })
                    }
                  />
                </div>                {selected.lastReply ? (
                  <div className="rounded-xl bg-secondary/60 p-3">
                    <p className="text-xs text-muted-foreground">
                      Última respuesta
                    </p>
                    <p className="mt-1">“{selected.lastReply}”</p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2 pt-2">
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
                  {canEditGuest ? (
                    <Button
                      variant="outline"
                      className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setGuestToDelete(selected)}
                    >
                      <Trash2 className="size-4" /> Eliminar
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet> */}

      <SendGuestInvitationDialog
        guest={guestToMessage}
        onClose={() => setGuestToMessage(null)}
      />

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
