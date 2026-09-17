import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { FileStack, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { WhatsappAccountTemplateEditDialog } from "@/components/whatsapp-account-template-edit-dialog";
import { WhatsappEventTemplateCreateDialog } from "@/components/whatsapp-event-template-create-dialog";
import { WhatsAppTemplateWizardDialog } from "@/components/whatsapp-template-wizard-dialog";
import { ApiError } from "@/lib/api/client";
import {
  integrationsApi,
  type AccountWhatsappTemplateDto,
} from "@/lib/api/integrations";
import { useStore } from "@/lib/mock/store";
import { availableTemplateKeys } from "@/lib/template-vars";
import {
  LAST_WABA_DEFAULT_DELETE_HINT,
  accountTemplateDeleteWarning,
  accountWhatsappTemplatesEmptyCopy,
  canDeleteAccountWhatsappTemplate,
} from "@/lib/whatsapp-account-templates";
import { displayNameOrPreview } from "@/lib/whatsapp-event-templates";
import {
  metaTemplateStatusHint,
  statusBadgeClassName,
  statusBadgeLabel,
  WHATSAPP_SETUP_CTA_LABEL,
} from "@/lib/whatsapp-templates";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  DEFAULT_TEMPLATE_PURPOSE,
  PURPOSE_HINT,
  PURPOSE_TAB_LABEL,
  TEMPLATE_PURPOSES,
  normalizeTemplatePurpose,
  templatesForPurpose,
  type WhatsappTemplatePurpose,
} from "@/lib/whatsapp-template-purpose";

