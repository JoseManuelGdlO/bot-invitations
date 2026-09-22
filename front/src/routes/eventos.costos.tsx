import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CircleDollarSign,
  Loader2,
  MessageSquare,
  Percent,
  Smartphone,
} from "lucide-react";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api/client";
import {
  integrationsApi,
  type PricingAnalyticsRange,
  type WhatsAppPricingAnalyticsDto,
} from "@/lib/api/integrations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/eventos/costos")({
  head: () => ({
    meta: [
      { title: "Costos WhatsApp · Alanna Confirmaciones" },
      {
        name: "description",
        content:
          "Dashboard de costos y volumen de mensajes WhatsApp según Meta pricing analytics.",
      },
      {
        property: "og:title",
        content: "Costos WhatsApp · Alanna Confirmaciones",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CostosWhatsAppPage,
});

const RANGE_OPTIONS: Array<{ value: PricingAnalyticsRange; label: string }> = [
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "90d", label: "90 días" },
];

const CATEGORY_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatMoney(value: number | null | undefined, currency: string | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)}${currency ? ` ${currency}` : ""}`;
  }
}

function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("es-MX").format(value);
}

function categoryLabel(raw: string) {
  const key = String(raw || "").trim().toUpperCase();
  const map: Record<string, string> = {
    MARKETING: "Marketing",
    UTILITY: "Utilidad",
    AUTHENTICATION: "Autenticación",
    SERVICE: "Servicio",
    UNKNOWN: "Sin categoría",
  };
  return map[key] || raw || "Sin categoría";
}

function CostosWhatsAppPage() {
  const [range, setRange] = useState<PricingAnalyticsRange>("30d");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [data, setData] = useState<WhatsAppPricingAnalyticsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const status = await integrationsApi.getWhatsAppStatus();
        if (cancelled) return;
        const ok = Boolean(status.configured);
        setConfigured(ok);
        if (!ok) {
          setData(null);
          return;
        }
        const analytics = await integrationsApi.getPricingAnalytics(range);
        if (cancelled) return;
        setData(analytics);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "No se pudieron cargar los costos.";
        setError(message);
        setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const pieData = useMemo(() => {
    if (!data?.byCategory?.length) return [];
    return data.byCategory.map((row, i) => ({
      name: categoryLabel(row.category),
      value: row.volume,
      cost: row.cost,
      color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
    }));
  }, [data]);

  const freePct =
    data && data.kpis.totalVolume > 0
      ? Math.round((data.kpis.freeVolume / data.kpis.totalVolume) * 100)
      : null;

  if (configured === false) {
    return (
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8">
        <header className="mb-8">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
            WhatsApp
          </p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl">Costos</h1>
        </header>
        <section className="rounded-2xl border border-border bg-card p-8 text-center shadow-soft">
          <Smartphone className="mx-auto size-10 text-muted-foreground" />
          <h2 className="mt-4 font-display text-2xl">Conecta WhatsApp primero</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Los costos de mensajes se consultan en tu cuenta de WhatsApp Business
            (Meta). Configura la integración para ver el dashboard.
          </p>
          <Button asChild className="mt-6">
            <Link to="/eventos/whatsapp">Configurar WhatsApp</Link>
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
            WhatsApp
          </p>
          <h1 className="mt-1 font-display text-3xl md:text-4xl">Costos</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Volumen y costo aproximado de mensajes entregados, según Meta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRange(opt.value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                range === opt.value
                  ? "border-gold bg-gold-soft text-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-secondary",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {data && !data.costAvailable ? (
        <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">
          El costo no está disponible para esta cuenta (facturación vía partner de
          Meta). Sí puedes ver el volumen de mensajes entregados.
        </div>
      ) : null}

      {error ? (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Cargando analytics…
        </div>
      ) : null}

      {!loading && data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Costo total"
              value={formatMoney(data.kpis.totalCost, data.currency)}
              hint={data.currency ? `Moneda: ${data.currency}` : undefined}
              icon={CircleDollarSign}
              tone="gold"
            />
            <StatCard
              label="Mensajes entregados"
              value={formatNumber(data.kpis.totalVolume)}
              icon={MessageSquare}
            />
            <StatCard
              label="Costo promedio / mensaje"
              value={formatMoney(data.kpis.avgCostPerMessage, data.currency)}
              tone="default"
            />
            <StatCard
              label="% mensajes gratis"
              value={freePct == null ? "—" : `${freePct}%`}
              hint={`${formatNumber(data.kpis.freeVolume)} gratis · ${formatNumber(data.kpis.paidVolume)} de pago`}
              icon={Percent}
              tone="success"
            />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <section className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
              <h2 className="font-display text-2xl">Costo y volumen por día</h2>
              <div className="mt-4 h-72">
                {data.series.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.series}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="day"
                        tick={{ fontSize: 11 }}
                        tickFormatter={(v) => String(v).slice(5)}
                      />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) =>
                          name === "cost"
                            ? [formatMoney(value, data.currency), "Costo"]
                            : [formatNumber(value), "Volumen"]
                        }
                        labelFormatter={(label) => String(label)}
                      />
                      <Legend
                        formatter={(value) =>
                          value === "cost" ? "Costo" : "Volumen"
                        }
                      />
                      <Bar
                        yAxisId="left"
                        dataKey="volume"
                        fill="var(--chart-2)"
                        radius={[4, 4, 0, 0]}
                      />
                      <Bar
                        yAxisId="right"
                        dataKey="cost"
                        fill="var(--chart-1)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Sin datos en este periodo.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
              <h2 className="font-display text-2xl">Por categoría</h2>
              <div className="mt-4 h-64">
                {pieData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={90}
                        paddingAngle={3}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number, _name, item) => {
                          const cost = item?.payload?.cost;
                          const vol = formatNumber(value);
                          if (cost == null) return [vol, "Mensajes"];
                          return [
                            `${vol} · ${formatMoney(cost, data.currency)}`,
                            "Mensajes",
                          ];
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Sin desglose por categoría.
                  </p>
                )}
              </div>
              <ul className="mt-2 space-y-1.5">
                {pieData.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ background: row.color }}
                      />
                      {row.name}
                    </span>
                    <span>{formatNumber(row.value)}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <p className="mt-6 text-xs text-muted-foreground">
            Costos aproximados según Meta; la cobranza ocurre al entregarse el
            mensaje. Los totales pueden diferir ligeramente del extracto de Meta
            Business Suite.
          </p>
        </>
      ) : null}
    </main>
  );
}
