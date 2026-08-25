import { guestsToRows, toCsv, toXlsx, toPdf } from "../../src/services/export.service.js";
import { fakeGuest, fakeEvent } from "../helpers/loadWithMocks.js";

describe("export.service", () => {
  const rows = guestsToRows([fakeGuest({ confirmed: 1 })], "boda-ana");

  test("guestsToRows serializa invitados", () => {
    expect(rows[0].rep).toBe("Luis Pérez");
    expect(rows[0].eventId).toBe("boda-ana");
  });

  test("toCsv genera un buffer UTF-8", async () => {
    const buf = await toCsv(rows);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("utf8")).toContain("Luis Pérez");
  });

  test("toXlsx genera un xlsx no vacío", async () => {
    const buf = await toXlsx(rows, "Invitados");
    expect(buf.length).toBeGreaterThan(100);
  });

  test("toPdf genera un PDF no vacío", async () => {
    const buf = await toPdf(fakeEvent(), rows);
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});
