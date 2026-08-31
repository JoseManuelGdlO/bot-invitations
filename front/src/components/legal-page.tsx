import type { ReactNode } from "react";
import { MarketingShell } from "@/components/marketing-shell";
import { LEGAL_UPDATED_AT } from "@/lib/legal";
import { SeoSection } from "@/components/seo-landing";

export function LegalPage({
  kicker,
  title,
  intro,
  children,
}: {
  kicker: string;
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <MarketingShell>
      <main className="mx-auto w-full max-w-3xl px-5 py-12 lg:py-16">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-gold">
          {kicker}
        </p>
        <h1 className="mt-3 font-display text-4xl leading-[1.1] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-5 text-base leading-relaxed text-muted-foreground">
          {intro}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Última actualización: {LEGAL_UPDATED_AT}
        </p>
        <div className="mt-12 space-y-10">{children}</div>
      </main>
    </MarketingShell>
  );
}

export { SeoSection as LegalSection };
