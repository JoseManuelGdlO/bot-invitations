import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import logo from "@/assets/alanna-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore } from "@/lib/mock/store";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api/client";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/iniciar-sesion")({
  validateSearch: (s: Record<string, unknown>) => ({
    email: typeof s.email === "string" ? s.email : undefined,
  }),
  head: () =>
    pageHead({
      title: "Iniciar sesión · Alanna Confirmaciones",
      description:
        "Accede a Alanna para gestionar confirmaciones de bodas, XV años y eventos con un asistente inteligente.",
      path: "/iniciar-sesion",
    }),
  component: Login,
});

function Login() {
  const { login } = useStore();
  const navigate = useNavigate();
  const { email: invitedEmail } = Route.useSearch();
  const [email, setEmail] = useState(invitedEmail || "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);

  const goToRegister = async (e: React.MouseEvent) => {
    e.preventDefault();
    const targetEmail = (email || invitedEmail || "").trim();
    if (!targetEmail && !invitedEmail) {
      navigate({ to: "/registro" });
      return;
    }
    try {
      const { status } = await api<{ status: "none" | "pending" | "registered" }>(
        `/auth/invitation?email=${encodeURIComponent(targetEmail)}`,
      );
      if (status === "registered") {
        toast.message("Ya tienes cuenta. Inicia sesión con este correo para ver el evento.");
        return;
      }
      if (status === "pending") {
        navigate({ to: "/registro", search: { email: targetEmail, invite: "1" } });
        return;
      }
    } catch {
      /* si no se puede consultar, seguimos al registro normal o de invitación */
    }
    if (invitedEmail) {
      navigate({ to: "/registro", search: { email: targetEmail || invitedEmail, invite: "1" } });
      return;
    }
    navigate({ to: "/registro", search: targetEmail ? { email: targetEmail } : undefined });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password, rememberMe);
      navigate({ to: user.isAdmin ? "/admin" : "/eventos" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-10 space-y-1.5">
            <Link to="/" className="flex items-center gap-2.5">
              <img
                src={logo}
                alt="Logotipo de Alanna Confirmaciones"
                width={36}
                height={36}
                className="size-9 rounded-xl bg-primary object-contain p-1.5"
              />
              <span className="font-display text-2xl">Alanna</span>
            </Link>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gold">
              Confirmaciones para Wedding Planners
            </p>
          </div>

          <h1 className="font-display text-4xl leading-tight">Inicia sesión</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {invitedEmail
              ? "Te invitaron a un evento. Inicia sesión o crea tu cuenta con este correo; no necesitas pagar un plan."
              : "Administra las confirmaciones de todos tus eventos desde un solo lugar."}
          </p>

          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={rememberMe} onCheckedChange={(v) => setRememberMe(!!v)} /> Recordarme
              </label>
              <Link to="/recuperar-contrasena" className="text-sm text-gold underline-offset-4 hover:underline">
                Recuperar contraseña
              </Link>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Iniciar sesión
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              ¿Aún no tienes cuenta?{" "}
              <Link
                to="/registro"
                search={invitedEmail ? { email: invitedEmail, invite: "1" } : undefined}
                onClick={goToRegister}
                className="text-gold underline-offset-4 hover:underline"
              >
                Crear cuenta
              </Link>
            </p>
          </form>
        </div>
      </div>

      <aside
        className="relative hidden overflow-hidden lg:block"
        style={{ background: "linear-gradient(150deg, var(--rose), var(--gold-soft) 55%, var(--secondary))" }}
      >
        <div className="absolute inset-0 flex flex-col justify-end gap-6 p-14">
          <Sparkles className="size-7 text-gold" />
          <p className="max-w-lg font-display text-4xl leading-snug text-primary">
            “El copiloto inteligente de un Wedding Planner para confirmar invitados.”
          </p>
          <div className="grid max-w-lg grid-cols-3 gap-4">
            {[
              ["2+", "eventos por plan"],
              ["300+", "invitados incluidos"],
              ["MXN", "planes desde $500"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl border border-border/60 bg-card/70 p-4 backdrop-blur">
                <p className="font-display text-2xl">{v}</p>
                <p className="text-xs text-muted-foreground">{l}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </main>
  );
}
