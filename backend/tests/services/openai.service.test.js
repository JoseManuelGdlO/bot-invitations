import { jest } from "@jest/globals";
import { loadWithMocks } from "../helpers/loadWithMocks.js";

function functionCallResponse(callId) {
  return {
    output_text: "",
    output: [
      {
        type: "function_call",
        call_id: callId,
        name: "actualizar_confirmacion",
        arguments: JSON.stringify({ status: "confirmado", confirmed: 2 }),
      },
    ],
  };
}

function jsonReplyResponse(reply, intent) {
  const raw = JSON.stringify({ reply, intent });
  return {
    output_text: raw,
    output: [{ type: "message", role: "assistant", content: raw }],
  };
}

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

describe("processTurn límite de tools", () => {
  let processTurn;
  let create;
  let executeTool;

  beforeEach(async () => {
    process.env.OPENAI_API_KEY = "sk-test-openai";
    create = jest.fn(async (req) => {
      if (!req.tools?.length) {
        return jsonReplyResponse("¿Me confirmas si podrán acompañarnos?", "desconocido");
      }
      return functionCallResponse(`call_${create.mock.calls.length}`);
    });
    executeTool = jest.fn(async () => ({ success: true }));
    const { mod } = await loadWithMocks("src/services/bot/openai.service.js", {
      extraMocks: {
        openai: () => ({
          default: class OpenAI {
            constructor() {
              this.responses = { create };
            }
          },
        }),
      },
    });
    processTurn = mod.processTurn;
  });

  test("máximo 3 vueltas si el modelo insiste en function calls, y siempre hay reply", async () => {
    const result = await processTurn({
      instructions: "test",
      items: [{ type: "message", role: "user", content: "hola" }],
      executeTool,
    });

    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[0][0].tools?.length).toBeGreaterThan(0);
    expect(create.mock.calls[1][0].tools?.length).toBeGreaterThan(0);
    expect(create.mock.calls[2][0].tools).toBeUndefined();
    expect(executeTool).toHaveBeenCalledTimes(2);
    expect(result.reply).toBe("¿Me confirmas si podrán acompañarnos?");
    expect(result.intent).toBe("desconocido");
    expect(typeof result.reply).toBe("string");
    expect(result.reply.length).toBeGreaterThan(0);
  });
});
