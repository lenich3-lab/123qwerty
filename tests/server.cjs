const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("../server.cjs");
const {
  generate,
  validateRequest,
  validateOutput,
} = require("../lib/generation.cjs");
const {
  materials,
  providerResponse,
  fixtureFetch,
} = require("./fixtures/provider.cjs");
const code = "test-only-access-code";
const input = {
  mode: "lesson",
  prompt: "Объяснить квадратные уравнения ученику с пробелами.",
  subject: "Математика",
  grade: "10 класс",
  exam: "ЕГЭ",
  duration: 60,
  count: 1,
};
async function setup(t, options = {}) {
  const server = createServer({
    host: "0.0.0.0",
    apiKey: "test-only-not-a-real-key",
    accessCode: code,
    fetchImpl: fixtureFetch,
    ...options,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const send = (body = input, headers = {}) =>
    fetch(base + "/api/ai/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${code}`,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { base, send };
}
test("Сервер не раскрывает файлы конфигурации и работает без ключа для ручного редактора", async (t) => {
  const { base, send } = await setup(t, { apiKey: "" });
  assert.equal((await fetch(base + "/")).status, 200);
  assert.equal((await fetch(base + "/ai.js")).status, 200);
  for (const route of [
    "/.env",
    "/server.cjs",
    "/lib/generation.cjs",
    "/package.json",
  ])
    assert.equal((await fetch(base + route)).status, 404);
  const status = await (await fetch(base + "/api/ai/status")).json();
  assert.equal(status.configured, false);
  assert.equal(status.reason, "missing_key");
  const response = await send();
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /ключ/);
});
test("Публичный сервер требует код; проверяет Origin, размер и структуру запроса", async (t) => {
  const { base, send } = await setup(t);
  assert.equal((await send(input, { Authorization: "" })).status, 401);
  assert.equal(
    (await send(input, { Origin: "https://untrusted.example" })).status,
    403,
  );
  assert.equal((await send({ ...input, prompt: "мало" })).status, 400);
  assert.equal((await send({ ...input, duration: -1 })).status, 400);
  assert.equal(
    (await send({ ...input, prompt: "Я".repeat(40000) })).status,
    413,
  );
  const response = await send();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).materials.length, 1);
  const disabled = await setup(t, { accessCode: "" });
  assert.equal((await disabled.send()).status, 503);
});
test("CORS разрешает только перечисленный фронтенд и не отправляет ключ в ответах", async (t) => {
  const { base, send } = await setup(t, {
    allowedOrigins: "https://lenich3-lab.github.io",
  });
  const result = await send(input, { Origin: "https://lenich3-lab.github.io" });
  assert.equal(
    result.headers.get("access-control-allow-origin"),
    "https://lenich3-lab.github.io",
  );
  assert(!(await result.text()).includes("test-only-not-a-real-key"));
  const preflight = await fetch(base + "/api/ai/generate", {
    method: "OPTIONS",
    headers: { Origin: "https://lenich3-lab.github.io" },
  });
  assert.equal(preflight.status, 204);
});
test("Контракт OpenAI Responses и все три формата проверены на синтетических ответах", async () => {
  for (const [mode, count] of [
    ["lesson", 1],
    ["series", 3],
    ["program", 64],
  ]) {
    const request = validateRequest({ ...input, mode, count });
    let upstream;
    const result = await generate(request, {
      apiKey: "test-only-not-a-real-key",
      fetchImpl: async (url, init) => {
        upstream = { url, body: JSON.parse(init.body), headers: init.headers };
        return new Response(JSON.stringify(providerResponse(request)), {
          status: 200,
        });
      },
    });
    assert.equal(upstream.url, "https://api.openai.com/v1/responses");
    assert.equal(upstream.body.store, false);
    assert.equal(upstream.body.text.format.type, "json_schema");
    assert.equal(upstream.body.text.format.strict, true);
    assert.equal(
      upstream.headers.Authorization,
      "Bearer test-only-not-a-real-key",
    );
    assert.equal(result.materials.length, mode === "series" ? 3 : 1);
    if (mode === "program")
      assert.equal(
        result.materials[0].stages.reduce((n, s) => n + s.sessions, 0),
        64,
      );
  }
});
test("Неполный ответ, неверный тайминг, отказ и лимиты провайдера не маскируются успехом", async () => {
  const request = validateRequest(input);
  const invalid = materials(request);
  invalid.materials[0].stages[0].minutes++;
  assert.throws(() => validateOutput(invalid, request), /тайминг/);
  for (const [body, pattern] of [
    [{ status: "incomplete", output: [] }, /не завершил/],
    [
      { status: "completed", output: [{ content: [{ type: "refusal" }] }] },
      /не смог/,
    ],
    [
      {
        status: "completed",
        output: [{ content: [{ type: "output_text", text: "not JSON" }] }],
      },
      /формат/,
    ],
  ]) {
    await assert.rejects(
      generate(request, {
        apiKey: "test",
        fetchImpl: async () => new Response(JSON.stringify(body)),
      }),
      pattern,
    );
  }
  for (const status of [401, 429, 500]) {
    await assert.rejects(
      generate(request, {
        apiKey: "test",
        fetchImpl: async () =>
          new Response("provider-secret-do-not-expose", { status }),
      }),
      (error) =>
        !error.message.includes("provider-secret") &&
        error.status === (status === 429 ? 429 : 502),
    );
  }
});
test("Ограничение частоты и таймаут прерывают генерацию", async (t) => {
  const { send } = await setup(t);
  for (let i = 0; i < 8; i++) assert.equal((await send()).status, 200);
  assert.equal((await send()).status, 429);
  let aborted = false;
  const timed = await setup(t, {
    timeoutMs: 20,
    fetchImpl: async (url, { signal }) =>
      new Promise((resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(signal.reason);
          },
          { once: true },
        );
      }),
  });
  const response = await timed.send();
  assert.equal(response.status, 504);
  assert(aborted);
});
