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

describe("processTurn con ventana de 24 horas abierta", () => {
  const REMINDER = "Hola Delsy, ¿pudiste revisar la invitación? Nos encantaría contar contigo el 2026-11-19 ✨";
  let processTurn;
  let create;
  let executeTool;

  beforeEach(async () => {
    process.env.OPENAI_API_KEY = "sk-test-openai";
    create = jest.fn();
    executeTool = jest.fn(async (call) => {
      if (call.name === "actualizar_confirmacion") {
        return { success: true, status: "confirmado", confirmed: 4 };
      }
      if (call.name === "usar_plantilla") {
        return { success: true, useAsReply: true, text: REMINDER, category: "Recordatorio" };
      }
      return { success: false };
    });
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

  function turnWith(reply, intent, calls = []) {
    const raw = JSON.stringify({ reply, intent });
    return {
      output_text: raw,
      output: [
        ...calls,
        { type: "message", role: "assistant", content: raw },
      ],
    };
  }

  test("los 4 por favor guarda el RSVP y no manda el recordatorio", async () => {
    const close = "Listo, Delsy. Quedan confirmadas 4 personas. Los esperamos.";
    create.mockResolvedValueOnce(
      turnWith(close, "asistira", [
        {
          type: "function_call",
          call_id: "rsvp",
          name: "actualizar_confirmacion",
          arguments: JSON.stringify({ status: "confirmado", confirmed: 4 }),
        },
        {
          type: "function_call",
          call_id: "tpl",
          name: "usar_plantilla",
          arguments: JSON.stringify({ category: "Recordatorio", id: null }),
        },
      ]),
    );
    const result = await processTurn({
      instructions: "test",
      items: [{ type: "message", role: "user", content: "los 4 por favor" }],
      executeTool,
      context: { windowOpen: true },
    });
    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "actualizar_confirmacion" }),
    );
    expect(result.reply).toBe(close);
    expect(result.reply).not.toContain("¿pudiste revisar la invitación?");
    expect(result.fromTemplate).toBeFalsy();
  });

  test("una duda de ubicación no va precedida del recordatorio", async () => {
    const where = "La fiesta es en el salón La Cantera. El mapa es https://maps.example/cantera";
    create.mockResolvedValueOnce(
      turnWith(where, "faq", [
        {
          type: "function_call",
          call_id: "tpl",
          name: "usar_plantilla",
          arguments: JSON.stringify({ category: "Recordatorio", id: null }),
        },
      ]),
    );
    const result = await processTurn({
      instructions: "test",
      items: [{ type: "message", role: "user", content: "me puedes enviar la ubi" }],
      executeTool,
      context: { windowOpen: true },
    });
    expect(result.reply).toBe(where);
    expect(result.reply.startsWith("Hola Delsy, ¿pudiste revisar la invitación?")).toBe(false);
    expect(result.fromTemplate).toBeFalsy();
  });
});
