import { defaultFaqs, faqPackForType, mergeConversationRules } from "../../src/utils/defaults.js";

describe("faqPackForType", () => {
  test.each([
    ["Boda", "boda"],
    ["boda", "boda"],
    ["XV Años", "cumpleanos"],
    ["Cumpleaños", "cumpleanos"],
    ["Aniversario", "cumpleanos"],
    ["Corporativo", "corporativo"],
    ["Otro", "general"],
    ["", "general"],
  ])("%s → %s", (type, pack) => {
    expect(faqPackForType(type)).toBe(pack);
  });
});

describe("defaultFaqs", () => {
  test("boda interpola el venue y usa el pack de boda", () => {
    const faqs = defaultFaqs("Hacienda Real", "Boda");
    expect(faqs).toHaveLength(5);
    expect(faqs[0].a).toContain("Hacienda Real");
    expect(faqs.map((f) => f.q)).toContain("¿Tienen mesa de regalos?");
  });

  test("XV Años usa el pack de cumpleanos", () => {
    const faqs = defaultFaqs("Salón Aurora", "XV Años");
    expect(faqs).toHaveLength(3);
    expect(faqs.map((f) => f.q)).toEqual([
      "¿Cuál es la ubicación?",
      "¿Cuál es el código de vestimenta?",
      "¿Habrá estacionamiento?",
    ]);
    expect(faqs[0].a).toContain("Salón Aurora");
  });

  test("corporativo usa el pack de negocios", () => {
    const faqs = defaultFaqs("Hotel W", "Corporativo");
    expect(faqs.map((f) => f.q)).toContain("¿Cómo valido mi acceso al llegar?");
  });

  test("tipo desconocido usa el pack general", () => {
    const faqs = defaultFaqs("Jardín", "Brunch");
    expect(faqs.map((f) => f.q)).toContain("¿Puedo llevar acompañantes?");
    expect(faqs[0].a).toContain("Jardín");
  });
});

describe("mergeConversationRules", () => {
  test("la regla de inyectar plantilla no vuelve y el cierre queda en conversación", () => {
    const rules = mergeConversationRules([
      "Si confirma o decline con claridad, usa las tools y la plantilla; no parafrasees el cierre.",
      "Si confirma o decline con claridad, usa actualizar_confirmacion y escribe el cierre en reply; no uses plantilla de Confirmación ni Rechazo.",
      "Si es FAQ, responde solo con las FAQs o plantillas de información; si no hay dato, no inventes y ofrece pasar al equipo.",
      "Sé breve.",
    ]);
    const text = rules.join("\n");
    expect(text).not.toMatch(/usa las tools y la plantilla/);
    expect(text).not.toMatch(/plantilla de Confirmación/);
    expect(text).not.toMatch(/plantillas de información/);
    expect(text).toMatch(/mensaje genérico de confirmación/);
    expect(rules).toContain("Sé breve.");
  });
});
