import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  FlaskConical,
  KeyRound,
  Loader2,
  Smartphone,
  Webhook,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { apiBase, ApiError } from "@/lib/api/client";
import {
  integrationsApi,
  type WhatsAppMetaStatusDto,
  type WhatsAppSendTestType,
} from "@/lib/api/integrations";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const [status, setStatus] = useState<WhatsAppMetaStatusDto | null>(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [credsOpen, setCredsOpen] = useState(false);
  const [credsForm, setCredsForm] = useState(emptyCredentialsForm);
  const [testType, setTestType] = useState<WhatsAppSendTestType>("template");
  const [testTo, setTestTo] = useState("");
  const [testName, setTestName] = useState("Invitado");
  const [testText, setTestText] = useState(
    "Prueba de conexión desde Alanna Confirmaciones",
  );

  const load = useCallback(async () => {
    const next = await integrationsApi.getWhatsAppStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    load()
      .catch((err) =>
        toast.error(
          err instanceof ApiError
            ? err.message
            : "No se pudo cargar WhatsApp (Meta)",
        ),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const webhookUrl = import.meta.env.DEV
    ? status?.webhookUrl || metaWebhookPublicUrl()
    : null;

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
        templateLanguage: next.templateLanguage ?? prev?.templateLanguage ?? "es_MX",
        webhookUrl: prev?.webhookUrl ?? next.webhookUrl ?? null,
      }));
      setCredsOpen(false);
      setCredsForm(emptyCredentialsForm);
      toast.success("Credenciales de WhatsApp guardadas");
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
    setBusy(true);
    try {
      await integrationsApi.sendWhatsAppTest({
        to: testTo.trim(),
        type: testType,
        text: testText.trim(),
        ...(testType === "template" ? { name: testName.trim() } : {}),
      });
      toast.success(
        testType === "template"
          ? "Plantilla de prueba enviada"
          : "Mensaje de prueba enviado",
      );
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo enviar la prueba",
      );
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
          Conecta el número de WhatsApp Business de esta cuenta. Las invitaciones
          de tus eventos salen con ese WABA.
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
                Un WABA por planner. El token se guarda cifrado en el servidor.
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
            <Button type="button" variant="outline" size="sm" onClick={openCredentials}>
              <KeyRound className="size-3.5" />
              {configured ? "Actualizar credenciales" : "Conectar WhatsApp"}
            </Button>
            {webhookUrl ? (
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
            <dt className="text-xs text-muted-foreground">WABA ID</dt>
            <dd className="mt-0.5 font-medium font-mono text-xs">
              {status?.wabaId || (
                <span className="font-sans text-sm font-normal text-muted-foreground">
                  Sin conectar
                </span>
              )}
            </dd>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">Phone number ID</dt>
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
            <dt className="text-xs text-muted-foreground">Plantilla HSM</dt>
            <dd className="mt-0.5 font-medium">
              {status?.templateName ? (
                <>
                  {status.templateName}
                  <span className="ml-1 font-normal text-muted-foreground">
                    · {status.templateLanguage}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">Sin nombre</span>
              )}
            </dd>
          </div>
        </dl>
        {!configured ? (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Esta cuenta aún no tiene credenciales de Meta. Conéctalas para
            enviar invitaciones.
          </p>
        ) : !status?.hasTemplate ? (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Falta META_TEMPLATE_NAME. Sin plantilla no se puede enviar en frío.
          </p>
        ) : null}
        <p className="mt-3 text-xs text-muted-foreground">
          El formulario de credenciales es temporal. Cuando Meta apruebe
          Embedded Signup, la conexión se hará desde Facebook sin pegar el
          token.
        </p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl">Probar envío</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manda un texto libre (ventana de 24 h) o la plantilla HSM a un número
          de 10 dígitos, usando el WABA de esta cuenta.
        </p>
        <form className="mt-5 space-y-4" onSubmit={sendTest}>
          <RadioGroup
            value={testType}
            onValueChange={(value) => setTestType(value as WhatsAppSendTestType)}
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
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="5512345678"
              required
            />
          </div>
          {testType === "template" ? (
            <div className="space-y-2">
              <Label htmlFor="testName">Nombre (variable 1)</Label>
              <Input
                id="testName"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="Invitado"
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="testText">
              {testType === "template" ? "Mensaje (variable 2)" : "Mensaje"}
            </Label>
            <Textarea
              id="testText"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              required
              rows={3}
            />
          </div>
          <Button type="submit" disabled={!canSend || busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FlaskConical className="size-4" />
            )}
            Probar envío
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
              Pega el token de usuario del sistema, el WABA ID y el phone
              number ID que te da Meta. Este formulario se sustituirá por
              Embedded Signup.
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
                  setCredsForm((prev) => ({ ...prev, accessToken: e.target.value }))
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
              <Label htmlFor="metaDisplayPhone">Número visible (opcional)</Label>
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
    </main>
  );
}
