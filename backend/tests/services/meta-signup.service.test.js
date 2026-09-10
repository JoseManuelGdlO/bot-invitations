import { jest } from "@jest/globals";
import { loadWithMocks } from "../helpers/loadWithMocks.js";
import { encryptCredentialsPayload } from "../../src/utils/credentials-crypto.js";

describe("meta-signup.service", () => {
  let service;
  let models;
  let exchangeEmbeddedSignupCode;
  let subscribeWabaApp;
  let listWabaPhoneNumbers;
  let getPhoneNumberDetails;
  let initiateCoexistenceSync;
  let upsertWhatsappMetaCredentials;

  beforeEach(async () => {
    exchangeEmbeddedSignupCode = jest.fn(async () => ({ accessToken: "EAA_TOKEN" }));
    subscribeWabaApp = jest.fn(async () => ({ success: true }));
    listWabaPhoneNumbers = jest.fn(async () => [
      { id: "pn_1", display_phone_number: "+52 618 123 4567", is_on_biz_app: true, platform_type: "CLOUD_API" },
    ]);
    getPhoneNumberDetails = jest.fn(async () => ({
      id: "pn_1",
      display_phone_number: "+52 618 123 4567",
      is_on_biz_app: true,
      platform_type: "CLOUD_API",
    }));
    initiateCoexistenceSync = jest.fn(async () => ({ request_id: "req_1" }));
    upsertWhatsappMetaCredentials = jest.fn(async () => ({
      integration: { id: "wa_meta" },
      hasActiveCredential: true,
    }));

    ({ mod: service, models } = await loadWithMocks("src/services/meta-signup.service.js", {
      extraMocks: {
        "src/services/meta-graph.client.js": () => ({
          exchangeEmbeddedSignupCode,
          subscribeWabaApp,
          unsubscribeWabaApp: jest.fn(),
          listWabaPhoneNumbers,
          getPhoneNumberDetails,
          initiateCoexistenceSync,
        }),
        "src/services/integration-resolver.service.js": () => ({
          META_WHATSAPP_PROVIDER: "meta",
          WHATSAPP_CHANNEL: "whatsapp",
          assertPhoneNumberIdExclusiveToOwner: jest.fn(async () => undefined),
          normalizeMetaCredentials: (payload) => payload,
        }),
        "src/services/whatsapp-meta.service.js": () => ({
          upsertWhatsappMetaCredentials,
        }),
      },
    }));

    models.ChannelIntegration.findOne.mockResolvedValue(null);
    models.ChannelIntegration.create.mockImplementation(async (data) => ({
      id: "int_meta",
      ...data,
      update: jest.fn(async function update(patch) {
        Object.assign(this, patch);
        return this;
      }),
    }));
    models.ChannelCredential.update.mockResolvedValue([1]);
    models.ChannelCredential.create.mockResolvedValue({ id: "cred_meta" });
    models.ChannelCredential.findOne.mockResolvedValue({
      cipherText: encryptCredentialsPayload({ accessToken: "EAA_TOKEN" }),
    });
  });

  test("publicMetaSignupConfig no expone el app secret", () => {
    const config = service.publicMetaSignupConfig();
    expect(config.configured).toBe(true);
    expect(config.appId).toBe("test-meta-app-id");
    expect(config.configId).toBe("test-meta-config-id");
    expect(JSON.stringify(config)).not.toContain("test-meta-app-secret");
  });

  test("completeEmbeddedSignup intercambia el código y guarda la conexión del usuario", async () => {
    const result = await service.completeEmbeddedSignup({
      ownerUserId: "usr_test_1",
      code: "AUTH_CODE",
      wabaId: "waba_1",
      event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING",
    });
    expect(exchangeEmbeddedSignupCode).toHaveBeenCalledWith("AUTH_CODE");
    expect(subscribeWabaApp).toHaveBeenCalledWith("waba_1", "EAA_TOKEN");
    expect(models.ChannelIntegration.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: "usr_test_1",
        provider: "meta",
        phoneNumberId: "pn_1",
        coexistenceEnabled: true,
      }),
    );
    expect(models.ChannelCredential.create).toHaveBeenCalled();
    expect(upsertWhatsappMetaCredentials).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerUserId: "usr_test_1",
        accessToken: "EAA_TOKEN",
        wabaId: "waba_1",
        phoneNumberId: "pn_1",
      }),
    );
    expect(result.coexistenceEnabled).toBe(true);
    expect(initiateCoexistenceSync).toHaveBeenCalled();
  });

  test("completeEmbeddedSignup descubre el número si Meta no mandó phone_number_id", async () => {
    await service.completeEmbeddedSignup({
      ownerUserId: "usr_test_1",
      code: "AUTH_CODE",
      wabaId: "waba_1",
    });
    expect(listWabaPhoneNumbers).toHaveBeenCalledWith("waba_1", "EAA_TOKEN");
    expect(models.ChannelIntegration.create.mock.calls[0][0].phoneNumberId).toBe("pn_1");
  });
});
