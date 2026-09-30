import assert from "node:assert/strict";
import { test } from "node:test";
import { createAiSaveQueue, settleAiSave, type AiSaveResult } from "./ai-save.ts";

type Ai = { assistantName: string; botEnabled: boolean; followUpsEnabled: boolean };

const ai = (patch: Partial<Ai> = {}): Ai => ({
  assistantName: "Sofía",
  botEnabled: true,
  followUpsEnabled: true,
  ...patch,
});

test("settleAiSave confirma el apagado que el servidor guardó", () => {
  const result: AiSaveResult<Ai> = {
    ok: true,
    ai: ai({ botEnabled: false }),
    patch: { botEnabled: false },
    ticket: { botEnabled: 1 },
    generations: { botEnabled: 1 },
  };
  const settled = settleAiSave(ai({ botEnabled: false }), ai({ botEnabled: true }), result);
  assert.equal(settled.displayed.botEnabled, false);
  assert.equal(settled.confirmed.botEnabled, false);
  assert.equal(settled.notify, "none");
});

test("una respuesta de otro campo no vuelve a prender el bot", () => {
  const displayed = ai({ assistantName: "Ana", botEnabled: false });
  const confirmed = ai({ assistantName: "Sofía", botEnabled: true });
  const result: AiSaveResult<Ai> = {
    ok: true,
    ai: ai({ assistantName: "Ana", botEnabled: true }),
    patch: { assistantName: "Ana" },
    ticket: { assistantName: 1 },
    generations: { assistantName: 1, botEnabled: 1 },
  };
  const settled = settleAiSave(displayed, confirmed, result);
  assert.equal(settled.displayed.botEnabled, false);
  assert.equal(settled.displayed.assistantName, "Ana");
  assert.equal(settled.confirmed.botEnabled, true);
  assert.equal(settled.confirmed.assistantName, "Ana");
  assert.equal(settled.notify, "none");
});

test("un apagado superado por un cambio más nuevo no pisa el interruptor", () => {
  const displayed = ai({ botEnabled: true });
  const confirmed = ai({ botEnabled: true });
  const result: AiSaveResult<Ai> = {
    ok: true,
    ai: ai({ botEnabled: false }),
    patch: { botEnabled: false },
    ticket: { botEnabled: 1 },
    generations: { botEnabled: 2 },
  };
  const settled = settleAiSave(displayed, confirmed, result);
  assert.equal(settled.displayed.botEnabled, true);
  assert.equal(settled.confirmed.botEnabled, true);
});

test("si falla el último apagado, el switch vuelve al valor confirmado", () => {
  const result: AiSaveResult<Ai> = {
    ok: false,
    error: new Error("red"),
    patch: { botEnabled: false },
    ticket: { botEnabled: 1 },
    generations: { botEnabled: 1 },
  };
  const settled = settleAiSave(ai({ botEnabled: false }), ai({ botEnabled: true }), result);
  assert.equal(settled.displayed.botEnabled, true);
  assert.equal(settled.confirmed.botEnabled, true);
  assert.equal(settled.notify, "error");
});

test("un fallo no revierte campos que el usuario cambió después", () => {
  const displayed = ai({ botEnabled: false, assistantName: "Ana" });
  const confirmed = ai({ botEnabled: true, assistantName: "Sofía" });
  const result: AiSaveResult<Ai> = {
    ok: false,
    error: new Error("red"),
    patch: { botEnabled: false },
    ticket: { botEnabled: 1 },
    generations: { botEnabled: 1, assistantName: 1 },
  };
  const settled = settleAiSave(displayed, confirmed, result);
  assert.equal(settled.displayed.botEnabled, true);
  assert.equal(settled.displayed.assistantName, "Ana");
  assert.equal(settled.notify, "error");
});

test("dos cambios en el mismo instante salen en un solo PATCH", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const queue = createAiSaveQueue(async (_eventId: string, patch: Record<string, unknown>) => {
    calls.push(patch);
    return ai(patch as Partial<Ai>);
  });

  await Promise.all([
    queue.enqueue("boda", { botEnabled: false }),
    queue.enqueue("boda", { assistantName: "Ana" }),
  ]);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { botEnabled: false, assistantName: "Ana" });
  assert.equal(queue.isIdle("boda"), true);
});

test("la respuesta de un guardado anterior no pisa el apagado que salió después", async () => {
  let releaseFirst: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const calls: Array<Record<string, unknown>> = [];
  const queue = createAiSaveQueue(async (_eventId: string, patch: Record<string, unknown>) => {
    calls.push({ ...patch });
    if (calls.length === 1) await gate;
    const enabled = patch["botEnabled"];
    return ai({ ...patch, botEnabled: enabled !== false } as Partial<Ai>);
  });

  const first = queue.enqueue("boda", { assistantName: "Ana" });
  await Promise.resolve();
  const second = queue.enqueue("boda", { botEnabled: false });
  assert.equal(queue.isIdle("boda"), false);
  releaseFirst();
  const [nameResult, toggleResult] = await Promise.all([first, second]);

  assert.deepEqual(calls, [{ assistantName: "Ana" }, { botEnabled: false }]);
  const settled = settleAiSave(
    ai({ assistantName: "Ana", botEnabled: false }),
    ai({ assistantName: "Sofía", botEnabled: true }),
    nameResult,
  );
  assert.equal(settled.displayed.botEnabled, false);
  assert.equal(settled.displayed.assistantName, "Ana");
  assert.equal(toggleResult.ok, true);
  if (toggleResult.ok) assert.equal(toggleResult.ai.botEnabled, false);
  assert.equal(queue.isIdle("boda"), true);
});

test("un fallo no bloquea el guardado siguiente", async () => {
  let attempt = 0;
  const queue = createAiSaveQueue(async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("db");
    return ai({ assistantName: "Ana" });
  });

  const first = queue.enqueue("boda", { botEnabled: false });
  await Promise.resolve();
  const second = queue.enqueue("boda", { assistantName: "Ana" });
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.ok, false);
  assert.equal(secondResult.ok, true);
  const settled = settleAiSave(
    ai({ botEnabled: false, assistantName: "Ana" }),
    ai(),
    firstResult,
  );
  assert.equal(settled.displayed.botEnabled, true);
  assert.equal(settled.displayed.assistantName, "Ana");
  assert.equal(settled.notify, "error");
});
