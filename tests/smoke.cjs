const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const KEY = "uroko.workspace.v1";
let server, browser, base;
const failures = [];
before(async () => {
  const { createServer } = require("../server.cjs");
  server = createServer({ apiKey: "", accessCode: "", host: "127.0.0.1" });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const executablePath =
    process.env.CHROMIUM_PATH ||
    (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined);
  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox"],
  });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise((resolve) => server.close(resolve));
  assert.deepEqual(failures, [], "No browser JavaScript errors");
});
async function pageFor(t, init) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  t.after(() => context.close());
  const page = await context.newPage();
  page.on("pageerror", (e) => failures.push(e.message));
  if (init) await page.addInitScript(init);
  await page.goto(base);
  return page;
}
async function saved(page) {
  await page.waitForFunction(
    () =>
      document.querySelector("#save-status").textContent ===
      "Сохранено на устройстве",
  );
}
async function data(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
}
async function exportFile(page, action) {
  const result = page.waitForEvent("download");
  await page.locator(`[data-action="${action}"]`).last().click();
  const download = await result;
  return fs.readFileSync(await download.path(), "utf8");
}

test("Примеры, редактирование и сохранение после перезагрузки", async (t) => {
  const page = await pageFor(t);
  assert.equal(await page.locator(".lesson-link").count(), 3);
  await page.locator("#lesson-title").fill("Тригонометрия — первый урок");
  await page.locator('[data-field="grade"]').fill("11 класс");
  await page
    .locator('[data-field="goal"]')
    .fill("Ученик объясняет смысл синуса.");
  await saved(page);
  await page.reload();
  assert.equal(
    await page.locator("#lesson-title").inputValue(),
    "Тригонометрия — первый урок",
  );
  assert.equal(
    await page.locator('[data-field="goal"]').inputValue(),
    "Ученик объясняет смысл синуса.",
  );
  await page.locator("#search").fill("Биология");
  assert.equal(await page.locator(".lesson-link").count(), 1);
  await page.locator(".lesson-link").click();
  assert.equal(
    await page.locator("#lesson-title").inputValue(),
    "Клетка: строение и функции",
  );
});

test("Создание, перестановка, дублирование и удаление этапов", async (t) => {
  const page = await pageFor(t);
  await page.locator('[data-action="new"]').click();
  await page.locator('#new-form [name="title"]').fill("Мой урок");
  await page.getByRole("button", { name: "Создать урок" }).click();
  assert.equal(await page.locator(".lesson-link").count(), 4);
  assert.equal(await page.locator(".stage").count(), 4);
  await page.locator('[data-action="add-stage"]').click();
  const last = page.locator(".stage").last();
  await last.locator('[data-field="stage.title"]').fill("Контрольный вопрос");
  await last.locator('[data-field="stage.minutes"]').fill("10");
  await last.locator('[data-action="move-up"]').click();
  assert.equal(
    await page.locator(".stage-summary-text strong").nth(3).textContent(),
    "Контрольный вопрос",
  );
  await page
    .locator(".stage")
    .nth(3)
    .locator('[data-action="duplicate-stage"]')
    .click();
  assert.equal(await page.locator(".stage").count(), 6);
  const duplicate = page.locator(".stage[open]").last();
  await duplicate.locator('[data-action="delete-stage"]').click();
  await page.locator('[data-action="confirm-delete-stage"]').click();
  assert.equal(await page.locator(".stage").count(), 5);
  await saved(page);
  const state = await data(page);
  const l = state.lessons.find((l) => l.id === state.activeId);
  assert.equal(l.stages[3].title, "Контрольный вопрос");
  assert.equal(l.stages[3].minutes, 10);
});

