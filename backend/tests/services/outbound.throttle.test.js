import { countInitialConversations, isBulkKind, nextInitialRetryAt, DAY_MS } from "../../src/services/outbound.throttle.js";

describe("outbound.throttle", () => {
  test("isBulkKind reconoce campaña y follow-up", () => {
    expect(isBulkKind("campaign")).toBe(true);
    expect(isBulkKind("follow_up")).toBe(true);
    expect(isBulkKind("reminder")).toBe(true);
    expect(isBulkKind("seguimiento")).toBe(true);
    expect(isBulkKind("reply")).toBe(false);
  });

  test("countInitialConversations solo suma envíos en frío done del owner", () => {
    const since = new Date("2026-01-01T00:00:00.000Z");
    const result = countInitialConversations(
      [
        {
          status: "done",
          updatedAt: new Date("2026-01-01T00:10:00.000Z"),
          payload: { eventId: "evt_a", kind: "campaign", result: { conversationStarted: true } },
        },
        {
          status: "done",
          updatedAt: new Date("2026-01-01T00:20:00.000Z"),
          payload: { eventId: "evt_b", kind: "follow_up", result: { conversationStarted: true } },
        },
        {
          status: "done",
          updatedAt: new Date("2026-01-01T00:25:00.000Z"),
          payload: { eventId: "evt_other", kind: "campaign", result: { conversationStarted: true } },
        },
        {
          status: "done",
          updatedAt: new Date("2026-01-01T00:30:00.000Z"),
          payload: { eventId: "evt_a", kind: "reply", result: { conversationStarted: false } },
        },
      ],
      new Set(["evt_a", "evt_b"]),
      since,
    );
    expect(result.count).toBe(2);
    expect(new Date(result.oldestAt).toISOString()).toBe("2026-01-01T00:10:00.000Z");
  });

  test("countInitialConversations no cuenta failed ni jobs sin conversationStarted", () => {
    const since = new Date("2026-01-01T00:00:00.000Z");
    const result = countInitialConversations(
      [
        {
          status: "failed",
          updatedAt: new Date("2026-01-01T00:30:00.000Z"),
          payload: { eventId: "evt_1", kind: "campaign", result: { conversationStarted: true } },
        },
        {
          status: "done",
          updatedAt: new Date("2026-01-01T00:31:00.000Z"),
          payload: { eventId: "evt_1", kind: "campaign", result: { conversationStarted: true } },
        },
        {
          status: "done",
          updatedAt: new Date("2026-01-01T00:32:00.000Z"),
          payload: { eventId: "evt_1", kind: "campaign" },
        },
      ],
      new Set(["evt_1"]),
      since,
    );
    expect(result.count).toBe(1);
  });

  test("nextInitialRetryAt usa oldest + 24 h", () => {
    const oldestAt = new Date("2026-01-01T00:10:00.000Z");
    expect(nextInitialRetryAt(oldestAt).toISOString()).toBe("2026-01-02T00:10:00.000Z");
  });

  test("nextInitialRetryAt sin oldest suma 24 h a now", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(nextInitialRetryAt(null, now).getTime()).toBe(now.getTime() + DAY_MS);
  });
});
