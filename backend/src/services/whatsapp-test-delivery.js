const RECENT_TTL_MS = 15_000;
const recent = new Map();
const waiters = new Map();

function pruneRecent(now = Date.now()) {
  for (const [id, row] of recent) {
    if (row.expiresAt <= now) recent.delete(id);
  }
}

export function resetTestDeliveryWaiters() {
  for (const waiter of waiters.values()) clearTimeout(waiter.timer);
  waiters.clear();
  recent.clear();
}

export function recordTestDeliveryStatus(status = {}) {
  const messageId = String(status.messageId || "").trim();
  const delivery = String(status.status || "").toLowerCase();
  if (!messageId || !delivery) return false;

  const waiter = waiters.get(messageId);
  if (waiter) {
    clearTimeout(waiter.timer);
    waiters.delete(messageId);
    waiter.resolve(status);
    return true;
  }

  pruneRecent();
  recent.set(messageId, { status, expiresAt: Date.now() + RECENT_TTL_MS });
  return false;
}

export function waitForTestDelivery(messageId, timeoutMs = 8000) {
  const id = String(messageId || "").trim();
  if (!id) return Promise.resolve(null);

  pruneRecent();
  const cached = recent.get(id);
  if (cached) {
    recent.delete(id);
    return Promise.resolve(cached.status);
  }

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      resolve(null);
    }, timeoutMs);
    waiters.set(id, {
      resolve: (status) => resolve(status),
      timer,
    });
  });
}
