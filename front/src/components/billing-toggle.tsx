import { cn } from "@/lib/utils";
import type { BillingInterval, SubscriptionPlan } from "@/lib/mock/types";

export function yearlyAmount(plan: Pick<SubscriptionPlan, "priceMxn" | "yearlyPriceMxn" | "annualDiscountPercent">) {
  if (plan.yearlyPriceMxn != null) return plan.yearlyPriceMxn;
  const discount = Math.min(80, Math.max(0, plan.annualDiscountPercent ?? 20));
  return Math.round(plan.priceMxn * 12 * (1 - discount / 100));
}

export function BillingToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-1">
      <button
        type="button"
        onClick={() => onChange("month")}
        className={cn(
          "rounded-full px-4 py-1.5 text-sm transition-colors",
          value === "month" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Mensual
      </button>
      <button
        type="button"
        onClick={() => onChange("year")}
        className={cn(
          "rounded-full px-4 py-1.5 text-sm transition-colors",
          value === "year" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Anual
      </button>
    </div>
  );
}

export function PlanPrice({
  plan,
  interval,
}: {
  plan: SubscriptionPlan;
  interval: BillingInterval;
}) {
  const yearly = yearlyAmount(plan);
  const discount = plan.annualDiscountPercent ?? 20;
  if (interval === "year") {
    return (
      <div>
        <p className="font-display text-4xl">
          ${yearly.toLocaleString("es-MX")}
          <span className="ml-1 text-base text-muted-foreground">MXN / año</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Equivale a ${Math.round(yearly / 12).toLocaleString("es-MX")} al mes · ahorras {discount}%
        </p>
      </div>
    );
  }
  return (
    <p className="font-display text-4xl">
      ${plan.priceMxn.toLocaleString("es-MX")}
      <span className="ml-1 text-base text-muted-foreground">MXN / mes</span>
    </p>
  );
}
