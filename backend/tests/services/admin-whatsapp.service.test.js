import { loadWithMocks } from "../helpers/loadWithMocks.js";
import { encryptCredentialsPayload } from "../../src/utils/credentials-crypto.js";

describe("admin-whatsapp.service", () => {
  test("400 si falta wabaId", async () => {
    const { mod } = await loadWithMocks("src/services/admin-whatsapp.service.js");
    await expect(mod.getMetaAccessTokenByWabaId("  ")).rejects.toMatchObject({
      status: 400,
      message: "wabaId es obligatorio.",
    });
  });

  test("descifra el User Access Token desde channel_credentials", async () => {
    const { mod, models } = await loadWithMocks("src/services/admin-whatsapp.service.js");
    models.ChannelIntegration.findOne.mockResolvedValue({
      id: "int_meta",
      ownerUserId: "usr_client",
      wabaId: "waba_1",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "+52 618 123 4567",
      status: "active",
    });
    models.ChannelCredential.findOne.mockResolvedValue({
      cipherText: encryptCredentialsPayload({ accessToken: "EAA_USER_TOKEN" }),
      isActive: true,
    });

    await expect(mod.getMetaAccessTokenByWabaId("waba_1")).resolves.toEqual({
      wabaId: "waba_1",
      ownerUserId: "usr_client",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "+52 618 123 4567",
      accessToken: "EAA_USER_TOKEN",
      source: "channel_credentials",
    });
  });

  test("cae a whatsapp_credentials si no hay credencial de canal", async () => {
    const { mod, models } = await loadWithMocks("src/services/admin-whatsapp.service.js");
    models.ChannelIntegration.findOne.mockResolvedValue(null);
    models.WhatsappIntegration.findOne.mockResolvedValue({
      id: "wa_int_1",
      ownerUserId: "usr_client",
      wabaId: "waba_1",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "5512345678",
      status: "active",
    });
    models.WhatsappCredential.findOne.mockResolvedValue({
      cipherText: encryptCredentialsPayload({ accessToken: "EAA_LEGACY" }),
      isActive: true,
    });

    await expect(mod.getMetaAccessTokenByWabaId("waba_1")).resolves.toEqual({
      wabaId: "waba_1",
      ownerUserId: "usr_client",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "5512345678",
      accessToken: "EAA_LEGACY",
      source: "whatsapp_credentials",
    });
  });

  test("400 si el cipherText no se puede descifrar", async () => {
    const { mod, models } = await loadWithMocks("src/services/admin-whatsapp.service.js");
    models.ChannelIntegration.findOne.mockResolvedValue({
      id: "int_meta",
      ownerUserId: "usr_client",
      wabaId: "waba_1",
      phoneNumberId: "10987654321",
      displayPhoneNumber: null,
      status: "active",
    });
    models.ChannelCredential.findOne.mockResolvedValue({
      cipherText: "no-es-un-paquete-valido",
      isActive: true,
    });

    await expect(mod.getMetaAccessTokenByWabaId("waba_1")).rejects.toMatchObject({
      status: 400,
      message: "Las credenciales de WhatsApp no se pudieron descifrar.",
    });
  });

  test("404 si no hay WABA ni credenciales", async () => {
    const { mod, models } = await loadWithMocks("src/services/admin-whatsapp.service.js");
    models.ChannelIntegration.findOne.mockResolvedValue(null);
    models.WhatsappIntegration.findOne.mockResolvedValue(null);

    await expect(mod.getMetaAccessTokenByWabaId("waba_missing")).rejects.toMatchObject({
      status: 404,
      message: "No hay una conexión de WhatsApp (Meta) para ese WABA.",
    });
  });
});
