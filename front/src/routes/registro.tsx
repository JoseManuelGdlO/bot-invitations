import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CalendarHeart, Check, Loader2, Users } from "lucide-react";
import logo from "@/assets/alanna-logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useStore } from "@/lib/mock/store";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api/client";
import { pageHead } from "@/lib/seo";
import type { SubscriptionPlan } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/registro")({
  validateSearch: (s: Record<string, unknown>) => ({
    plan: typeof s.plan === "string" ? s.plan : undefined,
    pago: typeof s.pago === "string" ? s.pago : undefined,
  }),
  head: () =>
    pageHead({
      title: "Crear cuenta · Alanna Confirmaciones",
      description: "Crea tu cuenta en Alanna y elige el plan según tus eventos e invitados. Desde $500 MXN al mes.",
      path: "/registro",
    }),
  component: Registro,
});

const MEXICO_STATES = [
  "Aguascalientes",
  "Baja California",
  "Baja California Sur",
  "Campeche",
  "Chiapas",
  "Chihuahua",
  "Ciudad de México",
  "Coahuila",
  "Colima",
  "Durango",
  "Estado de México",
  "Guanajuato",
  "Guerrero",
  "Hidalgo",
  "Jalisco",
  "Michoacán",
  "Morelos",
  "Nayarit",
  "Nuevo León",
  "Oaxaca",
  "Puebla",
  "Querétaro",
  "Quintana Roo",
  "San Luis Potosí",
  "Sinaloa",
  "Sonora",
  "Tabasco",
  "Tamaulipas",
  "Tlaxcala",
  "Veracruz",
  "Yucatán",
  "Zacatecas",
];

function Registro() {
  const { register } = useStore();
  const navigate = useNavigate();
  const { plan: planSlug, pago } = Route.useSearch();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<SubscriptionPlan[]>("/plans")
      .then((rows) => {
        setPlans(rows);
        const preferred = rows.find((p) => p.slug === planSlug) ?? rows.find((p) => p.highlighted) ?? rows[0];
        if (preferred) setPlanId(preferred.id);
      })
      .catch(() => toast.error("No se pudieron cargar los planes"));
  }, [planSlug]);

  const selected = plans.find((p) => p.id === planId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 0) {
      if (!businessName.trim() || !phone.trim() || !state.trim()) {
        toast.error("Completa negocio, teléfono y estado para continuar");
        return;
      }
      setStep(1);
      return;
    }
    if (!planId) {
      toast.error("Selecciona un plan para continuar");
      return;
    }
    setLoading(true);
    try {
      const { checkoutUrl } = await register({ name, email, password, planId, phone, state, businessName });
      if (checkoutUrl) {
        toast.success("Cuenta creada", { description: "Te llevamos a Stripe para pagar tu plan." });
        window.location.href = checkoutUrl;
        return;
      }
      toast.success("Cuenta creada", { description: selected ? `Activamos el plan ${selected.name}.` : undefined });
      navigate({ to: "/eventos" });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <Link to="/" className="mb-10 flex items-center gap-2.5">
        <img src={logo} alt="Logotipo de Alanna Confirmaciones" width={36} height={36} className="size-9 rounded-xl bg-primary object-contain p-1.5" />
        <span className="font-display text-2xl">Alanna</span>
      </Link>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
        {step === 0 ? "Paso 1 de 2" : "Paso 2 de 2"}
      </p>
      <h1 className="mt-2 font-display text-4xl leading-tight">
        {step === 0 ? "Crea tu cuenta" : "Elige tu suscripción"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {step === 0
          ? "Empieza a confirmar invitados de bodas y eventos con tu propio espacio."
          : "El plan define cuántos eventos e invitados puedes gestionar cada mes."}
      </p>

      {pago === "cancelado" ? (
        <p className="mt-6 rounded-xl border border-gold/40 bg-gold-soft/50 px-4 py-3 text-sm">
          El pago se canceló. Puedes elegir un plan e intentarlo de nuevo.
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-8 space-y-5">
        {step === 0 ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessName">Nombre del negocio</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Estudio o wedding planner"
                required
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52 999 123 4567"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="state">Estado</Label>
                <Select value={state} onValueChange={setState} required>
                  <SelectTrigger id="state">
                    <SelectValue placeholder="Selecciona tu estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEXICO_STATES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
            </div>
            <Button type="submit" className="w-full" size="lg">
              Continuar al plan
            </Button>
          </>
        ) : (
          <>
            <div className="grid gap-3">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setPlanId(plan.id)}
                  className={cn(
                    "rounded-2xl border p-5 text-left transition-colors",
                    planId === plan.id ? "border-gold bg-gold-soft/40" : "border-border bg-card hover:bg-secondary/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-2xl">{plan.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{plan.tagline}</p>
                    </div>
                    <p className="font-display text-2xl">${plan.priceMxn.toLocaleString("es-MX")}</p>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <li className="flex items-center gap-1.5">
                      <CalendarHeart className="size-3.5 text-gold" /> {plan.eventLimit} eventos
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Users className="size-3.5 text-gold" /> {plan.guestLimit.toLocaleString("es-MX")} invitados
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success" /> MXN / mes
                    </li>
                  </ul>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(0)}>
                Atrás
              </Button>
              <Button type="submit" className="flex-1" size="lg" disabled={loading || !planId}>
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Pagar y crear cuenta
              </Button>
            </div>
          </>
        )}
        <p className="text-center text-xs text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link to="/iniciar-sesion" className="text-gold underline-offset-4 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