export const Route = createFileRoute("/eventos/plantillas")({
  head: () => ({
    meta: [
      { title: "Plantillas de WhatsApp · Alanna Confirmaciones" },
      {
        name: "description",
        content:
          "Biblioteca de plantillas de la cuenta: estado Meta, uso en eventos y borrado.",
      },
      {
        property: "og:title",
        content: "Plantillas de WhatsApp · Alanna Confirmaciones",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AccountWhatsappTemplatesPage,
});

function AccountWhatsappTemplatesPage() {
  const { events, guests, session } = useStore();
  const plannerName = session?.name.split(" ")[0] ?? "Planner";
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [templates, setTemplates] = useState<AccountWhatsappTemplateDto[]>([]);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createEventId, setCreateEventId] = useState("");
  const [toDelete, setToDelete] = useState<AccountWhatsappTemplateDto | null>(
    null,
  );
  const [customEdit, setCustomEdit] =
    useState<AccountWhatsappTemplateDto | null>(null);
  const [purpose, setPurpose] = useState<WhatsappTemplatePurpose>(
    DEFAULT_TEMPLATE_PURPOSE,
  );

  const createEvent = events.find((item) => item.id === createEventId);
  const createGuests = guests.filter(
    (guest) => guest.eventId === createEventId,
  );
  const createExtraKeys = availableTemplateKeys(createGuests, createEvent);
  const editEventId = customEdit?.usage?.events?.[0]?.id;
  const editEvent = events.find((item) => item.id === editEventId);
  const editGuests = guests.filter((guest) => guest.eventId === editEventId);
  const editExtraKeys = availableTemplateKeys(editGuests, editEvent);
  const eventOptions = events.map((item) => ({
    id: item.id,
    name: item.name,
  }));

  const load = useCallback(async () => {
    const [statusResult, listResult] = await Promise.allSettled([
      integrationsApi.getWhatsAppStatus(),
      integrationsApi.listAccountWhatsappTemplates(),
    ]);
    const configured =
      statusResult.status === "fulfilled" &&
      Boolean(statusResult.value.configured);
    if (listResult.status === "fulfilled") {
      setLoadError(false);
      setTemplates(listResult.value.templates);
      setWhatsappConfigured(true);
      return;
    }
    setTemplates([]);
    const err = listResult.reason;
    if (err instanceof ApiError && err.status === 400) {
      setLoadError(false);
      setWhatsappConfigured(configured);
      return;
    }
    setLoadError(true);
    setWhatsappConfigured(configured);
    toast.error(
      err instanceof ApiError
        ? err.message
        : "No se pudieron cargar las plantillas",
    );
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const openEdit = (row: AccountWhatsappTemplateDto) => {
    if (
      row.isWabaDefault &&
      normalizeTemplatePurpose(row.purpose) === DEFAULT_TEMPLATE_PURPOSE
    ) {
      setWizardOpen(true);
      return;
    }
    setCustomEdit(row);
  };

  const confirmDelete = async () => {
    if (!toDelete?.id) return;
    const id = toDelete.id;
    setDeleting(true);
    try {
      await integrationsApi.deleteAccountWhatsappTemplate(id);
      setTemplates((prev) => prev.filter((row) => row.id !== id));
      setToDelete(null);
      toast.success("Plantilla eliminada");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo eliminar la plantilla",
      );
      return;
    } finally {
      setDeleting(false);
    }
    await load();
  };

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-5 py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const visibleTemplates = templatesForPurpose(templates, purpose);
  const emptyCopy = accountWhatsappTemplatesEmptyCopy(
    whatsappConfigured,
    purpose,
  );

  const renderTemplateList = (rows: AccountWhatsappTemplateDto[]) => {
    if (rows.length === 0) {
      return (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-foreground">
              <FileStack className="size-5" />
            </span>
            <div className="space-y-3">
              <p className="text-sm">
                {loadError
                  ? "No se pudieron cargar las plantillas."
                  : emptyCopy}
              </p>
              {loadError ? (
                <Button type="button" size="sm" onClick={() => void load()}>
                  Reintentar
                </Button>
              ) : whatsappConfigured && purpose === DEFAULT_TEMPLATE_PURPOSE ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setWizardOpen(true)}
                >
                  Crear plantilla default
                </Button>
              ) : whatsappConfigured ? (
                <Button type="button" size="sm" onClick={() => void load()}>
                  Reintentar
                </Button>
              ) : (
                <Button type="button" size="sm" asChild>
                  <Link to="/eventos/whatsapp">{WHATSAPP_SETUP_CTA_LABEL}</Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      );
    }
    return (
      <ul className="space-y-3">
        {rows.map((row) => {
          const canDelete = canDeleteAccountWhatsappTemplate(row, templates);
          const title = displayNameOrPreview(row) || row.name || "Plantilla";
          const usage = row.usage;
          const eventNames = (usage?.events ?? [])
            .map((event) => event.name)
            .filter(Boolean);
          const statusHint = metaTemplateStatusHint(row.status);
          const deleteButton = (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canDelete || !row.id}
              onClick={() => setToDelete(row)}
            >
              <Trash2 className="size-3.5" />
              Eliminar
            </Button>
          );
          return (
            <li
              key={row.id || row.name || title}
              className="rounded-2xl border border-border bg-card p-5 shadow-soft"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-xl">{title}</h2>
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                        statusBadgeClassName(row.status),
                      )}
                    >
                      {statusBadgeLabel(row.status || "")}
                    </Badge>
                    {row.isWabaDefault ? (
                      <Badge className="rounded-full bg-gold-soft text-gold-foreground">
                        Default
                      </Badge>
                    ) : null}
                  </div>
                  {statusHint ? (
                    <p className="text-xs text-muted-foreground">
                      {statusHint}
                    </p>
                  ) : null}
                  <p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {row.body || "Sin cuerpo"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {usage?.eventCount
                      ? `${usage.eventCount} ${
                          usage.eventCount === 1 ? "evento" : "eventos"
                        }${eventNames.length ? `: ${eventNames.join(", ")}` : ""}`
                      : "Ningún evento la usa"}
                    {(usage?.campaignEventCount ?? 0) > 0
                      ? ` · campaña en ${usage?.campaignEventCount}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="size-3.5" />
                    Ver/editar
                  </Button>
                  {canDelete ? (
                    deleteButton
                  ) : (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">{deleteButton}</span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          {LAST_WABA_DEFAULT_DELETE_HINT}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-5 py-8 md:px-8 md:py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
            Cuenta
          </p>
          <h1 className="mt-1 font-display text-4xl">Plantillas de WhatsApp</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plantillas de esta cuenta. Borrarlas también las quita en Meta.
          </p>
        </div>
        {whatsappConfigured ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    type="button"
                    size="sm"
                    disabled={events.length === 0}
                    onClick={() => {
                      setCreateEventId("");
                      setCreateOpen(true);
                    }}
                  >
                    <Plus className="size-4" />
                    Crear plantilla
                  </Button>
                </span>
              </TooltipTrigger>
              {events.length === 0 ? (
                <TooltipContent>Crea un evento primero</TooltipContent>
              ) : null}
            </Tooltip>
          </TooltipProvider>
        ) : null}
      </div>

      <Tabs
        value={purpose}
        onValueChange={(value) =>
          setPurpose(normalizeTemplatePurpose(value))
        }
      >
        <TabsList>
          {TEMPLATE_PURPOSES.map((item) => (
            <TabsTrigger key={item} value={item}>
              {PURPOSE_TAB_LABEL[item]}
            </TabsTrigger>
          ))}
        </TabsList>
        <p className="mt-2 text-sm text-muted-foreground">{PURPOSE_HINT[purpose]}</p>
        {TEMPLATE_PURPOSES.map((item) => (
          <TabsContent key={item} value={item} className="mt-4">
            {item === purpose ? renderTemplateList(visibleTemplates) : null}
          </TabsContent>
        ))}
      </Tabs>

      <WhatsAppTemplateWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onCreated={async () => {
          await load();
        }}
      />

      <WhatsappEventTemplateCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        eventId={createEventId}
        events={eventOptions}
        onEventIdChange={setCreateEventId}
        slot={1}
        extraKeys={createExtraKeys}
        guests={createGuests}
        event={createEvent}
        plannerName={plannerName}
        accountTemplates={templatesForPurpose(templates, purpose)}
        purpose={purpose}
        onCreated={async () => {
          await load();
        }}
      />

      <WhatsappAccountTemplateEditDialog
        template={customEdit}
        open={!!customEdit}
        onOpenChange={(open) => {
          if (!open) setCustomEdit(null);
        }}
        extraKeys={editExtraKeys}
        guests={editGuests}
        event={editEvent}
        plannerName={plannerName}
        onSaved={load}
      />

      <AlertDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && !deleting && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Eliminar{" "}
              {displayNameOrPreview(toDelete || {}) || "esta plantilla"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {accountTemplateDeleteWarning(toDelete?.usage)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting || !toDelete?.id}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                await confirmDelete();
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
