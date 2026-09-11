import { jest } from "@jest/globals";
import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";

describe("admin.controller getWhatsappAccessToken", () => {
  test("devuelve el token descifrado del WABA", async () => {
    const getMetaAccessTokenByWabaId = jest.fn(async () => ({
      wabaId: "waba_1",
      ownerUserId: "usr_client",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "+52 618 123 4567",
      accessToken: "EAA_USER_TOKEN",
      source: "channel_credentials",
    }));
    const { mod } = await loadWithMocks("src/controllers/admin.controller.js", {
      extraMocks: {
        "src/services/admin-whatsapp.service.js": () => ({ getMetaAccessTokenByWabaId }),
        "src/services/stripe.service.js": () => ({
          stripeEnabled: () => false,
          ensureStripePrice: jest.fn(),
        }),
      },
    });

    const { res } = await callHandler(mod.getWhatsappAccessToken, {
      req: createMockReq({ params: { wabaId: "waba_1" } }),
    });

    expect(getMetaAccessTokenByWabaId).toHaveBeenCalledWith("waba_1");
    expect(res.json).toHaveBeenCalledWith({
      wabaId: "waba_1",
      ownerUserId: "usr_client",
      phoneNumberId: "10987654321",
      displayPhoneNumber: "+52 618 123 4567",
      accessToken: "EAA_USER_TOKEN",
      source: "channel_credentials",
    });
  });
});
