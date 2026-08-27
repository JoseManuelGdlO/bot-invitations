import {
  addDays,
  clampFollowUpDays,
  computeFollowUpDueAt,
  defaultIndecisoFollowUpDate,
  followUpDays,
  FOLLOW_UP_DESCRIPTIONS,
  formatFollowUpDate,
  formatFollowUpWhen,
  INDECISO_NUDGE_DAYS,
  indecisoFollowUpDays,
  isIndecisoFollowUpRule,
  mergeFollowUps,
  normalizeFollowUps,
  parseFollowUpWhen,
  startOfDay,
} from "../../src/services/follow-up.service.js";

describe("follow-up.service", () => {
  test("defaultIndecisoFollowUpDate suma 3 días por defecto", () => {
    const now = new Date(2026, 7, 26, 18, 30, 0);
    const due = defaultIndecisoFollowUpDate(now);
    expect(due).toEqual(addDays(startOfDay(now), INDECISO_NUDGE_DAYS));
    expect(formatFollowUpDate(due)).toBe("29/08/2026");
  });

  test("defaultIndecisoFollowUpDate respeta días custom", () => {
    const now = new Date(2026, 7, 26);
    expect(formatFollowUpDate(defaultIndecisoFollowUpDate(now, 5))).toBe("31/08/2026");
  });

  test("parseFollowUpWhen entiende seguimiento y days del JSON", () => {
    expect(parseFollowUpWhen("3 días después de marcar seguimiento")).toEqual({
      days: 3,
      from: "seguimiento",
    });
    expect(parseFollowUpWhen("7 días después del primer contacto")).toEqual({
      days: 7,
      from: "contactedAt",
    });
    expect(followUpDays({ days: 12, when: "7 días después del primer contacto" })).toBe(12);
    expect(followUpDays({ when: "14 días antes del evento" })).toBe(14);
  });

  test("computeFollowUpDueAt prefiere days y no agenda indeciso en el drip", () => {
    const contactedAt = new Date(2026, 7, 1);
    const due = computeFollowUpDueAt(
      { id: "f2", days: 10, when: "7 días después del primer contacto", active: true },
      { contactedAt, eventDate: "2026-10-01" },
    );
    expect(formatFollowUpDate(due)).toBe("11/08/2026");
    expect(
      computeFollowUpDueAt(
        { id: "indeciso", days: 3, when: "3 días después de marcar seguimiento", active: true },
        { contactedAt, eventDate: "2026-10-01" },
      ),
    ).toBeNull();
  });

  test("indecisoFollowUpDays usa la regla o cae a 3", () => {
    expect(indecisoFollowUpDays([])).toBe(3);
    expect(
      indecisoFollowUpDays([{ id: "indeciso", days: 5, when: "5 días después de marcar seguimiento", active: true }]),
    ).toBe(5);
    expect(isIndecisoFollowUpRule({ id: "indeciso", label: "Recontacto a indecisos" })).toBe(true);
  });

  test("mergeFollowUps inyecta indeciso si falta", () => {
    const merged = mergeFollowUps([{ id: "f2", label: "Primer recordatorio", when: "7 días después del primer contacto", active: true }]);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toEqual(
      expect.objectContaining({ id: "indeciso", days: 3, active: true }),
    );
  });

  test("normalizeFollowUps clampa días y regenera when", () => {
    expect(normalizeFollowUps("nope")).toBeNull();
    expect(clampFollowUpDays(0)).toBe(1);
    expect(clampFollowUpDays(999)).toBe(180);
    const [rule] = normalizeFollowUps([
      { id: "f2", label: "Primer recordatorio", days: 999, when: "texto viejo", active: 1 },
    ]);
    expect(rule).toEqual({
      id: "f2",
      label: "Primer recordatorio",
      description: FOLLOW_UP_DESCRIPTIONS.f2,
      days: 180,
      when: formatFollowUpWhen(180, "contactedAt"),
      active: true,
    });
  });
});
