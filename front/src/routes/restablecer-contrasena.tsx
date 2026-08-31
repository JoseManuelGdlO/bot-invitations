import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import logo from "@/assets/alanna-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/mock/store";
import { toast } from "sonner";
import { ApiError } from "@/lib/api/client";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/restablecer-contrasena")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  head: () =>
    pageHead({
      title: "Nueva contraseña · Alanna Confirmaciones",
      description:
        "Define una nueva contraseña para tu cuenta de Alanna Confirmaciones.",
      path: "/restablecer-contrasena",
    }),
  component: Restablecer,
});

function Restablecer() {
  const { resetPassword } = useStore();
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(token, password);
      toast.success("Contraseña actualizada");
      navigate({ to: "/" });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo actualizar la contraseña",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex items-center gap-2.5">
          <img
            src={logo}
            alt="Logotipo de Alanna Confirmaciones"
            width={36}
            height={36}
            className="size-9 rounded-xl bg-primary object-contain p-1.5"
          />
          <span className="font-display text-2xl">Alanna</span>
        </div>
        <h1 className="font-display text-4xl leading-tight">
          Nueva contraseña
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Elige una contraseña de al menos 6 caracteres.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={loading || !token}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Guardar contraseña
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link
              to="/iniciar-sesion"
              className="text-gold underline-offset-4 hover:underline"
            >
              Volver a iniciar sesión
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
