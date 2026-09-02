import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DEFAULT_EVENT_TIMEZONE, normalizeTimezoneValue } from "./timezones.ts";

describe("normalizeTimezoneValue", () => {
  test("default es Ciudad de México", () => {
    assert.equal(DEFAULT_EVENT_TIMEZONE, "America/Mexico_City");
    assert.equal(normalizeTimezoneValue(""), DEFAULT_EVENT_TIMEZONE);
  });

  test("canónica case-insensitive para zonas conocidas", () => {
    assert.equal(normalizeTimezoneValue("america/monterrey"), "America/Monterrey");
  });
});
