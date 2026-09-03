import { useEffect, useState } from "react";
import { ChevronDown, Download, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  guestTemplateHeaders,
  MAX_CUSTOM_TEMPLATE_COLUMNS,
  REQUIRED_TEMPLATE_FIELD_IDS,
  TEMPLATE_CORE_FIELDS,
  TEMPLATE_FIELD_HEADERS,
} from "@/lib/import-fields";
import { columnVarKeys } from "@/lib/import-vars";
import {
  downloadGuestTemplate,
  type GuestTemplateFormat,
} from "@/lib/download-guest-template";
import { cn } from "@/lib/utils";

const FORMATS: { id: GuestTemplateFormat; label: string }[] = [
  { id: "xlsx", label: ".xlsx" },
  { id: "xls", label: ".xls" },
  { id: "csv", label: ".csv" },
];

function initialSelected() {
  return new Set<string>(REQUIRED_TEMPLATE_FIELD_IDS);
}

function DownloadTemplateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialSelected);
  const [customLabels, setCustomLabels] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedIds(initialSelected());
    setCustomLabels([]);
    setCustomInput("");
  }, [open]);

  const headers = guestTemplateHeaders(selectedIds, customLabels);
  const varKeys = columnVarKeys(headers);

  const addCustom = () => {
    const label = customInput.trim();
    if (!label) return;
    if (customLabels.length >= MAX_CUSTOM_TEMPLATE_COLUMNS) {
      toast.error(
        `Puedes agregar hasta ${MAX_CUSTOM_TEMPLATE_COLUMNS} columnas personalizadas.`,
      );
      return;
    }
    const taken = new Set(headers.map((h) => h.toLowerCase()));
    if (taken.has(label.toLowerCase())) {
      toast.error("Esa columna ya está en la plantilla.");
      return;
    }
    setCustomLabels((prev) => [...prev, label]);
    setCustomInput("");
  };

  const download = (format: GuestTemplateFormat) => {
    const hasRequired = REQUIRED_TEMPLATE_FIELD_IDS.every((id) =>
      headers.includes(TEMPLATE_FIELD_HEADERS[id]),
    );
    if (!hasRequired) {
      toast.error(
        "La plantilla debe incluir nombre del representante y número de WhatsApp.",
      );
      return;
    }
    try {
      downloadGuestTemplate(headers, format);
      toast.success("Plantilla descargada");
      onOpenChange(false);
    } catch {
      toast.error("No se pudo generar la plantilla");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Descargar plantilla</DialogTitle>
          <DialogDescription>
            Elige las columnas de tu Excel. Nombre del representante y número de
            WhatsApp siempre van incluidos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {TEMPLATE_CORE_FIELDS.map((field) => {
            const required = REQUIRED_TEMPLATE_FIELD_IDS.includes(field.id);
            const checked = required || selectedIds.has(field.id);
            return (
              <label
                key={field.id}
                htmlFor={`template-col-${field.id}`}
                className={cn(
                  "flex items-start gap-3 rounded-xl border border-border p-3",
                  required && "bg-secondary/40",
                )}
              >
                <Checkbox
                  id={`template-col-${field.id}`}
                  checked={checked}
                  disabled={required}
                  className="mt-0.5"
                  onCheckedChange={(value) => {
                    if (required) return;
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (value === true) next.add(field.id);
                      else next.delete(field.id);
                      return next;
                    });
                  }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{field.label}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                    {TEMPLATE_FIELD_HEADERS[field.id]}
                    {required ? " · obligatoria" : null}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Columnas personalizadas</p>
          <p className="text-xs text-muted-foreground">
            Se importan como {`{{variable}}`} en Mensajes.
          </p>
          {customLabels.length ? (
            <ul className="space-y-2">
              {customLabels.map((label) => (
                <li
                  key={label}
                  className="flex items-center gap-3 rounded-xl border border-border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    {varKeys[label] ? (
                      <p className="mt-0.5 font-mono text-[10px] text-gold">
                        {`{{${varKeys[label]}}}`}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar ${label}`}
                    onClick={() =>
                      setCustomLabels((prev) =>
                        prev.filter((item) => item !== label),
                      )
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Input
              value={customInput}
              placeholder="Ej. Menú especial"
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustom();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!customInput.trim()}
              onClick={addCustom}
            >
              <Plus className="size-4" /> Añadir
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button">
                <Download className="size-4" /> Descargar
                <ChevronDown className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {FORMATS.map((format) => (
                <DropdownMenuItem
                  key={format.id}
                  onSelect={() => download(format.id)}
                >
                  {format.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DownloadTemplateButton({
  variant = "outline",
  className,
}: {
  variant?: ButtonProps["variant"];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={variant}
        className={className}
        onClick={() => setOpen(true)}
      >
        <Download className="size-4" /> Descargar plantilla
      </Button>
      <DownloadTemplateDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
