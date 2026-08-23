import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlanUsage, SessionUser } from "@/lib/mock/types";
import { ApiError } from "@/lib/api/client";

export function usageOf(session: SessionUser | null): PlanUsage | null {
  return session?.usage ?? null;
}

export function isUpgradeError(err: unknown) {
  return err instanceof ApiError && err.status === 402;
}

export function PlanLimitBanner({
  session,
  kind = "event",
}: {
  session: SessionUser | null;
  kind?: "event" | "guest";
}) {
  const usage = usageOf(session);
  if (!session || session.isAdmin || !usage || !session.plan) return null;
  const atEventLimit = !usage.canCreateEvent;
  const atGuestLimit = usage.remainingGuests <= 0;
  if (kind === "event" && !atEventLimit) return null;
  if (kind === "guest" && !atGuestLimit) return null;
  return (
    <div className="rounded-2xl border border-gold/40 bg-gold-soft/50 p-5">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4 text-gold" />
        {kind === "event"
          ? `Tu plan ${session.plan.name} incluye ${usage.eventLimit} eventos.`
          : `Tu plan ${session.plan.name} incluye ${usage.guestLimit.toLocaleString("es-MX")} invitados.`}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {kind === "event"
          ? "Ya alcanzaste el límite. Mejora tu suscripción para crear otro evento."
          : "Ya no te quedan lugares. Mejora tu suscripción para agregar más invitados."}
      </p>
      <Button asChild className="mt-4" size="sm">
        <Link to="/" hash="planes">
          Ver planes y mejorar
        </Link>
      </Button>
    </div>
  );
}

export function PlanUsageHint({ session }: { session: SessionUser | null }) {
  const usage = usageOf(session);
  if (!session?.plan || !usage || session.isAdmin) return null;
  return (
    <p className="truncate text-[11px] text-muted-foreground">
      {usage.eventCount}/{usage.eventLimit} eventos · {usage.guestCount.toLocaleString("es-MX")}/
      {usage.guestLimit.toLocaleString("es-MX")} invitados
    </p>
  );
}
