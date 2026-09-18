import { useEffect, useState } from "react";
import { FileText, ImageOff, Image as ImageIcon, Sparkles } from "lucide-react";
import { WhatsAppFormattedText } from "@/components/whatsapp-formatted-text";
import {
  interpolateMetaTemplate,
  interpolateTemplate,
  SAMPLE_PREVIEW_EVENT,
  SAMPLE_PREVIEW_GUEST,
} from "@/lib/template-vars";
import type { EventItem, Guest } from "@/lib/mock/types";
import {
  templateHeaderPreviewState,
  type EventSlotMapping,
  type WizardHeaderType,
} from "@/lib/whatsapp-templates";
import { cn } from "@/lib/utils";

type Props = {
  body: string;
  guests: Guest[];
  event: EventItem | undefined;
  plannerName?: string | undefined;
  slotMappings?: Record<string, EventSlotMapping>;
  compact?: boolean;
  sampleFallback?: boolean;
  className?: string;
  headerType?: WizardHeaderType;
  headerFile?: File | null;
  headerFileName?: string | null;
};

function useObjectUrl(file: File | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  return url;
}

function HeaderPlaceholder({
  headerType,
}: {
  headerType: "image" | "document";
}) {
  const Icon = headerType === "image" ? ImageOff : FileText;
  return (
    <div className="flex min-h-28 flex-col items-center justify-center gap-1.5 border-b-2 border-dashed border-gold bg-gold-soft/80 px-3 py-5 text-center">
      <Icon className="size-7 text-gold-foreground" />
      <p className="text-xs font-semibold text-gold-foreground">
        {headerType === "image"
          ? "Aún no hay imagen cargada"
          : "Aún no hay documento cargado"}
      </p>
      <p className="text-[11px] leading-snug text-gold-foreground/80">
        {headerType === "image"
          ? "Sube un JPEG o PNG para ver aquí lo que se enviará."
          : "Sube un PDF o Word para ver aquí lo que se enviará."}
      </p>
    </div>
  );
}

function HeaderFileCard({
  fileName,
  variant,
}: {
  fileName: string;
  variant: "image" | "document";
}) {
  const Icon = variant === "image" ? ImageIcon : FileText;
  return (
    <div className="flex items-center gap-2 border-b border-black/5 bg-white/55 px-3 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-card text-gold-foreground shadow-soft">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-foreground">
          {fileName}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {variant === "image"
            ? "Imagen que se enviará"
            : "Documento que se enviará"}
        </p>
      </div>
    </div>
  );
}

function HeaderMedia({
  headerType,
  headerFile,
  headerFileName,
}: {
  headerType?: WizardHeaderType;
  headerFile?: File | null;
  headerFileName?: string | null;
}) {
  const state = templateHeaderPreviewState({
    headerType,
    headerFile,
    headerFileName,
  });
  const objectUrl = useObjectUrl(
    state.kind !== "none" && state.kind !== "empty" && state.source === "file"
      ? headerFile
      : null,
  );

  if (state.kind === "none") return null;
  if (state.kind === "empty") {
    return <HeaderPlaceholder headerType={state.headerType} />;
  }
  if (state.kind === "image" && state.source === "file" && objectUrl) {
    return (
      <img
        src={objectUrl}
        alt={state.fileName}
        className="max-h-40 w-full object-cover"
      />
    );
  }
  if (
    state.kind === "document" &&
    state.source === "file" &&
    state.previewablePdf &&
    objectUrl
  ) {
    return (
      <iframe
        title={state.fileName}
        src={objectUrl}
        className="h-40 w-full border-0 bg-white"
      />
    );
  }
  return (
    <HeaderFileCard
      fileName={state.fileName}
      variant={state.kind === "image" ? "image" : "document"}
    />
  );
}

export function TemplatePreview({
  body,
  guests,
  event,
  plannerName = "Planner",
  slotMappings,
  compact = false,
  sampleFallback = false,
  className,
  headerType = "none",
  headerFile = null,
  headerFileName = null,
}: Props) {
  const usingSample = sampleFallback && guests.length === 0;
  const previewGuests = usingSample
    ? [SAMPLE_PREVIEW_GUEST]
    : guests.slice(0, compact ? 1 : 2);
  const previewEvent =
    event ?? (usingSample ? SAMPLE_PREVIEW_EVENT : undefined);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft",
        compact ? "h-96 w-full p-3" : "p-5",
        className,
      )}
    >
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-gold" />
          <h3 className={cn("font-display", compact ? "text-lg" : "text-xl")}>
            Vista previa
          </h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {usingSample
            ? "Así se vería el mensaje con datos de ejemplo."
            : "Así se vería el mensaje con los datos de invitados de este evento."}
        </p>
      </div>
      <div
        className={cn(
          "min-h-0",
          compact ? "mt-3 flex-1 overflow-y-auto" : "mt-4 space-y-3",
        )}
      >
        {previewGuests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Agrega invitados para ver la interpolación.
          </p>
        ) : (
          previewGuests.map((guest) => (
            <div
              key={guest.id}
              className={cn(
                "chat-canvas rounded-xl p-3",
                compact && "min-h-full",
              )}
            >
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                {guest.rep}
              </p>
              <div className="overflow-hidden rounded-2xl rounded-br-sm bg-success-soft text-xs leading-relaxed shadow-soft">
                <HeaderMedia
                  headerType={headerType}
                  headerFile={headerFile}
                  headerFileName={headerFileName}
                />
                <div className="p-3">
                  <WhatsAppFormattedText
                    text={
                      slotMappings
                        ? interpolateMetaTemplate(
                            body,
                            slotMappings,
                            guest,
                            previewEvent,
                            plannerName,
                          )
                        : interpolateTemplate(
                            body,
                            guest,
                            previewEvent,
                            plannerName,
                          )
                    }
                  />
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
