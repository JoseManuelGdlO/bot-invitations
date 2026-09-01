import { jest } from "@jest/globals";
import { loadWithMocks } from "../helpers/loadWithMocks.js";

describe("assertWhatsappReady (Meta)", () => {
  test("pasa con integración del owner y plantilla", async () => {
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js", {
      extraMocks: {
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner: jest.fn(async () => ({
            credentials: { accessToken: "tok", phoneNumberId: "123" },
          })),
        }),
      },
    });
    await expect(mod.assertWhatsappReady({ ownerId: "usr_1" })).resolves.toBeUndefined();
  });

  test("400 si el evento no tiene owner", async () => {
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js", {
      extraMocks: {
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner: jest.fn(),
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
      },
    });
    await expect(mod.assertWhatsappReady({ ownerId: "usr_1" })).rejects.toMatchObject({
      status: 400,
      message: "WhatsApp (Meta) no está configurado.",
    });
  });

  test("400 si falta el nombre de plantilla", async () => {
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js", {
      extraMocks: {
        "src/config/env.js": () => ({
          env: { meta: { templateName: "" } },
        }),
        "src/services/whatsapp-meta.service.js": () => ({
          resolveActiveWhatsappMetaByOwner: jest.fn(async () => ({
            credentials: { accessToken: "tok", phoneNumberId: "123" },
          })),
        }),
      },
    });
    await expect(mod.assertWhatsappReady({ ownerId: "usr_1" })).rejects.toMatchObject({
      status: 400,
      message: "Falta META_TEMPLATE_NAME.",
    });
  });
});
