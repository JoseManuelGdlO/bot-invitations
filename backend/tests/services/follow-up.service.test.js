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
  isDue,
  isIndecisoFollowUpRule,
  isLaunchFollowUpRule,
  mergeFollowUps,
  nextActiveFollowUpDate,
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

  test("computeFollowUpDueAt ancla f4 a la fecha del evento", () => {
    const due = computeFollowUpDueAt(
      { id: "f4", label: "Último intento", days: 7, when: "7 días antes del evento", active: true },
      { contactedAt: new Date(2026, 7, 1), eventDate: "2026-10-01" },
    );
    expect(formatFollowUpDate(due)).toBe("24/09/2026");
  });

  test("isDue compara solo el día", () => {
    const today = startOfDay(new Date(2026, 7, 27, 18, 0, 0));
    expect(isDue(today, new Date(2026, 7, 27, 9, 0, 0))).toBe(true);
    expect(isDue(addDays(today, 1), today)).toBe(false);
    expect(isDue(addDays(today, -1), today)).toBe(true);
    expect(isDue(null, today)).toBe(false);
  });

  test("nextActiveFollowUpDate ignora f1, indeciso e inactivas", () => {
    const contactedAt = new Date(2026, 7, 1);
    const now = new Date(2026, 7, 10);
    const due = nextActiveFollowUpDate(
      [
        { id: "f1", label: "Primer contacto", days: 1, when: "1 día antes del evento", active: true },
        { id: "f2", label: "Primer recordatorio", days: 7, when: "7 días después del primer contacto", active: true },
        { id: "f3", label: "Segundo recordatorio", days: 14, when: "14 días después del primer contacto", active: false },
        { id: "indeciso", label: "Recontacto a indecisos", days: 3, when: "3 días después de marcar seguimiento", active: true },
      ],
      { contactedAt, eventDate: "2026-08-15", now, alreadySent: [] },
    );
    expect(formatFollowUpDate(due)).toBe("08/08/2026");
    expect(isLaunchFollowUpRule({ id: "f1", label: "Primer contacto" })).toBe(true);
  });

  test("nextActiveFollowUpDate salta reglas ya enviadas", () => {
    const contactedAt = new Date(2026, 7, 1);
    const due = nextActiveFollowUpDate(
      [
        { id: "f2", label: "Primer recordatorio", days: 7, when: "7 días después del primer contacto", active: true },
        { id: "f3", label: "Segundo recordatorio", days: 14, when: "14 días después del primer contacto", active: true },
      ],
      { contactedAt, eventDate: "2026-10-01", now: new Date(2026, 7, 20), alreadySent: ["f2"] },
    );
    expect(formatFollowUpDate(due)).toBe("15/08/2026");
  });

  describe("timing configurado por regla", () => {
    const contactedAt = new Date(2026, 7, 1); // 1 ago
    const eventDate = "2026-09-15"; // 15 sep

    test("f2 vence exactamente en contactedAt + days", () => {
      const rule = { id: "f2", days: 7, when: "7 días después del primer contacto", active: true };
      const due = computeFollowUpDueAt(rule, { contactedAt, eventDate });
      expect(formatFollowUpDate(due)).toBe("08/08/2026");
      expect(isDue(due, new Date(2026, 7, 7))).toBe(false);
      expect(isDue(due, new Date(2026, 7, 8))).toBe(true);
    });

    test("f3 vence exactamente en contactedAt + days", () => {
      const rule = { id: "f3", days: 14, when: "14 días después del primer contacto", active: true };
      const due = computeFollowUpDueAt(rule, { contactedAt, eventDate });
      expect(formatFollowUpDate(due)).toBe("15/08/2026");
      expect(isDue(due, new Date(2026, 7, 14))).toBe(false);
      expect(isDue(due, new Date(2026, 7, 15))).toBe(true);
    });

    test("f4 vence exactamente en eventDate - days", () => {
      const rule = { id: "f4", days: 7, when: "7 días antes del evento", active: true };
      const due = computeFollowUpDueAt(rule, { contactedAt, eventDate });
      expect(formatFollowUpDate(due)).toBe("08/09/2026");
      expect(isDue(due, new Date(2026, 8, 7))).toBe(false);
      expect(isDue(due, new Date(2026, 8, 8))).toBe(true);
    });

    test("days del JSON manda sobre when (f2 a 5 días)", () => {
      const rule = { id: "f2", days: 5, when: "7 días después del primer contacto", active: true };
      const due = computeFollowUpDueAt(rule, { contactedAt, eventDate });
      expect(formatFollowUpDate(due)).toBe("06/08/2026");
      expect(isDue(due, new Date(2026, 7, 5))).toBe(false);
      expect(isDue(due, new Date(2026, 7, 6))).toBe(true);
    });

    test("indeciso agenda hoy + days configurados", () => {
      const now = new Date(2026, 7, 10);
      expect(formatFollowUpDate(defaultIndecisoFollowUpDate(now, 3))).toBe("13/08/2026");
      expect(formatFollowUpDate(defaultIndecisoFollowUpDate(now, 5))).toBe("15/08/2026");
    });
  });
});
