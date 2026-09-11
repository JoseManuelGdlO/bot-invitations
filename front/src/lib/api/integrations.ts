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
  wabaId?: string | null;
  phoneNumberId?: string | null;
  displayPhoneNumber?: string | null;
  coexistenceEnabled?: boolean;
};

export type MetaSignupConfigDto = {
  configured: boolean;
  appId: string;
  configId: string;
  graphVersion: string;
  featureType: string;
  sessionInfoVersion: string;
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

export type WhatsAppMetaTemplateParameter = {
  key: string;
};

export type WhatsAppMetaTemplateDto = {
  id: string | null;
  name: string | null;
  language: string | null;
  status: string | null;
  parameterFormat: string;
  header: { format: string; text: string | null } | null;
  body: {
    text: string;
    parameters: WhatsAppMetaTemplateParameter[];
  };
  footer: { text: string } | null;
};

export type WhatsAppSendTestType = "text" | "template";

export type WhatsappSlotMappingDto =
  { type: "field"; key: string } | { type: "literal"; value: string } | null;

export type EventWhatsappTemplateDto = {
  id: string | null;
  slot: number;
  isCampaign: boolean;
  slotMappings: Record<string, WhatsappSlotMappingDto>;
  template: {
    id: string | null;
    name: string | null;
    metaTemplateId: string | null;
    language: string | null;
    category: string | null;
    headerType: string;
    headerFileName: string | null;
    status: string | null;
    rejectedReason: string | null;
    body: string;
  };
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
  getWhatsAppStatus: () =>
    api<WhatsAppMetaStatusDto>("/internal/whatsapp/status"),
  getWhatsAppTemplate: (document = false) =>
    api<WhatsAppMetaTemplateDto>(
      `/internal/whatsapp/template?document=${document ? "true" : "false"}`,
    ),
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
  getMetaSignupConfig: () =>
    api<MetaSignupConfigDto>("/integrations/whatsapp/meta/config"),
  completeMetaSignup: (body: {
    code: string;
    wabaId?: string | null;
    phoneNumberId?: string | null;
    businessId?: string | null;
    event?: string | null;
  }) =>
    api<IntegrationDto>("/integrations/whatsapp/meta/signup", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  disconnectMeta: () =>
    api<IntegrationDto>("/integrations/whatsapp/meta/disconnect", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  createWizardTemplates: (form: FormData) =>
    api<{ templates: EventWhatsappTemplateDto[] }>(
      "/integrations/whatsapp/meta/templates",
      { method: "POST", body: form },
    ),
};
