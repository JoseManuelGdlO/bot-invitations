import { callHandler, createMockReq, loadWithMocks } from "../helpers/controller.js";

describe("help.controller", () => {
  test("suggestions", async () => {
    const { mod } = await loadWithMocks("src/controllers/help.controller.js");
    const { res } = await callHandler(mod.suggestions);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ suggestions: expect.any(Array) }));
  });

  test("chat 400 si el mensaje es muy largo", async () => {
    const { mod } = await loadWithMocks("src/controllers/help.controller.js");
    const { res } = await callHandler(mod.chat, {
      req: createMockReq({ body: { message: "a".repeat(501) } }),
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("chat responde una guía", async () => {
    const { mod } = await loadWithMocks("src/controllers/help.controller.js");
    const { res } = await callHandler(mod.chat, {
      req: createMockReq({ body: { message: "cómo creo un evento" } }),
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ reply: expect.any(String) }));
  });
});
