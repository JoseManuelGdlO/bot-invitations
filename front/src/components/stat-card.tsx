import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "rose" | "gold";
  className?: string;
}) {
  const tones = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    rose: "text-rose-foreground",
    gold: "text-gold",
  } as const;

  return (
    <div
      className={cn(
        "group min-w-0 rounded-xl border border-border bg-card p-3.5 shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift sm:p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <p className="min-w-0 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground sm:text-xs">
          {label}
        </p>
        {Icon ? (
          <span className="shrink-0 rounded-lg bg-secondary p-1.5 text-muted-foreground transition-colors group-hover:bg-gold-soft group-hover:text-gold">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 font-display text-2xl leading-none sm:mt-3 sm:text-3xl",
          tones[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
