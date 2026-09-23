import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  FlaskConical,
  KeyRound,
  Loader2,
  Smartphone,
  Unplug,
  Webhook,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { WhatsAppTemplateWizardDialog } from "@/components/whatsapp-template-wizard-dialog";
import { apiBase, ApiError } from "@/lib/api/client";
import { botApi } from "@/lib/api/bot";
import {
  integrationsApi,
  type MetaSignupConfigDto,
  type WhatsAppMetaStatusDto,
  type WhatsAppSendTestType,
} from "@/lib/api/integrations";
import {
  launchEmbeddedSignup,
  loadFacebookSdk,
} from "@/lib/meta-embedded-signup";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { WHATSAPP_CONNECTED_NEXT_STEP } from "@/lib/whatsapp-templates";
import {
  MX_PHONE_HINT,
  mxPhoneError,
  sanitizeMxPhoneInput,
} from "@/lib/mx-phone";

export const Route = createFileRoute("/eventos/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp · Alanna Confirmaciones" },
      {
        name: "description",
        content:
          "Configuración de WhatsApp Cloud API (Meta) para enviar invitaciones y mensajes.",
      },
      { property: "og:title", content: "WhatsApp · Alanna Confirmaciones" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WhatsAppMetaPage,
});

function metaWebhookPublicUrl() {
  const base = apiBase.replace(/\/$/, "");
  if (base.startsWith("http")) return `${base}/webhooks/meta`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${base}/webhooks/meta`;
  }
  return `${base}/webhooks/meta`;
}

function whatsappSendTestErrorMessage(err: unknown) {
  if (!(err instanceof ApiError)) return "No se pudo enviar la prueba";
  const haystack = err.message.toLowerCase();
  if (
    haystack.includes("re-engagement") ||
    haystack.includes("more than 24 hours")
  ) {
    return "Han pasado más de 24 horas. Debes usar una plantilla aprobada.";
  }
  return err.message;
}

const emptyCredentialsForm = {
  accessToken: "",
  wabaId: "",
  phoneNumberId: "",
  displayPhoneNumber: "",
};

function WhatsAppMetaPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [connectingMeta, setConnectingMeta] = useState(false);
  const [status, setStatus] = useState<WhatsAppMetaStatusDto | null>(null);
  const [metaConfig, setMetaConfig] = useState<MetaSignupConfigDto | null>(
    null,
  );
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [credsForm, setCredsForm] = useState(emptyCredentialsForm);
  const [testType, setTestType] = useState<WhatsAppSendTestType>("template");
  const [testTo, setTestTo] = useState("");
  const [testText, setTestText] = useState(
    "Prueba de conexión desde Alanna Confirmaciones",
  );
  const [wizardOpen, setWizardOpen] = useState(false);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [devTools, setDevTools] = useState(false);

  const load = useCallback(async () => {
    const next = await integrationsApi.getWhatsAppStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    botApi.status().then((res) => {
      if (!cancelled) setDevTools(Boolean(res.enabled));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    Promise.all([load(), integrationsApi.getMetaSignupConfig()])
      .then(([next, config]) => {
        setMetaConfig(config);
        if (next?.configured && next.invitationWizardRequired) {
          setWizardOpen(true);
        }
      })
      .catch((err) =>
        toast.error(
          err instanceof ApiError
            ? err.message
            : "No se pudo cargar WhatsApp (Meta)",
        ),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const webhookUrl = devTools
    ? status?.webhookUrl || metaWebhookPublicUrl()
    : null;

  const connectMeta = async () => {
    if (!metaConfig?.configured) {
      toast.error("Embedded Signup no está configurado en el servidor.");
      return;
    }
    setConnectingMeta(true);
    try {
      await loadFacebookSdk(metaConfig.appId, metaConfig.graphVersion);
      const { code, session } = await launchEmbeddedSignup({
        configId: metaConfig.configId,
        featureType: metaConfig.featureType,
        sessionInfoVersion: metaConfig.sessionInfoVersion,
      });
      const connected = await integrationsApi.completeMetaSignup({
        code,
        wabaId: session?.wabaId ?? null,
        phoneNumberId: session?.phoneNumberId ?? null,
        businessId: session?.businessId ?? null,
        event: session?.event ?? null,
      });
      const next = await load();
      if (next?.invitationWizardRequired) {
        setWizardOpen(true);
      }
      toast.success("WhatsApp conectado", {
        description: [
          connected.displayPhoneNumber
            ? `Número ${connected.displayPhoneNumber}.`
            : "La cuenta quedó vinculada.",
          WHATSAPP_CONNECTED_NEXT_STEP,
        ].join(" "),
      });
    } catch (err) {
      const message =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : "No se pudo conectar WhatsApp";
      toast.error(message);
    } finally {
      setConnectingMeta(false);
    }
  };

  const disconnectMeta = async () => {
    setConnectingMeta(true);
    try {
      await integrationsApi.disconnectMeta();
      await load();
      setDisconnectOpen(false);
      toast.success("WhatsApp desconectado");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo desconectar WhatsApp",
      );
    } finally {
      setConnectingMeta(false);
    }
  };

  const openCredentials = () => {
    setCredsForm({
      accessToken: "",
      wabaId: status?.wabaId || "",
      phoneNumberId: status?.phoneNumberId || "",
      displayPhoneNumber: status?.displayPhoneNumber || "",
    });
    setCredsOpen(true);
  };

  const saveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCreds(true);
    try {
      const next = await integrationsApi.saveWhatsAppCredentials({
        accessToken: credsForm.accessToken.trim(),
        wabaId: credsForm.wabaId.trim(),
        phoneNumberId: credsForm.phoneNumberId.trim(),
        displayPhoneNumber: credsForm.displayPhoneNumber.trim() || null,
      });
      setStatus((prev) => ({
        provider: "meta-cloud",
        configured: true,
        wabaId: next.wabaId,
        phoneNumberId: next.phoneNumberId,
        displayPhoneNumber: next.displayPhoneNumber,
        hasTemplate: next.hasTemplate ?? prev?.hasTemplate ?? false,
        templateName: next.templateName ?? prev?.templateName ?? null,
        templateDisplayName:
          next.templateDisplayName ?? prev?.templateDisplayName ?? null,
        templateLanguage:
          next.templateLanguage ?? prev?.templateLanguage ?? "es_MX",
        webhookUrl: prev?.webhookUrl ?? next.webhookUrl ?? null,
      }));
      setCredsOpen(false);
      setCredsForm(emptyCredentialsForm);
      toast.success("Credenciales de WhatsApp guardadas", {
        description: WHATSAPP_CONNECTED_NEXT_STEP,
      });
      await load();
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudieron guardar las credenciales",
      );
    } finally {
      setSavingCreds(false);
    }
  };

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const to = sanitizeMxPhoneInput(testTo);
    const phoneError = mxPhoneError(to);
    if (phoneError) {
      toast.error(phoneError);
      return;
    }
    if (testType === "text" && !testText.trim()) {
      toast.error("Escribe un mensaje de prueba.");
      return;
    }
    setBusy(true);
    try {
      await integrationsApi.sendWhatsAppTest({
        to,
        type: testType,
        ...(testType === "text" ? { text: testText.trim() } : {}),
      });
      toast.success(
        testType === "template"
          ? "Plantilla de prueba enviada"
          : "Mensaje de prueba enviado",
      );
    } catch (err) {
      toast.error(whatsappSendTestErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("URL del webhook copiada");
    } catch {
      toast.error("No se pudo copiar la URL");
    }
  };

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-5 py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const configured = Boolean(status?.configured);
  const canSendTemplate = configured && Boolean(status?.hasTemplate);
  const canSend = testType === "template" ? canSendTemplate : configured;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-5 py-8 md:px-8 md:py-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
          Cuenta
        </p>
        <h1 className="mt-1 font-display text-4xl">WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conecta el número de WhatsApp Business de esta cuenta. Las
          invitaciones de tus eventos salen con ese número.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-foreground">
              <Smartphone className="size-5" />
            </span>
            <div>
              <h2 className="font-display text-2xl">Meta Cloud API</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Un número de WhatsApp Business por planner. Conéctalo con
                Facebook
                {devTools ? " o pega el token manualmente" : ""}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {configured ? (
              <Badge className="rounded-full bg-whatsapp text-primary-foreground">
                <CheckCircle2 className="mr-1 size-3" /> Configurada
              </Badge>
            ) : (
              <Badge variant="outline" className="rounded-full">
                Falta configurar
              </Badge>
            )}
            {configured ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDisconnectOpen(true)}
                disabled={connectingMeta}
              >
                {connectingMeta ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Unplug className="size-3.5" />
                )}
                Desconectar
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={connectMeta}
                disabled={connectingMeta || !metaConfig?.configured}
              >
                {connectingMeta ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Smartphone className="size-3.5" />
                )}
                Conectar con Facebook
              </Button>
            )}
            {devTools ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={openCredentials}
              >
                <KeyRound className="size-3.5" />
                {configured ? "Actualizar credenciales" : "Pegar token"}
              </Button>
            ) : null}
            {devTools && webhookUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setWebhookOpen(true)}
              >
                <Webhook className="size-3.5" /> Webhook
              </Button>
            ) : null}
          </div>
        </div>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-lg border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">
              WABA ID
              <span className="ml-1 font-normal">· identificador de Meta</span>
            </dt>
            <dd className="mt-0.5 font-medium font-mono text-xs">
              {status?.wabaId || (
                <span className="font-sans text-sm font-normal text-muted-foreground">
                  Sin conectar
                </span>
              )}
            </dd>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">
              Phone number ID
              <span className="ml-1 font-normal">· identificador de Meta</span>
            </dt>
            <dd className="mt-0.5 font-medium font-mono text-xs">
              {status?.phoneNumberId || (
                <span className="font-sans text-sm font-normal text-muted-foreground">
                  Sin conectar
                </span>
              )}
            </dd>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">Número</dt>
            <dd className="mt-0.5 font-medium">
              {status?.displayPhoneNumber || (
                <span className="font-normal text-muted-foreground">—</span>
              )}
            </dd>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">
              Plantilla de invitación
            </dt>
            <dd className="mt-0.5 font-medium">
              {status?.templateName ? (
                <>
                  {status.templateDisplayName || status.templateName}
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {status.templateLanguage}
                  </span>
                  {status.templateDisplayName ? (
                    <p className="mt-0.5 font-mono text-xs font-normal text-muted-foreground">
                      {status.templateName}
                    </p>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">Sin nombre</span>
              )}
            </dd>
          </div>
        </dl>
        {!configured ? (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <p>
              Esta cuenta aún no tiene WhatsApp conectado. Para enviar
              invitaciones:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Conecta tu cuenta de WhatsApp Business.</li>
              <li>Crea la plantilla de invitación.</li>
              <li>Espera a que Meta la apruebe.</li>
            </ol>
          </div>
        ) : !status?.hasTemplate ? (
          <div className="mt-3 flex flex-col gap-3 rounded-lg border border-gold/40 bg-gold-soft/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              Falta la plantilla de invitación. Meta debe aprobarla antes de
              lanzar la campaña; no podrás lanzar mientras esté en revisión.
            </p>
            <Button type="button" size="sm" onClick={() => setWizardOpen(true)}>
              Crear plantilla
            </Button>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-muted-foreground">
          Al conectar con Facebook, procura agregar un método de pago en tu cuenta de
          WhatsApp Business (país, moneda y facturación). Sin eso, Meta puede
          rechazar los envíos.{" "}
          <a
            href="https://business.facebook.com/billing_hub"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2 hover:text-gold"
          >
            Abrir facturación en Meta Business Suite
          </a>
        </p>
        {!metaConfig?.configured ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Falta configurar META_APP_ID, META_APP_SECRET y
            META_EMBEDDED_SIGNUP_CONFIG_ID en el servidor
            {devTools
              ? ". Mientras tanto puedes pegar el token a mano."
              : ". Intenta más tarde o contacta a soporte."}
          </p>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            Pulsa «Conectar con Facebook» para vincular tu WhatsApp Business. Se
            abre una ventana de Meta; al terminar, tu número queda listo para
            enviar invitaciones.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl">Probar envío</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Comprueba que el número conectado pueda enviar. La plantilla usa la de
          campaña de invitación; el texto libre solo funciona dentro de la
          ventana de 24 h.
        </p>
        <form className="mt-5 space-y-4" onSubmit={sendTest}>
          <RadioGroup
            value={testType}
            onValueChange={(value) =>
              setTestType(value as WhatsAppSendTestType)
            }
            className="gap-3 sm:grid-cols-2 sm:grid"
          >
            <label
              htmlFor="wa-test-template"
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border border-border p-3",
                testType === "template" && "border-primary",
              )}
            >
              <RadioGroupItem
                id="wa-test-template"
                value="template"
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Plantilla</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Primer contacto o fuera de la ventana de 24 h.
                </p>
              </div>
            </label>
            <label
              htmlFor="wa-test-text"
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border border-border p-3",
                testType === "text" && "border-primary",
              )}
            >
              <RadioGroupItem
                id="wa-test-text"
                value="text"
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-medium">Texto libre</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Solo si esa persona ya te escribió en las últimas 24 h.
                </p>
              </div>
            </label>
          </RadioGroup>

          <div className="space-y-2">
            <Label htmlFor="testTo">Número de destino</Label>
            <Input
              id="testTo"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={testTo}
              onChange={(e) => setTestTo(sanitizeMxPhoneInput(e.target.value))}
              placeholder="5512345678"
              required
            />
            <p className="text-xs text-muted-foreground">{MX_PHONE_HINT}</p>
          </div>
          {testType === "template" ? (
            <div className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-sm">
              {canSendTemplate && status?.templateName ? (
                <>
                  <p className="font-medium">
                    {status.templateDisplayName || "Plantilla de campaña"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                    {status.templateName}
                    {status.templateLanguage
                      ? ` · ${status.templateLanguage}`
                      : null}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Se enviará con valores de ejemplo (como en Meta). No hace
                    falta editar el texto de la plantilla.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  Necesitas una plantilla de invitación de campaña aprobada para
                  probar este envío.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="testText">Mensaje</Label>
              <Textarea
                id="testText"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
                required
                rows={3}
              />
            </div>
          )}
          <Button type="submit" disabled={!canSend || busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FlaskConical className="size-4" />
            )}
            {testType === "template"
              ? "Enviar plantilla de prueba"
              : "Probar envío"}
          </Button>
        </form>
      </section>

      <Dialog open={credsOpen} onOpenChange={setCredsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {configured ? "Actualizar credenciales" : "Conectar WhatsApp"}
            </DialogTitle>
            <DialogDescription>
              Pega el token de usuario del sistema y los identificadores de Meta
              (WABA ID y phone number ID). Preferimos el alta con Facebook
              cuando esté configurado.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={saveCredentials}>
            <div className="space-y-2">
              <Label htmlFor="metaAccessToken">Access token</Label>
              <Input
                id="metaAccessToken"
                type="password"
                autoComplete="off"
                value={credsForm.accessToken}
                onChange={(e) =>
                  setCredsForm((prev) => ({
                    ...prev,
                    accessToken: e.target.value,
                  }))
                }
                placeholder="EAAG…"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metaWabaId">WABA ID</Label>
              <Input
                id="metaWabaId"
                value={credsForm.wabaId}
                onChange={(e) =>
                  setCredsForm((prev) => ({ ...prev, wabaId: e.target.value }))
                }
                placeholder="123456789012345"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metaPhoneNumberId">Phone number ID</Label>
              <Input
                id="metaPhoneNumberId"
                value={credsForm.phoneNumberId}
                onChange={(e) =>
                  setCredsForm((prev) => ({
                    ...prev,
                    phoneNumberId: e.target.value,
                  }))
                }
                placeholder="10987654321"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="metaDisplayPhone">
                Número visible (opcional)
              </Label>
              <Input
                id="metaDisplayPhone"
                value={credsForm.displayPhoneNumber}
                onChange={(e) =>
                  setCredsForm((prev) => ({
                    ...prev,
                    displayPhoneNumber: e.target.value,
                  }))
                }
                placeholder="5215512345678"
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCredsOpen(false)}
                disabled={savingCreds}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingCreds}>
                {savingCreds ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <WhatsAppTemplateWizardDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        dismissible={!status?.invitationWizardRequired}
        onCreated={async () => {
          await load();
        }}
      />

      {webhookUrl ? (
        <Dialog open={webhookOpen} onOpenChange={setWebhookOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Webhook de Meta</DialogTitle>
              <DialogDescription>
                Solo visible en desarrollo. Úsala como Callback URL en el panel
                de Meta (GET de verificación y POST de eventos).
              </DialogDescription>
            </DialogHeader>
            <p className="break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs">
              {webhookUrl}
            </p>
            <Button type="button" variant="outline" onClick={copyWebhook}>
              <Copy className="size-4" /> Copiar URL
            </Button>
          </DialogContent>
        </Dialog>
      ) : null}
      <AlertDialog open={disconnectOpen} onOpenChange={setDisconnectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar WhatsApp?</AlertDialogTitle>
            <AlertDialogDescription>
              Se detendrán los envíos y las campañas de todos tus eventos hasta
              que vuelvas a conectar la cuenta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={connectingMeta}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={connectingMeta}
              onClick={() => void disconnectMeta()}
            >
              Desconectar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
