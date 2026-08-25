import { createWhatsAppProvider, StubWhatsAppProvider } from "../../src/services/whatsapp.adapter.js";

describe("whatsapp.adapter", () => {
  test("el provider actual es stub y marca skipped", async () => {
    const provider = createWhatsAppProvider();
    expect(provider).toBeInstanceOf(StubWhatsAppProvider);
    const result = await provider.sendMessage("5511111111", "Hola");
    expect(result.provider).toBe("stub");
    expect(result.skipped).toBe(true);
  });
});
