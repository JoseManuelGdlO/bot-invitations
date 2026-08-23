import { Badge } from "@/components/ui/badge";
import { STATUS_META } from "@/lib/mock/format";
import type { ConfirmationStatus } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: ConfirmationStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors", meta.className, className)}
    >
      {meta.label}
    </Badge>
  );
}
