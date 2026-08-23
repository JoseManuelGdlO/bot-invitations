import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import logo from "@/assets/alanna-logo.png";
import { api } from "@/lib/api/client";
import { useStore } from "@/lib/mock/store";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/registro/exito")({
  validateSearch: (s: Record<string, unknown>) => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  head: () =>
    pageHead({
      title: "Pago confirmado · Alanna Confirmaciones",
      description: "Estamos activando tu suscripción de Alanna.",
      path: "/registro/exito",
      noindex: true,
    }),
  component: RegistroExito,
});

function RegistroExito() {
  const { session_id } = Route.useSearch();
  const { refresh, session } = useStore();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Confirmando tu pago con Stripe…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (session_id) {
          await api(`/billing/session/${session_id}`);
        }
        await refresh();
        if (!cancelled) {
          setMessage("Pago recibido. Entrando a tu panel…");
          navigate({ to: "/eventos" });
        }
      } catch {
        if (!cancelled) {
          setMessage("El pago se está procesando. En un momento verás tu plan activo.");
          setTimeout(() => navigate({ to: "/eventos" }), 2500);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session_id, refresh, navigate]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <img src={logo} alt="Alanna" width={40} height={40} className="size-10 rounded-xl bg-primary object-contain p-1.5" />
      <Loader2 className="mt-8 size-6 animate-spin text-gold" />
      <h1 className="mt-4 font-display text-3xl">Activando tu plan</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      {session?.plan ? (
        <p className="mt-3 text-sm">Plan {session.plan.name} · {session.subscriptionStatus}</p>
      ) : null}
    </main>
  );
}
