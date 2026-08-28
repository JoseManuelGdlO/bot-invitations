import { Badge } from "@/components/ui/badge";
import type { EventItem } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

const EVENT_STATUS_CLASS: Record<EventItem["status"], string> = {
  activo: "border-transparent bg-success-soft text-success",
  borrador: "border-border bg-card/90 text-foreground",
  finalizado: "border-transparent bg-secondary text-muted-foreground",
};

export function EventStatusBadge({
  status,
  className,
}: {
  status: EventItem["status"];
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "rounded-full capitalize",
        EVENT_STATUS_CLASS[status],
        className,
      )}
    >
      {status}
    </Badge>
  );
}
