import { useEffect, useRef, useState } from "react";
import { Bold, Code, Italic, Loader2, Strikethrough } from "lucide-react";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TemplateVariableMenu } from "@/components/template-variable-menu";
import { TemplatePreview } from "@/components/template-preview";
import { ApiError } from "@/lib/api/client";
import { integrationsApi } from "@/lib/api/integrations";
import { wrapSelection } from "@/lib/whatsapp-markup";
import {
  WIZARD_EXTRA_FIELDS,
  WIZARD_PRESETS,
  WIZARD_UNIVERSAL_FIELDS,
  isWizardBodyDirty,
  mappingsFromAccountTemplate,
  matchWizardPreset,
  wizardPresetById,
  type WizardPreset,
  type WizardPresetId,
} from "@/lib/whatsapp-template-presets";
import {
  DEFAULT_TEMPLATE_PURPOSE,
  normalizeTemplatePurpose,
} from "@/lib/whatsapp-template-purpose";
import {
  buildWizardFormData,
  canSubmitWizard,
  extraPlaceholderIds,
  insertWizardVariable,
  mergeEventSlotMappings,
  metaTemplateBodyErrors,
  needsHeaderFile,
  unmappedExtraNotices,
  type EventSlotMapping,
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
const EXISTING_HEADER_FILE = "existente";
const WIZARD_TOAST =
  "Plantilla enviada a revisión. Se usará en todos los eventos hasta que elijas una personalizada.";

function emptyDraft(): WizardTemplateDraft {
  return {
    displayName: "",
    headerType: "none",
    body: "",
    headerFile: null,
    headerFileName: null,
    slotMappings: {},
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

function asHeaderType(value: string | null | undefined): WizardHeaderType {
  if (value === "document" || value === "image") return value;
  return "none";
}

export function WhatsAppTemplateWizardDialog({
  open,
  onOpenChange,
  onCreated,
  dismissible = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void | Promise<void>;
  dismissible?: boolean;
}) {
  const [draft, setDraft] = useState<WizardTemplateDraft>(emptyDraft);
  const [selectedPresetId, setSelectedPresetId] =
    useState<WizardPresetId | null>(null);
  const [pendingPreset, setPendingPreset] = useState<WizardPreset | null>(null);
  const [insertHint, setInsertHint] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef({ start: 0, end: 0 });

  const rememberCaret = (el?: HTMLTextAreaElement | null) => {
    const target = el ?? textareaRef.current;
    if (!target) return;
    caretRef.current = {
      start: target.selectionStart,
      end: target.selectionEnd,
    };
  };

  const selectedPreset = selectedPresetId
    ? wizardPresetById(selectedPresetId)
    : matchWizardPreset(draft.body);

  useEffect(() => {
    if (!open) return;
    setDraft(emptyDraft());
    setSelectedPresetId(null);
    setInsertHint(null);
    let cancelled = false;
    (async () => {
      try {
        const { templates } =
          await integrationsApi.listAccountWhatsappTemplates();
        if (cancelled) return;
        const def = templates.find(
          (row) =>
            row.isWabaDefault &&
            normalizeTemplatePurpose(row.purpose) === DEFAULT_TEMPLATE_PURPOSE,
        );
        if (!def) return;
        const matched = matchWizardPreset(def.body || "");
        const headerType = asHeaderType(def.headerType);
        let appliedPreload = false;
        setDraft((current) => {
          if (current.body.trim()) return current;
          appliedPreload = true;
          return {
            displayName: def.displayName || matched?.displayName || "",
            headerType,
            body: def.body || "",
            headerFile: null,
            headerFileName: needsHeaderFile(headerType)
              ? EXISTING_HEADER_FILE
              : null,
            slotMappings: mappingsFromAccountTemplate(
              def.body || "",
              def.slotMappings,
            ),
          };
        });
        if (appliedPreload) setSelectedPresetId(matched?.id ?? null);
      } catch {
        /* el wizard sigue usable con presets */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const updateDraft = (patch: Partial<WizardTemplateDraft>) => {
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
    setInsertHint(null);
    caretRef.current = {
      start: preset.body.length,
      end: preset.body.length,
    };
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

  const setHeaderType = (headerType: WizardHeaderType) => {
    updateDraft({
      headerType,
      headerFile: null,
      headerFileName: null,
    });
  };

  const pickHeaderFile = (
    headerType: WizardHeaderType,
    file?: File,
  ): boolean => {
    if (!file) {
      updateDraft({ headerFile: null });
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
    updateDraft({ headerFile: file, headerFileName: file.name });
    return true;
  };

  const restoreSelection = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(start, end);
    });
  };

  const setBody = (body: string) => {
    updateDraft({
      body,
      slotMappings: mergeEventSlotMappings(body, draft.slotMappings),
    });
    setInsertHint(null);
  };

  const applyWrap = (left: string, right: string = left) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? draft.body.length;
    const end = el?.selectionEnd ?? draft.body.length;
    const next = wrapSelection(draft.body, start, end, left, right);
    setBody(next.text);
    restoreSelection(next.selectionStart, next.selectionEnd);
  };

  const insertField = (fieldKey: string) => {
    const el = textareaRef.current;
    if (el && document.activeElement === el) rememberCaret(el);
    const start = caretRef.current.start;
    const end = caretRef.current.end;
    const formal = wizardPresetById("formal");
    const result = insertWizardVariable({
      body: draft.body,
      cursorStart: start,
      cursorEnd: end,
      fieldKey,
      slotMappings: draft.slotMappings,
      emptyFallback: {
        body: formal.body,
        slotMappings: formal.slotMappings,
        displayName: formal.displayName,
        headerType: formal.headerType,
      },
    });
    if (result.usedFallback) {
      applyPreset(formal);
      return;
    }
    if (result.error) {
      setInsertHint(result.error);
      return;
    }
    if (result.alreadyPresent) {
      setInsertHint("Esa variable ya está en el mensaje.");
      restoreSelection(result.selectionStart, result.selectionEnd);
      return;
    }
    updateDraft({
      body: result.body,
      slotMappings: result.slotMappings,
    });
    setInsertHint(null);
    restoreSelection(result.selectionStart, result.selectionEnd);
  };

  const setExtraMapping = (id: string, mapping: EventSlotMapping) => {
    updateDraft({
      slotMappings: mergeEventSlotMappings(draft.body, {
        ...draft.slotMappings,
        [id]: mapping,
      }),
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitWizard(draft) || submitting || submitInFlight.current) return;
    submitInFlight.current = true;
    setSubmitting(true);
    try {
      await integrationsApi.createWizardTemplates(buildWizardFormData(draft));
      setDraft(emptyDraft());
      setSelectedPresetId(null);
      onOpenChange(false);
      toast.success(WIZARD_TOAST);
      await onCreated?.();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo enviar la plantilla",
      );
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  };

  const bodyErrors = metaTemplateBodyErrors(draft.body);
  const mappingNotices = unmappedExtraNotices(draft.body, draft.slotMappings);
  const notices = [
    ...bodyErrors,
    ...mappingNotices,
    ...(insertHint &&
    !bodyErrors.includes(insertHint) &&
    !mappingNotices.includes(insertHint)
      ? [insertHint]
      : []),
  ];
  const extras = extraPlaceholderIds(draft.body);
  const showFile = needsHeaderFile(draft.headerType);
  const ready = canSubmitWizard(draft);

  const handleOpenChange = (next: boolean) => {
    if (!next && !dismissible) return;
    onOpenChange(next);
  };

  const preventDismiss = (event: { preventDefault: () => void }) => {
    if (!dismissible) event.preventDefault();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="max-w-5xl"
          showCloseButton={dismissible}
          onEscapeKeyDown={preventDismiss}
          onPointerDownOutside={preventDismiss}
          onInteractOutside={preventDismiss}
        >
          <DialogHeader>
            <DialogTitle>Plantilla de invitación</DialogTitle>
            <DialogDescription>
              Meta revisa y aprueba cada plantilla. Se usará en todos los
              eventos hasta que elijas una personalizada.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="space-y-2">
              <Label>Preconfiguración</Label>
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
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wizard-display-name">Nombre</Label>
              <Input
                id="wizard-display-name"
                value={draft.displayName}
                onChange={(e) => updateDraft({ displayName: e.target.value })}
                placeholder="Invitación formal"
              />
            </div>

            <div className="space-y-2">
              <Label>Encabezado</Label>
              <RadioGroup
                value={draft.headerType}
                onValueChange={(value) =>
                  setHeaderType(value as WizardHeaderType)
                }
                className="gap-2 sm:grid-cols-3 sm:grid"
              >
                {(
                  [
                    ["none", "Texto", "wizard-header-none"],
                    ["document", "Documento", "wizard-header-document"],
                    ["image", "Imagen", "wizard-header-image"],
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
                    <RadioGroupItem id={id} value={value} className="mt-0.5" />
                    <span className="text-sm font-medium">{label}</span>
                  </label>
                ))}
              </RadioGroup>
            </div>

            {showFile ? (
              <div className="space-y-2">
                <Label htmlFor="wizard-file">Archivo de encabezado</Label>
                <Input
                  id="wizard-file"
                  key={draft.headerType}
                  type="file"
                  accept={
                    draft.headerType === "image"
                      ? IMAGE_ACCEPT
                      : DOCUMENT_ACCEPT
                  }
                  onChange={(e) => {
                    const ok = pickHeaderFile(
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
                ) : draft.headerFileName ? (
                  <p className="text-xs text-muted-foreground">
                    Se conservará el archivo actual si no subes uno nuevo.
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

            <div className="grid items-start gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="wizard-body">Cuerpo del mensaje</Label>
              <div className="mb-2 flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  title="Negrita"
                  onClick={() => applyWrap("*")}
                >
                  <Bold />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  title="Cursiva"
                  onClick={() => applyWrap("_")}
                >
                  <Italic />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  title="Tachado"
                  onClick={() => applyWrap("~")}
                >
                  <Strikethrough />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="size-8"
                  title="Monoespaciado"
                  onClick={() => applyWrap("```")}
                >
                  <Code />
                </Button>
                <p className="ml-1 text-[11px] text-muted-foreground">
                  Enter para saltos. *negrita*, _cursiva_, ~tachado~.
                </p>
              </div>
              <Textarea
                id="wizard-body"
                ref={textareaRef}
                value={draft.body}
                onChange={(e) => setBody(e.target.value)}
                onSelect={(e) => rememberCaret(e.currentTarget)}
                onClick={(e) => rememberCaret(e.currentTarget)}
                onKeyUp={(e) => rememberCaret(e.currentTarget)}
                onBlur={(e) => rememberCaret(e.currentTarget)}
                onKeyDown={(e) => {
                  if (!(e.metaKey || e.ctrlKey)) return;
                  if (e.key === "b" || e.key === "B") {
                    e.preventDefault();
                    applyWrap("*");
                  } else if (e.key === "i" || e.key === "I") {
                    e.preventDefault();
                    applyWrap("_");
                  }
                }}
                placeholder="Hola {{1}}, tienes {{2}} pases reservados."
                rows={6}
                className="font-sans text-sm leading-relaxed"
              />
              <TemplateVariableMenu
                variables={[...WIZARD_UNIVERSAL_FIELDS]}
                formatToken={(key) => key}
                labelFor={(key) => key}
                onInsert={insertField}
              />
              {notices.length > 0 ? (
                <ul className="space-y-1">
                  {notices.map((message) => (
                    <li key={message} className="text-xs text-destructive">
                      {message}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {"{{1}} es el nombre y {{2}} el número de pases."}
                </p>
              )}
            </div>

            <TemplatePreview
              body={draft.body}
              guests={[]}
              event={undefined}
              slotMappings={draft.slotMappings}
              headerType={draft.headerType}
              headerFile={draft.headerFile}
              headerFileName={draft.headerFileName ?? null}
              compact
              sampleFallback
            />
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Variables fijas
              </p>
              <p className="text-sm">{"{{1}} · nombre"}</p>
              <p className="text-sm">{"{{2}} · numero_invitados"}</p>
            </div>

            {extras.length > 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Variables extra</p>
                {extras.map((id) => {
                  const mapping = draft.slotMappings[id] ?? null;
                  const selected =
                    mapping?.type === "field" ? mapping.key : undefined;
                  return (
                    <div key={id} className="space-y-2">
                      <Label htmlFor={`wizard-slot-${id}`}>{`{{${id}}}`}</Label>
                      <Select
                        {...(selected ? { value: selected } : {})}
                        onValueChange={(value) =>
                          setExtraMapping(id, { type: "field", key: value })
                        }
                      >
                        <SelectTrigger id={`wizard-slot-${id}`}>
                          <SelectValue placeholder="Elige un dato del evento" />
                        </SelectTrigger>
                        <SelectContent>
                          {WIZARD_EXTRA_FIELDS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <DialogFooter>
              {dismissible ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
              ) : null}
              <Button type="submit" disabled={!ready || submitting}>
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Guardar y enviar a revisión
              </Button>
            </DialogFooter>
          </form>
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
