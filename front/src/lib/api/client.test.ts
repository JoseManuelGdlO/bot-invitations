import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { api, getToken, setToken } from "./client.ts";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, String(value));
    },
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("api client auth", () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init?: RequestInit }[] = [];

  beforeEach(() => {
    calls.length = 0;
    globalThis.sessionStorage = memoryStorage();
    globalThis.localStorage = memoryStorage();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("setToken persist false usa sessionStorage", () => {
    setToken("access-session", false);
    assert.equal(sessionStorage.getItem("alanna-access-token"), "access-session");
    assert.equal(sessionStorage.getItem("alanna-remember"), "0");
    assert.equal(localStorage.getItem("alanna-access-token"), null);
    assert.equal(getToken(), "access-session");
  });

  test("setToken persist true usa localStorage y limpia session", () => {
    setToken("old-session", false);
    setToken("access-local", true);
    assert.equal(localStorage.getItem("alanna-access-token"), "access-local");
    assert.equal(localStorage.getItem("alanna-remember"), "1");
    assert.equal(sessionStorage.getItem("alanna-access-token"), null);
    assert.equal(getToken(), "access-local");
  });

  test("api en 401 refresca una vez, guarda access y reintenta", async () => {
    setToken("expired", true);
    const responses = [
      jsonResponse({ error: "Sesión inválida" }, 401),
      jsonResponse({ accessToken: "fresh" }),
      jsonResponse({ ok: true }),
    ];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      const next = responses.shift();
      if (!next) throw new Error("fetch inesperado");
      return next;
    }) as typeof fetch;

    await assert.doesNotReject(async () => {
      assert.deepEqual(await api("/dashboard"), { ok: true });
    });

    assert.equal(calls.length, 3);
    assert.match(calls[1]?.url ?? "", /\/auth\/refresh/);
    assert.equal(calls[1]?.init?.method, "POST");
    assert.equal(calls[1]?.init?.credentials, "include");
    const refreshHeaders = new Headers(calls[1]?.init?.headers);
    assert.equal(refreshHeaders.get("Authorization"), null);
    assert.equal(getToken(), "fresh");
    assert.equal(localStorage.getItem("alanna-access-token"), "fresh");
    const retryHeaders = new Headers(calls[2]?.init?.headers);
    assert.equal(retryHeaders.get("Authorization"), "Bearer fresh");
  });

  test("401 en /auth/login no dispara refresh", async () => {
    setToken("stale", true);
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ error: "Correo o contraseña incorrectos." }, 401);
    }) as typeof fetch;

    await assert.rejects(() => api("/auth/login", { method: "POST", body: JSON.stringify({}) }), (err: unknown) => {
      assert.equal((err as { status?: number }).status, 401);
      return true;
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0]?.url ?? "", /\/auth\/login/);
  });

  test("refresh 401 limpia token y no entra en bucle", async () => {
    setToken("expired", true);
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      if (String(input).includes("/auth/refresh")) {
        return jsonResponse({ error: "Refresh inválido" }, 401);
      }
      return jsonResponse({ error: "Sesión inválida" }, 401);
    }) as typeof fetch;

    await assert.rejects(() => api("/dashboard"), (err: unknown) => {
      assert.equal((err as { status?: number }).status, 401);
      return true;
    });
    assert.equal(calls.length, 2);
    assert.match(calls[1]?.url ?? "", /\/auth\/refresh/);
    assert.equal(getToken(), null);
    assert.equal(localStorage.getItem("alanna-access-token"), null);
  });

  test("401 en paralelo comparte un solo POST /auth/refresh", async () => {
    setToken("expired", true);
    let releaseRefresh: ((value: Response) => void) | undefined;
    const refreshGate = new Promise<Response>((resolve) => {
      releaseRefresh = resolve;
    });

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      const url = String(input);
      if (url.includes("/auth/refresh")) return refreshGate;
      const auth = new Headers(init?.headers).get("Authorization");
      if (auth === "Bearer fresh") return jsonResponse({ ok: true });
      return jsonResponse({ error: "Sesión inválida" }, 401);
    }) as typeof fetch;

    const a = api("/dashboard");
    const b = api("/events");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(calls.filter((c) => c.url.includes("/auth/refresh")).length, 1);
    releaseRefresh?.(jsonResponse({ accessToken: "fresh" }));
    assert.deepEqual(await a, { ok: true });
    assert.deepEqual(await b, { ok: true });
    assert.equal(calls.filter((c) => c.url.includes("/auth/refresh")).length, 1);
  });
});
