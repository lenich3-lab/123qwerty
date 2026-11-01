"use strict";

const AI_ENDPOINT_KEY = "uroko.ai.endpoint.v1";
let aiEndpoint = "";
try {
  aiEndpoint = localStorage.getItem(AI_ENDPOINT_KEY) || "";
} catch {}
let aiAccessCode = "";
let aiDraft = null;
let aiCandidates = null;
let aiReady = false;
let aiController;
let aiRequestId = 0;
let aiStatusId = 0;
const aiExamples = {
  lesson:
    "Математика, 10 класс, подготовка к профильному ЕГЭ. Урок 60 минут: квадратные уравнения и дискриминант. Ученик путает знаки и допускает ошибки при подстановке коэффициентов. План: короткая диагностика, наглядное объяснение трёх случаев, совместное решение, самостоятельная практика и рефлексия. Нужны задания с решениями и домашняя работа на 20 минут.",
  series:
    "Русский язык, 11 класс, подготовка к сочинению. Сделайте три последовательных занятия по 60 минут: чтение и позиция автора; логика аргумента; редактирование собственного текста. Ученик уверенно пишет, но теряет связь между тезисом и примером. Для каждого урока нужны цель, конкретные упражнения, обратная связь и домашнее задание. Тексты для анализа подберу сам.",
  program:
    "Математика, 11 класс. Стратегия подготовки к профильному ЕГЭ на весь учебный год: 64 занятия по 60 минут. Начальный уровень: уверенная арифметика, пробелы в алгебре и геометрии. Цель — системно освоить школьную программу и научиться решать типовые задачи. Включите диагностику, последовательные модули по алгебре, функциям, геометрии, вероятности, повторение и контрольные точки. Дайте план самостоятельной работы и варианты адаптации при отставании. Официальные требования и подбор заданий сверю по ФИПИ.",
};
const aiAdvice = [
  [
    "Стратегия на учебный год",
    "Выберите «Программа». Опишите полную программу, срок, количество занятий, стартовый уровень и цель. Укажите диагностику, повторение и контрольные точки.",
    "program",
  ],
  [
    "Один конкретный урок",
    "Выберите «Урок». Напишите тему и желаемый план обычными словами: что объяснить, что потренировать и как проверить понимание.",
    "lesson",
  ],
  [
    "Тема на несколько встреч",
    "Выберите «Серия». Укажите последовательность тем и число занятий — от 2 до 6. Для каждого получится отдельный материал.",
    "series",
  ],
  [
    "Подготовка к ОГЭ / ЕГЭ",
    "Опишите нужные навыки и добавьте действующие требования, если они важны. У ИИ нет доступа к актуальной ФИПИ: проверьте критерии и решения перед уроком.",
  ],
  [
    "Под конкретного ученика",
    "Укажите, что уже получается, где возникают ошибки и какие объяснения помогают. Уровень и пробелы полезнее имени и других личных данных.",
  ],
];
function aiUrl(path) {
  if (!aiEndpoint) return new URL(path.slice(1), document.baseURI).href;
  return aiEndpoint.replace(/\/$/, "") + path;
}
function validateAIEndpoint(value) {
  if (!value.trim()) return "";
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      "Введите полный HTTPS-адрес сервера или оставьте поле пустым.",
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !(
      url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
  )
    throw new Error(
      "Нужен HTTPS-адрес без пароля и параметров. HTTP разрешён только для localhost.",
    );
  return url.href.replace(/\/$/, "");
}
function aiReadDraft() {
  const form = $("#ai-form");
  if (!form || $(".ai-inputs", form)?.disabled) return;
  const data = new FormData(form);
  aiDraft = {
    mode: data.get("mode"),
    prompt: String(data.get("prompt") || ""),
    subject: String(data.get("subject")),
    grade: String(data.get("grade")),
    exam: String(data.get("exam")),
    duration: Number(data.get("duration")),
    count: Number(data.get("count")),
  };
}
function aiModeChanged() {
  const mode = $('#ai-form [name="mode"]:checked').value;
  $("#ai-count-field").hidden = mode === "lesson";
  $("#ai-count-label").textContent =
    mode === "program" ? "Всего занятий за период" : "Занятий в серии";
  const count = $('#ai-form [name="count"]');
  count.min = mode === "series" ? 2 : 1;
  count.max = mode === "series" ? 6 : 200;
  count.value = mode === "program" ? 64 : mode === "series" ? 3 : 1;
  $("#ai-result-hint").textContent =
    mode === "program"
      ? "Получится программа с модулями, распределением занятий, контрольными точками и рекомендациями."
      : mode === "series"
        ? "Получится несколько связанных уроков. Для каждого будут доступны карта и слайды."
        : "Получится план, содержательный конспект и домашнее задание. Карта и слайды соберутся автоматически.";
}
function aiOpen(prefill) {
  if (aiController) aiController.abort();
  aiRequestId++;
  aiCandidates = null;
  const l = current();
  if (prefill || !aiDraft)
    aiDraft = {
      mode: "lesson",
      prompt: prefill || "",
      subject: l.subject,
      grade: l.grade || "10–11 класс",
      exam: l.exam,
      duration: Math.max(10, Math.min(240, l.duration)),
      count: 1,
    };
  aiRenderForm();
  if (!$("#ai-dialog").open) $("#ai-dialog").showModal();
  void aiCheckStatus();
}
function aiHeader() {
  return '<div class="ai-heading"><div><span class="eyebrow">ИЗ ВАШЕЙ ИДЕИ — В ГОТОВЫЙ МАТЕРИАЛ</span><h2 id="ai-title">О чём будет занятие?</h2></div><button class="icon-button" data-action="ai-close" aria-label="Закрыть создание с ИИ">×</button></div>';
}
function aiRenderForm() {
  const d = aiDraft;
  $("#ai-dialog").innerHTML =
    `${aiHeader()}<div class="ai-layout"><section class="ai-work"><form id="ai-form"><fieldset class="ai-inputs"><legend class="sr-only">Описание материала</legend><fieldset class="ai-modes"><legend class="sr-only">Что подготовить</legend>${[
      ["lesson", "Один урок"],
      ["series", "Серия занятий"],
      ["program", "Программа"],
    ]
      .map(
        ([value, text]) =>
          `<label><input type="radio" name="mode" value="${value}" ${d.mode === value ? "checked" : ""}><span>${text}</span></label>`,
      )
      .join(
        "",
      )}</fieldset><div class="ai-meta"><label class="field"><span>Предмет</span><select name="subject">${options(SUBJECTS, d.subject)}</select></label><label class="field"><span>Класс</span><input name="grade" required maxlength="80" value="${esc(d.grade)}"></label><label class="field"><span>Формат</span><select name="exam">${options(["ЕГЭ", "ОГЭ", "Школьная программа"], d.exam)}</select></label></div><div class="ai-numbers"><label class="field"><span>Одно занятие, мин</span><input type="number" name="duration" min="10" max="240" required value="${d.duration}"></label><label class="field" id="ai-count-field"><span id="ai-count-label">Количество занятий</span><input name="count" type="number" min="1" max="200" required value="${d.count}"></label></div><label class="field ai-prompt"><span>Опишите, что хотите подготовить</span><textarea name="prompt" id="ai-prompt" required minlength="20" maxlength="16000" placeholder="Тема, уровень ученика, цель, желаемый ход занятия и особые пожелания…">${esc(d.prompt)}</textarea></label><p id="ai-result-hint" class="ai-result-hint"></p><details class="ai-connection"><summary>Подключение ИИ <span id="ai-connection-indicator">проверяем…</span></summary><p>На сайте с подключённым сервером оставьте адрес пустым. Для GitHub Pages укажите отдельный сервер генерации.</p><label class="field"><span>Адрес сервера</span><input id="ai-endpoint" type="url" placeholder="https://your-uroko-server.example" value="${esc(aiEndpoint)}" autocomplete="off"></label><label class="field"><span>Код доступа, если его настроил владелец</span><input id="ai-access-code" type="password" autocomplete="off" value="${esc(aiAccessCode)}"></label><button type="button" class="button outline" data-action="ai-check">Проверить подключение</button><p>Ключ OpenAI вводится только в настройках сервера. Здесь он не нужен.</p></details></fieldset><p id="ai-status" role="status" class="ai-status">Проверяем подключение…</p><p id="ai-error" role="alert" class="form-error" hidden></p><div class="ai-form-footer"><button type="button" class="button subtle" data-action="ai-example-current">Заполнить пример</button><button type="submit" id="ai-generate" class="button primary" disabled>✦ Подготовить материал</button><button type="button" id="ai-cancel" class="button outline" data-action="ai-cancel" hidden>Остановить</button></div><p class="ai-smallprint">Описание отправляется в OpenAI. Результат сначала появится на просмотре и не заменит текущие уроки. Генерация расходует лимит API владельца сервера.</p></form></section><aside class="ai-advice"><span class="eyebrow">КАК ПОЛУЧИТЬ ПОЛЕЗНЫЙ РЕЗУЛЬТАТ</span><h3>Хороший запрос —<br>половина подготовки.</h3><ol>${aiAdvice.map(([title, body, mode], i) => `<li><span class="advice-number">0${i + 1}</span><div><h4>${title}</h4><p>${body}</p>${mode ? `<button type="button" class="text-button" data-action="ai-example" data-mode="${mode}">Взять пример запроса ↗</button>` : ""}</div></li>`).join("")}</ol></aside></div>`;
  const storedCount = d.count;
  aiModeChanged();
  $('#ai-form [name="count"]').value = storedCount;
  if (d.mode === "lesson") $('#ai-form [name="count"]').value = 1;
}
async function aiCheckStatus() {
  const id = ++aiStatusId;
  aiReady = false;
  const submit = $("#ai-generate");
  if (!submit) return;
  submit.disabled = true;
  const status = $("#ai-status");
  const indicator = $("#ai-connection-indicator");
  status.textContent = "Проверяем подключение…";
  try {
    aiEndpoint = validateAIEndpoint($("#ai-endpoint").value);
    aiAccessCode = $("#ai-access-code").value;
    try {
      if (aiEndpoint) localStorage.setItem(AI_ENDPOINT_KEY, aiEndpoint);
      else localStorage.removeItem(AI_ENDPOINT_KEY);
    } catch {}
    const response = await fetch(aiUrl("/api/ai/status"), {
      signal: AbortSignal.timeout(7000),
      credentials: "omit",
      redirect: "error",
      cache: "no-store",
    });
    if (
      !response.ok ||
      !response.headers.get("content-type")?.includes("application/json")
    )
      throw new Error(
        "На этом адресе сервер ИИ не найден. Для GitHub Pages подключите отдельный сервер в разделе «Подключение ИИ».",
      );
    const result = await response.json();
    if (id !== aiStatusId || !$("#ai-status")) return;
    aiReady = result.configured === true;
    if (!aiReady)
      status.textContent =
        result.reason === "missing_access_code"
          ? "Сервер найден. Владелец должен настроить код доступа для публичной генерации."
          : "Сервер найден, но ключ ИИ ещё не добавлен. Владелец должен подключить OpenAI в настройках сервера.";
    else
      status.textContent = result.requiresAccessCode
        ? "Сервер настроен. Для генерации введите код доступа в разделе подключения."
        : "Сервер настроен. Можно отправить описание.";
    indicator.textContent = aiReady ? "сервер настроен" : "нужно настроить";
    submit.disabled = !aiReady;
  } catch (error) {
    if (id !== aiStatusId || !$("#ai-status")) return;
    status.textContent =
      error.name === "TypeError" || error.name === "TimeoutError"
        ? "Не удалось связаться с сервером ИИ. Проверьте адрес и разрешение подключения этого сайта на сервере."
        : error.message;
    indicator.textContent = "не подключено";
  }
}
function aiSetBusy(busy) {
  $(".ai-inputs").disabled = busy;
  $("#ai-generate").disabled = busy || !aiReady;
  $("#ai-generate").textContent = busy
    ? "Готовим материал…"
    : "✦ Подготовить материал";
  $("#ai-cancel").hidden = !busy;
}
async function aiGenerate(event) {
  event.preventDefault();
  if (!aiReady || aiController) return;
  aiReadDraft();
  const request = {
    ...aiDraft,
    count: aiDraft.mode === "lesson" ? 1 : aiDraft.count,
  };
  aiAccessCode = $("#ai-access-code").value;
  try {
    aiEndpoint = validateAIEndpoint($("#ai-endpoint").value);
  } catch (error) {
    $("#ai-error").textContent = error.message;
    $("#ai-error").hidden = false;
    return;
  }
  const requestId = ++aiRequestId;
  const controller = new AbortController();
  aiController = controller;
  const timer = setTimeout(() => controller.abort(), 105000);
  $("#ai-error").hidden = true;
  aiSetBusy(true);
  $("#ai-status").textContent =
    "ИИ составляет материал. Обычно это занимает от нескольких секунд до минуты. Можно остановить запрос.";
  try {
    const response = await fetch(aiUrl("/api/ai/generate"), {
      method: "POST",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(aiAccessCode ? { Authorization: `Bearer ${aiAccessCode}` } : {}),
      },
      body: JSON.stringify(request),
    });
    const result = await response.json().catch(() => {
      throw new Error(
        "Сервер вернул неподходящий ответ. Проверьте подключение ИИ.",
      );
    });
    if (!response.ok)
      throw new Error(
        result.error || "Не удалось подготовить материал. Повторите позже.",
      );
    if (requestId !== aiRequestId) return;
    const expected = request.mode === "series" ? request.count : 1;
    if (
      !Array.isArray(result.materials) ||
      result.materials.length !== expected
    )
      throw new Error(
        "Сервер вернул неполный набор материалов. Библиотека не изменена.",
      );
    aiCandidates = result.materials.map((item) =>
      validateLesson(
        {
          ...item,
          id: uid(),
          theme: "lavender",
          updatedAt: new Date().toISOString(),
          stages: item.stages.map((s) => ({ ...s, id: uid() })),
        },
        true,
      ),
    );
    if (
      aiCandidates.some(
        (l) =>
          l.kind !== (request.mode === "program" ? "program" : "lesson") ||
          l.stages.reduce((sum, s) => sum + unitCount(s, l), 0) !==
            targetCount(l),
      )
    )
      throw new Error(
        "Тайминг или формат ответа не согласован. Библиотека не изменена.",
      );
    aiRenderPreview();
  } catch (error) {
    if (requestId !== aiRequestId || !$("#ai-error")) return;
    $("#ai-error").textContent =
      error.name === "AbortError"
        ? "Запрос остановлен или истекло время ожидания. Материалы не добавлены."
        : error.name === "TypeError"
          ? "Не удалось связаться с сервером. Описание сохранено в этом окне — попробуйте ещё раз."
          : String(error.message).slice(0, 500);
    $("#ai-error").hidden = false;
    $("#ai-status").textContent = "Библиотека не изменена.";
  } finally {
    clearTimeout(timer);
    if (aiController === controller) aiController = null;
    if ($("#ai-generate") && requestId === aiRequestId) aiSetBusy(false);
  }
}
function aiRenderPreview() {
  $("#ai-dialog").innerHTML =
    `<div class="ai-heading"><div><span class="eyebrow">ЧЕРНОВИК ОТ ИИ</span><h2 id="ai-title">Материал готов к просмотру</h2></div><button class="icon-button" data-action="ai-close" aria-label="Закрыть просмотр">×</button></div><p class="ai-preview-note">Проверьте объяснения, решения и актуальные требования экзамена. Это редактируемый черновик, а не проверенный банк заданий.</p><div class="ai-preview">${aiCandidates.map((l) => `<article class="ai-preview-material"><div class="ai-preview-meta"><span class="subject-badge">${isProgram(l) ? "Программа" : "Урок"}</span><span>${esc(l.subject)} · ${esc(l.grade)} · ${isProgram(l) ? `${l.totalSessions} занятий` : `${l.duration} мин`}</span></div><h3>${esc(l.title)}</h3><p>${esc(l.goal)}</p>${l.stages.map((s) => `<details><summary>${esc(s.title)} <span>${unitText(s, l)}</span></summary><p>${esc(s.notes)}</p></details>`).join("")}<details><summary>Самостоятельная работа и рекомендации</summary><p>${esc(l.homework)}</p><p>${esc(l.notes)}</p></details></article>`).join("")}</div><div class="ai-preview-footer"><button class="button outline" data-action="ai-back">← Уточнить описание</button><button class="button primary" data-action="ai-accept">Добавить в библиотеку (${aiCandidates.length}) →</button></div>`;
}
function aiAccept() {
  if (!aiCandidates?.length) return;
  if (state.lessons.length + aiCandidates.length > 100)
    return notify(
      "Недостаточно места в библиотеке: максимум 100 материалов. Сохраните копию и удалите ненужные.",
    );
  const materials = aiCandidates;
  aiCandidates = null;
  state.lessons.unshift(...materials);
  state.activeId = materials[0].id;
  openedStage = null;
  slideIndex = 0;
  $("#search").value = "";
  saveNow();
  setView("plan");
  render();
  $("#ai-dialog").close();
  notify(
    `Добавлено материалов: ${materials.length}. Их можно редактировать как обычные уроки.`,
  );
}
Object.assign(actions, {
  ai: () => aiOpen(),
  "ai-close": () => $("#ai-dialog").close(),
  "ai-check": () => void aiCheckStatus(),
  "ai-cancel": () => aiController?.abort(),
  "ai-back": () => {
    aiCandidates = null;
    aiRenderForm();
    void aiCheckStatus();
  },
  "ai-accept": aiAccept,
  "ai-example": (button) => {
    const mode = button.dataset.mode;
    $(`#ai-form [name="mode"][value="${mode}"]`).checked = true;
    aiModeChanged();
    $("#ai-prompt").value = aiExamples[mode];
    $('#ai-form [name="subject"]').value =
      mode === "series" ? "Русский язык" : "Математика";
    $('#ai-form [name="grade"]').value =
      mode === "lesson" ? "10 класс" : "11 класс";
    $('#ai-form [name="exam"]').value = "ЕГЭ";
    $('#ai-form [name="duration"]').value = 60;
    aiReadDraft();
    $("#ai-prompt").focus();
  },
  "ai-example-current": () =>
    actions["ai-example"]({
      dataset: { mode: $('#ai-form [name="mode"]:checked').value },
    }),
  "ai-module": (button) => {
    const l = current();
    const s = l.stages.find(
      (s) => s.id === button.closest("[data-stage-id]").dataset.stageId,
    );
    aiOpen(
      `Подготовьте отдельный урок по модулю «${s.title}» из программы «${l.title}».\nЦель программы: ${l.goal}\nСодержание модуля: ${s.notes}\nУчтите, что на весь модуль отведено ${s.sessions} занятий. Этот урок — вводное занятие модуля. Включите объяснения, конкретные задания с ответами и домашнюю работу.`.slice(
        0,
        16000,
      ),
    );
  },
});
$("#ai-dialog").addEventListener("submit", (event) => {
  if (event.target.id === "ai-form") void aiGenerate(event);
});
$("#ai-dialog").addEventListener("change", (event) => {
  if (event.target.name === "mode") {
    aiModeChanged();
    aiReadDraft();
  }
  if (event.target.id === "ai-endpoint") {
    aiReady = false;
    $("#ai-generate").disabled = true;
    $("#ai-status").textContent =
      "Адрес изменён. Нажмите «Проверить подключение».";
  }
});
$("#ai-dialog").addEventListener("close", () => {
  aiReadDraft();
  aiRequestId++;
  aiStatusId++;
  aiController?.abort();
  aiController = null;
});
