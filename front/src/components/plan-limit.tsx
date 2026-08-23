import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlanUsage, SessionUser, SubscriptionPlan } from "@/lib/mock/types";
import { ApiError, api } from "@/lib/api/client";
import { useStore } from "@/lib/mock/store";
import { toast } from "sonner";

export function usageOf(session: SessionUser | null): PlanUsage | null {
  return session?.usage ?? null;
}

export function isUpgradeError(err: unknown) {
  return err instanceof ApiError && err.status === 402;
}

async function checkoutPlan(
  startCheckout: (planId: string, interval?: "month" | "year") => Promise<{ checkoutUrl?: string | null; updated?: boolean }>,
  planId: string,
  interval: "month" | "year" = "month",
) {
  const res = await startCheckout(planId, interval);
  if (res.checkoutUrl) {
    window.location.href = res.checkoutUrl;
    return;
  }
  if (res.updated) {
    toast.success("Plan actualizado. Ya puedes continuar.");
    window.location.reload();
  }
}

export function PlanLimitBanner({
  session,
  kind = "event",
}: {
  session: SessionUser | null;
  kind?: "event" | "guest";
}) {
  const { startCheckout } = useStore();
  const [loading, setLoading] = useState(false);
  const usage = usageOf(session);
  if (!session || session.isAdmin || !usage || !session.plan) return null;
  const atEventLimit = !usage.canCreateEvent;
  const atGuestLimit = usage.remainingGuests <= 0;
  if (kind === "event" && !atEventLimit) return null;
  if (kind === "guest" && !atGuestLimit) return null;

  const upgrade = async () => {
    setLoading(true);
    try {
      const plans = await api<SubscriptionPlan[]>("/plans");
      const next =
        plans.find(
          (plan) =>
            plan.eventLimit > (session.plan?.eventLimit || 0) ||
            plan.guestLimit > (session.plan?.guestLimit || 0),
        ) ?? plans.at(-1);
      if (!next) {
        toast.error("No hay un plan superior disponible");
        return;
      }
      await checkoutPlan(startCheckout, next.id, session.billingInterval === "year" ? "year" : "month");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo abrir el pago");
    } finally {
      setLoading(false);
    }
  };

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
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={upgrade} disabled={loading}>
          Mejorar plan con Stripe
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/" hash="planes">
            Ver planes
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function PendingPaymentBanner({ session }: { session: SessionUser | null }) {
  const { startCheckout } = useStore();
  const [loading, setLoading] = useState(false);
  if (!session || session.isAdmin || session.subscriptionStatus === "active") return null;

  const pay = async () => {
    if (!session.plan?.id) {
      toast.error("Elige un plan para continuar");
      return;
    }
    setLoading(true);
    try {
      await checkoutPlan(startCheckout, session.plan.id, session.billingInterval === "year" ? "year" : "month");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo abrir el pago");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gold/40 bg-gold-soft/50 p-5">
      <p className="text-sm font-medium">
        {session.subscriptionStatus === "canceled" ? "Tu suscripción está cancelada" : "Tu suscripción aún no está activa"}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Los envíos de invitaciones de tus eventos actuales no se detienen. Para crear otro evento o agregar invitados,
        reactiva tu plan.
      </p>
      <Button className="mt-4" size="sm" onClick={pay} disabled={loading}>
        Completar pago
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
      {usage.guestLimit.toLocaleString("es-MX")} invitados · {session.billingInterval === "year" ? "anual" : "mensual"}
    </p>
  );
}
