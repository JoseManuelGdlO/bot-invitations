import { answerHelp, helpSuggestions } from "../../src/services/help-bot.service.js";

describe("help-bot.service", () => {
  test("helpSuggestions no está vacío", () => {
    expect(helpSuggestions().length).toBeGreaterThan(3);
  });

  test("saludo usa el nombre del usuario", () => {
    const result = answerHelp("hola", { name: "Ana Test" });
    expect(result.reply).toContain("Ana");
  });

  test("match por keywords de importar", () => {
    const result = answerHelp("cómo importo el excel", { name: "Ana" });
    expect(result.title).toMatch(/importar/i);
    expect(result.href).toBe("/eventos");
  });

  test("fallback cuando no hay match", () => {
    const result = answerHelp("xyzzy foobar 12345", { name: "Ana" });
    expect(result.reply).toMatch(/no tengo una guía/i);
    expect(result.href).toBe("/eventos/soporte");
  });
});
