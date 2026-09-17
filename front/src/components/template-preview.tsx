import { Sparkles } from "lucide-react";
import { WhatsAppFormattedText } from "@/components/whatsapp-formatted-text";
import {
  interpolateMetaTemplate,
  interpolateTemplate,
  SAMPLE_PREVIEW_EVENT,
  SAMPLE_PREVIEW_GUEST,
} from "@/lib/template-vars";
import type { EventItem, Guest } from "@/lib/mock/types";
import type { EventSlotMapping } from "@/lib/whatsapp-templates";
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
};

export function TemplatePreview({
  body,
  guests,
  event,
  plannerName = "Planner",
  slotMappings,
  compact = false,
  sampleFallback = false,
  className,
}: Props) {
  const usingSample = sampleFallback && guests.length === 0;
  const previewGuests = usingSample
    ? [SAMPLE_PREVIEW_GUEST]
    : guests.slice(0, compact ? 1 : 2);
  const previewEvent = event ?? (usingSample ? SAMPLE_PREVIEW_EVENT : undefined);

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft",
        compact ? "h-80 w-full p-3" : "p-5",
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
              <div className="rounded-2xl rounded-br-sm bg-success-soft p-3 text-xs leading-relaxed shadow-soft">
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
          ))
        )}
      </div>
    </div>
  );
}
