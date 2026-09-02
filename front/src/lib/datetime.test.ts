import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { formatChatDayLabel, formatMessageTime, getZonedDayKey } from "./datetime.ts";

function compactClock(value: string) {
  return value.replace(/\s/g, "").toLowerCase();
}

describe("formatMessageTime", () => {
  const midday = "2026-07-16T18:00:00.000Z";

  test("formatea el mismo instante según la zona del evento", () => {
    assert.equal(compactClock(formatMessageTime(midday, "America/Mexico_City")), "12:00p.m.");
    assert.match(compactClock(formatMessageTime(midday, "America/Bogota")), /^0?1:00p\.m\.$/);
  });

  test("usa el fallback si no hay fecha", () => {
    assert.equal(formatMessageTime(undefined, "America/Mexico_City", "07:30 p.m."), "07:30 p.m.");
  });
});

describe("formatChatDayLabel", () => {
  const tz = "America/Mexico_City";
  const reference = new Date("2026-09-02T18:00:00.000Z");

  test("etiqueta Hoy y Ayer según la zona del evento", () => {
    assert.equal(formatChatDayLabel("2026-09-02T18:00:00.000Z", tz, reference), "Hoy");
    assert.equal(formatChatDayLabel("2026-09-01T18:00:00.000Z", tz, reference), "Ayer");
  });

  test("getZonedDayKey agrupa por día civil en la zona", () => {
    assert.equal(getZonedDayKey("2026-09-02T05:30:00.000Z", tz), "2026-09-01");
    assert.equal(getZonedDayKey("2026-09-02T06:30:00.000Z", tz), "2026-09-02");
  });
});
