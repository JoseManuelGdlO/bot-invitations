import { jest } from "@jest/globals";
import {
  allocateBulkSlot,
  isBulkKind,
  nextAllowedAt,
  randomIntervalMs,
  rememberNextGap,
} from "../../src/services/outbound.throttle.js";

describe("outbound.throttle", () => {
  test("randomIntervalMs queda dentro del rango inclusive", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    try {
      expect(randomIntervalMs(15000, 30000)).toBe(15000);
      Math.random.mockReturnValue(0.999999);
      expect(randomIntervalMs(15000, 30000)).toBe(30000);
    } finally {
      Math.random.mockRestore();
    }
  });

  test("nextAllowedAt respeta el gap recordado", () => {
    const ownerId = "owner_gap_1";
    const now = new Date("2026-01-01T00:00:00.000Z");
    const nextAt = new Date("2026-01-01T00:00:20.000Z");
    rememberNextGap(ownerId, nextAt);
    const result = nextAllowedAt({
      now,
      ownerId,
      lastSendAt: null,
      intervalMinMs: 15000,
      intervalMaxMs: 30000,
      isBulk: true,
      bulkCount: 0,
      maxPerHour: 20,
      oldestBulkAt: null,
    });
    expect(result).toEqual({ at: nextAt, reason: "gap" });
  });

  test("nextAllowedAt aplaza masivos por tope horario", () => {
    const oldestBulkAt = new Date("2026-01-01T00:00:00.000Z");
    const now = new Date("2026-01-01T00:30:00.000Z");
    const result = nextAllowedAt({
      now,
      ownerId: "owner_hourly_1",
      lastSendAt: null,
      intervalMinMs: 15000,
      intervalMaxMs: 30000,
      isBulk: true,
      bulkCount: 20,
      maxPerHour: 20,
      oldestBulkAt,
    });
    expect(result.reason).toBe("hourly");
    expect(result.at.toISOString()).toBe("2026-01-01T01:00:00.000Z");
  });

  test("isBulkKind reconoce campaña y follow-up", () => {
    expect(isBulkKind("campaign")).toBe(true);
    expect(isBulkKind("follow_up")).toBe(true);
    expect(isBulkKind("reminder")).toBe(true);
    expect(isBulkKind("reply")).toBe(false);
  });

  test("allocateBulkSlot pone el primero ahora y los siguientes con jitter", () => {
    jest.spyOn(Math, "random").mockReturnValue(0);
    try {
      const now = new Date("2026-01-01T00:00:00.000Z");
      const first = allocateBulkSlot("owner_slot_1", { now, intervalMinMs: 15000, intervalMaxMs: 30000 });
      const second = allocateBulkSlot("owner_slot_1", { now, intervalMinMs: 15000, intervalMaxMs: 30000 });
      expect(first.toISOString()).toBe("2026-01-01T00:00:00.000Z");
      expect(second.getTime() - first.getTime()).toBe(15000);
    } finally {
      Math.random.mockRestore();
    }
  });
});
