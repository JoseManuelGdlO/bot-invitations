import { createModelsBundle } from "./models.js";

describe("createModelsBundle whatsapp templates", () => {
  test("incluye WhatsappMessageTemplate y EventWhatsappTemplate", () => {
    const models = createModelsBundle();
    expect(models.WhatsappMessageTemplate.create).toEqual(expect.any(Function));
    expect(models.EventWhatsappTemplate.create).toEqual(expect.any(Function));
  });
});
