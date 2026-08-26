import { Sparkles } from "lucide-react";
import { interpolateTemplate } from "@/lib/template-vars";
import type { EventItem, Guest } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

type Props = {
  body: string;
  guests: Guest[];
  event: EventItem | undefined;
  plannerName?: string;
};

export function TemplatePreview({ body, guests, event, plannerName = "Planner" }: Props) {
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
          <p className="text-sm text-muted-foreground">Agrega invitados para ver la interpolación.</p>
        ) : (
          samples.map((guest) => (
            <div key={guest.id} className={cn("chat-canvas rounded-xl p-3")}>
              <p className="mb-1.5 text-[11px] text-muted-foreground">{guest.rep}</p>
              <div className="rounded-2xl rounded-br-sm bg-success-soft p-3 text-xs leading-relaxed shadow-soft">
                <p className="whitespace-pre-line">{interpolateTemplate(body, guest, event, plannerName)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
