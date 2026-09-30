export type FaqItem = { id: string; q: string; a: string };

export type FaqSaveResult<T> =
  | { ok: true; latest: boolean; faqs: T[] }
  | { ok: false; latest: boolean; error: unknown };

export function newFaqId() {
  return crypto.randomUUID();
}

export function applyFaqDraft(
  faqs: FaqItem[],
  draft: { editingId: string | null; q: string; a: string; id: string },
): FaqItem[] | null {
  const question = draft.q.trim();
  if (!question) return null;
  if (draft.editingId) {
    return faqs.map((faq) =>
      faq.id === draft.editingId ? { ...faq, q: question, a: draft.a } : faq,
    );
  }
  return [...faqs, { id: draft.id, q: question, a: draft.a }];
}

export function settleFaqSave<T>(
  displayed: T[],
  confirmed: T[],
  result: FaqSaveResult<T>,
): { displayed: T[]; confirmed: T[]; notify: "saved" | "error" | "none" } {
  if (result.ok && result.latest) {
    return { displayed: result.faqs, confirmed: result.faqs, notify: "saved" };
  }
  if (result.ok) {
    return { displayed, confirmed: result.faqs, notify: "none" };
  }
  if (result.latest) {
    return { displayed: confirmed, confirmed, notify: "error" };
  }
  return { displayed, confirmed, notify: "none" };
}

export function createFaqSaveQueue<T>(
  save: (eventId: string, faqs: T[]) => Promise<T[]>,
) {
  const generation = new Map<string, number>();
  const tail = new Map<string, Promise<void>>();

  return {
    enqueue(eventId: string, faqs: T[]): Promise<FaqSaveResult<T>> {
      const ticket = (generation.get(eventId) ?? 0) + 1;
      generation.set(eventId, ticket);
      const previous = tail.get(eventId) ?? Promise.resolve();
      const run = previous.then(async () => {
        const latest = () => generation.get(eventId) === ticket;
        try {
          const saved = await save(eventId, faqs);
          return { ok: true as const, latest: latest(), faqs: saved };
        } catch (error) {
          return { ok: false as const, latest: latest(), error };
        }
      });
      tail.set(
        eventId,
        run.then(
          () => undefined,
          () => undefined,
        ),
      );
      return run;
    },
  };
}
