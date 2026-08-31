import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CalendarHeart,
  Check,
  MessageCircle,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import { pageHead, faqJsonLd, businessJsonLd } from "@/lib/seo";
import type { BillingInterval, SubscriptionPlan } from "@/lib/mock/types";
import { useStore } from "@/lib/mock/store";
import { BillingToggle, PlanPrice } from "@/components/billing-toggle";
import { MarketingShell } from "@/components/marketing-shell";

export const Route = createFileRoute("/")({
  head: () => ({
    ...pageHead({
      title: "Alanna Confirmaciones · Software para wedding planners",
      description:
        "Alanna Confirmaciones confirma invitados de bodas por WhatsApp. Software RSVP para wedding planners en México. Planes desde $500 MXN al mes.",
      path: "/",
    }),
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqJsonLd) },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          ...businessJsonLd,
          offers: {
            "@type": "AggregateOffer",
            lowPrice: "500",
            priceCurrency: "MXN",
          },
        }),
      },
    ],
  }),
  component: Landing,
});

const fallbackPlans: SubscriptionPlan[] = [
  {
    id: "esencial",
    slug: "esencial",
    name: "Esencial",
    tagline: "Para planners que empiezan con bodas íntimas.",
    priceMxn: 500,
    yearlyPriceMxn: 4800,
    annualDiscountPercent: 20,
    eventLimit: 2,
    guestLimit: 300,
    highlighted: false,
  },
  {
    id: "estudio",
    slug: "estudio",
    name: "Estudio",
    tagline: "El ritmo de un estudio con varias fechas al año.",
    priceMxn: 1200,
    yearlyPriceMxn: 11520,
    annualDiscountPercent: 20,
    eventLimit: 6,
    guestLimit: 1000,
    highlighted: true,
  },
  {
    id: "atelier",
    slug: "atelier",
    name: "Atelier",
    tagline: "Para equipos con temporada completa de eventos.",
    priceMxn: 2400,
    yearlyPriceMxn: 23040,
    annualDiscountPercent: 20,
    eventLimit: 15,
    guestLimit: 3000,
    highlighted: false,
  },
];

