import { validateTimezone, resolveEventTimezone, DEFAULT_EVENT_TIMEZONE } from "../../src/utils/timezone.js";

describe("timezone", () => {
  test("default es America/Mexico_City", () => {
    expect(DEFAULT_EVENT_TIMEZONE).toBe("America/Mexico_City");
    expect(resolveEventTimezone()).toBe("America/Mexico_City");
    expect(resolveEventTimezone("")).toBe("America/Mexico_City");
  });

  test("validateTimezone canónica case-insensitive", () => {
    expect(validateTimezone("america/monterrey")).toBe("America/Monterrey");
  });

  test("validateTimezone rechaza zonas inválidas", () => {
    expect(() => validateTimezone("Not/AZone")).toThrow(/Zona horaria inválida/);
  });
});
