import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import logo from "@/assets/alanna-logo.png";
import { api, getToken } from "@/lib/api/client";
import { useStore } from "@/lib/mock/store";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/pago/exito")({
  validateSearch: (s: Record<string, unknown>) => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  head: () =>
    pageHead({
      title: "Pago confirmado · Alanna Confirmaciones",
      description: "Estamos activando tu suscripción de Alanna.",
      path: "/pago/exito",
      noindex: true,
    }),
  component: PagoExito,
});

function PagoExito() {
  const { session_id } = Route.useSearch();
  const { refresh, hydrated } = useStore();
  const navigate = useNavigate();
  const [message, setMessage] = useState("Confirmando tu pago con Stripe…");

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    (async () => {
      try {
        if (session_id) {
          await api(`/billing/session/${session_id}`);
        }
        if (getToken()) {
          await refresh();
        }
        if (cancelled) return;
        setMessage("Pago recibido. Entrando a tu panel…");
        if (getToken()) {
          navigate({ to: "/eventos", replace: true });
          return;
        }
        navigate({ to: "/iniciar-sesion", replace: true });
      } catch {
        if (cancelled) return;
        if (getToken()) {
          setMessage("El pago se está procesando. Entrando a tu panel…");
          navigate({ to: "/eventos", replace: true });
          return;
        }
        setMessage("Pago recibido. Inicia sesión para entrar a tu panel.");
        setTimeout(() => {
          if (!cancelled) navigate({ to: "/iniciar-sesion", replace: true });
        }, 1600);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, session_id, refresh, navigate]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <img src={logo} alt="Alanna" width={40} height={40} className="size-10 rounded-xl bg-primary object-contain p-1.5" />
      <Loader2 className="mt-8 size-6 animate-spin text-gold" />
      <h1 className="mt-4 font-display text-3xl">Activando tu plan</h1>
      <p className="mt-2 text-sm text-muted-foreground">{message}</p>
    </main>
  );
}
