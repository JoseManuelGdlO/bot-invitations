import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarHeart, CreditCard, Users, Wallet } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { SubscriptionPlan } from "@/lib/mock/types";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")({
  component: AdminHome,
});

interface Overview {
  clients: number;
  activeSubscriptions: number;
  events: number;
  guests: number;
  monthlyMxn: number;
  plans: SubscriptionPlan[];
}

function AdminHome() {
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    api<Overview>("/admin/overview")
      .then(setData)
      .catch(() => toast.error("No se pudo cargar el resumen"));
  }, []);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 md:px-8 md:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">Backoffice</p>
      <h1 className="mt-1 font-display text-4xl">Resumen de la plataforma</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Clientes, uso y el valor mensual de las suscripciones activas.
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Clientes" value={data?.clients ?? "—"} icon={Users} />
        <StatCard
          label="Suscripciones activas"
          value={data?.activeSubscriptions ?? "—"}
          tone="success"
          icon={CreditCard}
        />
        <StatCard label="Eventos" value={data?.events ?? "—"} icon={CalendarHeart} />
        <StatCard
          label="Ingreso mensual"
          value={data ? `$${data.monthlyMxn.toLocaleString("es-MX")}` : "—"}
          hint="MXN de planes activos"
          tone="gold"
          icon={Wallet}
        />
      </section>

      <section className="mt-10">
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-display text-2xl">Planes</h2>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/planes">Editar precios</Link>
          </Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {(data?.plans ?? []).map((plan) => (
            <div key={plan.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
              <p className="font-display text-2xl">{plan.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
              <p className="mt-4 font-display text-3xl">${plan.priceMxn.toLocaleString("es-MX")}<span className="text-base text-muted-foreground"> / mes</span></p>
              <p className="mt-2 text-sm text-muted-foreground">
                {plan.eventLimit} eventos · {plan.guestLimit.toLocaleString("es-MX")} invitados
                {plan.yearlyPriceMxn
                  ? ` · anual $${plan.yearlyPriceMxn.toLocaleString("es-MX")} (−${plan.annualDiscountPercent ?? 20}%)`
                  : ""}
              </p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
