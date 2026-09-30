export type AiPatch = Record<string, unknown>;

export type AiSaveResult<T> = {
  patch: AiPatch;
  ticket: Record<string, number>;
  generations: Record<string, number>;
} & ({ ok: true; ai: T } | { ok: false; error: unknown });

function liveKeys(ticket: Record<string, number>, generations: Record<string, number>) {
  return Object.keys(ticket).filter((key) => generations[key] === ticket[key]);
}

function pick<T extends object>(source: T, keys: string[]): Partial<T> {
  const selected: Partial<T> = {};
  const record = source as Record<string, unknown>;
  for (const key of keys) {
    if (key in record) (selected as Record<string, unknown>)[key] = record[key];
  }
  return selected;
}

/** Aplica solo los campos de este guardado que siguen siendo el último cambio local. */
export function settleAiSave<T extends object>(
  displayed: T,
  confirmed: T,
  result: AiSaveResult<T>,
): { displayed: T; confirmed: T; notify: "error" | "none" } {
  const keys = liveKeys(result.ticket, result.generations);
  if (!result.ok) {
    if (keys.length === 0) return { displayed, confirmed, notify: "none" };
    return {
      displayed: { ...displayed, ...pick(confirmed, keys) },
      confirmed,
      notify: "error",
    };
  }
  if (keys.length === 0) return { displayed, confirmed, notify: "none" };
  const saved = pick(result.ai, keys);
  return {
    displayed: { ...displayed, ...saved },
    confirmed: { ...confirmed, ...saved },
    notify: "none",
  };
}

export function createAiSaveQueue<T>(
  save: (eventId: string, patch: AiPatch) => Promise<T>,
) {
  const generations = new Map<string, Record<string, number>>();
  const pending = new Map<string, AiPatch>();
  const waiters = new Map<string, Array<(result: AiSaveResult<T>) => void>>();
  const running = new Set<string>();
  const scheduled = new Set<string>();

  function bump(eventId: string, patch: AiPatch) {
    const current = { ...(generations.get(eventId) ?? {}) };
    for (const key of Object.keys(patch)) {
      current[key] = (current[key] ?? 0) + 1;
    }
    generations.set(eventId, current);
  }

  function schedule(eventId: string) {
    if (running.has(eventId) || scheduled.has(eventId)) return;
    scheduled.add(eventId);
    queueMicrotask(() => {
      scheduled.delete(eventId);
      void run(eventId);
    });
  }

  async function run(eventId: string) {
    if (running.has(eventId)) return;
    running.add(eventId);
    try {
      while (pending.has(eventId)) {
        const patch = pending.get(eventId)!;
        pending.delete(eventId);
        const atSend = generations.get(eventId) ?? {};
        const ticket: Record<string, number> = {};
        for (const key of Object.keys(patch)) ticket[key] = atSend[key] ?? 0;
        const owned = waiters.get(eventId) ?? [];
        waiters.set(eventId, []);
        let result: AiSaveResult<T>;
        try {
          const ai = await save(eventId, patch);
          result = {
            ok: true,
            ai,
            patch,
            ticket,
            generations: { ...(generations.get(eventId) ?? {}) },
          };
        } catch (error) {
          result = {
            ok: false,
            error,
            patch,
            ticket,
            generations: { ...(generations.get(eventId) ?? {}) },
          };
        }
        for (const resolve of owned) resolve(result);
      }
    } finally {
      running.delete(eventId);
      if (pending.has(eventId)) schedule(eventId);
    }
  }

  return {
    isIdle(eventId: string) {
      return (
        !running.has(eventId) && !scheduled.has(eventId) && !pending.has(eventId)
      );
    },
    enqueue(eventId: string, patch: AiPatch) {
      bump(eventId, patch);
      pending.set(eventId, { ...(pending.get(eventId) ?? {}), ...patch });
      return new Promise<AiSaveResult<T>>((resolve) => {
        const list = waiters.get(eventId) ?? [];
        list.push(resolve);
        waiters.set(eventId, list);
        schedule(eventId);
      });
    },
  };
}
