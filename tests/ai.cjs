const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require("playwright");
const { createServer } = require("../server.cjs");
const { fixtureFetch } = require("./fixtures/provider.cjs");
let browser;
const pageErrors = [];
before(async () => {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox"],
  });
});
after(async () => {
  await browser.close();
  assert.deepEqual(pageErrors, []);
});
async function setup(t, options = {}) {
  const server = createServer({
    host: "127.0.0.1",
    apiKey: "test-only-not-a-real-key",
    accessCode: "",
    fetchImpl: fixtureFetch,
    ...options,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  t.after(() => context.close());
  const page = await context.newPage();
  page.on("pageerror", (e) => pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-action="ai"]').click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#ai-status").textContent.includes("Проверяем"),
  );
  return page;
}
async function choose(page, mode) {
  await page.locator(`[data-action="ai-example"][data-mode="${mode}"]`).click();
}
async function generate(page) {
  await page.locator("#ai-generate").click();
  await page.locator('[data-action="ai-accept"]').waitFor();
}
test("Рекомендации, примеры и урок: сначала просмотр, затем добавление", async (t) => {
  const page = await setup(t);
  assert.equal(await page.locator(".ai-advice li").count(), 5);
  await choose(page, "lesson");
  assert((await page.locator("#ai-prompt").inputValue()).includes("План:"));
  await generate(page);
  assert.equal(await page.locator(".lesson-link").count(), 3);
  assert.equal(await page.locator(".ai-preview-material").count(), 1);
  await page.locator('[data-action="ai-accept"]').click();
  assert.equal(await page.locator(".lesson-link").count(), 4);
  assert.equal(
    await page.locator("#lesson-title").inputValue(),
    "Урок: тестовый материал 1",
  );
  await page.getByRole("tab", { name: "Майнд-карта" }).click();
  assert(
    (await page.locator(".map-surface").textContent()).includes(
      "Тестовый конспект",
    ),
  );
  await page.getByRole("tab", { name: "Презентация" }).click();
  assert((await page.locator(".thumbnail").count()) > 2);
});
test("Серия создаёт независимые уроки и сохраняет их после перезагрузки", async (t) => {
  const page = await setup(t);
  await choose(page, "series");
  await generate(page);
  assert.equal(await page.locator(".ai-preview-material").count(), 3);
  await page.locator('[data-action="ai-accept"]').click();
  assert.equal(await page.locator(".lesson-link").count(), 6);
  await page.reload();
  assert.equal(await page.locator(".lesson-link").count(), 6);
});
test("Программа на год хранит занятия, экспортируется и позволяет раскрыть модуль в урок", async (t) => {
  const page = await setup(t);
  await choose(page, "program");
  await generate(page);
  await page.locator('[data-action="ai-accept"]').click();
  assert(
    (await page.locator("#duration-badge").textContent()).includes(
      "64 занятий",
    ),
  );
  assert.equal(
    await page
      .getByRole("tab", { name: "Программа" })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.match(await page.locator("#timeline").textContent(), /64 из 64 зан/);
  await page.locator('.stage[open] [data-field="stage.sessions"]').fill("2");
  await page.getByRole("tab", { name: "Майнд-карта" }).click();
  assert((await page.locator(".map-surface").textContent()).includes("2 зан."));
  await page.locator('[data-action="export"]').click();
  const pending = page.waitForEvent("download");
  await page.locator('[data-action="export-lesson"]').click();
  const result = await pending;
  const json = JSON.parse(fs.readFileSync(await result.path(), "utf8"));
  assert.equal(json.lessons[0].kind, "program");
  assert.equal(json.lessons[0].stages[0].sessions, 2);
  await page.reload();
  assert.equal(
    await page
      .getByRole("tab", { name: "Программа" })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await page
      .locator('.stage[open] [data-field="stage.sessions"]')
      .inputValue(),
    "2",
  );
  await page.locator('.stage[open] [data-action="ai-module"]').click();
  assert(
    (await page.locator("#ai-prompt").inputValue()).includes(
      "Тестовый модуль 1",
    ),
  );
});
test("Отсутствующий ключ явно отключает генерацию; старый редактор работает", async (t) => {
  const page = await setup(t, { apiKey: "" });
  assert(await page.locator("#ai-generate").isDisabled());
  assert.match(await page.locator("#ai-status").textContent(), /ключ ИИ/);
  await page.locator('[data-action="ai-close"]').click();
  await page.locator("#lesson-title").fill("Ручное редактирование работает");
  await page.waitForFunction(
    () =>
      document.querySelector("#save-status").textContent ===
      "Сохранено на устройстве",
  );
});
test("Неверный код и сбой провайдера не изменяют библиотеку или описание", async (t) => {
  const page = await setup(t, { accessCode: "test-only-access-code" });
  await choose(page, "lesson");
  await page.locator("#ai-generate").click();
  await page.locator("#ai-error:not([hidden])").waitFor();
  assert.match(await page.locator("#ai-error").textContent(), /код доступа/);
  assert.equal(await page.locator(".lesson-link").count(), 3);
  const text = await page.locator("#ai-prompt").inputValue();
  await page.locator(".ai-connection summary").click();
  await page.locator("#ai-access-code").fill("test-only-access-code");
  await generate(page);
  await page.locator('[data-action="ai-back"]').click();
  assert.equal(await page.locator("#ai-prompt").inputValue(), text);
  const failing = await setup(t, {
    fetchImpl: async () => {
      throw new Error("synthetic network failure");
    },
  });
  await choose(failing, "lesson");
  await failing.locator("#ai-generate").click();
  await failing.locator("#ai-error:not([hidden])").waitFor();
  assert.match(
    await failing.locator("#ai-error").textContent(),
    /не смог связаться/,
  );
  assert.equal(await failing.locator(".lesson-link").count(), 3);
});
test("Отмена сохраняет описание; устаревший результат не попадает в библиотеку", async (t) => {
  const page = await setup(t, {
    fetchImpl: async (url, { signal }) =>
      new Promise((resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      ),
  });
  await choose(page, "lesson");
  const text = await page.locator("#ai-prompt").inputValue();
  await page.locator("#ai-generate").click();
  await page.locator("#ai-cancel").click();
  await page.locator("#ai-error:not([hidden])").waitFor();
  assert.match(await page.locator("#ai-error").textContent(), /остановлен/);
  assert.equal(await page.locator("#ai-prompt").inputValue(), text);
  assert.equal(await page.locator(".lesson-link").count(), 3);
  await page.locator('[data-action="ai-close"]').click();
  await page.locator('[data-action="ai"]').click();
  assert.equal(await page.locator("#ai-prompt").inputValue(), text);
});
test("ИИ-форма и программа помещаются на телефоне; неподключённый Pages не притворяется ИИ", async (t) => {
  const page = await setup(t);
  await choose(page, "program");
  for (const width of [320, 375, 768]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(
      await page
        .locator("#ai-dialog")
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
    );
  }
  await generate(page);
  await page.setViewportSize({ width: 320, height: 850 });
  assert.equal(
    await page
      .locator("#ai-dialog")
      .evaluate((el) => el.scrollWidth > el.clientWidth),
    false,
  );
  await page.locator('[data-action="ai-accept"]').click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.route("**/api/ai/status", (route) =>
    route.fulfill({ status: 404, contentType: "text/html", body: "Not Found" }),
  );
  await page.locator('[data-action="ai"]').click();
  await page.waitForFunction(() =>
    document.querySelector("#ai-status").textContent.includes("не найден"),
  );
  assert(await page.locator("#ai-generate").isDisabled());
});
