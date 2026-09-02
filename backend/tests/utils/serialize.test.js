import { jest } from "@jest/globals";

describe("serializeMessage / serializeEvent timezone", () => {
  let serialize;

  beforeEach(async () => {
    jest.resetModules();
    await jest.unstable_mockModule("../../src/services/bot/prompt.service.js", () => ({
      extraInstructions: (value) => value || "",
    }));
    await jest.unstable_mockModule("../../src/services/follow-up.service.js", () => ({
      mergeFollowUps: (value) => value || [],
      normalizeFollowUp: (value) => value,
    }));
    serialize = await import("../../src/utils/serialize.js");
  });

  test("serializeMessage incluye createdAt ISO", () => {
    const message = {
      id: "m1",
      from: "guest",
      text: "hola",
      at: "07:30 p.m.",
      createdAt: new Date("2026-09-02T18:30:00.000Z"),
    };
    expect(serialize.serializeMessage(message)).toEqual({
      id: "m1",
      from: "guest",
      text: "hola",
      at: "07:30 p.m.",
      createdAt: "2026-09-02T18:30:00.000Z",
      kind: null,
    });
  });

  test("serializeMessage incluye kind de plantilla", () => {
    const message = {
      id: "m2",
      from: "ai",
      text: "*Hola*",
      at: "12:00 p.m.",
      createdAt: new Date("2026-09-02T18:00:00.000Z"),
      kind: "template",
    };
    expect(serialize.serializeMessage(message)).toEqual(
      expect.objectContaining({ kind: "template" }),
    );
  });

  test("serializeEvent incluye timezone canónica", () => {
    const event = {
      slug: "boda-ana",
      name: "Boda Ana",
      shortName: "A&C",
      type: "Boda",
      hosts: "Ana",
      date: "2027-01-01",
      time: "18:00",
      timezone: "america/mexico_city",
      venue: "Hacienda",
      address: "",
      estimatedGuests: 100,
      cover: "x",
      status: "activo",
    };
    expect(serialize.serializeEvent(event)).toEqual(
      expect.objectContaining({
        id: "boda-ana",
        timezone: "America/Mexico_City",
      }),
    );
  });
});
