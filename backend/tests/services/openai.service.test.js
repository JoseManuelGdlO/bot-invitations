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
      output_text: JSON.stringify({ reply: "Los niños no pueden asistir.", intent: "faq" }),
    });
    expect(extra).toBe("Los niños no pueden asistir.");
  });

  test("itemsToChat conserva el JSON crudo del schema", () => {
    const raw = JSON.stringify({ reply: "Te escribo más adelante.", intent: "seguimiento" });
    expect(openai.itemsToChat([{ type: "message", role: "assistant", content: raw }])).toEqual([
      { role: "assistant", text: raw },
    ]);
  });

  test("buildPlaygroundLogs resume intent, FAQ y tools", () => {
    expect(
      openai.buildPlaygroundLogs({
        intent: "faq",
        tools: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "intent", value: "faq" }),
        expect.objectContaining({ kind: "faq" }),
      ]),
    );
    expect(
      openai.buildPlaygroundLogs({
        intent: "asistira",
        tools: [
          {
            name: "actualizar_confirmacion",
            arguments: { status: "confirmado", confirmed: 2 },
            result: { success: true },
          },
          {
            name: "usar_plantilla",
            arguments: { category: "Confirmación" },
            result: { category: "Confirmación", title: "Cierre sí" },
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "intent", value: "asistira" }),
        expect.objectContaining({ kind: "tool", label: "actualizar_confirmacion" }),
        expect.objectContaining({ kind: "template", value: "Confirmación" }),
      ]),
    );
  });
});
