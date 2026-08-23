import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { CreditCard, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api/client";
import { useStore } from "@/lib/mock/store";
import type { CancellationRequest } from "@/lib/mock/types";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/suscripcion")({
  component: ClientSubscription,
});

const STATUS_COPY: Record<CancellationRequest["status"], { label: string; text: string }> = {
  pending: {
    label: "En revisión",
    text: "Tu solicitud ya llegó al equipo de Alanna. La suscripción sigue activa hasta que un administrador la acepte.",
  },
  approved: {
    label: "Cancelada",
    text: "Un administrador aceptó la baja. Ya no se harán más cobros de este plan.",
  },
  rejected: {
    label: "No aceptada",
    text: "El administrador no aceptó esta baja. Tu plan sigue activo.",
  },
  withdrawn: {
    label: "Retirada",
    text: "Retiraste la solicitud. Puedes volver a pedirla si lo necesitas.",
  },
};

function ClientSubscription() {
  const { session, refresh, openBillingPortal } = useStore();
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const cancellation = session?.cancellation ?? null;
  const pending = cancellation?.status === "pending";
  const canceled = session?.subscriptionStatus === "canceled";

  const request = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api("/billing/cancellation", {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await refresh();
      setReason("");
      toast.success("Solicitud enviada", {
        description: "Un administrador debe aceptarla para que la suscripción se cancele.",
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo enviar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  const withdraw = async () => {
    setLoading(true);
    try {
      await api("/billing/cancellation", { method: "DELETE" });
      await refresh();
      toast.success("Solicitud retirada");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo retirar la solicitud");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8 md:px-8 md:py-10">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">Cuenta</p>
      <h1 className="mt-1 font-display text-4xl">Suscripción</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Puedes pedir la baja, pero un administrador de Alanna debe aceptarla para que se cancele de verdad.
      </p>

      <section className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Plan actual</p>
            <h2 className="mt-1 font-display text-2xl">{session?.plan?.name || "Sin plan"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {session?.billingInterval === "year" ? "Facturación anual" : "Facturación mensual"}
            </p>
          </div>
          <Badge variant={canceled ? "secondary" : "outline"}>
            {canceled ? "Cancelada" : session?.subscriptionStatus === "active" ? "Activa" : "Pendiente de pago"}
          </Badge>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={async () => {
            try {
              await openBillingPortal();
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : "No se pudo abrir el portal de pagos");
            }
          }}
        >
          <CreditCard className="size-4" /> Actualizar método de pago
        </Button>
      </section>

      {cancellation ? (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-2xl">Solicitud de cancelación</h2>
            <Badge variant={pending ? "destructive" : "secondary"}>{STATUS_COPY[cancellation.status].label}</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{STATUS_COPY[cancellation.status].text}</p>
          <p className="mt-4 text-sm">{cancellation.reason}</p>
          {cancellation.adminNote ? (
            <p className="mt-3 rounded-xl bg-secondary px-3 py-2 text-sm">
              Nota del administrador: {cancellation.adminNote}
            </p>
          ) : null}
          {pending ? (
            <Button type="button" variant="outline" className="mt-4" onClick={withdraw} disabled={loading}>
              Retirar solicitud
            </Button>
          ) : null}
        </section>
      ) : null}

      {!canceled && !pending ? (
        <form onSubmit={request} className="mt-6 space-y-4 rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="font-display text-2xl">Pedir cancelación</h2>
          <p className="text-sm text-muted-foreground">
            Esto no cancela el cobro de inmediato. El administrador revisa la solicitud y, si la acepta, se cancela en Stripe.
          </p>
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo</Label>
            <Textarea
              id="reason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Cuéntanos por qué quieres cancelar. El administrador lo verá antes de aceptar."
            />
          </div>
          <Button type="submit" disabled={loading || reason.trim().length < 8}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Enviar solicitud
          </Button>
        </form>
      ) : null}
    </main>
  );
}
