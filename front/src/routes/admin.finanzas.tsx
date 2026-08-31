import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Banknote, CreditCard, TrendingUp, Wallet } from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api/client";
import { mxn } from "@/lib/money";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/finanzas")({
  component: AdminFinance,
});

interface FinanceSnapshot {
  stripe: {
    available: boolean;
    availableMxn: number;
    pendingMxn: number;
    error?: string;
  };
  estimatedMrrMxn: number;
  estimatedArrMxn: number;
  collectedThisMonthMxn: number;
  collectedLastMonthMxn: number;
  collectedLast12MonthsMxn: number;
  subscribers: {
    active: number;
    pending: number;
    canceled: number;
    monthly: number;
    yearly: number;
    clients: number;
  };
  byPlan: Array<{
    id: string;
    name: string;
    slug: string;
    priceMxn: number;
    subscribers: number;
    monthlySubscribers: number;
    yearlySubscribers: number;
    mrrMxn: number;
  }>;
  months: Array<{
    key: string;
    label: string;
    collectedMxn: number;
    invoices: number;
  }>;
  recentPayments: Array<{
    id: string;
    amountMxn: number;
    interval: string | null;
    paidAt: string;
    customerEmail: string;
    customerName: string;
    businessName: string;
    planName: string;
    status: string;
  }>;
}

function AdminFinance() {
  const [data, setData] = useState<FinanceSnapshot | null>(null);

  useEffect(() => {
    api<FinanceSnapshot>("/admin/finance")
      .then(setData)
      .catch(() => toast.error("No se pudo cargar el dashboard financiero"));
  }, []);

  const maxMonth = Math.max(
    1,
    ...(data?.months.map((m) => m.collectedMxn) ?? [1]),
  );
  const delta =
    data && data.collectedLastMonthMxn > 0
      ? ((data.collectedThisMonthMxn - data.collectedLastMonthMxn) /
          data.collectedLastMonthMxn) *
        100
      : null;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8 md:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
        Backoffice
      </p>
      <h1 className="mt-1 font-display text-4xl">Finanzas</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Dinero cobrado en Stripe y el ingreso recurrente estimado de las
        suscripciones activas.
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Cobrado este mes"
          value={data ? mxn(data.collectedThisMonthMxn, 2) : "—"}
          hint={
            delta === null
              ? "Pagos confirmados en Stripe"
              : `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}% vs mes pasado`
          }
          tone="gold"
          icon={Wallet}
        />
        <StatCard
          label="MRR estimado"
          value={data ? mxn(data.estimatedMrrMxn) : "—"}
          hint="Planes activos, anual prorrateado"
          tone="success"
          icon={TrendingUp}
        />
        <StatCard
          label="Disponible en Stripe"
          value={
            data?.stripe.available ? mxn(data.stripe.availableMxn, 2) : "—"
          }
          hint={
            data?.stripe.available
              ? `Por liquidar ${mxn(data.stripe.pendingMxn, 2)}`
              : "Conecta Stripe para ver el saldo"
          }
          icon={Banknote}
        />
        <StatCard
          label="Suscripciones activas"
          value={data?.subscribers.active ?? "—"}
          hint={
            data
              ? `${data.subscribers.monthly} mensuales · ${data.subscribers.yearly} anuales`
              : undefined
          }
          icon={CreditCard}
        />
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Ingresos cobrados</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Últimos 12 meses ·{" "}
                {data ? mxn(data.collectedLast12MonthsMxn, 2) : "—"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex h-48 items-end gap-1.5">
            {(
              data?.months ??
              Array.from({ length: 12 }, (_, i) => ({
                key: String(i),
                label: "—",
                collectedMxn: 0,
                invoices: 0,
              }))
            ).map((month) => (
              <div
                key={month.key}
                className="flex min-w-0 flex-1 flex-col items-center gap-2"
              >
                <div className="flex h-36 w-full items-end justify-center">
                  <div
                    className="w-full max-w-7 rounded-t-md bg-gold/80"
                    style={{
                      height: `${Math.max(4, (month.collectedMxn / maxMonth) * 100)}%`,
                    }}
                    title={`${month.label}: ${mxn(month.collectedMxn, 2)}`}
                  />
                </div>
                <p className="truncate text-[10px] uppercase text-muted-foreground">
                  {month.label.slice(0, 3)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-display text-2xl">Por plan</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Clientes activos y su aporte al MRR.
          </p>
          <div className="mt-5 space-y-4">
            {(data?.byPlan ?? []).map((plan) => (
              <div key={plan.id}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-sm text-gold">{mxn(plan.mrrMxn)}</p>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {plan.subscribers} activas · {plan.monthlySubscribers} mes /{" "}
                  {plan.yearlySubscribers} año
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-gold"
                    style={{
                      width: `${data && data.estimatedMrrMxn ? Math.min(100, (plan.mrrMxn / data.estimatedMrrMxn) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4 text-center">
            <div>
              <p className="text-xs text-muted-foreground">Pendientes</p>
              <p className="mt-1 font-display text-xl">
                {data?.subscribers.pending ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Canceladas</p>
              <p className="mt-1 font-display text-xl">
                {data?.subscribers.canceled ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">ARR est.</p>
              <p className="mt-1 font-display text-xl">
                {data ? mxn(data.estimatedArrMxn) : "—"}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl">Últimos cobros</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Facturas pagadas que Stripe ya confirmó.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Periodo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.recentPayments ?? []).length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    Aún no hay cobros registrados. Aparecerán cuando Stripe
                    confirme un pago.
                  </TableCell>
                </TableRow>
              ) : (
                data?.recentPayments.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <p className="font-medium">{row.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.businessName || row.customerEmail}
                      </p>
                    </TableCell>
                    <TableCell>{row.planName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {row.interval === "year" ? "Anual" : "Mensual"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(row.paidAt).toLocaleDateString("es-MX", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {mxn(row.amountMxn, 2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </main>
  );
}
