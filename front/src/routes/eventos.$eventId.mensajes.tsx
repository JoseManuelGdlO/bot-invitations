import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateBodyEditor } from "@/components/template-body-editor";
import { TemplatePreview } from "@/components/template-preview";
import {
  WhatsappTemplateCard,
  type EventTemplateCardDraft,
} from "@/components/whatsapp-template-card";
import { useEvent, useStore } from "@/lib/mock/store";
import type { EventItem, Guest, Template } from "@/lib/mock/types";
import { availableTemplateKeys } from "@/lib/template-vars";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import {
  integrationsApi,
  type EventWhatsappTemplateDto,
} from "@/lib/api/integrations";
import {
  buildEventTemplateFormData,
  mergeEventSlotMappings,
  shouldShowEventTemplateCards,
  type WizardHeaderType,
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

function headerTypeOf(value: string | null | undefined): WizardHeaderType {
  return value === "document" || value === "image" ? value : "none";
}

function blankEventTemplateDraft(
  slot: 1 | 2,
  isCampaign: boolean,
): EventTemplateCardDraft {
  return {
    slot,
    body: "",
    headerType: "none",
    headerFile: null,
    headerFileName: null,
    savedHeaderType: "none",
    savedHeaderFileName: null,
    isCampaign,
    status: "DRAFT",
    rejectedReason: null,
    slotMappings: mergeEventSlotMappings("", {}),
    persisted: false,
  };
}

function dtoToEventTemplateDraft(
  dto: EventWhatsappTemplateDto,
): EventTemplateCardDraft {
  const headerType = headerTypeOf(dto.template.headerType);
  const slot: 1 | 2 = dto.slot === 2 ? 2 : 1;
  return {
    slot,
    body: dto.template.body || "",
    headerType,
    headerFile: null,
    headerFileName: dto.template.headerFileName,
    savedHeaderType: headerType,
    savedHeaderFileName: dto.template.headerFileName,
    isCampaign: dto.isCampaign,
    status: dto.template.status,
    rejectedReason: dto.template.rejectedReason,
    slotMappings: mergeEventSlotMappings(
      dto.template.body || "",
      dto.slotMappings || {},
    ),
    persisted: true,
  };
}

function draftsFromTemplates(templates: EventWhatsappTemplateDto[]) {
  const slot1 = templates.find((item) => item.slot === 1);
  const slot2 = templates.find((item) => item.slot === 2);
  const first = slot1
    ? dtoToEventTemplateDraft(slot1)
    : blankEventTemplateDraft(1, slot2 ? !slot2.isCampaign : true);
  if (!slot2) return { drafts: [first], showSecond: false };
  return {
    drafts: [first, dtoToEventTemplateDraft(slot2)],
    showSecond: true,
  };
}

function PrimerContactoTemplates({
  eventId,
  guests,
  event,
}: {
  eventId: string;
  guests: Guest[];
  event: EventItem | undefined;
}) {
  const extraKeys = availableTemplateKeys(guests, event);
  const [drafts, setDrafts] = useState<EventTemplateCardDraft[]>([]);
  const [showSecond, setShowSecond] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [savingSlot, setSavingSlot] = useState<1 | 2 | null>(null);

  const visibleDrafts = showSecond ? drafts.slice(0, 2) : drafts.slice(0, 1);
  const campaignSlot = String(
    visibleDrafts.find((draft) => draft.isCampaign)?.slot ??
      visibleDrafts[0]?.slot ??
      1,
  );

  const updateDraft = (slot: 1 | 2, patch: Partial<EventTemplateCardDraft>) => {
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
    void integrationsApi
      .listEventWhatsappTemplates(eventId)
      .then((data) => {
        if (cancelled) return;
        const next = draftsFromTemplates(data.templates || []);
        setDrafts(next.drafts);
        setShowSecond(next.showSecond);
      })
      .catch((err) => {
        if (cancelled) return;
        setDrafts([]);
        setShowSecond(false);
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
          body: draft.body,
          headerType: draft.headerType,
          slotMappings: draft.slotMappings,
          isCampaign: draft.isCampaign,
          headerFile: draft.headerFile,
        }),
      );
      const next = dtoToEventTemplateDraft(template);
      setDrafts((prev) => {
        const others = prev.filter((item) => item.slot !== next.slot);
        const merged = [...others, next].sort((a, b) => a.slot - b.slot);
        if (!next.isCampaign) return merged;
        return merged.map((item) => ({
          ...item,
          isCampaign: item.slot === next.slot,
        }));
      });
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

  const selectCampaign = async (value: string) => {
    const slot: 1 | 2 = Number(value) === 2 ? 2 : 1;
    const previous = drafts;
    setDrafts((prev) =>
      prev.map((draft) => ({ ...draft, isCampaign: draft.slot === slot })),
    );
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
        <RadioGroup
          value={campaignSlot}
          onValueChange={(value) => void selectCampaign(value)}
          className="mt-3 grid gap-4 md:grid-cols-2"
        >
          {visibleDrafts.map((draft) => (
            <WhatsappTemplateCard
              key={draft.slot}
              draft={draft}
              extraKeys={extraKeys}
              submitting={savingSlot === draft.slot}
              onChange={(patch) => updateDraft(draft.slot, patch)}
              onSave={() => void saveDraft(draft)}
            />
          ))}
          {!showSecond ? (
            <button
              type="button"
              className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card p-5 text-sm font-medium text-muted-foreground shadow-soft hover:border-primary hover:text-foreground"
              onClick={() => {
                setDrafts((prev) => {
                  const withoutSecond = prev.filter((item) => item.slot !== 2);
                  return [
                    ...withoutSecond,
                    blankEventTemplateDraft(2, false),
                  ].sort((a, b) => a.slot - b.slot);
                });
                setShowSecond(true);
              }}
            >
              <Plus className="size-5" />
              Crear segunda plantilla
            </button>
          ) : null}
        </RadioGroup>
      ) : null}
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
