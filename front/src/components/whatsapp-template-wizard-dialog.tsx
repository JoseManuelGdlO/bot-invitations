import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/client";
import { integrationsApi } from "@/lib/api/integrations";
import {
  buildWizardFormData,
  canSubmitWizard,
  needsHeaderFile,
  wizardBodyError,
  type WizardHeaderType,
  type WizardTemplateDraft,
} from "@/lib/whatsapp-templates";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";

function emptyDraft(slot: 1 | 2, isCampaign: boolean): WizardTemplateDraft {
  return {
    slot,
    headerType: "none",
    body: "",
    isCampaign,
    headerFile: null,
  };
}

function isDocumentFile(file: File) {
  const byExt = /\.(pdf|docx?)$/i.test(file.name);
  const byMime =
    !file.type ||
    file.type === "application/pdf" ||
    file.type === "application/msword" ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return byExt && byMime;
}

function isHeaderImageFile(file: File) {
  const byExt = /\.(jpe?g|png)$/i.test(file.name);
  const byMime =
    !file.type || file.type === "image/jpeg" || file.type === "image/png";
  return byExt && byMime;
}

export function WhatsAppTemplateWizardDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
}) {
  const [drafts, setDrafts] = useState<WizardTemplateDraft[]>([
    emptyDraft(1, true),
  ]);
  const [submitting, setSubmitting] = useState(false);

  const campaignSlot = String(
    drafts.find((draft) => draft.isCampaign)?.slot ?? drafts[0]?.slot ?? 1,
  );

  const updateDraft = (slot: 1 | 2, patch: Partial<WizardTemplateDraft>) => {
    setDrafts((prev) =>
      prev.map((draft) =>
        draft.slot === slot ? { ...draft, ...patch } : draft,
      ),
    );
  };

  const setHeaderType = (slot: 1 | 2, headerType: WizardHeaderType) => {
    updateDraft(slot, {
      headerType,
      headerFile: null,
    });
  };

  const pickHeaderFile = (
    slot: 1 | 2,
    headerType: WizardHeaderType,
    file?: File,
  ): boolean => {
    if (!file) {
      updateDraft(slot, { headerFile: null });
      return true;
    }
    if (headerType === "document") {
      if (!isDocumentFile(file)) {
        toast.error("El documento debe ser PDF o Word (doc, docx).");
        return false;
      }
      if (file.size > DOCUMENT_MAX_BYTES) {
        toast.error("El archivo no puede superar 10 MB.");
        return false;
      }
    }
    if (headerType === "image") {
      if (!isHeaderImageFile(file)) {
        toast.error("La imagen debe ser JPEG o PNG.");
        return false;
      }
      if (file.size > IMAGE_MAX_BYTES) {
        toast.error("La imagen no puede superar 5 MB.");
        return false;
      }
    }
    updateDraft(slot, { headerFile: file });
    return true;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitWizard(drafts) || submitting) return;
    setSubmitting(true);
    try {
      await integrationsApi.createWizardTemplates(buildWizardFormData(drafts));
      setDrafts([emptyDraft(1, true)]);
      onOpenChange(false);
      toast.success("Plantillas enviadas a revisión");
      await onCreated?.();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudieron enviar las plantillas",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plantillas de invitación</DialogTitle>
          <DialogDescription>
            Meta revisa y aprueba cada plantilla. Hasta que el estado sea
            Aprobada no puedes lanzar la campaña.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <RadioGroup
            value={campaignSlot}
            onValueChange={(value) => {
              const slot = Number(value) === 2 ? 2 : 1;
              setDrafts((prev) =>
                prev.map((draft) => ({
                  ...draft,
                  isCampaign: draft.slot === slot,
                })),
              );
            }}
            className="gap-3"
          >
            {drafts.map((draft) => {
              const bodyError = wizardBodyError(draft.body);
              const showFile = needsHeaderFile(draft.headerType);
              return (
                <div
                  key={draft.slot}
                  className="space-y-4 rounded-xl border border-border p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      Plantilla {draft.slot}
                    </p>
                    {draft.slot === 2 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDrafts((prev) =>
                            prev
                              .filter((item) => item.slot !== 2)
                              .map((item) => ({ ...item, isCampaign: true })),
                          )
                        }
                      >
                        <Trash2 className="size-3.5" />
                        Quitar
                      </Button>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label>Encabezado</Label>
                    <RadioGroup
                      value={draft.headerType}
                      onValueChange={(value) =>
                        setHeaderType(draft.slot, value as WizardHeaderType)
                      }
                      className="gap-2 sm:grid-cols-3 sm:grid"
                    >
                      {(
                        [
                          ["none", "Texto", `wizard-header-none-${draft.slot}`],
                          [
                            "document",
                            "Documento",
                            `wizard-header-document-${draft.slot}`,
                          ],
                          [
                            "image",
                            "Imagen",
                            `wizard-header-image-${draft.slot}`,
                          ],
                        ] as const
                      ).map(([value, label, id]) => (
                        <label
                          key={value}
                          htmlFor={id}
                          className={cn(
                            "flex cursor-pointer gap-2 rounded-xl border border-border p-3",
                            draft.headerType === value && "border-primary",
                          )}
                        >
                          <RadioGroupItem
                            id={id}
                            value={value}
                            className="mt-0.5"
                          />
                          <span className="text-sm font-medium">{label}</span>
                        </label>
                      ))}
                    </RadioGroup>
                  </div>

                  {showFile ? (
                    <div className="space-y-2">
                      <Label htmlFor={`wizard-file-${draft.slot}`}>
                        Archivo de encabezado
                      </Label>
                      <Input
                        id={`wizard-file-${draft.slot}`}
                        key={`${draft.slot}-${draft.headerType}`}
                        type="file"
                        accept={
                          draft.headerType === "image"
                            ? IMAGE_ACCEPT
                            : DOCUMENT_ACCEPT
                        }
                        onChange={(e) => {
                          const ok = pickHeaderFile(
                            draft.slot,
                            draft.headerType,
                            e.target.files?.[0],
                          );
                          if (!ok) e.target.value = "";
                        }}
                      />
                      {draft.headerFile ? (
                        <p className="text-xs text-muted-foreground">
                          {draft.headerFile.name}
                        </p>
                      ) : (
                        <p className="text-xs text-destructive">
                          {draft.headerType === "image"
                            ? "JPEG o PNG de hasta 5 MB."
                            : "PDF o Word de hasta 10 MB."}
                        </p>
                      )}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor={`wizard-body-${draft.slot}`}>
                      Cuerpo del mensaje
                    </Label>
                    <Textarea
                      id={`wizard-body-${draft.slot}`}
                      value={draft.body}
                      onChange={(e) =>
                        updateDraft(draft.slot, { body: e.target.value })
                      }
                      placeholder="Hola {{1}}, tienes {{2}} pases reservados."
                      rows={4}
                    />
                    {bodyError ? (
                      <p className="text-xs text-destructive">{bodyError}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        {"{{1}} es el nombre y {{2}} el número de pases."}
                      </p>
                    )}
                  </div>

                  <label
                    htmlFor={`wizard-campaign-${draft.slot}`}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-xl border border-border p-3",
                      draft.isCampaign && "border-primary",
                    )}
                  >
                    <RadioGroupItem
                      id={`wizard-campaign-${draft.slot}`}
                      value={String(draft.slot)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium">Usar en campaña</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Solo esta plantilla se usa para el primer contacto
                        masivo.
                      </p>
                    </div>
                  </label>
                </div>
              );
            })}
          </RadioGroup>

          {drafts.length < 2 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDrafts((prev) => [...prev, emptyDraft(2, false)])
              }
            >
              <Plus className="size-4" />
              Agregar segunda plantilla
            </Button>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!canSubmitWizard(drafts) || submitting}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
              Guardar y enviar a revisión
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
