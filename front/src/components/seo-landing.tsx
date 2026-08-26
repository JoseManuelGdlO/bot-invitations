import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { MarketingShell } from "@/components/marketing-shell";

export type SeoFaq = { q: string; a: string };
export type SeoRelated = { href: string; label: string };

export function SeoSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-3xl">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

export function SeoLanding({
  kicker,
  title,
  intro,
  children,
  faqs,
  related,
}: {
  kicker: string;
  title: string;
  intro: string;
  children: ReactNode;
  faqs: SeoFaq[];
  related: SeoRelated[];
}) {
  return (
    <MarketingShell>
      <main className="mx-auto w-full max-w-3xl px-5 py-12 lg:py-16">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">{kicker}</p>
        <h1 className="mt-3 font-display text-4xl leading-[1.1] sm:text-5xl">{title}</h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">{intro}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link to="/registro">Empezar con Alanna</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/">Ver planes</Link>
          </Button>
        </div>
        <div className="mt-12 space-y-10">{children}</div>
        {faqs.length ? (
          <section className="mt-14">
            <h2 className="font-display text-3xl">Preguntas frecuentes</h2>
            <Accordion type="single" collapsible className="mt-4">
              {faqs.map((faq, index) => (
                <AccordionItem key={faq.q} value={`faq-${index}`}>
                  <AccordionTrigger className="text-base">{faq.q}</AccordionTrigger>
                  <AccordionContent className="text-sm leading-relaxed text-muted-foreground">{faq.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ) : null}
        {related.length ? (
          <section className="mt-14 rounded-2xl border border-border bg-card p-6">
            <h2 className="font-display text-2xl">Sigue leyendo</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {related.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-foreground underline-offset-4 hover:underline">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </MarketingShell>
  );
}
