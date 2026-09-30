import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyFaqDraft,
  createFaqSaveQueue,
  newFaqId,
  settleFaqSave,
  type FaqItem,
  type FaqSaveResult,
} from "./faq-save.ts";

const faq = (id: string, q = id, a = "respuesta"): FaqItem => ({ id, q, a });

test("newFaqId genera un id que el servidor puede conservar", () => {
  const id = newFaqId();
  assert.equal(id.length, 36);
  assert.notEqual(newFaqId(), id);
});

test("applyFaqDraft agrega una pregunta y rechaza el texto vacío", () => {
  const current = [faq("a")];
  assert.equal(applyFaqDraft(current, { editingId: null, q: "  ", a: "x", id: "b" }), null);
  assert.deepEqual(applyFaqDraft(current, { editingId: null, q: " ¿Hora? ", a: "18:00", id: "b" }), [
    faq("a"),
    { id: "b", q: "¿Hora?", a: "18:00" },
  ]);
});

test("applyFaqDraft reemplaza solo la pregunta en edición", () => {
  const current = [faq("a", "vieja", "1"), faq("b", "otra", "2")];
  assert.deepEqual(
    applyFaqDraft(current, { editingId: "a", q: "nueva", a: "3", id: "ignorado" }),
    [faq("a", "nueva", "3"), faq("b", "otra", "2")],
  );
});

test("dos guardados del mismo evento corren en orden y solo el último queda vigente", async () => {
  const calls: string[][] = [];
  let releaseFirst: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const queue = createFaqSaveQueue(async (_eventId: string, faqs: FaqItem[]) => {
    calls.push(faqs.map((item) => item.id));
    if (calls.length === 1) await gate;
    return faqs.map((item) => ({ ...item, q: `srv-${item.id}` }));
  });

  const first = queue.enqueue("boda", [faq("1")]);
  const second = queue.enqueue("boda", [faq("1"), faq("2")]);
  releaseFirst();
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.deepEqual(calls, [["1"], ["1", "2"]]);
  assert.equal(firstResult.ok && firstResult.latest, false);
  assert.equal(secondResult.ok && secondResult.latest, true);
  if (secondResult.ok) {
    assert.deepEqual(
      secondResult.faqs.map((item: FaqItem) => item.q),
      ["srv-1", "srv-2"],
    );
  }
});

test("un fallo anterior no bloquea el guardado siguiente", async () => {
  let attempt = 0;
  const queue = createFaqSaveQueue(async () => {
    attempt += 1;
    if (attempt === 1) throw new Error("db");
    return [faq("2")];
  });

  const first = queue.enqueue("boda", [faq("1")]);
  const second = queue.enqueue("boda", [faq("2")]);
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult.ok, false);
  assert.equal(firstResult.latest, false);
  assert.equal(secondResult.ok, true);
  assert.equal(secondResult.latest, true);
});

test("settleFaqSave aplica la respuesta vigente y conserva la lista si la respuesta es vieja", () => {
  const confirmed = [faq("a")];
  const visible = [faq("a"), faq("b")];
  const stale: FaqSaveResult<FaqItem> = {
    ok: true,
    latest: false,
    faqs: [faq("a", "srv-a")],
  };
  const ignored = settleFaqSave(visible, confirmed, stale);
  assert.deepEqual(ignored.displayed, visible);
  assert.deepEqual(ignored.confirmed, [faq("a", "srv-a")]);
  assert.equal(ignored.notify, "none");

  const fresh: FaqSaveResult<FaqItem> = {
    ok: true,
    latest: true,
    faqs: [faq("a", "srv-a"), faq("b", "srv-b")],
  };
  const applied = settleFaqSave(visible, ignored.confirmed, fresh);
  assert.deepEqual(applied.displayed, fresh.faqs);
  assert.equal(applied.notify, "saved");
});

test("settleFaqSave revierte a lo confirmado cuando falla el último guardado", () => {
  const confirmed = [faq("a", "srv-a")];
  const visible = [faq("a"), faq("b")];
  const failed: FaqSaveResult<FaqItem> = {
    ok: false,
    latest: true,
    error: new Error("db"),
  };
  const settled = settleFaqSave(visible, confirmed, failed);
  assert.deepEqual(settled.displayed, confirmed);
  assert.deepEqual(settled.confirmed, confirmed);
  assert.equal(settled.notify, "error");
});
