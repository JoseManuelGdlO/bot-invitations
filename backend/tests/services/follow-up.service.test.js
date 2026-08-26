import {
  addDays,
  defaultIndecisoFollowUpDate,
  formatFollowUpDate,
  INDECISO_NUDGE_DAYS,
  startOfDay,
} from "../../src/services/follow-up.service.js";

describe("follow-up.service indeciso", () => {
  test("defaultIndecisoFollowUpDate suma 3 días", () => {
    const now = new Date(2026, 7, 26, 18, 30, 0);
    const due = defaultIndecisoFollowUpDate(now);
    expect(due).toEqual(addDays(startOfDay(now), INDECISO_NUDGE_DAYS));
    expect(formatFollowUpDate(due)).toBe("29/08/2026");
  });
});
