import { jest } from "@jest/globals";
import { loadWithMocks } from "../helpers/loadWithMocks.js";

describe("assertWhatsappReady (Meta)", () => {
  test("pasa con integración Meta del owner y plantilla de campaña aprobada", async () => {
    const assertCampaignTemplateReady = jest.fn(async () => undefined);
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js", {
      extraMocks: {
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner: jest.fn(async () => ({
            credentials: { accessToken: "tok", phoneNumberId: "123" },
          })),
        }),
        "src/services/whatsapp-templates.service.js": () => ({
          assertCampaignTemplateReady,
        }),
      },
    });
    const event = { id: "evt_1", ownerId: "usr_1" };

    await expect(mod.assertWhatsappReady(event)).resolves.toBeUndefined();
    expect(assertCampaignTemplateReady).toHaveBeenCalledWith(event);
  });

  test("400 si el evento no tiene owner", async () => {
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js", {
      extraMocks: {
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner: jest.fn(),
        }),
        "src/services/whatsapp-templates.service.js": () => ({
          assertCampaignTemplateReady: jest.fn(),
        }),
      },
    });
    await expect(mod.assertWhatsappReady({})).rejects.toMatchObject({
      status: 400,
      message: "WhatsApp (Meta) no está configurado.",
    });
  });

  test("400 si faltan credenciales Meta del owner", async () => {
    const err = Object.assign(new Error("WhatsApp (Meta) no está configurado."), { status: 400 });
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js", {
      extraMocks: {
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner: jest.fn(async () => {
            throw err;
          }),
        }),
        "src/services/whatsapp-templates.service.js": () => ({
          assertCampaignTemplateReady: jest.fn(),
        }),
      },
    });
    await expect(mod.assertWhatsappReady({ ownerId: "usr_1" })).rejects.toMatchObject({
      status: 400,
      message: "WhatsApp (Meta) no está configurado.",
    });
  });

  test("400 si no hay plantilla de campaña aprobada", async () => {
    const err = Object.assign(
      new Error("Meta aún no aprueba la plantilla de campaña."),
      { status: 400 },
    );
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js", {
      extraMocks: {
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner: jest.fn(async () => ({
            credentials: { accessToken: "tok", phoneNumberId: "123" },
          })),
        }),
        "src/services/whatsapp-templates.service.js": () => ({
          assertCampaignTemplateReady: jest.fn(async () => {
            throw err;
          }),
        }),
      },
    });
    await expect(mod.assertWhatsappReady({ ownerId: "usr_1" })).rejects.toMatchObject({
      status: 400,
      message: "Meta aún no aprueba la plantilla de campaña.",
    });
  });
});
