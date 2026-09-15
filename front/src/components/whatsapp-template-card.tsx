import { useRef, useState } from "react";
import { Bold, Code, Italic, Loader2, Strikethrough } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TemplateVariableMenu } from "@/components/template-variable-menu";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { wrapSelection } from "@/lib/whatsapp-markup";
import {
  canEditEventExtraMappings,
  displayNameOrPreview,
  extraSlotOptionsForEventTemplate,
  eventTemplateVariableKeys,
  type EventTemplateCardDraft,
} from "@/lib/whatsapp-event-templates";
import { wizardPresetById } from "@/lib/whatsapp-template-presets";
import {
  extraPlaceholderIds,
  extraSlotOptionLabel,
  insertWizardVariable,
  isEventTemplateCardReady,
  LITERAL_SLOT_OPTION,
  mergeEventSlotMappings,
  metaTemplateBodyErrors,
  needsHeaderFile,
  statusBadgeClassName,
  statusBadgeLabel,
  unmappedExtraNotices,
  type EventSlotMapping,
  type WizardHeaderType,
} from "@/lib/whatsapp-templates";

export type { EventTemplateCardDraft };

const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_ACCEPT = "image/jpeg,image/png,.jpg,.jpeg,.png";

const HEADER_OPTIONS: Array<[WizardHeaderType, string]> = [
  ["none", "Texto"],
  ["document", "Documento"],
  ["image", "Imagen"],
];

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

function mappingSelectValue(
  mapping: EventSlotMapping,
  allowLiteral: boolean,
): string | undefined {
  if (!mapping) return undefined;
  if (mapping.type === "literal") {
    return allowLiteral ? LITERAL_SLOT_OPTION : undefined;
  }
  return mapping.key || undefined;
}

