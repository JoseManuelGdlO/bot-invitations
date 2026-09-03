import { defaultFaqs, faqPackForType } from "../../src/utils/defaults.js";

describe("faqPackForType", () => {
  test.each([
    ["Boda", "wedding"],
    ["boda", "wedding"],
    ["XV Años", "party"],
    ["Cumpleaños", "party"],
    ["Aniversario", "party"],
    ["Corporativo", "corporate"],
    ["Otro", "general"],
    ["", "general"],
  ])("%s → %s", (type, pack) => {
    expect(faqPackForType(type)).toBe(pack);
  });
});

describe("defaultFaqs", () => {
  test("boda interpola el venue y usa el pack de wedding", () => {
    const faqs = defaultFaqs("Hacienda Real", "Boda");
    expect(faqs).toHaveLength(5);
    expect(faqs[0].a).toContain("Hacienda Real");
    expect(faqs.map((f) => f.q)).toContain("¿Tienen mesa de regalos?");
  });

  test("XV Años usa el pack de fiesta", () => {
    const faqs = defaultFaqs("Salón Aurora", "XV Años");
    expect(faqs.map((f) => f.q)).toContain("¿Puedo llevar acompañante adicional?");
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
