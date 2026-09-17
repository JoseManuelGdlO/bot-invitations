import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateBodyEditor } from "@/components/template-body-editor";
import { TemplatePreview } from "@/components/template-preview";
import { WhatsappEventTemplateCreateDialog } from "@/components/whatsapp-event-template-create-dialog";
import { WhatsappTemplateCard } from "@/components/whatsapp-template-card";
import { useEvent, useStore } from "@/lib/mock/store";
import type { EventItem, Guest, Template } from "@/lib/mock/types";
import { availableTemplateKeys } from "@/lib/template-vars";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import {
  integrationsApi,
  type AccountWhatsappTemplateDto,
} from "@/lib/api/integrations";
import {
  buildPrimerContactoSelectorOptions,
  canCreateEventCustomTemplate,
  DEFAULT_ACCOUNT_TEMPLATE_BANNER,
  draftsFromEventTemplates,
  parsePrimerContactoSelectorValue,
  selectorValueForDraft,
  shouldConfirmEventTemplateFork,
  shouldShowDefaultTemplateBanner,
  type EventTemplateCardDraft,
} from "@/lib/whatsapp-event-templates";
import {
  buildEventTemplateFormData,
  shouldShowEventTemplateCards,
} from "@/lib/whatsapp-templates";

export const Route = createFileRoute("/eventos/$eventId/mensajes")({
  head: () => ({
    meta: [
      { title: "Centro de mensajes · Alanna Confirmaciones" },
      {
        name: "description",
        content: "Biblioteca de plantillas y respuestas frecuentes del evento.",
      },
      {
        property: "og:title",
        content: "Centro de mensajes · Alanna Confirmaciones",
      },
      {
        property: "og:description",
        content: "Plantillas por categoría y respuestas frecuentes.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Mensajes,
});

const localCategories = [
  {
    id: "Recordatorio",
    hint: "Recordatorio automático. El envío masivo está desactivado; el texto queda listo por si se reactiva.",
  },
  {
    id: "Seguimiento",
    hint: "Recontacto a indecisos, según las reglas de seguimiento.",
  },
] as const;

const PRIMER_CONTACTO_HINT =
  "Campaña inicial de WhatsApp. Editas el cuerpo de cada plantilla de Meta y eliges cuál usar en el envío masivo.";

function mergeSavedDraft(
  prev: EventTemplateCardDraft[],
  next: EventTemplateCardDraft,
): EventTemplateCardDraft[] {
  const others = prev.filter((item) => item.slot !== next.slot);
  const merged = [...others, next].sort((a, b) => a.slot - b.slot);
  if (!next.isCampaign) return merged;
  return merged.map((item) => ({
    ...item,
    isCampaign: item.slot === next.slot,
  }));
}

function PrimerContactoTemplates({
  eventId,
  guests,
  event,
  plannerName,
}: {
  eventId: string;
  guests: Guest[];
  event: EventItem | undefined;
  plannerName: string;
}) {
  const extraKeys = availableTemplateKeys(guests, event);
  const [drafts, setDrafts] = useState<EventTemplateCardDraft[]>([]);
  const [accountTemplates, setAccountTemplates] = useState<
    AccountWhatsappTemplateDto[]
  >([]);
  const [focusedSlot, setFocusedSlot] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [forkDraft, setForkDraft] = useState<EventTemplateCardDraft | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [attaching, setAttaching] = useState(false);

  const campaignDraft =
    drafts.find((draft) => draft.isCampaign) ?? drafts[0] ?? null;
  const focusedDraft =
    drafts.find((draft) => draft.slot === focusedSlot) ?? campaignDraft;
  const selectorOptions = buildPrimerContactoSelectorOptions({
    accountTemplates,
    linkedTemplates: drafts.map((draft) => ({
      slot: draft.slot,
      template: {
        id: draft.templateId,
        displayName: draft.displayName,
        body: draft.body,
        isWabaDefault: draft.isWabaDefault,
      },
    })),
  });
  const selectorValue = focusedDraft
    ? selectorValueForDraft(focusedDraft)
    : "";
  const campaignSlot = String(campaignDraft?.slot ?? "");
  const canCreate = canCreateEventCustomTemplate(drafts.length);
  const nextSlot =
    drafts.length === 0 ? 1 : Math.max(...drafts.map((item) => item.slot)) + 1;
  const showBanner =
    shouldShowDefaultTemplateBanner(focusedDraft || {}) ||
    shouldShowDefaultTemplateBanner(campaignDraft || {});

  const updateDraft = (
    slot: number,
    patch: Partial<EventTemplateCardDraft>,
  ) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.slot === slot ? { ...draft, ...patch } : draft,
      ),
    );
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void Promise.all([
      integrationsApi.listEventWhatsappTemplates(eventId),
      integrationsApi.listAccountWhatsappTemplates().catch(() => ({
        templates: [] as AccountWhatsappTemplateDto[],
      })),
    ])
      .then(([eventData, accountData]) => {
        if (cancelled) return;
        const next = draftsFromEventTemplates(eventData.templates || []);
        setDrafts(next);
        setAccountTemplates(accountData.templates || []);
        const campaign = next.find((item) => item.isCampaign) ?? next[0];
        setFocusedSlot(campaign?.slot ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setDrafts([]);
        setAccountTemplates([]);
        setFocusedSlot(null);
        setError(
          err instanceof ApiError
            ? err.message
            : "No se pudieron cargar las plantillas de Meta.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey]);

  const saveDraft = async (draft: EventTemplateCardDraft) => {
    if (savingSlot || error || loading) return;
    setSavingSlot(draft.slot);
    try {
      const { template } = await integrationsApi.putEventWhatsappTemplate(
        eventId,
        draft.slot,
        buildEventTemplateFormData({
          displayName: draft.displayName,
          body: draft.body,
          headerType: draft.headerType,
          slotMappings: draft.slotMappings,
          isCampaign: draft.isCampaign,
          headerFile: draft.headerFile,
        }),
      );
      const next = draftsFromEventTemplates([template])[0];
      if (!next) return;
      setDrafts((prev) => mergeSavedDraft(prev, next));
      setFocusedSlot(next.slot);
      toast.success("Plantilla enviada a revisión");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo enviar la plantilla a revisión",
      );
    } finally {
      setSavingSlot(null);
    }
  };

  const requestSave = (draft: EventTemplateCardDraft) => {
    if (shouldConfirmEventTemplateFork(draft)) {
      setForkDraft(draft);
      return;
    }
    void saveDraft(draft);
  };

  const selectCampaign = async (value: string) => {
    const slot = Number(value);
    if (!Number.isInteger(slot) || slot < 1) return;
    const previous = drafts;
    setDrafts((prev) =>
      prev.map((draft) => ({ ...draft, isCampaign: draft.slot === slot })),
    );
    setFocusedSlot(slot);
    const target = drafts.find((draft) => draft.slot === slot);
    if (!target?.persisted) return;
    try {
      await integrationsApi.patchEventWhatsappCampaign(eventId, slot);
    } catch (err) {
      setDrafts(previous);
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo marcar la plantilla de campaña",
      );
    }
  };

  const attachLibraryTemplate = async (templateId: string) => {
    if (attaching || !canCreate) return;
    setAttaching(true);
    try {
      const { template } = await integrationsApi.attachEventWhatsappTemplate(
        eventId,
        templateId,
      );
      const next = draftsFromEventTemplates([template])[0];
      if (!next) return;
      setDrafts((prev) => mergeSavedDraft(prev, next));
      setFocusedSlot(next.slot);
      toast.success("Plantilla vinculada a este evento");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo vincular la plantilla",
      );
    } finally {
      setAttaching(false);
    }
  };

  const onSelectorChange = (value: string) => {
    const action = parsePrimerContactoSelectorValue(value);
    if (!action) return;
    if (action.type === "create") {
      if (canCreate) setCreateOpen(true);
      return;
    }
    if (action.type === "select-linked") {
      setFocusedSlot(action.slot);
      return;
    }
    void attachLibraryTemplate(action.templateId);
  };

  return (
    <section>
      <h2 className="font-display text-2xl">Primer contacto</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {PRIMER_CONTACTO_HINT}
      </p>
      {loading ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Cargando plantillas de Meta…
        </p>
      ) : null}
      {error ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => setReloadKey((n) => n + 1)}
          >
            Reintentar
          </Button>
        </div>
      ) : null}
      {shouldShowEventTemplateCards(loading, Boolean(error)) ? (
        <div className="mt-3 space-y-4">
          {selectorOptions.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="primer-contacto-selector">Plantilla</Label>
              <Select
                {...(selectorValue ? { value: selectorValue } : {})}
                onValueChange={onSelectorChange}
                disabled={attaching}
              >
                <SelectTrigger id="primer-contacto-selector">
                  <SelectValue placeholder="Elige una plantilla" />
                </SelectTrigger>
                <SelectContent>
                  {selectorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {showBanner ? (
            <Alert>
              <AlertDescription>
                {DEFAULT_ACCOUNT_TEMPLATE_BANNER}
              </AlertDescription>
            </Alert>
          ) : null}
          <RadioGroup
            value={campaignSlot || null}
            onValueChange={(value) => void selectCampaign(value)}
            className="grid gap-4"
          >
            {drafts.map((draft) => (
              <WhatsappTemplateCard
                key={draft.slot}
                draft={draft}
                extraKeys={extraKeys}
                guests={guests}
                event={event}
                plannerName={plannerName}
                submitting={savingSlot === draft.slot}
                highlighted={focusedDraft?.slot === draft.slot}
                onChange={(patch) => updateDraft(draft.slot, patch)}
                onSave={() => requestSave(draft)}
              />
            ))}
          </RadioGroup>
          <Button
            type="button"
            variant="outline"
            disabled={!canCreate}
            title={
              canCreate
                ? undefined
                : "Este evento ya tiene el máximo de 10 plantillas."
            }
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            Crear plantilla personalizada
          </Button>
        </div>
      ) : null}
      <WhatsappEventTemplateCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        eventId={eventId}
        slot={nextSlot}
        extraKeys={extraKeys}
        guests={guests}
        event={event}
        plannerName={plannerName}
        accountTemplates={accountTemplates}
        onCreated={(template) => {
          const next = draftsFromEventTemplates([template])[0];
          if (!next) return;
          setDrafts((prev) => mergeSavedDraft(prev, next));
          setFocusedSlot(next.slot);
        }}
      />
      <AlertDialog
        open={forkDraft !== null}
        onOpenChange={(next) => {
          if (!next) setForkDraft(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Crear una copia para este evento?</AlertDialogTitle>
            <AlertDialogDescription>
              {DEFAULT_ACCOUNT_TEMPLATE_BANNER}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (forkDraft) void saveDraft(forkDraft);
                setForkDraft(null);
              }}
            >
              Crear copia y guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function TemplateCategory({
  eventId,
  category,
  hint,
  template,
  templates,
  guests,
  event,
  plannerName,
  setTemplates,
}: {
  eventId: string;
  category: string;
  hint: string;
  template: Template | undefined;
  templates: Template[];
  guests: Guest[];
  event: EventItem | undefined;
  plannerName: string;
  setTemplates: (eventId: string, t: Template[]) => void;
}) {
  const [draft, setDraft] = useState(template?.body ?? "");

  useEffect(() => {
    setDraft(template?.body ?? "");
  }, [template?.id, template?.body]);

  const variables = availableTemplateKeys(guests, event);

  return (
    <section>
      <h2 className="font-display text-2xl">{category}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      {template ? (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <div className="mb-3 flex items-start justify-between gap-2">
              <p className="font-medium">{template.title}</p>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(draft);
                  toast.success("Plantilla copiada");
                }}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <Copy className="size-4" />
              </button>
            </div>
            <TemplateBodyEditor
              value={template.body}
              onChange={setDraft}
              variables={variables}
              onSave={(body) => {
                setTemplates(
                  eventId,
                  templates.map((x) =>
                    x.id === template.id ? { ...x, body } : x,
                  ),
                );
                toast.success("Plantilla guardada");
              }}
            />
          </div>
          <TemplatePreview
            body={draft}
            guests={guests}
            event={event}
            plannerName={plannerName}
          />
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          No hay plantilla para esta categoría.
        </p>
      )}
    </section>
  );
}

function Mensajes() {
  const { eventId } = Route.useParams();
  const { data, event, guests } = useEvent(eventId);
  const { setTemplates, setFaqs, session } = useStore();
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const plannerName = session?.name.split(" ")[0] ?? "Planner";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-8">
      <Tabs defaultValue="plantillas">
        <TabsList>
          <TabsTrigger value="plantillas">Biblioteca de mensajes</TabsTrigger>
          <TabsTrigger value="faq">Respuestas frecuentes</TabsTrigger>
        </TabsList>

        <TabsContent value="plantillas" className="mt-6 space-y-8">
          <PrimerContactoTemplates
            eventId={eventId}
            guests={guests}
            event={event}
            plannerName={plannerName}
          />
          {localCategories.map((cat) => (
            <TemplateCategory
              key={cat.id}
              eventId={eventId}
              category={cat.id}
              hint={cat.hint}
              template={data.templates.find((t) => t.category === cat.id)}
              templates={data.templates}
              guests={guests}
              event={event}
              plannerName={plannerName}
              setTemplates={setTemplates}
            />
          ))}
        </TabsContent>

        <TabsContent value="faq" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div className="space-y-3">
              {data.faqs.map((f) => (
                <div
                  key={f.id}
                  className="rounded-2xl border border-border bg-card p-5 shadow-soft"
                >
                  <p className="font-medium">{f.q}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
                  <button
                    onClick={() =>
                      setFaqs(
                        eventId,
                        data.faqs.filter((x) => x.id !== f.id),
                      )
                    }
                    className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
                  >
                    Eliminar
                  </button>
                </div>
              ))}
            </div>
            <div className="h-fit rounded-2xl border border-border bg-card p-5 shadow-soft">
              <h3 className="font-display text-xl">Agregar respuesta</h3>
              <div className="mt-4 space-y-3">
                <div className="space-y-2">
                  <Label>Pregunta</Label>
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="¿Hay estacionamiento?"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Respuesta</Label>
                  <Textarea
                    value={a}
                    onChange={(e) => setA(e.target.value)}
                    rows={3}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    if (!q.trim()) return;
                    setFaqs(eventId, [
                      ...data.faqs,
                      { id: `q-${Date.now()}`, q, a },
                    ]);
                    setQ("");
                    setA("");
                    toast.success("Respuesta agregada");
                  }}
                >
                  <Plus className="size-4" /> Agregar
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
