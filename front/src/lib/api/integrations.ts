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

export type WhatsAppMetaStatusDto = {
  provider: "meta-cloud";
  configured: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  hasTemplate: boolean;
  templateName: string | null;
  templateLanguage: string;
  webhookUrl: string | null;
};

export type WhatsAppMetaCredentialsInput = {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber?: string | null;
};

export type WhatsAppSendTestType = "text" | "template";

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
  getWhatsAppStatus: () =>
    api<WhatsAppMetaStatusDto>("/internal/whatsapp/status"),
  saveWhatsAppCredentials: (body: WhatsAppMetaCredentialsInput) =>
    api<WhatsAppMetaStatusDto & { ok: boolean }>("/internal/whatsapp/credentials", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  sendWhatsAppTest: (body: {
    to: string;
    type: WhatsAppSendTestType;
    text: string;
    name?: string;
  }) =>
    api<{ ok: boolean; type: WhatsAppSendTestType; id: string | null }>(
      "/internal/whatsapp/send-test",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
    ),
};
