import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import logo from "@/assets/alanna-logo.png";
import { Button } from "@/components/ui/button";
import { api, ApiError, getToken } from "@/lib/api/client";
import { useStore } from "@/lib/mock/store";
import { pageHead } from "@/lib/seo";

type ErrorKind = "not_found" | "incomplete" | "timeout" | "missing";

const ERROR_COPY: Record<ErrorKind, { title: string; body: string }> = {
  missing: {
    title: "Falta la sesión de pago",
    body: "No recibimos el identificador de Stripe. Vuelve a tu suscripción e intenta el pago de nuevo.",
  },
  not_found: {
    title: "No encontramos este pago",
    body: "La sesión de Stripe no existe o ya no es válida. Revisa tu suscripción o vuelve a pagar.",
  },
  incomplete: {
    title: "El pago no se completó",
    body: "Stripe no confirmó el cobro. Puedes reintentar la confirmación o ir a tu suscripción para pagar de nuevo.",
  },
  timeout: {
    title: "No pudimos confirmar el pago",
    body: "Hubo un problema de red o el servidor no respondió a tiempo. Reintenta; no entramos al panel hasta confirmar.",
  },
};

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

function classifyError(err: unknown): ErrorKind {
  if (err instanceof ApiError) {
    if (err.status === 404) return "not_found";
    if (err.status === 409) return "incomplete";
  }
  return "timeout";
}

function isPaid(payload: { status?: string; paymentStatus?: string }) {
  return payload.paymentStatus === "paid" || payload.status === "complete";
}

function PagoExito() {
  const { session_id } = Route.useSearch();
  const { refresh, hydrated } = useStore();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"loading" | "error">("loading");
  const [errorKind, setErrorKind] = useState<ErrorKind>("timeout");
  const [message, setMessage] = useState("Confirmando tu pago con Stripe…");
  const [attempt, setAttempt] = useState(0);

  const confirm = useCallback(async () => {
    if (!session_id) {
      setErrorKind("missing");
      setPhase("error");
      return false;
    }
    const payload = await api<{ status?: string; paymentStatus?: string }>(`/billing/session/${session_id}`);
    if (!isPaid(payload)) {
      throw new ApiError("El pago no se completó.", 409);
    }
    return true;
  }, [session_id]);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setPhase("loading");
    setMessage("Confirmando tu pago con Stripe…");
    (async () => {
      try {
        const ok = await confirm();
        if (!ok || cancelled) return;
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
      } catch (err) {
        if (cancelled) return;
        setErrorKind(classifyError(err));
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, session_id, refresh, navigate, confirm, attempt]);

  const copy = ERROR_COPY[errorKind];
  const loggedIn = Boolean(getToken());

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-center justify-center px-6 text-center">
      <img src={logo} alt="Alanna" width={40} height={40} className="size-10 rounded-xl bg-primary object-contain p-1.5" />
      {phase === "loading" ? (
        <>
          <Loader2 className="mt-8 size-6 animate-spin text-gold" />
          <h1 className="mt-4 font-display text-3xl">Activando tu plan</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        </>
      ) : (
        <>
          <h1 className="mt-8 font-display text-3xl">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{copy.body}</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            {errorKind !== "missing" && session_id ? (
              <Button type="button" onClick={() => setAttempt((n) => n + 1)}>
                Reintentar
              </Button>
            ) : null}
            {loggedIn ? (
              <Button variant="outline" asChild>
                <Link to="/eventos/suscripcion">Ir a mi suscripción</Link>
              </Button>
            ) : (
              <Button variant="outline" asChild>
                <Link to="/iniciar-sesion">Iniciar sesión</Link>
              </Button>
            )}
          </div>
        </>
      )}
    </main>
  );
}
