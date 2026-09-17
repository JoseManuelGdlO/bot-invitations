import { answerHelp, helpSuggestions } from "../../src/services/help-bot.service.js";

describe("help-bot.service", () => {
  test("helpSuggestions incluye WhatsApp y plantillas de Meta", () => {
    const suggestions = helpSuggestions();
    expect(suggestions.length).toBeGreaterThan(3);
    expect(suggestions.some((item) => /whatsapp/i.test(item))).toBe(true);
    expect(suggestions.some((item) => /plantillas de meta/i.test(item))).toBe(true);
  });

  test("saludo usa el nombre del usuario y menciona WhatsApp", () => {
    const result = answerHelp("hola", { name: "Ana Test" });
    expect(result.reply).toContain("Ana");
    expect(result.reply).toMatch(/whatsapp/i);
  });

  test("match por keywords de importar", () => {
    const result = answerHelp("cómo importo el excel", { name: "Ana" });
    expect(result.title).toMatch(/importar/i);
    expect(result.href).toBe("/eventos");
  });

  test("cómo conecto WhatsApp va a conectar-whatsapp", () => {
    const result = answerHelp("cómo conecto whatsapp", { name: "Ana" });
    expect(result.title).toMatch(/conectar whatsapp/i);
    expect(result.href).toBe("/eventos/whatsapp");
  });

  test("plantillas de Meta van a plantillas-meta", () => {
    const result = answerHelp("plantillas de meta", { name: "Ana" });
    expect(result.title).toMatch(/plantillas de whatsapp/i);
    expect(result.href).toBe("/eventos/plantillas");
    expect(result.reply).not.toMatch(/Planes y límites/);
    expect(result.suggestions).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/whatsapp/i),
        expect.stringMatching(/invitaciones/i),
      ]),
    );
    expect(result.suggestions.some((item) => /plantillas de meta/i.test(item))).toBe(false);
    expect(result.suggestions.some((item) => /creo un evento/i.test(item))).toBe(false);
  });

  test("conectar WhatsApp sugiere el siguiente paso de plantillas", () => {
    const result = answerHelp("cómo conecto whatsapp", { name: "Ana" });
    expect(result.suggestions).toEqual(
      expect.arrayContaining([expect.stringMatching(/plantillas de meta/i)]),
    );
    expect(result.suggestions.some((item) => /conecto whatsapp/i.test(item))).toBe(false);
  });

  test("plantilla en revisión va a plantillas-meta", () => {
    const result = answerHelp("plantilla en revisión", { name: "Ana" });
    expect(result.title).toMatch(/plantillas de whatsapp/i);
    expect(result.href).toBe("/eventos/plantillas");
  });

  test("enviar invitaciones explica Resumen y plantilla Aprobada", () => {
    const result = answerHelp("cómo envío las invitaciones", { name: "Ana" });
    expect(result.title).toMatch(/enviar las invitaciones/i);
    expect(result.reply).toMatch(/Resumen/);
    expect(result.reply).toMatch(/Aprobada/);
    expect(result.reply).not.toMatch(/Conversaciones o Automatización/);
  });

  test("respuestas frecuentes van a faq del evento", () => {
    const result = answerHelp("respuestas frecuentes", { name: "Ana" });
    expect(result.title).toMatch(/respuestas frecuentes del evento/i);
  });

  test("dress code va a faq del evento", () => {
    const result = answerHelp("dress code", { name: "Ana" });
    expect(result.title).toMatch(/respuestas frecuentes del evento/i);
  });

  test("fallback cuando no hay match", () => {
    const result = answerHelp("xyzzy foobar 12345", { name: "Ana" });
    expect(result.reply).toMatch(/no tengo una guía/i);
    expect(result.href).toBe("/eventos/soporte");
  });

  test("cambiar de plan explica Stripe y prorrateo", () => {
    const result = answerHelp("cómo cambio mi plan de pago", { name: "Ana" });
    expect(result.title).toMatch(/cambiar de plan/i);
    expect(result.reply).toMatch(/prorrate/i);
    expect(result.reply).toMatch(/Planes/);
    expect(result.href).toBe("/");
  });

  test("planes incluyen precios y límites", () => {
    const result = answerHelp("qué incluye el plan estudio", { name: "Ana" });
    expect(result.title).toMatch(/planes y límites/i);
    expect(result.reply).toMatch(/500/);
    expect(result.reply).toMatch(/1,?200/);
    expect(result.reply).toMatch(/20\s*%/);
    expect(result.href).toBe("/");
  });

  test("actualizar tarjeta va a suscripción y portal", () => {
    const result = answerHelp("cómo actualizo mi tarjeta", { name: "Ana" });
    expect(result.title).toMatch(/suscripci[oó]n/i);
    expect(result.reply).toMatch(/Actualizar método de pago/);
    expect(result.href).toBe("/eventos/suscripcion");
  });
});
