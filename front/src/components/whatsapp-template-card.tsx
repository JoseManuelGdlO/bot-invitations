import { useRef } from "react";
import { Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  extraPlaceholderIds,
  extraSlotOptionLabel,
  extraSlotOptions,
  eventTemplateBodyError,
  isEventTemplateCardReady,
  LITERAL_SLOT_OPTION,
  mergeEventSlotMappings,
  needsHeaderFile,
  statusBadgeClassName,
  statusBadgeLabel,
  type EventSlotMapping,
  type WizardHeaderType,
} from "@/lib/whatsapp-templates";

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

export type EventTemplateCardDraft = {
  slot: 1 | 2;
  body: string;
  headerType: WizardHeaderType;
  headerFile: File | null;
  headerFileName: string | null;
  savedHeaderType: WizardHeaderType;
  savedHeaderFileName: string | null;
  isCampaign: boolean;
  status: string | null;
  rejectedReason: string | null;
  slotMappings: Record<string, EventSlotMapping>;
  persisted: boolean;
};

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

function mappingSelectValue(mapping: EventSlotMapping): string | undefined {
  if (!mapping) return undefined;
  if (mapping.type === "literal") return LITERAL_SLOT_OPTION;
  return mapping.key || undefined;
}

export function WhatsappTemplateCard({
  draft,
  extraKeys,
  submitting = false,
  onChange,
  onSave,
}: {
  draft: EventTemplateCardDraft;
  extraKeys: string[];
  submitting?: boolean;
  onChange: (patch: Partial<EventTemplateCardDraft>) => void;
  onSave: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyError = eventTemplateBodyError(draft.body);
  const extras = extraPlaceholderIds(draft.body);
  const options = extraSlotOptions(extraKeys);
  const showFile = needsHeaderFile(draft.headerType);
  const status = draft.status || "DRAFT";
  const ready = isEventTemplateCardReady(draft);

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
    onChange({
      slotMappings: mergeEventSlotMappings(draft.body, {
        ...draft.slotMappings,
        [id]: mapping,
      }),
    });
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
    <Card className="rounded-2xl border-border shadow-soft">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <CardTitle className="text-base font-medium">
          Plantilla {draft.slot}
        </CardTitle>
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
          <Textarea
            id={`event-template-body-${draft.slot}`}
            value={draft.body}
            onChange={(e) => {
              const body = e.target.value;
              onChange({
                body,
                slotMappings: mergeEventSlotMappings(body, draft.slotMappings),
              });
            }}
            placeholder="Hola {{1}}, tienes {{2}} pases reservados."
            rows={5}
          />
          {bodyError ? (
            <p className="text-xs text-destructive">{bodyError}</p>
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
            {extras.map((id) => {
              const mapping = draft.slotMappings[id] ?? null;
              const selected = mappingSelectValue(mapping);
              return (
                <div key={id} className="space-y-2">
                  <Label htmlFor={`event-template-slot-${draft.slot}-${id}`}>
                    {`{{${id}}}`}
                  </Label>
                  <Select
                    value={selected}
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
                      <SelectValue placeholder="Elige un dato o texto fijo" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((option) => (
                        <SelectItem key={option} value={option}>
                          {extraSlotOptionLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {mapping?.type === "literal" ? (
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
