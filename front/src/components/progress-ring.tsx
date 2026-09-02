import { cn } from "@/lib/utils";

export function ProgressRing({
  value,
  size = 132,
  stroke = 10,
  caption,
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  caption?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, value)) / 100) * c;
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--gold)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-2xl leading-none">{value}%</span>
        </div>
      </div>
      {caption ? (
        <p className="max-w-56 text-center text-xs text-muted-foreground">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
