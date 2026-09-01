import { loadWithMocks, fakeUser } from "../helpers/loadWithMocks.js";
import { encryptCredentialsPayload } from "../../src/utils/credentials-crypto.js";

const ownerId = fakeUser().id;

function fakeIntegration(overrides = {}) {
  return {
    id: "wa_int_1",
    ownerUserId: ownerId,
    wabaId: "waba_1",
    phoneNumberId: "10987654321",
    displayPhoneNumber: "5512345678",
    status: "active",
    lastError: null,
    update: async function update(patch) {
      Object.assign(this, patch);
      return this;
    },
    ...overrides,
  };
}

describe("whatsapp-meta.service", () => {
  test("upsert crea integración y credencial cifrada", async () => {
    const { mod, models } = await loadWithMocks("src/services/whatsapp-meta.service.js");
    models.WhatsappIntegration.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    const created = fakeIntegration();
    models.WhatsappIntegration.create.mockResolvedValue(created);

    const result = await mod.upsertWhatsappMetaCredentials({
      ownerUserId: ownerId,
      accessToken: "EAAG-secret",
      wabaId: "waba_1",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "5512345678",
    });

    expect(models.WhatsappIntegration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: ownerId,
        wabaId: "waba_1",
        phoneNumberId: "10987654321",
        status: "active",
      }),
    );
    expect(models.WhatsappCredential.update).toHaveBeenCalledWith(
      { isActive: false },
      { where: { ownerUserId: ownerId, whatsappIntegrationId: created.id } },
    );
    expect(models.WhatsappCredential.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: ownerId,
        credentialType: "meta_system_user_token",
        isActive: true,
      }),
    );
    const cipherText = models.WhatsappCredential.create.mock.calls[0][0].cipherText;
    expect(cipherText).not.toContain("EAAG-secret");
    expect(result.hasActiveCredential).toBe(true);
  });

  test("upsert rota credenciales de una integración existente", async () => {
    const { mod, models } = await loadWithMocks("src/services/whatsapp-meta.service.js");
    const existing = fakeIntegration();
    models.WhatsappIntegration.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);

    await mod.upsertWhatsappMetaCredentials({
      ownerUserId: ownerId,
      accessToken: "EAAG-new",
      wabaId: "waba_2",
      phoneNumberId: "222",
    });

    expect(existing.wabaId).toBe("waba_2");
    expect(existing.phoneNumberId).toBe("222");
    expect(models.WhatsappIntegration.create).not.toHaveBeenCalled();
    expect(models.WhatsappCredential.update).toHaveBeenCalled();
    expect(models.WhatsappCredential.create).toHaveBeenCalled();
  });

  test("409 si otro usuario ya tiene el phoneNumberId", async () => {
    const { mod, models } = await loadWithMocks("src/services/whatsapp-meta.service.js");
    models.WhatsappIntegration.findOne.mockResolvedValueOnce({
      id: "other",
      ownerUserId: "usr_other",
      phoneNumberId: "10987654321",
    });

    await expect(
      mod.upsertWhatsappMetaCredentials({
        ownerUserId: ownerId,
        accessToken: "tok",
        wabaId: "waba_1",
        phoneNumberId: "10987654321",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(models.WhatsappCredential.create).not.toHaveBeenCalled();
  });

  test("400 si falta accessToken", async () => {
    const { mod } = await loadWithMocks("src/services/whatsapp-meta.service.js");
    await expect(
      mod.upsertWhatsappMetaCredentials({
        ownerUserId: ownerId,
        accessToken: "  ",
        wabaId: "waba_1",
        phoneNumberId: "111",
      }),
    ).rejects.toMatchObject({ status: 400, message: "accessToken es obligatorio." });
  });

  test("resolveActiveWhatsappMetaByOwner descifra el token", async () => {
    const { mod, models } = await loadWithMocks("src/services/whatsapp-meta.service.js");
    const integration = fakeIntegration();
    models.WhatsappIntegration.findOne.mockResolvedValue(integration);
    models.WhatsappCredential.findOne.mockResolvedValue({
      cipherText: encryptCredentialsPayload({ accessToken: "EAAG-live" }),
      isActive: true,
    });

    const resolved = await mod.resolveActiveWhatsappMetaByOwner(ownerId);
    expect(resolved.credentials).toEqual({
      accessToken: "EAAG-live",
      phoneNumberId: "10987654321",
      wabaId: "waba_1",
      displayPhoneNumber: "5512345678",
    });
  });

  test("resolveActiveWhatsappMetaByPhoneNumberId rutea por id", async () => {
    const { mod, models } = await loadWithMocks("src/services/whatsapp-meta.service.js");
    const integration = fakeIntegration();
    models.WhatsappIntegration.findOne.mockResolvedValue(integration);
    models.WhatsappCredential.findOne.mockResolvedValue({
      cipherText: encryptCredentialsPayload({ accessToken: "EAAG-live" }),
      isActive: true,
    });

    const resolved = await mod.resolveActiveWhatsappMetaByPhoneNumberId("10987654321");
    expect(resolved.integration.ownerUserId).toBe(ownerId);
    expect(resolved.credentials.accessToken).toBe("EAAG-live");
  });

  test("resolveActiveWhatsappMetaByPhoneNumberId null si no hay integración", async () => {
    const { mod, models } = await loadWithMocks("src/services/whatsapp-meta.service.js");
    models.WhatsappIntegration.findOne.mockResolvedValue(null);
    await expect(mod.resolveActiveWhatsappMetaByPhoneNumberId("missing")).resolves.toBeNull();
  });
});
