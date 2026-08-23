import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import logo from "@/assets/alanna-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useStore } from "@/lib/mock/store";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión · Alanna Confirmaciones" },
      {
        name: "description",
        content:
          "Accede a Alanna, el copiloto inteligente para confirmar invitados de bodas y eventos.",
      },
      { property: "og:title", content: "Iniciar sesión · Alanna Confirmaciones" },
      {
        property: "og:description",
        content: "El copiloto inteligente de un Wedding Planner para confirmar invitados.",
      },
    ],
  }),
  component: Login,
});

function Login() {
  const { login } = useStore();
  const navigate = useNavigate();
  const [email, setEmail] = useState("hola@planner.mx");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      login(email);
      navigate({ to: "/eventos" });
    }, 900);
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-10 space-y-1.5">
            <div className="flex items-center gap-2.5">
              <img
                src={logo}
                alt="Alanna"
                width={36}
                height={36}
                className="size-9 rounded-xl bg-primary object-contain p-1.5"
              />
              <span className="font-display text-2xl">Alanna</span>
            </div>
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gold">
              Confirmaciones para Wedding Planners
            </p>
          </div>

          <h1 className="font-display text-4xl leading-tight">Inicia sesión</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Administra las confirmaciones de todos tus eventos desde un solo lugar.
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
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox defaultChecked /> Recordarme
              </label>
              <button
                type="button"
                onClick={() => toast.info("Te enviamos un enlace de recuperación (demo).")}
                className="text-sm text-gold underline-offset-4 hover:underline"
              >
                Recuperar contraseña
              </button>
            </div>
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Iniciar sesión
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Demo: cualquier correo y contraseña funcionan.
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
              ["4", "eventos activos"],
              ["780", "invitados gestionados"],
              ["92%", "tasa de respuesta"],
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
