import { jest } from "@jest/globals";
import http from "node:http";

const META_WEBHOOK_PATH = "/api/webhooks/meta";

async function requestApp(app, path, options = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const url = `http://127.0.0.1:${port}${path}`;
  const res = await fetch(url, options);
  const body = await res.text();
  server.close();
  return { status: res.status, body, headers: res.headers };
}

describe("app meta webhook (público)", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("GET /api/webhooks/meta responde challenge sin autenticación", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const query = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.challenge": "327989990",
      "hub.verify_token": "test-meta-verify-token",
    });
    const { status, body } = await requestApp(app, `${META_WEBHOOK_PATH}?${query}`);
    expect(status).toBe(200);
    expect(body).toBe("327989990");
  });

  test("GET /api/webhooks/meta/webhook es alias público del challenge", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const query = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.challenge": "99",
      "hub.verify_token": "test-meta-verify-token",
    });
    const { status, body } = await requestApp(app, `${META_WEBHOOK_PATH}/webhook?${query}`);
    expect(status).toBe(200);
    expect(body).toBe("99");
  });

  test("GET /api/webhooks/meta sin token válido devuelve 403, no 401", async () => {
    const { createApp } = await import("../src/app.js");
    const app = createApp();
    const query = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.challenge": "123",
      "hub.verify_token": "token-invalido",
    });
    const { status, body } = await requestApp(app, `${META_WEBHOOK_PATH}?${query}`);
    expect(status).toBe(403);
    expect(body).toContain("Challenge de webhook inválido");
  });
});
