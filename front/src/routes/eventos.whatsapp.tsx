import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FlaskConical,
  Loader2,
  Power,
  PowerOff,
  QrCode,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiBase, ApiError } from "@/lib/api/client";
import {
  integrationsApi,
  type IntegrationDto,
  type WhatsAppDeviceStatusDto,
  type WhatsAppQrLinkDto,
} from "@/lib/api/integrations";
import { toast } from "sonner";

export const Route = createFileRoute("/eventos/whatsapp")({
  head: () => ({
    meta: [
      { title: "WhatsApp · Alanna Confirmaciones" },
      {
        name: "description",
        content:
          "Conecta tu número de WhatsApp para enviar invitaciones y mensajes.",
      },
      { property: "og:title", content: "WhatsApp · Alanna Confirmaciones" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: WhatsAppConnectPage,
});

const STATUS_LABEL: Record<IntegrationDto["status"], string> = {
  draft: "Borrador",
  active: "Activa",
  error: "Error",
  disabled: "Desactivada",
};

const DEVICE_LABEL: Record<WhatsAppDeviceStatusDto["status"], string> = {
  ONLINE: "En línea",
  OFFLINE: "Desconectado",
  UNKNOWN: "Desconocido",
};

function webhookPublicUrl() {
  const base = apiBase.replace(/\/$/, "");
  if (base.startsWith("http"))
    return `${base}/webhooks/whatsapp-connect/events`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}${base}/webhooks/whatsapp-connect/events`;
  }
  return `${base}/webhooks/whatsapp-connect/events`;
}

function WhatsAppConnectPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [integration, setIntegration] = useState<IntegrationDto | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [testTo, setTestTo] = useState("");
  const [testText, setTestText] = useState(
    "Prueba de conexión desde Alanna Confirmaciones",
  );
  const [qr, setQr] = useState<WhatsAppQrLinkDto | null>(null);
  const [deviceStatus, setDeviceStatus] =
    useState<WhatsAppDeviceStatusDto | null>(null);

  const webhookUrl = useMemo(() => webhookPublicUrl(), []);
  const qrExpired = qr ? new Date(qr.expiresAt).getTime() <= Date.now() : false;
  const canOperate = Boolean(
    integration?.status === "active" && integration.hasActiveCredential,
  );

  const load = useCallback(async () => {
    const rows = await integrationsApi.list();
    const found =
      rows.find(
        (row) =>
          row.channel === "whatsapp" && row.provider === "whatsapp-connect",
      ) ?? null;
    setIntegration(found);
    return found;
  }, []);

  useEffect(() => {
    load()
      .catch((err) =>
        toast.error(
          err instanceof ApiError ? err.message : "No se pudo cargar WhatsApp",
        ),
      )
      .finally(() => setLoading(false));
  }, [load]);

  const refreshDeviceStatus = async (id: string) => {
    try {
      const status = await integrationsApi.getWhatsAppDeviceStatus(id);
      setDeviceStatus(status);
    } catch {
      setDeviceStatus(null);
    }
  };

  useEffect(() => {
    if (integration?.id && canOperate) {
      refreshDeviceStatus(integration.id);
    }
  }, [integration?.id, canOperate]);

  const createIntegration = async () => {
    setBusy("create");
    try {
      const created = await integrationsApi.create({ displayName: "WhatsApp" });
      setIntegration(created);
      toast.success("Integración creada", {
        description: "Ahora guarda el deviceId y el secreto del webhook.",
      });
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo crear la integración",
      );
    } finally {
      setBusy(null);
    }
  };

  const saveCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!integration) return;
    setSaving(true);
    try {
      await integrationsApi.postCredentials(integration.id, {
        deviceId,
        webhookSecret,
        tenantId: tenantId.trim(),
      });
      const updated = await load();
      setWebhookSecret("");
      toast.success("Credenciales guardadas", {
        description: "La integración quedó activa y cifrada en el servidor.",
      });
      if (updated?.status === "active") await refreshDeviceStatus(updated.id);
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudieron guardar las credenciales",
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (next: boolean) => {
    if (!integration) return;
    setBusy("status");
    try {
      const updated = await integrationsApi.patch(integration.id, {
        status: next ? "active" : "disabled",
      });
      setIntegration(updated);
      toast.success(next ? "WhatsApp activado" : "WhatsApp desactivado");
    } catch (err) {
      toast.error(
        err instanceof ApiError
          ? err.message
          : "No se pudo actualizar el estado",
      );
    } finally {
      setBusy(null);
    }
  };

  const generateQr = async () => {
    if (!integration) return;
    setBusy("qr");
    try {
      const result = await integrationsApi.createWhatsAppQrLink(integration.id);
      setQr(result);
      window.open(result.url, "_blank", "noopener,noreferrer");
      toast.success("QR generado", {
        description: "Se abrió el enlace público del proveedor.",
      });
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo generar el QR",
      );
    } finally {
      setBusy(null);
    }
  };

  const sendTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!integration) return;
    setBusy("test");
    try {
      await integrationsApi.sendWhatsAppTest({
        integrationId: integration.id,
        to: testTo.trim(),
        text: testText.trim(),
      });
      toast.success("Mensaje de prueba enviado");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "No se pudo enviar la prueba",
      );
    } finally {
      setBusy(null);
    }
  };

  const copyWebhook = async () => {
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

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-5 py-8 md:px-8 md:py-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-gold">
          Cuenta
        </p>
        <h1 className="mt-1 font-display text-4xl">WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Un número por cuenta, compartido por todos tus eventos. El QR lo
          genera el proveedor; aquí vinculamos solo un device que pertenezca a
          tu tenant.
        </p>
      </div>

      {!integration ? (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-gold-soft text-gold-foreground">
              <Smartphone className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-2xl">Conecta tu WhatsApp</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                El deviceId y el tenantId deben ser tuyos en WhatsApp Connect.
                Esta app no crea devices, solo los vincula si el proveedor
                confirma la titularidad.
              </p>
              <Button
                className="mt-5"
                onClick={createIntegration}
                disabled={busy === "create"}
              >
                {busy === "create" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Smartphone className="size-4" />
                )}
                Crear integración
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl">Conexión</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {integration.hasActiveCredential
                    ? "Hay credenciales cifradas en el servidor."
                    : "Aún no hay credenciales guardadas."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="rounded-full">
                  {STATUS_LABEL[integration.status]}
                </Badge>
                {integration.hasActiveCredential ? (
                  <Badge className="rounded-full bg-whatsapp text-primary-foreground">
                    <CheckCircle2 className="mr-1 size-3" /> Credenciales OK
                  </Badge>
                ) : null}
              </div>
            </div>

            {integration.lastError ? (
              <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {integration.lastError}
              </p>
            ) : null}

            <form className="mt-5 space-y-4" onSubmit={saveCredentials}>
              <div className="space-y-2">
                <Label htmlFor="deviceId">Device ID</Label>
                <Input
                  id="deviceId"
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  placeholder={
                    integration.hasActiveCredential
                      ? "Ingresa uno nuevo para reemplazar"
                      : "El ID del device de tu tenant en WhatsApp Connect"
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="webhookSecret">Webhook secret</Label>
                <Input
                  id="webhookSecret"
                  type="password"
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder="No se vuelve a mostrar después de guardar"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tenantId">Tenant ID</Label>
                <Input
                  id="tenantId"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="El tenant dueño del device en WhatsApp Connect"
                  required
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={integration.status === "active"}
                    disabled={
                      busy === "status" || !integration.hasActiveCredential
                    }
                    onCheckedChange={toggleActive}
                  />
                  {integration.status === "active" ? (
                    <span className="inline-flex items-center gap-1">
                      <Power className="size-3.5" /> Activa
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <PowerOff className="size-3.5" /> Desactivada
                    </span>
                  )}
                </label>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : null}
                  Guardar credenciales
                </Button>
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-2xl">QR y estado</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Genera un enlace público temporal para escanear el QR. Esta
              pantalla no dibuja el código.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={generateQr}
                disabled={!canOperate || busy === "qr"}
              >
                {busy === "qr" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <QrCode className="size-4" />
                )}
                Generar QR
              </Button>
              {qr?.url ? (
                <Button type="button" variant="outline" asChild>
                  <a href={qr.url} target="_blank" rel="noreferrer">
                    <ExternalLink className="size-4" /> Abrir QR
                  </a>
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={!canOperate || busy === "status-refresh"}
                onClick={async () => {
                  if (!integration) return;
                  setBusy("status-refresh");
                  try {
                    await refreshDeviceStatus(integration.id);
                    toast.success("Estado actualizado");
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                {busy === "status-refresh" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Consultar estado
              </Button>
            </div>
            <div className="mt-4 space-y-1 text-sm text-muted-foreground">
              {deviceStatus ? (
                <p>
                  Device {DEVICE_LABEL[deviceStatus.status]} · actualizado{" "}
                  {new Date(deviceStatus.updatedAt).toLocaleString("es-MX")}
                </p>
              ) : (
                <p>
                  Aún no hay estado del device. Activa la integración y
                  consúltalo.
                </p>
              )}
              {qr?.expiresAt ? (
                <p>
                  {qrExpired
                    ? "El QR expiró. Genera uno nuevo."
                    : `QR vigente hasta ${new Date(qr.expiresAt).toLocaleString("es-MX")}`}
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-2xl">Probar envío</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Manda un texto de prueba para confirmar que el device puede salir
              a WhatsApp.
            </p>
            <form className="mt-5 space-y-4" onSubmit={sendTest}>
              <div className="space-y-2">
                <Label htmlFor="testTo">Número de destino</Label>
                <Input
                  id="testTo"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="5215512345678"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="testText">Mensaje</Label>
                <Input
                  id="testText"
                  value={testText}
                  onChange={(e) => setTestText(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={!canOperate || busy === "test"}>
                {busy === "test" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <FlaskConical className="size-4" />
                )}
                Enviar prueba
              </Button>
            </form>
          </section>

          <section className="rounded-2xl border border-border bg-card p-6 shadow-soft">
            <h2 className="font-display text-2xl">Webhook</h2>
            <p className="mt-3 break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-xs">
              {webhookUrl}
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              onClick={copyWebhook}
            >
              <Copy className="size-4" /> Copiar URL
            </Button>
          </section>
        </>
      )}
    </main>
  );
}
