import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";
import type { SubscriptionPlan } from "@/lib/mock/types";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/planes")({
  component: AdminPlans,
});

function validatePlan(plan: SubscriptionPlan): string | null {
  const price = Number(plan.priceMxn);
  if (!Number.isFinite(price) || price <= 0) {
    return "El precio mensual debe ser mayor a 0 MXN";
  }
  return null;
}

function AdminPlans() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    api<SubscriptionPlan[]>("/admin/plans")
      .then(setPlans)
      .catch(() => toast.error("No se pudieron cargar los planes"));
  }, []);

  const set = (
    id: string,
    key: keyof SubscriptionPlan,
    value: string | number | boolean,
  ) => {
    setPlans((current) =>
      current.map((plan) =>
        plan.id === id ? { ...plan, [key]: value } : plan,
      ),
    );
  };

  const save = async (plan: SubscriptionPlan) => {
    const validationError = validatePlan(plan);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(plan.id);
    try {
      const updated = await api<SubscriptionPlan>(`/admin/plans/${plan.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: plan.name,
          tagline: plan.tagline,
          priceMxn: Number(plan.priceMxn),
          annualDiscountPercent: Number(plan.annualDiscountPercent ?? 20),
          eventLimit: Number(plan.eventLimit),
          guestLimit: Number(plan.guestLimit),
          highlighted: !!plan.highlighted,
        }),
      });
      setPlans((current) =>
        current.map((item) => (item.id === plan.id ? updated : item)),
      );
      toast.success(`Plan ${updated.name} actualizado`);
    } catch {
      toast.error("No se pudo guardar el plan");
    } finally {
      setSaving(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 md:px-8 md:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
        Backoffice
      </p>
      <h1 className="mt-1 font-display text-4xl">Planes y precios</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Estos límites se aplican de inmediato al crear eventos o importar
        invitados.
      </p>

      <div className="mt-8 space-y-5">
        {plans.map((plan) => (
          <form
            key={plan.id}
            className="rounded-2xl border border-border bg-card p-6 shadow-soft"
            onSubmit={(e) => {
              e.preventDefault();
              save(plan);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input
                  value={plan.name}
                  onChange={(e) => set(plan.id, "name", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Precio mensual (MXN)</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={plan.priceMxn}
                  onChange={(e) =>
                    set(plan.id, "priceMxn", Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Descripción</Label>
                <Input
                  value={plan.tagline}
                  onChange={(e) => set(plan.id, "tagline", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Eventos incluidos</Label>
                <Input
                  type="number"
                  min={1}
                  value={plan.eventLimit}
                  onChange={(e) =>
                    set(plan.id, "eventLimit", Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Invitados incluidos</Label>
                <Input
                  type="number"
                  min={1}
                  value={plan.guestLimit}
                  onChange={(e) =>
                    set(plan.id, "guestLimit", Number(e.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Descuento anual (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={80}
                  value={plan.annualDiscountPercent ?? 20}
                  onChange={(e) =>
                    set(
                      plan.id,
                      "annualDiscountPercent",
                      Number(e.target.value),
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Precio anual resultante</Label>
                <p className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm">
                  $
                  {Math.round(
                    (plan.priceMxn *
                      12 *
                      (100 - (plan.annualDiscountPercent ?? 20))) /
                      100,
                  ).toLocaleString("es-MX")}{" "}
                  MXN / año
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end">
              <Button type="submit" disabled={saving === plan.id}>
                Guardar {plan.name}
              </Button>
            </div>
          </form>
        ))}
      </div>
    </main>
  );
}
