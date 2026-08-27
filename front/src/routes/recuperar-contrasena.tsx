import { Link, createFileRoute } from "@tanstack/react-router";
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

export const Route = createFileRoute("/recuperar-contrasena")({
  head: () =>
    pageHead({
      title: "Recuperar contraseña · Alanna Confirmaciones",
      description:
        "Solicita un enlace para restablecer el acceso a tu cuenta de Alanna Confirmaciones.",
      path: "/recuperar-contrasena",
    }),
  component: Recuperar,
});

function Recuperar() {
  const { forgotPassword } = useStore();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
      toast.success("Si el correo existe, enviamos un enlace de recuperación.");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo enviar el enlace",
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
          Recupera tu acceso
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Escribe el correo de tu cuenta y te enviaremos un enlace para crear
          una nueva contraseña.
        </p>
        <form onSubmit={submit} className="mt-8 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">Correo</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : null}
            Enviar enlace
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
