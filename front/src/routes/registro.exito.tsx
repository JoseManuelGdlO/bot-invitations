import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/registro/exito")({
  validateSearch: (s: Record<string, unknown>) => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
  }),
  component: RegistroExitoRedirect,
});

function RegistroExitoRedirect() {
  const { session_id } = Route.useSearch();
  const navigate = useNavigate();

  useEffect(() => {
    navigate({ to: "/pago/exito", search: { session_id }, replace: true });
  }, [session_id, navigate]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-gold" />
    </main>
  );
}