test("Общий конспект обновляет карту и слайды; личные заметки остаются приватными", async (t) => {
  const page = await pageFor(t);
  await page
    .locator('.stage[open] [data-field="stage.title"]')
    .fill("Уникальный этап");
  await page
    .locator('.stage[open] [data-field="stage.notes"]')
    .fill("Проверяем связи\nВторой учебный вопрос");
  await page.locator('[data-field="notes"]').fill("PRIVATE_TEACHER_NOTE");
  await page.getByRole("tab", { name: "Майнд-карта" }).click();
  assert(
    (await page.locator(".map-surface svg").textContent()).includes(
      "Второй учебный вопрос",
    ),
  );
  await page.locator("[data-map-stage]").first().click();
  assert.equal(
    await page
      .getByRole("tab", { name: "План урока" })
      .getAttribute("aria-selected"),
    "true",
  );
  assert.equal(
    await page.locator('.stage[open] [data-field="stage.title"]').inputValue(),
    "Уникальный этап",
  );
  await page.getByRole("tab", { name: "Презентация" }).click();
  await page.locator(".thumbnail").nth(1).click();
  assert(
    (await page.locator("#slide-preview").textContent()).includes(
      "Второй учебный вопрос",
    ),
  );
  await page.locator("#theme").selectOption("midnight");
  assert.equal(await page.locator("#slide-preview .theme-midnight").count(), 1);
  const html = await exportFile(page, "export-slides");
  assert(!html.includes("PRIVATE_TEACHER_NOTE"));
  await page.locator('[data-action="present"]').click();
  const previous = await page.locator("#presenter-counter").textContent();
  await page.keyboard.press("ArrowRight");
  assert.notEqual(
    await page.locator("#presenter-counter").textContent(),
    previous,
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#presenter").evaluate((d) => d.open), false);
});

test("Экспорт HTML запускается автономно, SVG валиден, печатный план формирует PDF", async (t) => {
  const page = await pageFor(t);
  await page.locator('[data-action="export"]').click();
  const html = await exportFile(page, "export-slides");
  const standalone = await page.context().newPage();
  standalone.on("pageerror", (e) => failures.push(e.message));
  await standalone.setContent(html);
  assert.equal(await standalone.locator(".slide:not([hidden])").count(), 1);
  assert(
    (
      await standalone.locator(".slide:not([hidden]) h2").textContent()
    ).includes("Квадратные уравнения"),
  );
  await standalone.locator("#next").click();
  assert(
    (
      await standalone.locator(".slide:not([hidden]) h2").textContent()
    ).includes("Разминка"),
  );
  await standalone.keyboard.press("ArrowLeft");
  assert(
    (
      await standalone.locator(".slide:not([hidden]) h2").textContent()
    ).includes("Квадратные"),
  );
  await page.locator('[data-action="export"]').click();
  const svg = await exportFile(page, "export-map");
  const xmlValid = await page.evaluate(
    (xml) =>
      !new DOMParser()
        .parseFromString(xml, "image/svg+xml")
        .querySelector("parsererror"),
    svg,
  );
  assert(xmlValid);
  assert(svg.includes("Дискриминант"));
  await page.locator('[data-action="export"]').click();
  const popupPromise = page.context().waitForEvent("page");
  await page.locator('[data-action="export-plan"]').click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  assert(
    (await popup.locator("body").textContent()).includes("Домашнее задание"),
  );
  await popup.evaluate(() => {
    window.print = () => {
      window.didPrint = true;
    };
  });
  await popup.locator("#print").click();
  assert(await popup.evaluate(() => window.didPrint));
  const pdf = await popup.pdf({ format: "A4" });
  assert(pdf.byteLength > 2000);
});

test("JSON переносит уроки без замены существующих; неверный импорт атомарен", async (t) => {
  const page = await pageFor(t);
  await page.locator('[data-action="export"]').click();
  const json = await exportFile(page, "export-lesson");
  const exported = JSON.parse(json);
  assert.equal(exported.lessons.length, 1);
  await page.locator("#import-file").setInputFiles({
    name: "lesson.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await page.waitForFunction(
    () => document.querySelector("#lesson-count").textContent === "4",
  );
  const state = await data(page);
  assert.notEqual(state.activeId, exported.lessons[0].id);
  assert.equal(
    state.lessons[0].stages[0].notes,
    exported.lessons[0].stages[0].notes,
  );
  await page.locator("#import-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from("{broken"),
  });
  await page.waitForFunction(() =>
    document.querySelector("#toast").textContent.includes("Импорт не выполнен"),
  );
  assert.equal(await page.locator(".lesson-link").count(), 4);
  const invalid = JSON.parse(json);
  invalid.lessons[0].stages[0].minutes = -1;
  await page.locator("#import-file").setInputFiles({
    name: "bad-duration.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(invalid)),
  });
  await page.waitForFunction(() =>
    document
      .querySelector("#toast")
      .textContent.includes("Некорректная длительность"),
  );
  assert.equal((await data(page)).lessons.length, 4);
});

test("Пустые длительности не повреждают данные; удаление и копирование урока", async (t) => {
  const page = await pageFor(t);
  await page.locator('[data-field="duration"]').fill("");
  await page.locator("#lesson-title").focus();
  assert.equal(
    await page.locator('[data-field="duration"]').inputValue(),
    "60",
  );
  await page.locator('[data-action="lesson-menu"]').click();
  await page.locator('[data-action="duplicate-lesson"]').click();
  assert.equal(await page.locator(".lesson-link").count(), 4);
  assert(
    (await page.locator("#lesson-title").inputValue()).endsWith("— копия"),
  );
  await page.locator('[data-action="lesson-menu"]').click();
  await page.locator('[data-action="delete-lesson"]').click();
  await page.locator('[data-action="close-modal"]').last().click();
  assert.equal(await page.locator(".lesson-link").count(), 4);
  await page.locator('[data-action="lesson-menu"]').click();
  await page.locator('[data-action="delete-lesson"]').click();
  await page.locator('[data-action="confirm-delete-lesson"]').click();
  assert.equal(await page.locator(".lesson-link").count(), 3);
});

test("Длинные конспекты разбиваются на слайды; HTML-текст безопасен", async (t) => {
  const page = await pageFor(t);
  const attack = '</script><img src=x onerror="window.injected=true">';
  await page.locator("#lesson-title").fill(attack);
  const text = Array.from(
    { length: 18 },
    (_, i) =>
      `Пункт_${i + 1}: длинное объяснение учебной темы, которое должно сохраниться при экспорте.`,
  ).join("\n");
  await page
    .locator('.stage[open] [data-field="stage.notes"]')
    .fill(text + "\n" + attack);
  await page.getByRole("tab", { name: "Презентация" }).click();
  assert((await page.locator(".thumbnail").count()) > 7);
  const html = await exportFile(page, "export-slides");
  const result = await page.context().newPage();
  result.on("pageerror", (e) => failures.push(e.message));
  await result.setContent(html);
  assert.equal(await result.locator("img").count(), 0);
  assert.equal(await result.evaluate(() => window.injected), undefined);
  for (let i = 1; i <= 18; i++)
    assert(
      (await result.locator("body").textContent()).includes(`Пункт_${i}:`),
    );
});

test("Недоступное хранилище отображает ошибку, но позволяет скачать резервную копию", async (t) => {
  const page = await pageFor(t, () => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  assert.equal(
    await page.locator("#save-status").textContent(),
    "Не сохранено",
  );
  await page.locator("#lesson-title").fill("Не потерять этот урок");
  await page.locator('[data-action="export"]').click();
  const json = await exportFile(page, "backup");
  assert.equal(JSON.parse(json).lessons[0].title, "Не потерять этот урок");
});

test("Повреждённые данные сохраняются отдельно перед записью новой версии", async (t) => {
  const page = await pageFor(t, () =>
    localStorage.setItem("uroko.workspace.v1", "{broken"),
  );
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key), KEY),
    "{broken",
  );
  await page.locator("#lesson-title").fill("Новая версия");
  await saved(page);
  assert.equal(
    await page.evaluate((key) => localStorage.getItem(key + ".recovery"), KEY),
    "{broken",
  );
  assert.equal((await data(page)).lessons[0].title, "Новая версия");
});

test("Мобильная вёрстка и клавиатурная навигация вкладок", async (t) => {
  const page = await pageFor(t);
  await page.getByRole("tab", { name: "План урока" }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page
      .getByRole("tab", { name: "Майнд-карта" })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.locator("[data-map-stage]").first().focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .getByRole("tab", { name: "План урока" })
      .getAttribute("aria-selected"),
    "true",
  );
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: 850 });
    for (const name of ["План урока", "Майнд-карта", "Презентация"]) {
      await page.getByRole("tab", { name }).click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
        `${name} fits width ${width}`,
      );
    }
  }
});
