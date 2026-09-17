import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WhatsappEventTemplateCreateDialog } from "@/components/whatsapp-event-template-create-dialog";
import { WhatsappTemplateCard } from "@/components/whatsapp-template-card";
import { useEvent, useStore } from "@/lib/mock/store";
import type { EventItem, Guest } from "@/lib/mock/types";
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
  META_RESUBMIT_TITLE_EVENT,
  META_RESUBMIT_WARNING_EVENT,
  parsePrimerContactoSelectorValue,
  selectorValueForDraft,
  shouldConfirmEventTemplateFork,
  shouldConfirmMetaResubmit,
  shouldShowDefaultTemplateBanner,
  type EventTemplateCardDraft,
} from "@/lib/whatsapp-event-templates";
import {
  buildEventTemplateFormData,
  eventTemplatesLoadUi,
  isMetaTemplateInReview,
  isWhatsAppUnconfiguredError,
  shouldShowEventTemplateCards,
  WHATSAPP_SETUP_CTA_DESCRIPTION,
  WHATSAPP_SETUP_CTA_LABEL,
} from "@/lib/whatsapp-templates";
import {
  PURPOSE_CAMPAIGN_RADIO_HINT,
  PURPOSE_CAMPAIGN_RADIO_TITLE,
  PURPOSE_HINT,
  PURPOSE_TAB_LABEL,
  TEMPLATE_PURPOSES,
  normalizeTemplatePurpose,
  templatesForPurpose,
  type WhatsappTemplatePurpose,
} from "@/lib/whatsapp-template-purpose";

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

const PURPOSE_TITLES: Record<WhatsappTemplatePurpose, string> = {
  invitation: "Primer contacto",
  reminder: "Recordatorio",
  followup: "Seguimiento",
};

function PurposeTemplatesSkeleton() {
  return (
    <div className="mt-3 space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Cargando plantillas…
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-28 w-full" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-10 w-40" />
        </div>
      </div>
      <Skeleton className="h-10 w-56" />
    </div>
  );
}

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

function PurposeTemplates({
  eventId,
  guests,
  event,
  plannerName,
  purpose,
}: {
  eventId: string;
  guests: Guest[];
  event: EventItem | undefined;
  plannerName: string;
  purpose: WhatsappTemplatePurpose;
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
  const [whatsappConfigured, setWhatsappConfigured] = useState(false);
  const [showWhatsAppSetupCta, setShowWhatsAppSetupCta] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [attaching, setAttaching] = useState(false);
  const [nextSlot, setNextSlot] = useState(1);

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
    setShowWhatsAppSetupCta(false);
    void Promise.allSettled([
      integrationsApi.getWhatsAppStatus(),
      integrationsApi.listEventWhatsappTemplates(eventId),
      integrationsApi.listAccountWhatsappTemplates(),
    ])
      .then(([statusResult, eventResult, accountResult]) => {
        if (cancelled) return;
        const statusConfigured =
          statusResult.status === "fulfilled"
            ? Boolean(statusResult.value.configured)
            : null;
        const listError =
          eventResult.status === "rejected" ? eventResult.reason : null;
        const ui = eventTemplatesLoadUi({ statusConfigured, listError });
        setWhatsappConfigured(ui.whatsappConfigured);
        setShowWhatsAppSetupCta(ui.showWhatsAppSetupCta);
        setError(ui.error);
        if (ui.error || !ui.whatsappConfigured) {
          setDrafts([]);
          setAccountTemplates([]);
          setFocusedSlot(null);
          return;
        }
        const eventData =
          eventResult.status === "fulfilled"
            ? eventResult.value
            : { templates: [] };
        const accountData =
          accountResult.status === "fulfilled"
            ? accountResult.value
            : { templates: [] };
        const allDrafts = draftsFromEventTemplates(eventData.templates || []);
        const next = allDrafts.filter((item) => item.purpose === purpose);
        setDrafts(next);
        setNextSlot(
          allDrafts.length === 0
            ? 1
            : Math.max(...allDrafts.map((item) => item.slot)) + 1,
        );
        setAccountTemplates(
          templatesForPurpose(accountData.templates || [], purpose),
        );
        const campaign = next.find((item) => item.isCampaign) ?? next[0];
        setFocusedSlot(campaign?.slot ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey, purpose]);

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
    if (isMetaTemplateInReview(draft.status)) return;
    if (
      shouldConfirmEventTemplateFork(draft) ||
      shouldConfirmMetaResubmit(draft)
    ) {
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
      <h2 className="font-display text-2xl">{PURPOSE_TITLES[purpose]}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {PURPOSE_HINT[purpose]}
      </p>
      {loading ? <PurposeTemplatesSkeleton /> : null}
      {error ? (
        <div className="mt-3 flex flex-col items-start gap-2">
          <p className="text-sm text-destructive">{error}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => setReloadKey((n) => n + 1)}
            >
              Reintentar
            </Button>
            {isWhatsAppUnconfiguredError(error) ? (
              <Button type="button" size="sm" asChild>
                <Link to="/eventos/whatsapp">{WHATSAPP_SETUP_CTA_LABEL}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {!loading && showWhatsAppSetupCta ? (
        <Alert className="mt-3">
          <AlertDescription className="space-y-3">
            <p>{WHATSAPP_SETUP_CTA_DESCRIPTION}</p>
            <Button type="button" size="sm" asChild>
              <Link to="/eventos/whatsapp">{WHATSAPP_SETUP_CTA_LABEL}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {shouldShowEventTemplateCards(
        loading,
        Boolean(error),
        whatsappConfigured,
      ) ? (
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
                campaignRadioTitle={PURPOSE_CAMPAIGN_RADIO_TITLE[purpose]}
                campaignRadioHint={PURPOSE_CAMPAIGN_RADIO_HINT[purpose]}
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
        purpose={purpose}
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
            <AlertDialogTitle>
              {forkDraft && shouldConfirmEventTemplateFork(forkDraft)
                ? "¿Crear una copia para este evento?"
                : META_RESUBMIT_TITLE_EVENT}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {forkDraft && shouldConfirmEventTemplateFork(forkDraft)
                ? `${DEFAULT_ACCOUNT_TEMPLATE_BANNER} ${META_RESUBMIT_WARNING_EVENT}`
                : META_RESUBMIT_WARNING_EVENT}
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
              {forkDraft && shouldConfirmEventTemplateFork(forkDraft)
                ? "Crear copia y guardar"
                : "Enviar a revisión"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Mensajes() {
  const { eventId } = Route.useParams();
  const { data, event, guests } = useEvent(eventId);
  const { setFaqs, session } = useStore();
  const [q, setQ] = useState("");
  const [a, setA] = useState("");
  const [purpose, setPurpose] = useState<WhatsappTemplatePurpose>("invitation");
  const plannerName = session?.name.split(" ")[0] ?? "Planner";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-8">
      <Tabs defaultValue="plantillas">
        <TabsList>
          <TabsTrigger value="plantillas">Biblioteca de mensajes</TabsTrigger>
          <TabsTrigger value="faq">Respuestas frecuentes</TabsTrigger>
        </TabsList>

        <TabsContent value="plantillas" className="mt-6 space-y-6">
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
            {TEMPLATE_PURPOSES.map((item) => (
              <TabsContent key={item} value={item} className="mt-6">
                <PurposeTemplates
                  eventId={eventId}
                  guests={guests}
                  event={event}
                  plannerName={plannerName}
                  purpose={item}
                />
              </TabsContent>
            ))}
          </Tabs>
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
