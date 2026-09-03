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
    expect(text).toContain("MÁS personas que el cupo");
    expect(text).toMatch(/Si NO hay una regla así/);
    expect(text).toContain("CÓMO redactar");
    expect(text).toContain("confirmar asistencia al evento");
  });

  test("defaultPrompt interpola los días de la regla indeciso", () => {
    const text = prompt.defaultPrompt({
      assistantName: "Renata",
      followUps: [{ id: "indeciso", days: 5, when: "5 días después de marcar seguimiento", active: true }],
    });
    expect(text).toMatch(/5 días/);
    expect(text).not.toMatch(/3 días/);
  });

  test("buildInstructions usa defaultPrompt y añade instrucciones extra", () => {
    const text = prompt.buildInstructions({
      event: fakeEvent(),
      guest: fakeGuest({ status: "enviado" }),
      ai: { prompt: "Menciona el valet parking.", assistantName: "Sofía" },
      templates: [
        { id: "t9", category: "Seguimiento", title: "Recontacto", body: "¿Ya pudieron confirmar?" },
        { id: "t3", category: "Confirmación", title: "Cierre", body: "Perfecto {{nombre}}." },
        { id: "t4", category: "Rechazo", title: "Adiós", body: "Gracias {{nombre}}." },
      ],
      faqs: [{ q: "¿Pueden ir niños?", a: "Solo adultos." }],
      vars: { nombre: "Luis", evento: "Boda Ana" },
    });
    expect(text).toContain("Flujo (obligatorio)");
    expect(text).toContain("## Instrucciones extra del evento");
    expect(text).toContain("Menciona el valet parking.");
    expect(text).toContain("Aislamiento");
    expect(text).toContain("[Seguimiento] Recontacto");
    expect(text).toContain("¿Pueden ir niños?");
    expect(text).toContain("faq | asistira | no_asistira | seguimiento | desconocido");
    expect(text).toContain("INMEDIATAMENTE a actualizar_confirmacion");
    expect(text).toContain("marcar_seguimiento");
    expect(text).toContain("{{nombre}}");
    expect(text).toMatch(/Si NO hay una regla así/);
    expect(text).toMatch(/cierre breve y natural/);
    expect(text).not.toMatch(/usar_plantilla con category "Confirmación"/);
    expect(text).not.toContain("[Confirmación]");
    expect(text).not.toContain("[Rechazo]");
  });

  test("buildInstructions cae a defaultPrompt si no hay extras", () => {
    const text = prompt.buildInstructions({
      event: fakeEvent(),
      guest: fakeGuest(),
      ai: { prompt: "  ", assistantName: "Luna" },
    });
    expect(text).toContain("Eres Luna");
    expect(text).not.toContain("## Instrucciones extra del evento");
    expect(text).toContain("no hay FAQs guardadas");
  });

  test("buildInstructions no trata el cerebro de sistema guardado como extras", () => {
    const stored = prompt.defaultPrompt({ assistantName: "Luna" });
    const text = prompt.buildInstructions({
      event: fakeEvent(),
      guest: fakeGuest(),
      ai: { prompt: stored, assistantName: "Luna" },
    });
    expect(text).toContain("Eres Luna");
    expect(text).not.toContain("## Instrucciones extra del evento");
  });

  test("buildInstructions reescribe personalidad desde los knobs en defaultPrompt", () => {
    const text = prompt.buildInstructions({
      event: fakeEvent(),
      guest: fakeGuest(),
      ai: {
        prompt: "Menciona el valet.",
        assistantName: "Camila",
        tone: "Divertido",
        formality: 20,
        emojis: "frecuentes",
        length: "detallados",
      },
    });
    expect(text).toContain("Menciona el valet.");
    expect(text).not.toContain("Personalidad actual (prevalece)");
    expect(text).toContain("Eres Camila");
    expect(text).toContain("Tono: Divertido");
    expect(text).toContain("Formalidad: 20%");
    expect(text).toContain("emojis con naturalidad");
    expect(text).toContain("extenderte un poco");
  });
});
