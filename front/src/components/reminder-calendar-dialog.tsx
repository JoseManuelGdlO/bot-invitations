import { useMemo, useState } from "react";
import { es } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { buildCalendarEntries, type UpcomingReminder } from "@/lib/event-ops";
import type { EventItem } from "@/lib/mock/types";

function dateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dateFromKey(key: string) {
  const [year = 1970, month = 1, day = 1] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function ReminderCalendarDialog({
  reminders,
  events = [],
  size = "sm",
}: {
  reminders: UpcomingReminder[];
  events?: EventItem[];
  size?: "sm" | "lg";
}) {
  const entries = useMemo(() => buildCalendarEntries(events, reminders), [events, reminders]);
  const scheduled = useMemo(() => {
    const keys = [...new Set(entries.map((reminder) => reminder.dueOn).filter(Boolean))] as string[];
    return keys.sort().map(dateFromKey);
  }, [entries]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const fallbackKey = scheduled[0] ? dateKey(scheduled[0]) : null;
  const activeKey = selectedKey ?? fallbackKey;
  const selected = activeKey ? dateFromKey(activeKey) : undefined;
  const onSelectedDay = entries.filter((reminder) => reminder.dueOn === activeKey);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size={size} className="shrink-0">
          <CalendarDays /> Calendario
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl font-normal">
            Calendario
          </DialogTitle>
          <DialogDescription>
            Los días marcados son el evento, una campaña programada o un recordatorio.
          </DialogDescription>
        </DialogHeader>
        {scheduled.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay fechas de eventos, campañas ni recordatorios.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <Calendar
                locale={es}
                mode="single"
                selected={selected}
                defaultMonth={selected ?? scheduled[0] ?? new Date()}
                onSelect={(day) => {
                  if (day) setSelectedKey(dateKey(day));
                }}
                modifiers={{ scheduled }}
                modifiersClassNames={{
                  scheduled:
                    "relative bg-gold-soft font-medium text-foreground after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-gold",
                }}
              />
            </div>
            <div className="rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
                {selected?.toLocaleDateString("es-MX", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
              {onSelectedDay.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Este día no tiene eventos, campañas ni recordatorios.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {onSelectedDay.map((reminder) => (
                    <div key={reminder.id}>
                      <p className="text-sm font-medium">{reminder.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {reminder.eventName} · {reminder.when}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
