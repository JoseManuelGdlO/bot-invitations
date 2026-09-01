import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Copy,
  FlaskConical,
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

function WhatsAppMetaPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<WhatsAppMetaStatusDto | null>(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
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
          Un número de la plataforma vía Cloud API de Meta, compartido por todos
          los eventos. Las credenciales viven en el servidor, no por planner.
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
                Token, phone number id y plantilla se configuran en el entorno
                del backend.
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
            <dt className="text-xs text-muted-foreground">Proveedor</dt>
            <dd className="mt-0.5 font-medium">Meta Cloud API</dd>
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
            Falta META_ACCESS_TOKEN o META_PHONE_NUMBER_ID en el servidor.
          </p>
        ) : !status?.hasTemplate ? (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            Falta META_TEMPLATE_NAME. Sin plantilla no se puede enviar en frío.
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h2 className="font-display text-2xl">Probar envío</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manda un texto libre (ventana de 24 h) o la plantilla HSM a un número
          de 10 dígitos.
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
