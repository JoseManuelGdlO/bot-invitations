import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhatsappTemplateCard } from "@/components/whatsapp-template-card";
import { ApiError } from "@/lib/api/client";
import {
  integrationsApi,
  type AccountWhatsappTemplateDto,
  type EventWhatsappTemplateDto,
} from "@/lib/api/integrations";
import {
  blankEventTemplateDraft,
  buildCreateEventTemplateFormData,
  type EventTemplateCardDraft,
} from "@/lib/whatsapp-event-templates";
import {
  WIZARD_PRESETS,
  isWizardBodyDirty,
  matchWizardPreset,
  wizardPresetById,
  type WizardPreset,
  type WizardPresetId,
} from "@/lib/whatsapp-template-presets";
import {
  mergeEventSlotMappings,
  needsHeaderFile,
  type WizardHeaderType,
} from "@/lib/whatsapp-templates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const EXISTING_HEADER_FILE = "existente";

function asHeaderType(value: string | null | undefined): WizardHeaderType {
  if (value === "document" || value === "image") return value;
  return "none";
}

export function WhatsappEventTemplateCreateDialog({
  open,
  onOpenChange,
  eventId,
  slot,
  extraKeys,
  accountTemplates,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  slot: number;
  extraKeys: string[];
  accountTemplates: AccountWhatsappTemplateDto[];
  onCreated: (template: EventWhatsappTemplateDto) => void;
}) {
  const [draft, setDraft] = useState<EventTemplateCardDraft>(() =>
    blankEventTemplateDraft(slot, false),
  );
  const [source, setSource] = useState<"blank" | "default">("blank");
  const [selectedPresetId, setSelectedPresetId] =
    useState<WizardPresetId | null>(null);
  const [pendingPreset, setPendingPreset] = useState<WizardPreset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selectedPreset = selectedPresetId
    ? wizardPresetById(selectedPresetId)
    : matchWizardPreset(draft.body);
  const accountDefault = accountTemplates.find((item) => item.isWabaDefault);

  useEffect(() => {
    if (!open) return;
    setDraft(blankEventTemplateDraft(slot, false));
    setSource("blank");
    setSelectedPresetId(null);
    setPendingPreset(null);
  }, [open, slot]);

  const updateDraft = (patch: Partial<EventTemplateCardDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const applyPreset = (preset: WizardPreset) => {
    setDraft((prev) => ({
      ...prev,
      displayName: preset.displayName,
      headerType: preset.headerType,
      body: preset.body,
      slotMappings: preset.slotMappings,
      headerFile: null,
      headerFileName: null,
    }));
    setSelectedPresetId(preset.id);
    setSource("blank");
  };

  const requestPreset = (preset: WizardPreset) => {
    if (
      selectedPreset?.id === preset.id &&
      !isWizardBodyDirty(draft.body, preset)
    ) {
      return;
    }
    if (isWizardBodyDirty(draft.body, selectedPreset)) {
      setPendingPreset(preset);
      return;
    }
    applyPreset(preset);
  };

  const applyAccountDefault = () => {
    if (!accountDefault) return;
    const matched = matchWizardPreset(accountDefault.body || "");
    const headerType = asHeaderType(accountDefault.headerType);
    setDraft((prev) => ({
      ...prev,
      displayName:
        accountDefault.displayName || matched?.displayName || prev.displayName,
      headerType,
      body: accountDefault.body || "",
      headerFile: null,
      headerFileName: needsHeaderFile(headerType) ? EXISTING_HEADER_FILE : null,
      slotMappings: matched
        ? matched.slotMappings
        : mergeEventSlotMappings(accountDefault.body || "", {}),
    }));
    setSelectedPresetId(matched?.id ?? null);
    setSource("default");
  };

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { template } = await integrationsApi.createEventWhatsappTemplate(
        eventId,
        buildCreateEventTemplateFormData({
          source,
          displayName: draft.displayName,
          body: draft.body,
          headerType: draft.headerType,
          slotMappings: draft.slotMappings,
          headerFile: draft.headerFile,
        }),
      );
      toast.success("Plantilla enviada a revisión");
      onOpenChange(false);
      onCreated(template);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo crear la plantilla",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Crear plantilla para este evento</DialogTitle>
            <DialogDescription>
              La copia queda solo en este evento. Meta la revisa antes de usarla
              en campaña.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Preconfiguración</p>
              <div className="flex flex-wrap gap-2">
                {WIZARD_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "rounded-full",
                      selectedPreset?.id === preset.id && "border-primary",
                    )}
                    onClick={() => requestPreset(preset)}
                  >
                    {preset.displayName}
                  </Button>
                ))}
                {accountDefault ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "rounded-full",
                      source === "default" && "border-primary",
                    )}
                    onClick={applyAccountDefault}
                  >
                    Partir del default
                  </Button>
                ) : null}
              </div>
            </div>
            <WhatsappTemplateCard
              draft={draft}
              extraKeys={extraKeys}
              submitting={submitting}
              showCampaignRadio={false}
              onChange={updateDraft}
              onSave={() => void submit()}
            />
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingPreset !== null}
        onOpenChange={(next) => {
          if (!next) setPendingPreset(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Reemplazar el cuerpo?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios en el cuerpo. Si continúas, se reemplazarán con
              esta preconfiguración.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingPreset) applyPreset(pendingPreset);
                setPendingPreset(null);
              }}
            >
              Reemplazar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
