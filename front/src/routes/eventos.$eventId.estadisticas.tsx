import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatCard } from "@/components/stat-card";
import { ProgressRing } from "@/components/progress-ring";
import { statsFor, useEvent } from "@/lib/mock/store";

export const Route = createFileRoute("/eventos/$eventId/estadisticas")({
  head: () => ({
    meta: [
      { title: "Estadísticas · Alanna Confirmaciones" },
      { name: "description", content: "Gráficas de confirmaciones, respuestas y actividad del evento." },
      { property: "og:title", content: "Estadísticas · Alanna Confirmaciones" },
      { property: "og:description", content: "Gráficas de confirmaciones y actividad del evento." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Estadisticas,
});

const days = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function Estadisticas() {
  const { eventId } = Route.useParams();
  const { guests, conversations, analytics } = useEvent(eventId);
  const s = statsFor(guests);

  const donut = [
    { name: "Confirmados", value: s.confirmedPeople, color: "var(--chart-1)" },
    { name: "Pendientes", value: Math.max(0, s.people - s.confirmedPeople - s.rejectedPeople), color: "var(--chart-2)" },
    { name: "No asistirán", value: s.rejectedPeople, color: "var(--chart-3)" },
  ];

  const bars = analytics?.dailyConfirmations?.length
    ? analytics.dailyConfirmations
    : days.map((d) => ({ day: d, confirmaciones: 0 }));

  const timeline = analytics?.timeline?.length
    ? analytics.timeline
    : [
        { label: "Mensajes iniciales enviados", value: guests.filter((g) => g.lastMessage).length, at: "Registrado" },
        { label: "Primeras respuestas recibidas", value: guests.filter((g) => g.lastReply).length, at: "Registrado" },
        { label: "Conversaciones abiertas", value: conversations.length, at: "Actual" },
        { label: "Confirmaciones cerradas", value: s.confirmed, at: "Actual" },
      ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-8 md:px-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Invitados totales" value={s.people} />
        <StatCard label="Confirmados" value={s.confirmedPeople} tone="success" />
        <StatCard label="No asistirán" value={s.rejectedPeople} tone="rose" />
        <StatCard label="Pendientes" value={s.pending} tone="warning" />
        <StatCard label="Sin respuesta" value={s.noReply} />
        <StatCard label="Conversaciones activas" value={conversations.length} tone="gold" />
        <StatCard label="Tasa de respuesta" value={`${s.responseRate}%`} tone="gold" />
        <StatCard label="Tiempo promedio de respuesta" value={analytics?.averageResponseTime || "—"} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Confirmados vs pendientes</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={donut} dataKey="value" innerRadius={62} outerRadius={95} paddingAngle={3}>
                  {donut.map((d) => <Cell key={d.name} fill={d.color} stroke="none" />)}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 text-sm">
            {donut.map((d) => (
              <div key={d.name} className="flex items-center gap-2">
                <span className="size-2.5 rounded-full" style={{ background: d.color }} />
                <span className="flex-1 text-muted-foreground">{d.name}</span>
                <span className="font-medium">{d.value}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft lg:col-span-2">
          <h2 className="font-display text-2xl">Confirmaciones por día</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bars}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
                <Tooltip
                  cursor={{ fill: "var(--secondary)" }}
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="confirmaciones" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <section className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="mb-4 font-display text-2xl">Progreso general</h2>
          <ProgressRing value={s.progress} size={160} caption={`${s.confirmedPeople} de ${s.people} personas`} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <h2 className="font-display text-2xl">Actividad de mensajes</h2>
          <ol className="mt-5 space-y-5">
            {timeline.map((t, i) => (
              <li key={t.label} className="relative flex gap-4 pl-1">
                <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-gold" />
                {i < timeline.length - 1 ? (
                  <span className="absolute left-[9px] top-5 h-full w-px bg-border" />
                ) : null}
                <div>
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted-foreground">{t.value} mensajes · {t.at}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
