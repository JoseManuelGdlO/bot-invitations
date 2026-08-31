import {
  Link,
  Outlet,
  createFileRoute,
  useChildMatches,
  useNavigate,
} from "@tanstack/react-router";
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
import type { BillingInterval, SubscriptionPlan } from "@/lib/mock/types";
import { cn } from "@/lib/utils";
import { BillingToggle, yearlyAmount } from "@/components/billing-toggle";

type LoginSearch = {
  email: string | undefined;
};

function loginSearch(email = ""): LoginSearch {
  return { email: email.trim() || undefined };
}

export const Route = createFileRoute("/registro")({
  validateSearch: (s: Record<string, unknown>) => ({
    plan: typeof s["plan"] === "string" ? s["plan"] : undefined,
    pago: typeof s["pago"] === "string" ? s["pago"] : undefined,
    email: typeof s["email"] === "string" ? s["email"] : undefined,
    invite: s["invite"] === "1" || s["invite"] === true ? "1" : undefined,
  }),
  head: () =>
    pageHead({
      title: "Crear cuenta · Alanna Confirmaciones",
      description:
        "Crea tu cuenta en Alanna y elige el plan según tus eventos e invitados. Desde $500 MXN al mes.",
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
  const { register, registerInvite, session, hydrated } = useStore();
  const navigate = useNavigate();
  const childMatches = useChildMatches();
  const {
    plan: planSlug,
    pago,
    email: invitedEmail,
    invite,
  } = Route.useSearch();
  const isInvite = invite === "1";
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState("");
  const [email, setEmail] = useState(invitedEmail || "");
  const [emailError, setEmailError] = useState("");
  const [password, setPassword] = useState("");
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [planId, setPlanId] = useState("");
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [loading, setLoading] = useState(false);
  const hasChildRoute = childMatches.length > 0;

  useEffect(() => {
    if (hydrated && session && !hasChildRoute) {
      navigate({ to: "/eventos", replace: true });
    }
  }, [hydrated, session, hasChildRoute, navigate]);

  useEffect(() => {
    if (!isInvite) return;
    const targetEmail = (invitedEmail || email || "").trim();
    if (!targetEmail) return;
    let cancelled = false;
    api<{ status: "none" | "pending" | "registered" }>(
      `/auth/invitation?email=${encodeURIComponent(targetEmail)}`,
    )
      .then(({ status }) => {
        if (cancelled) return;
        if (status === "registered") {
          toast.message(
            "Ya tienes cuenta. Inicia sesión con este correo para ver el evento.",
          );
          navigate({
            to: "/iniciar-sesion",
            search: { email: targetEmail },
            replace: true,
          });
        } else if (status === "none") {
          toast.error("No hay una invitación pendiente para este correo.");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isInvite, invitedEmail, email, navigate]);

  useEffect(() => {
    if (isInvite) return;
    api<SubscriptionPlan[]>("/plans")
      .then((rows) => {
        setPlans(rows);
        const preferred =
          rows.find((p) => p.slug === planSlug) ??
          rows.find((p) => p.highlighted) ??
          rows[0];
        if (preferred) setPlanId(preferred.id);
      })
      .catch(() => toast.error("No se pudieron cargar los planes"));
  }, [planSlug, isInvite]);

  const selected = plans.find((p) => p.id === planId);

  const checkEmailAvailable = async (targetEmail: string) => {
    await api<{ available: true }>(
      `/auth/email-available?email=${encodeURIComponent(targetEmail.trim())}`,
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInvite) {
      if (!name.trim() || !email.trim() || password.length < 6) {
        toast.error(
          "Completa nombre, correo y contraseña (mín. 6) para continuar",
        );
        return;
      }
      setLoading(true);
      try {
        await registerInvite({ name, email, password });
        toast.success("Cuenta creada", {
          description: "Ya puedes ver el evento al que te invitaron.",
        });
        navigate({ to: "/eventos" });
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : "No se pudo crear la cuenta";
        if (err instanceof ApiError) setEmailError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (step === 0) {
      if (!businessName.trim() || !phone.trim() || !state.trim()) {
        toast.error("Completa negocio, teléfono y estado para continuar");
        return;
      }
      if (!name.trim() || !email.trim() || password.length < 6) {
        toast.error(
          "Completa nombre, correo y contraseña (mín. 6) para continuar",
        );
        return;
      }
      setLoading(true);
      try {
        await checkEmailAvailable(email);
        setEmailError("");
        setStep(1);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : "No se pudo validar el correo";
        setEmailError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!planId) {
      toast.error("Selecciona un plan para continuar");
      return;
    }
    setLoading(true);
    try {
      const { checkoutUrl } = await register({
        name,
        email,
        password,
        planId,
        phone,
        state,
        businessName,
        interval,
      });
      if (checkoutUrl) {
        toast.success("Cuenta creada", {
          description: "Te llevamos a Stripe para pagar tu plan.",
        });
        window.location.href = checkoutUrl;
        return;
      }
      toast.success("Cuenta creada", {
        description: selected
          ? `Activamos el plan ${selected.name}.`
          : undefined,
      });
      navigate({ to: "/eventos" });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "No se pudo crear la cuenta";
      if (err instanceof ApiError && err.status === 409) {
        setEmailError(message);
        setStep(0);
      }
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (hasChildRoute) return <Outlet />;
  if (hydrated && session) return null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-16">
      <Link to="/" className="mb-10 flex items-center gap-2.5">
        <img
          src={logo}
          alt="Logotipo de Alanna Confirmaciones"
          width={36}
          height={36}
          className="size-9 rounded-xl bg-primary object-contain p-1.5"
        />
        <span className="font-display text-2xl">Alanna</span>
      </Link>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
        {isInvite
          ? "Invitación al equipo"
          : step === 0
            ? "Paso 1 de 2"
            : "Paso 2 de 2"}
      </p>
      <h1 className="mt-2 font-display text-4xl leading-tight">
        {isInvite
          ? "Crea tu cuenta"
          : step === 0
            ? "Crea tu cuenta"
            : "Elige tu suscripción"}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isInvite
          ? "Usa el correo al que te invitaron. No necesitas pagar un plan: quien te invitó ya cubre el evento."
          : step === 0
            ? "Empieza a confirmar invitados de bodas y eventos con tu propio espacio."
            : "El plan define cuántos eventos e invitados puedes gestionar cada mes."}
      </p>

      {pago === "cancelado" && !isInvite ? (
        <p className="mt-6 rounded-xl border border-gold/40 bg-gold-soft/50 px-4 py-3 text-sm">
          El pago se canceló. Puedes elegir un plan e intentarlo de nuevo.
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-8 space-y-5">
        {isInvite ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                }}
                readOnly={Boolean(invitedEmail)}
                aria-invalid={Boolean(emailError)}
                required
                className={invitedEmail ? "bg-muted" : undefined}
              />
              {emailError ? (
                <p className="text-sm text-destructive">
                  {emailError}{" "}
                  <Link
                    to="/iniciar-sesion"
                    search={loginSearch(email)}
                    className="underline underline-offset-4"
                  >
                    Inicia sesión
                  </Link>
                </p>
              ) : null}
            </div>
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
              disabled={loading}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Crear cuenta
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Al crear tu cuenta aceptas las{" "}
              <Link to="/terminos" className="underline underline-offset-4">
                Condiciones del servicio
              </Link>{" "}
              y la{" "}
              <Link to="/privacidad" className="underline underline-offset-4">
                Política de privacidad
              </Link>
              .
            </p>
          </>
        ) : step === 0 ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
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
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (emailError) setEmailError("");
                }}
                aria-invalid={Boolean(emailError)}
                required
              />
              {emailError ? (
                <p className="text-sm text-destructive">
                  {emailError}{" "}
                  <Link
                    to="/iniciar-sesion"
                    search={loginSearch(email)}
                    className="underline underline-offset-4"
                  >
                    Inicia sesión
                  </Link>
                </p>
              ) : null}
            </div>
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
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}
              Continuar al plan
            </Button>
          </>
        ) : (
          <>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                ¿Cómo quieres pagar?
              </p>
              <BillingToggle value={interval} onChange={setInterval} />
            </div>
            <div className="grid gap-3">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setPlanId(plan.id)}
                  className={cn(
                    "rounded-2xl border p-5 text-left transition-colors",
                    planId === plan.id
                      ? "border-gold bg-gold-soft/40"
                      : "border-border bg-card hover:bg-secondary/50",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-2xl">{plan.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {plan.tagline}
                      </p>
                    </div>
                    <p className="font-display text-2xl">
                      {interval === "year"
                        ? `$${yearlyAmount(plan).toLocaleString("es-MX")}`
                        : `$${plan.priceMxn.toLocaleString("es-MX")}`}
                    </p>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <li className="flex items-center gap-1.5">
                      <CalendarHeart className="size-3.5 text-gold" />{" "}
                      {plan.eventLimit} eventos
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Users className="size-3.5 text-gold" />{" "}
                      {plan.guestLimit.toLocaleString("es-MX")} invitados
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Check className="size-3.5 text-success" />{" "}
                      {interval === "year"
                        ? `MXN / año · ${plan.annualDiscountPercent ?? 20}% off`
                        : "MXN / mes"}
                    </li>
                  </ul>
                </button>
              ))}
            </div>
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep(0)}
              >
                Atrás
              </Button>
              <Button
                type="submit"
                className="flex-1"
                size="lg"
                disabled={loading || !planId}
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                Pagar y crear cuenta
              </Button>
            </div>
          </>
        )}
        <p className="text-center text-xs text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link
            to="/iniciar-sesion"
            search={loginSearch(email)}
            className="text-gold underline-offset-4 hover:underline"
          >
            Inicia sesión
          </Link>
        </p>
      </form>
    </main>
  );
}