export function WhatsappTemplateCard({
  draft,
  extraKeys,
  submitting = false,
  showCampaignRadio = true,
  highlighted = false,
  onChange,
  onSave,
}: {
  draft: EventTemplateCardDraft;
  extraKeys: string[];
  submitting?: boolean;
  showCampaignRadio?: boolean;
  highlighted?: boolean;
  onChange: (patch: Partial<EventTemplateCardDraft>) => void;
  onSave: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
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
  const [insertHint, setInsertHint] = useState<string | null>(null);
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
  const extrasEditable = canEditEventExtraMappings(draft);
  const options = extraSlotOptionsForEventTemplate(
    draft.isWabaDefault,
    extraKeys,
  );
  const variables = eventTemplateVariableKeys(draft.isWabaDefault, extraKeys);
  const showFile = needsHeaderFile(draft.headerType);
  const status = draft.status || "DRAFT";
  const ready = isEventTemplateCardReady(draft);
  const title =
    displayNameOrPreview({
      displayName: draft.displayName,
      body: draft.body,
    }) || `Plantilla ${draft.slot}`;

  const setHeaderType = (headerType: WizardHeaderType) => {
    onChange({
      headerType,
      headerFile: null,
      headerFileName:
        headerType === draft.savedHeaderType ? draft.savedHeaderFileName : null,
    });
    if (fileRef.current) fileRef.current.value = "";
  };

  const pickHeaderFile = (file?: File) => {
    if (!file) {
      onChange({ headerFile: null });
      return true;
    }
    if (draft.headerType === "document") {
      if (!isDocumentFile(file)) {
        toast.error("El documento debe ser PDF o Word (doc, docx).");
        return false;
      }
      if (file.size > DOCUMENT_MAX_BYTES) {
        toast.error("El archivo no puede superar 10 MB.");
        return false;
      }
    }
    if (draft.headerType === "image") {
      if (!isHeaderImageFile(file)) {
        toast.error("La imagen debe ser JPEG o PNG.");
        return false;
      }
      if (file.size > IMAGE_MAX_BYTES) {
        toast.error("La imagen no puede superar 5 MB.");
        return false;
      }
    }
    onChange({ headerFile: file, headerFileName: file.name });
    return true;
  };

  const setExtraMapping = (id: string, mapping: EventSlotMapping) => {
    if (!extrasEditable && mapping?.type === "literal") return;
    onChange({
      slotMappings: mergeEventSlotMappings(draft.body, {
        ...draft.slotMappings,
        [id]: mapping,
      }),
    });
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
    onChange({
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
      onChange({
        body: result.body,
        slotMappings: result.slotMappings,
        displayName: draft.displayName || result.displayName || formal.displayName,
        headerType: result.headerType || formal.headerType,
      });
      setInsertHint(null);
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
    onChange({
      body: result.body,
      slotMappings: result.slotMappings,
    });
    setInsertHint(null);
    restoreSelection(result.selectionStart, result.selectionEnd);
  };

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-medium",
        statusBadgeClassName(status),
      )}
    >
      {statusBadgeLabel(status)}
    </Badge>
  );

  return (
    <Card
      className={cn(
        "rounded-2xl border-border shadow-soft",
        highlighted && "border-primary",
      )}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle className="text-base font-medium">{title}</CardTitle>
        {draft.rejectedReason ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="cursor-help">
                  {badge}
                </button>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                {draft.rejectedReason}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          badge
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`event-template-name-${draft.slot}`}>Nombre</Label>
          <Input
            id={`event-template-name-${draft.slot}`}
            value={draft.displayName}
            onChange={(e) => onChange({ displayName: e.target.value })}
            placeholder="Invitación formal"
          />
        </div>

        <div className="space-y-2">
          <Label>Encabezado</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {HEADER_OPTIONS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "rounded-xl border border-border p-3 text-left text-sm font-medium",
                  draft.headerType === value && "border-primary",
                )}
                onClick={() => setHeaderType(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {showFile ? (
          <div className="space-y-2">
            <Label htmlFor={`event-template-file-${draft.slot}`}>
              Archivo de encabezado
            </Label>
            <Input
              id={`event-template-file-${draft.slot}`}
              ref={fileRef}
              key={`${draft.slot}-${draft.headerType}`}
              type="file"
              accept={
                draft.headerType === "image" ? IMAGE_ACCEPT : DOCUMENT_ACCEPT
              }
              onChange={(e) => {
                const ok = pickHeaderFile(e.target.files?.[0]);
                if (!ok) e.target.value = "";
              }}
            />
            {draft.headerFileName ? (
              <p className="text-xs text-muted-foreground">
                {draft.headerFileName}
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
          <Label htmlFor={`event-template-body-${draft.slot}`}>
            Cuerpo del mensaje
          </Label>
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
            id={`event-template-body-${draft.slot}`}
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
            rows={5}
            className="font-sans text-sm leading-relaxed"
          />
          <TemplateVariableMenu
            variables={variables}
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
            {!extrasEditable ? (
              <p className="text-xs text-muted-foreground">
                En el default compartido las extras solo pueden ser datos
                universales. Para mesa, familia u otros datos del evento,
                guarda una copia personalizada.
              </p>
            ) : null}
            {extras.map((id) => {
              const mapping = draft.slotMappings[id] ?? null;
              const selected = mappingSelectValue(mapping, extrasEditable);
              return (
                <div key={id} className="space-y-2">
                  <Label htmlFor={`event-template-slot-${draft.slot}-${id}`}>
                    {`{{${id}}}`}
                  </Label>
                  <Select
                    {...(selected ? { value: selected } : {})}
                    onValueChange={(value) => {
                      if (value === LITERAL_SLOT_OPTION) {
                        setExtraMapping(id, {
                          type: "literal",
                          value:
                            mapping?.type === "literal" ? mapping.value : "",
                        });
                        return;
                      }
                      setExtraMapping(id, { type: "field", key: value });
                    }}
                  >
                    <SelectTrigger
                      id={`event-template-slot-${draft.slot}-${id}`}
                    >
                      <SelectValue
                        placeholder={
                          extrasEditable
                            ? "Elige un dato o texto fijo"
                            : "Elige un dato del evento"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {extraSlotOptionLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {extrasEditable && mapping?.type === "literal" ? (
                    <Input
                      value={mapping.value}
                      onChange={(e) =>
                        setExtraMapping(id, {
                          type: "literal",
                          value: e.target.value,
                        })
                      }
                      placeholder="Texto fijo"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {showCampaignRadio ? (
          <label
            htmlFor={`event-template-campaign-${draft.slot}`}
            className={cn(
              "flex cursor-pointer gap-3 rounded-xl border border-border p-3",
              draft.isCampaign && "border-primary",
            )}
          >
            <RadioGroupItem
              id={`event-template-campaign-${draft.slot}`}
              value={String(draft.slot)}
              className="mt-0.5"
            />
            <div>
              <p className="text-sm font-medium">Usar en campaña</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Solo esta plantilla se usa para el primer contacto masivo.
              </p>
            </div>
          </label>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          className="w-full"
          disabled={!ready || submitting}
          onClick={onSave}
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Guardar y enviar a revisión
        </Button>
      </CardFooter>
    </Card>
  );
}
