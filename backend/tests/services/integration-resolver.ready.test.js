import { loadWithMocks } from "../helpers/loadWithMocks.js";

describe("assertWhatsappReady (Meta)", () => {
  test("pasa con token, phone_number_id y plantilla", async () => {
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js");
    await expect(mod.assertWhatsappReady({ ownerId: "usr_1" })).resolves.toBeUndefined();
  });

  test("400 si faltan credenciales Meta", async () => {
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js", {
      extraMocks: {
        "src/config/env.js": () => ({
          env: { meta: { accessToken: "", phoneNumberId: "", templateName: "" } },
        }),
      },
    });
    await expect(mod.assertWhatsappReady({})).rejects.toMatchObject({
      status: 400,
      message: "WhatsApp (Meta) no está configurado.",
    });
  });

  test("400 si falta el nombre de plantilla", async () => {
    const { mod } = await loadWithMocks("src/services/integration-resolver.service.js", {
      extraMocks: {
        "src/config/env.js": () => ({
          env: {
            meta: { accessToken: "tok", phoneNumberId: "123", templateName: "" },
          },
        }),
      },
    });
    await expect(mod.assertWhatsappReady({})).rejects.toMatchObject({
      status: 400,
      message: "Falta META_TEMPLATE_NAME.",
    });
  });
});
