import { formatClock } from "../../src/utils/time.js";

function compactClock(value) {
  return String(value).replace(/\s/g, "").toLowerCase();
}

describe("formatClock", () => {
  const instant = new Date("2026-07-16T18:00:00.000Z");

  test("usa la zona explícita y no la del proceso", () => {
    expect(compactClock(formatClock(instant, "America/Mexico_City"))).toBe("12:00p.m.");
    expect(compactClock(formatClock(instant, "America/Bogota"))).toMatch(/^0?1:00p\.m\.$/);
  });
});
