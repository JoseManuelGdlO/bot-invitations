import http from "node:http";

const META_WEBHOOK_PATH = "/api/webhooks/meta";

async function requestApp(app, path, options = {}) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  try {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}${path}`;
    const res = await fetch(url, options);
    const body = await res.text();
    return { status: res.status, body, headers: res.headers };
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("app meta webhook (público)", () => {
  let app;

  beforeAll(async () => {
    const { createApp } = await import("../src/app.js");
    app = createApp();
  });

  test("GET /api/webhooks/meta responde challenge sin autenticación", async () => {
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
    const query = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.challenge": "123",
      "hub.verify_token": "token-invalido",
    });
    const { status, body } = await requestApp(app, `${META_WEBHOOK_PATH}?${query}`);
    expect(status).toBe(403);
    expect(body).toContain("Challenge de webhook inválido");
  });

  test("POST /api/webhooks/meta sin messages responde 200", async () => {
    const raw = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: { statuses: [] } }] }],
    });
    const { status, body } = await requestApp(app, META_WEBHOOK_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: raw,
    });
    expect(status).toBe(200);
    expect(JSON.parse(body).ok).toBe(true);
  });
});