function Landing() {
  const { session, startCheckout } = useStore();
  const [plans, setPlans] = useState<SubscriptionPlan[]>(fallbackPlans);
  const [interval, setInterval] = useState<BillingInterval>("month");

  useEffect(() => {
    api<SubscriptionPlan[]>("/plans")
      .then((rows) => {
        if (rows?.length) setPlans(rows);
      })
      .catch(() => undefined);
  }, []);

  return (
    <MarketingShell>
      <main>
        <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:py-20">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
              Para wedding planners
            </p>
            <h1 className="mt-3 font-display text-5xl leading-[1.05] sm:text-6xl">
              Alanna Confirmaciones: confirmamos a tus invitados mientras tú
              diseñas el día.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">
              Alanna es el copiloto de tu estudio: importa la lista, lanza las
              confirmaciones por WhatsApp y deja que el asistente registre quién
              va, con cuántas personas y qué falta por seguir.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/registro">Empezar con Alanna</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/iniciar-sesion">Ya tengo cuenta</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Planes desde $500 MXN al mes. Elige volumen de eventos e
              invitados.
            </p>
          </div>
          <div
            className="rounded-3xl border border-border p-8 shadow-lift"
            style={{
              background:
                "linear-gradient(150deg, var(--rose), var(--gold-soft) 55%, var(--secondary))",
            }}
          >
            <Sparkles className="size-6 text-gold" />
            <p className="mt-5 font-display text-3xl leading-snug text-primary">
              “El copiloto inteligente de un Wedding Planner para confirmar
              invitados.”
            </p>
            <div className="mt-8 grid grid-cols-3 gap-3">
              {[
                ["500", "MXN / mes"],
                ["2", "eventos"],
                ["300", "invitados"],
              ].map(([v, l]) => (
                <div
                  key={l}
                  className="rounded-xl border border-border/60 bg-card/70 p-3 backdrop-blur"
                >
                  <p className="font-display text-2xl">{v}</p>
                  <p className="text-[11px] text-muted-foreground">{l}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-border bg-card/50">
          <div className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-14 sm:grid-cols-3">
            {[
              {
                icon: Upload,
                title: "Importas la lista",
                text: "Sube Excel o CSV. Alanna mapea columnas y deja cada invitación lista para contactar.",
              },
              {
                icon: MessageCircle,
                title: "El asistente conversa",
                text: "Envía el primer mensaje, responde dudas y confirma cuántas personas asisten.",
              },
              {
                icon: Users,
                title: "Tú ves el tablero",
                text: "KPIs, conversaciones y lista final en un solo lugar, por cada evento.",
              },
            ].map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-border bg-card p-6 shadow-soft"
              >
                <item.icon className="size-5 text-gold" />
                <h2 className="mt-4 font-display text-2xl">{item.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section id="planes" className="mx-auto w-full max-w-6xl px-5 py-16">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
            Suscripciones
          </p>
          <h2 className="mt-2 font-display text-4xl">
            Elige según tus eventos e invitados
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Cada plan incluye el asistente, importación, conversaciones y
            exportaciones. Paga el mes o el año completo.
          </p>
          <div className="mt-6">
            <BillingToggle value={interval} onChange={setInterval} />
          </div>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article
                key={plan.slug}
                className={`flex flex-col rounded-2xl border bg-card p-6 shadow-soft ${plan.highlighted ? "border-gold shadow-lift" : "border-border"}`}
              >
                {plan.highlighted ? (
                  <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-gold">
                    Más elegido
                  </p>
                ) : null}
                <h3 className="font-display text-3xl">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.tagline}
                </p>
                <div className="mt-5">
                  <PlanPrice plan={plan} interval={interval} />
                </div>
                <ul className="mt-5 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <CalendarHeart className="size-4 text-gold" />{" "}
                    {plan.eventLimit} eventos
                  </li>
                  <li className="flex items-center gap-2">
                    <Users className="size-4 text-gold" />{" "}
                    {plan.guestLimit.toLocaleString("es-MX")} invitados
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-success" /> Asistente,
                    importación y lista final
                  </li>
                </ul>
                {session && !session.isAdmin ? (
                  <Button
                    className="mt-6"
                    variant={plan.highlighted ? "default" : "outline"}
                    onClick={async () => {
                      try {
                        const res = await startCheckout(plan.id, interval);
                        if (res.checkoutUrl)
                          window.location.href = res.checkoutUrl;
                        else window.location.assign("/eventos");
                      } catch {
                        window.location.assign("/iniciar-sesion");
                      }
                    }}
                  >
                    Cambiar a {plan.name}
                  </Button>
                ) : (
                  <Button
                    className="mt-6"
                    variant={plan.highlighted ? "default" : "outline"}
                    asChild
                  >
                    <Link to="/registro" search={{ plan: plan.slug }}>
                      Contratar {plan.name}
                    </Link>
                  </Button>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-card/50">
          <div className="mx-auto w-full max-w-6xl px-5 py-14">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
              Recursos
            </p>
            <h2 className="mt-2 font-display text-4xl">
              Guías de RSVP y WhatsApp para tu estudio
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Cómo confirmar invitados, armar la lista y dejar Excel. El mismo
              proceso que Alanna Confirmaciones automatiza.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  href: "/para-wedding-planners",
                  title: "Para wedding planners",
                  text: "Cómo entra Alanna en el flujo de un estudio.",
                },
                {
                  href: "/confirmacion-invitados-whatsapp",
                  title: "Confirmación WhatsApp",
                  text: "RSVP en el canal donde sí contestan.",
                },
                {
                  href: "/software-rsvp-bodas",
                  title: "Software RSVP",
                  text: "Deja de copiar respuestas en Excel.",
                },
                {
                  href: "/blog",
                  title: "Blog",
                  text: "Listas, seguimiento y bodas de 200 invitados.",
                },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-2xl border border-border bg-card p-5 shadow-soft transition-colors hover:border-gold"
                >
                  <h3 className="font-display text-xl">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {item.text}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
