const LOCK_RETRY_MS = 250;

const states = new Map();

export function inboundBufferKey(eventId, guestId) {
  return `${eventId}:${guestId}`;
}

function getState(key) {
  let state = states.get(key);
  if (!state) {
    state = {
      texts: [],
      timer: null,
      waiters: [],
      running: false,
      flushFn: null,
      debounceMs: 0,
    };
    states.set(key, state);
  }
  return state;
}

function settleWaiters(waiters, result, error) {
  for (const waiter of waiters) {
    if (error) waiter.reject(error);
    else waiter.resolve(result);
  }
}

export function pushPending(key, text) {
  const state = getState(key);
  state.texts.push(text);
  return state.texts.length;
}

export function pendingCount(key) {
  return states.get(key)?.texts.length || 0;
}

export function hasPending(key) {
  return pendingCount(key) > 0;
}

export function resetInboundBuffers() {
  for (const state of states.values()) {
    if (state.timer) clearTimeout(state.timer);
    settleWaiters(state.waiters, { skipped: true, reason: "reset" }, null);
  }
  states.clear();
}

async function runFlush(key) {
  const state = states.get(key);
  if (!state || state.running) return;
  if (!state.texts.length) {
    const waiters = state.waiters;
    state.waiters = [];
    settleWaiters(waiters, { skipped: true, reason: "empty" }, null);
    return;
  }
  if (typeof state.flushFn !== "function") {
    const waiters = state.waiters;
    state.waiters = [];
    settleWaiters(waiters, { skipped: true, reason: "no_flush" }, null);
    return;
  }

  state.running = true;
  const waitersForThisFlush = state.waiters;
  state.waiters = [];
  const batch = state.texts.slice();
  state.texts = [];
  let deferred = false;
  try {
    const result = await state.flushFn(batch.join("\n"));
    if (result?.deferred) {
      state.texts = [...batch, ...state.texts];
      state.waiters = [...waitersForThisFlush, ...state.waiters];
      deferred = true;
      return;
    }
    settleWaiters(waitersForThisFlush, result, null);
  } catch (error) {
    settleWaiters(waitersForThisFlush, null, error);
  } finally {
    state.running = false;
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (deferred) {
      state.timer = setTimeout(() => {
        state.timer = null;
        void runFlush(key);
      }, LOCK_RETRY_MS);
    } else if (state.texts.length) {
      const delay = Math.max(0, Number(state.debounceMs) || 0);
      state.timer = setTimeout(() => {
        state.timer = null;
        void runFlush(key);
      }, delay);
    }
  }
}

export function armFlush(key, { delayMs, debounceMs, flushFn }) {
  const state = getState(key);
  state.flushFn = flushFn;
  if (debounceMs != null) state.debounceMs = debounceMs;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const promise = new Promise((resolve, reject) => {
    state.waiters.push({ resolve, reject });
  });
  if (state.running) return promise;
  const delay = Math.max(0, Number(delayMs) || 0);
  state.timer = setTimeout(() => {
    state.timer = null;
    void runFlush(key);
  }, delay);
  return promise;
}
