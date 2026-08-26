import { loadWithMocks, fakeEvent, fakeGuest } from "../helpers/loadWithMocks.js";

describe("prompt.service", () => {
  let prompt;

  beforeEach(async () => {
    ({ mod: prompt } = await loadWithMocks("src/services/bot/prompt.service.js"));
  });

  test("defaultPrompt interpola personalidad y el árbol de intención", () => {
    const text = prompt.defaultPrompt({
      assistantName: "Renata",
      tone: "Cálido",
      formality: 40,
      emojis: "ninguno",
      length: "cortos",
      rules: ["Sé breve."],
    });
    expect(text).toContain("Eres Renata");
    expect(text).toContain("Tono: Cálido");
    expect(text).toContain("Formalidad: 40%");
    expect(text).toContain("No uses emojis.");
    expect(text).toContain("Sé breve.");
    expect(text).toMatch(/faq/);
    expect(text).toMatch(/asistira/);
    expect(text).toMatch(/no_asistira/);
    expect(text).toMatch(/seguimiento/);
    expect(text).toMatch(/desconocido/);
    expect(text).toMatch(/3 días/);
  });

  test("buildInstructions usa el cerebro guardado y refuerza FAQ / plantillas / tools", () => {
    const text = prompt.buildInstructions({
      event: fakeEvent(),
      guest: fakeGuest({ status: "enviado" }),
      ai: { prompt: "Cerebro custom de Sofía." },
      templates: [{ id: "t9", category: "Seguimiento", title: "Recontacto", body: "¿Ya pudieron confirmar?" }],
      faqs: [{ q: "¿Pueden ir niños?", a: "Solo adultos." }],
      vars: { nombre: "Luis", evento: "Boda Ana" },
    });
    expect(text).toContain("Cerebro custom de Sofía.");
    expect(text).toContain("Aislamiento");
    expect(text).toContain("[Seguimiento] Recontacto");
    expect(text).toContain("¿Pueden ir niños?");
    expect(text).toContain("faq | asistira | no_asistira | seguimiento | desconocido");
    expect(text).toContain("marcar_seguimiento");
    expect(text).toContain("{{nombre}}");
  });

  test("buildInstructions cae a defaultPrompt si el cerebro está vacío", () => {
    const text = prompt.buildInstructions({
      event: fakeEvent(),
      guest: fakeGuest(),
      ai: { prompt: "  ", assistantName: "Luna" },
    });
    expect(text).toContain("Eres Luna");
    expect(text).toContain("no hay FAQs guardadas");
  });
});
