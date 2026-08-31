import { api } from "@/lib/api/client";

export type IntegrationStatus = "draft" | "active" | "error" | "disabled";

export type IntegrationDto = {
  id: string;
  channel: string;
  provider: string;
  displayName: string | null;
  status: IntegrationStatus;
  webhookUrl: string | null;
  lastHealthcheckAt: string | null;
  lastError: string | null;
  hasActiveCredential: boolean;
};

export type WhatsAppQrLinkDto = {
  url: string;
  expiresAt: string;
};

export type WhatsAppDeviceStatusDto = {
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  updatedAt: string;
};

export const integrationsApi = {
  list: () => api<IntegrationDto[]>("/integrations"),
  create: (body?: {
    channel?: string;
    provider?: string;
    displayName?: string | null;
  }) =>
    api<IntegrationDto>("/integrations", {
      method: "POST",
      body: JSON.stringify({
        channel: "whatsapp",
        provider: "whatsapp-connect",
        ...body,
      }),
    }),
  patch: (
    id: string,
    body: Partial<
      Pick<IntegrationDto, "displayName" | "status" | "webhookUrl">
    >,
  ) =>
    api<IntegrationDto>(`/integrations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    api<{ ok: boolean }>(`/integrations/${id}`, { method: "DELETE" }),
  postCredentials: (
    id: string,
    payload: { deviceId: string; webhookSecret: string; tenantId: string },
  ) =>
    api<{ ok: boolean; hasActiveCredential: boolean }>(
      `/integrations/${id}/credentials`,
      {
        method: "POST",
        body: JSON.stringify({ payload }),
      },
    ),
  test: (id: string) =>
    api<{ ok: boolean; message: string }>(`/integrations/${id}/test`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  createWhatsAppQrLink: (integrationId: string) =>
    api<WhatsAppQrLinkDto>("/internal/whatsapp/qr-link", {
      method: "POST",
      body: JSON.stringify({ integrationId }),
    }),
  getWhatsAppDeviceStatus: (integrationId: string) =>
    api<WhatsAppDeviceStatusDto>(
      `/internal/whatsapp/device-status?integrationId=${encodeURIComponent(integrationId)}`,
    ),
  sendWhatsAppTest: (body: {
    integrationId: string;
    to: string;
    text: string;
  }) =>
    api<{ ok: boolean }>("/internal/whatsapp/send-test", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
