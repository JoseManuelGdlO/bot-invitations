import { Sparkles } from "lucide-react";
import { interpolateTemplate } from "@/lib/template-vars";
import { parseWhatsAppMarkup } from "@/lib/whatsapp-markup";
import type { EventItem, Guest } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

type Props = {
  body: string;
  guests: Guest[];
  event: EventItem | undefined;
  plannerName?: string;
};

function WhatsAppFormattedText({ text }: { text: string }) {
  const segments = parseWhatsAppMarkup(text);
  return (
    <p className="whitespace-pre-line">
      {segments.map((segment, index) => {
        switch (segment.type) {
          case "strong":
            return <strong key={index}>{segment.value}</strong>;
          case "em":
            return <em key={index}>{segment.value}</em>;
          case "s":
            return <s key={index}>{segment.value}</s>;
          case "code":
            return (
              <code key={index} className="font-mono text-[0.95em]">
                {segment.value}
              </code>
            );
          default:
            return <span key={index}>{segment.value}</span>;
        }
      })}
    </p>
  );
}

export function TemplatePreview({
  body,
  guests,
  event,
  plannerName = "Planner",
}: Props) {
  const samples = guests.slice(0, 2);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-gold" />
        <h3 className="font-display text-xl">Vista previa</h3>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Así se vería el mensaje con los datos de invitados de este evento.
      </p>
      <div className="mt-4 space-y-3">
        {samples.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Agrega invitados para ver la interpolación.
          </p>
        ) : (
          samples.map((guest) => (
            <div key={guest.id} className={cn("chat-canvas rounded-xl p-3")}>
              <p className="mb-1.5 text-[11px] text-muted-foreground">
                {guest.rep}
              </p>
              <div className="rounded-2xl rounded-br-sm bg-success-soft p-3 text-xs leading-relaxed shadow-soft">
                <WhatsAppFormattedText
                  text={interpolateTemplate(body, guest, event, plannerName)}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
