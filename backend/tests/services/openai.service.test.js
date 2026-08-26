import { loadWithMocks } from "../helpers/loadWithMocks.js";

describe("openai.service combineTemplateReply", () => {
  let openai;

  beforeEach(async () => {
    ({ mod: openai } = await loadWithMocks("src/services/bot/openai.service.js"));
  });

  test("concatena la plantilla RSVP con la FAQ extra", () => {
    expect(openai.combineTemplateReply("Perfecto Luis, confirmamos 2.", "El evento es solo para adultos.")).toBe(
      "Perfecto Luis, confirmamos 2.\n\nEl evento es solo para adultos.",
    );
  });

  test("no duplica si no hay extra o es el mismo texto", () => {
    expect(openai.combineTemplateReply("Perfecto Luis, confirmamos 2.", "")).toBe("Perfecto Luis, confirmamos 2.");
    expect(openai.combineTemplateReply("Perfecto Luis, confirmamos 2.", "Perfecto Luis, confirmamos 2.")).toBe(
      "Perfecto Luis, confirmamos 2.",
    );
  });

  test("extraReplyFromResponse lee reply del JSON de la respuesta", () => {
    const extra = openai.extraReplyFromResponse({
      output_text: JSON.stringify({ reply: "Los niños no pueden asistir." }),
    });
    expect(extra).toBe("Los niños no pueden asistir.");
  });
});
