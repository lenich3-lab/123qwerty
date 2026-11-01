"use strict";

const STORAGE_KEY = "uroko.workspace.v1";
const SUBJECTS = [
  "Математика",
  "Русский язык",
  "Биология",
  "История",
  "Обществознание",
  "Физика",
  "Химия",
  "Информатика",
  "География",
  "Литература",
  "Английский язык",
  "Другой предмет",
];
const TONES = ["#9b82dc", "#73a99a", "#d6a569", "#7f9ccf", "#c28ba9"];
const LIGHTS = ["#f0eafc", "#eaf4f0", "#fbf2e5", "#edf2fb", "#f8edf3"];
const TYPES = [
  "Знакомство с темой",
  "Проверка знаний",
  "Теория",
  "Практика",
  "Подготовка к экзамену",
  "Рефлексия",
];
const $ = (selector, root = document) => root.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const uid = () =>
  window.crypto?.randomUUID?.() ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const stage = (title, minutes, type, notes) => ({
  id: uid(),
  title,
  minutes,
  type,
  notes,
});
let view = "plan";
let slideIndex = 0;
let zoom = 65;
let toastTimer;
let saveTimer;
let saved = true;
let recoveryWarning = "";
let damagedRaw = null;
let openedStage;

function template(kind = "blank") {
  const base = {
    id: uid(),
    title: "Новый урок",
    subject: "Математика",
    grade: "10–11 класс",
    exam: "ЕГЭ",
    duration: 60,
    goal: "",
    homework: "",
    notes: "",
    theme: "lavender",
    stages: [],
    updatedAt: new Date().toISOString(),
  };
  if (kind === "math")
    return {
      ...base,
      title: "Квадратные уравнения",
      goal: "Ученик различает случаи D > 0, D = 0 и D < 0 и самостоятельно решает квадратные уравнения.",
      homework:
        "Решить: x² − 7x + 10 = 0; x² + 4x + 4 = 0; 2x² − 3x − 2 = 0. Проверить корни подстановкой.",
      notes:
        "Попросить ученика проговаривать каждый шаг. Если возникают ошибки со знаками, вернуться к подстановке коэффициентов.",
      stages: [
        stage(
          "Разминка и проверка базы",
          5,
          "Проверка знаний",
          "Что называют квадратным уравнением?\nНайдите a, b и c в уравнении 2x² − 3x + 1 = 0.\nВспомним, как возводить отрицательное число в квадрат.",
        ),
        stage(
          "Дискриминант: три возможных случая",
          12,
          "Теория",
          "D = b² − 4ac\nD > 0: два различных действительных корня.\nD = 0: один действительный корень. D < 0: действительных корней нет.\nx = (−b ± √D) / (2a)",
        ),
        stage(
          "Решаем вместе",
          18,
          "Практика",
          "x² − 5x + 6 = 0: D = 1, корни 2 и 3.\nx² − 6x + 9 = 0: D = 0, корень 3.\nx² + 2x + 5 = 0: D = −16, действительных корней нет.",
        ),
        stage(
          "Самостоятельная практика",
          20,
          "Подготовка к экзамену",
          "Решите: 2x² − 7x + 3 = 0.\nПроверьте найденные корни подстановкой.\nОбъясните, почему при D < 0 нет действительных корней.",
        ),
        stage(
          "Подводим итоги",
          5,
          "Рефлексия",
          "Как определить число действительных корней?\nГде было сложнее всего?\nУченик формулирует алгоритм решения своими словами.",
        ),
      ],
    };
  if (kind === "russian")
    return {
      ...base,
      title: "Сочинение: от чтения к аргументу",
      subject: "Русский язык",
      goal: "Ученик формулирует позицию автора и подкрепляет своё мнение понятным аргументом.",
      homework:
        "По выбранному тексту сформулировать позицию автора и написать один аргумент с пояснением.",
      notes:
        "Подобрать исходный текст заранее. Требования и критерии оценивания сверять с актуальными материалами ФИПИ.",
      stages: [
        stage(
          "Читаем и замечаем",
          10,
          "Знакомство с темой",
          "Читаем подготовленный текст.\nО чём размышляет автор?\nКакие слова помогают увидеть его отношение?",
        ),
        stage(
          "Позиция автора",
          15,
          "Теория",
          "Различаем тему текста и позицию автора.\nФормулируем позицию одним-двумя предложениями.\nПодтверждаем формулировку фрагментом текста.",
        ),
        stage(
          "Своя позиция и аргумент",
          25,
          "Практика",
          "Формулируем собственное отношение к позиции автора.\nПодбираем уместный пример и объясняем его связь с мыслью.\nПроверяем, нет ли логического скачка.",
        ),
        stage(
          "Редактируем и обсуждаем",
          10,
          "Рефлексия",
          "Читаем написанное вслух.\nПроверяем ясность формулировок и связность.\nОпределяем, что улучшить в следующей работе.",
        ),
      ],
    };
  if (kind === "biology")
    return {
      ...base,
      title: "Клетка: строение и функции",
      subject: "Биология",
      goal: "Ученик связывает строение основных органоидов с их функциями и сравнивает растительную и животную клетки.",
      homework:
        "Составить таблицу: органоид → строение → функция. Привести три отличия растительной клетки от животной.",
      notes: "Подготовить две схемы клеток без подписей.",
      stages: [
        stage(
          "Что мы уже знаем о клетке",
          10,
          "Проверка знаний",
          "Почему клетку называют структурной единицей живого?\nПодпишите знакомые части клетки на схеме.",
        ),
        stage(
          "Органоиды и их функции",
          20,
          "Теория",
          "Ядро хранит основную часть наследственной информации эукариотической клетки.\nРибосомы участвуют в синтезе белка.\nМитохондрии участвуют в клеточном дыхании и синтезе АТФ.",
        ),
        stage(
          "Сравниваем клетки",
          20,
          "Практика",
          "Найдите общие структуры растительной и животной клеток.\nОбъясните роль клеточной стенки и хлоропластов.\nСвяжите наличие крупных вакуолей с их функциями.",
        ),
        stage(
          "Проверяем понимание",
          10,
          "Рефлексия",
          "Как связаны строение органоида и его функция?\nОбъясните одну связь своими словами.\nКакие вопросы остались?",
        ),
      ],
    };
  base.stages = [
    stage("Начало урока", 5, "Знакомство с темой", ""),
    stage("Новая тема", 20, "Теория", ""),
    stage("Практика", 30, "Практика", ""),
    stage("Итоги и обратная связь", 5, "Рефлексия", ""),
  ];
  return base;
}

function validateLesson(item, freshIds = false) {
  if (
    !item ||
    typeof item !== "object" ||
    !Array.isArray(item.stages) ||
    item.stages.length > 40
  )
    throw new Error("Некорректная структура урока.");
  const text = (value, max = 20000) => {
    if (typeof value !== "string" || value.length > max)
      throw new Error("Некорректный текст в файле.");
    return value;
  };
  const integer = (value, max) => {
    if (!Number.isInteger(value) || value < 1 || value > max)
      throw new Error("Некорректная длительность.");
    return value;
  };
  const lesson = {
    id: freshIds ? uid() : text(item.id, 120),
    title: text(item.title, 180),
    subject: text(item.subject, 80),
    grade: text(item.grade, 80),
    exam: text(item.exam, 40),
    duration: integer(item.duration, 480),
    goal: text(item.goal),
    homework: text(item.homework),
    notes: text(item.notes),
    theme: ["lavender", "sage", "midnight"].includes(item.theme)
      ? item.theme
      : "lavender",
    updatedAt:
      typeof item.updatedAt === "string"
        ? item.updatedAt.slice(0, 60)
        : new Date().toISOString(),
    stages: item.stages.map((s) => ({
      id: freshIds ? uid() : text(s.id, 120),
      title: text(s.title, 180),
      type: text(s.type, 80),
      minutes: integer(s.minutes, 240),
      notes: text(s.notes),
    })),
  };
  if (
    !lesson.id ||
    lesson.stages.some((s) => !s.id) ||
    new Set(lesson.stages.map((s) => s.id)).size !== lesson.stages.length
  )
    throw new Error("Повторяющиеся или пустые идентификаторы.");
  return lesson;
}

function load() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (
        parsed.version !== 1 ||
        !Array.isArray(parsed.lessons) ||
        !parsed.lessons.length ||
        parsed.lessons.length > 100
      )
        throw new Error("Формат данных не поддерживается.");
      const lessons = parsed.lessons.map((x) => validateLesson(x));
      if (new Set(lessons.map((x) => x.id)).size !== lessons.length)
        throw new Error("Повторяющиеся уроки.");
      return {
        version: 1,
        lessons,
        activeId: lessons.some((x) => x.id === parsed.activeId)
          ? parsed.activeId
          : lessons[0].id,
      };
    }
  } catch {
    damagedRaw = raw || null;
    recoveryWarning =
      "Не удалось прочитать сохранённые данные. Открыты примеры. Старые данные не изменены; перед работой проверьте резервную копию.";
  }
  const lessons = [template("math"), template("russian"), template("biology")];
  return { version: 1, lessons, activeId: lessons[0].id };
}

let state = load();
const current = () => state.lessons.find((x) => x.id === state.activeId);
function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
  }, 5500);
}
function saveNow() {
  clearTimeout(saveTimer);
  try {
    if (damagedRaw) {
      localStorage.setItem(`${STORAGE_KEY}.recovery`, damagedRaw);
      damagedRaw = null;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    saved = true;
  } catch {
    saved = false;
    notify(
      "Не удалось сохранить на устройстве. Скачайте резервную копию через «Экспорт».",
    );
  }
  updateSaveStatus();
}
function updateSaveStatus() {
  $("#save-status").textContent = saved
    ? "Сохранено на устройстве"
    : "Не сохранено";
  $("#save-status").classList.toggle("failed", !saved);
}
function changed() {
  current().updatedAt = new Date().toISOString();
  saved = false;
  $("#save-status").textContent = "Сохраняем…";
  $("#save-status").classList.remove("failed");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 350);
}
function lines(value) {
  return String(value)
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
}
function lessonName(lesson = current()) {
  return lesson.title.trim() || "Без названия";
}
function slug(value) {
  return (
    value
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 90) || "Урок"
  );
}
function renderLibrary() {
  const term = $("#search").value.trim().toLocaleLowerCase("ru");
  const lessons = state.lessons.filter((x) =>
    `${x.title} ${x.subject} ${x.grade}`.toLocaleLowerCase("ru").includes(term),
  );
  $("#lesson-count").textContent = state.lessons.length;
  $("#lesson-list").innerHTML =
    lessons
      .map(
        (l) =>
          `<button class="lesson-link ${l.id === state.activeId ? "active" : ""}" data-action="select-lesson" data-id="${esc(l.id)}" ${l.id === state.activeId ? 'aria-current="page"' : ""}><span class="lesson-icon" aria-hidden="true">▤</span><span><strong>${esc(lessonName(l))}</strong><small>${esc(l.subject)} · ${l.duration} мин</small></span></button>`,
      )
      .join("") ||
    '<p class="no-results">Уроки не найдены.<br>Попробуйте другой запрос.</p>';
}
function renderMetadata() {
  const l = current();
  $("#subject-badge").textContent = l.subject;
  $("#level-badge").textContent = l.grade || "Класс не указан";
  $("#duration-badge").textContent = `${l.duration} минут`;
  $("#exam-badge").textContent = l.exam;
}
function render() {
  $("#lesson-title").value = current().title;
  document.title = `${lessonName()} — Уроко`;
  renderLibrary();
  renderMetadata();
  renderView();
  updateSaveStatus();
}
function setView(next) {
  view = next;
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  $("#view-panel").setAttribute("aria-labelledby", `tab-${view}`);
  renderView();
}
function field(label, name, value, kind = "input", extra = "") {
  const attr = `data-field="${name}" ${extra} ${extra.includes('type="number"') ? "required" : ""}`;
  return `<label class="field"><span>${label}</span>${kind === "textarea" ? `<textarea ${attr}>${esc(value)}</textarea>` : `<input ${attr} value="${esc(value)}">`}</label>`;
}
function options(values, chosen) {
  return [...new Set([...values, chosen])]
    .filter(Boolean)
    .map((x) => `<option ${chosen === x ? "selected" : ""}>${esc(x)}</option>`)
    .join("");
}
function renderSummary() {
  const l = current();
  const total = l.stages.reduce((sum, s) => sum + s.minutes, 0);
  const container = $("#timeline");
  if (!container) return;
  container.innerHTML = `<div class="timeline-label"><span>Распределение времени</span><strong class="${total > l.duration ? "over-time" : ""}">${total} из ${l.duration} мин${total > l.duration ? " · больше плана" : total < l.duration ? ` · резерв ${l.duration - total} мин` : " · всё по плану"}</strong></div><div class="timeline-track">${l.stages.map((s, i) => `<span class="timeline-segment" style="flex:${s.minutes};--tone:${TONES[i % 5]}" title="${esc(s.title)}: ${s.minutes} мин"></span>`).join("")}${total < l.duration ? `<span style="flex:${l.duration - total}"></span>` : ""}</div><div class="timeline-legend">${l.stages
    .slice(0, 5)
    .map((s, i) => `<span style="--tone:${TONES[i % 5]}">${esc(s.type)}</span>`)
    .join("")}</div>`;
  const count = $("#stage-count");
  if (count) count.textContent = l.stages.length;
}
function stageHTML(s, i) {
  return `<details class="stage" data-stage-id="${esc(s.id)}" style="--tone:${TONES[i % 5]};--light:${LIGHTS[i % 5]}" ${openedStage === s.id || (!openedStage && i === 0) ? "open" : ""}><summary><span class="stage-number">${String(i + 1).padStart(2, "0")}</span><span class="stage-summary-text"><strong>${esc(s.title || "Без названия")}</strong><small>${esc(s.type)}</small></span><span class="stage-duration">${s.minutes} мин</span><span class="chevron" aria-hidden="true">⌄</span></summary><div class="stage-body"><div class="stage-fields">${field("Название этапа", "stage.title", s.title, "input", 'maxlength="180"')}${field("Минуты", "stage.minutes", s.minutes, "input", 'type="number" min="1" max="240"')}</div><label class="field"><span>Тип этапа</span><select data-field="stage.type">${options(TYPES, s.type)}</select></label>${field("Конспект и задания", "stage.notes", s.notes, "textarea", 'maxlength="20000" placeholder="Каждая новая строка — отдельная мысль или задание…"')}<span class="field-hint">Эти строки появятся на майнд-карте и в презентации.</span><div class="stage-actions"><button class="mini-button" data-action="move-up" aria-label="Поднять этап" ${i === 0 ? "disabled" : ""}>↑</button><button class="mini-button" data-action="move-down" aria-label="Опустить этап" ${i === current().stages.length - 1 ? "disabled" : ""}>↓</button><button class="mini-button" data-action="duplicate-stage">Дублировать</button><button class="mini-button danger delete-stage" data-action="delete-stage">Удалить</button></div></div></details>`;
}
function renderPlan() {
  const l = current();
  return `<div class="plan-layout"><section><div class="section-heading"><h2>Сценарий урока <small><span id="stage-count">${l.stages.length}</span> этапов</small></h2><span>От первого вопроса до результата</span></div><div class="timeline" id="timeline"></div><div id="stages">${l.stages.map(stageHTML).join("") || '<div class="empty-state">Пока нет этапов.<br>Добавьте первый — с него начнётся ваш урок.</div>'}</div><button class="add-stage" data-action="add-stage">＋ Добавить этап урока</button></section><aside class="inspector" aria-label="Настройки и заметки урока"><section class="card"><h2><span aria-hidden="true">⌑</span> Параметры урока</h2><label class="field"><span>Предмет</span><select data-field="subject">${options(SUBJECTS, l.subject)}</select></label><div class="details-row">${field("Класс", "grade", l.grade, "input", 'maxlength="80"')}<label class="field"><span>Формат</span><select data-field="exam">${options(["ЕГЭ", "ОГЭ", "Школьная программа"], l.exam)}</select></label></div>${field("Продолжительность, мин", "duration", l.duration, "input", 'type="number" min="1" max="480"')}</section><section class="card"><h2><span aria-hidden="true">◎</span> Цель урока</h2>${field("Что ученик сможет после урока?", "goal", l.goal, "textarea", 'maxlength="20000" class="goal-input" placeholder="Конкретный результат…"')}</section><section class="card"><h2><span aria-hidden="true">⌂</span> Домашнее задание</h2>${field("Закрепляем материал", "homework", l.homework, "textarea", 'maxlength="20000" placeholder="Задания для самостоятельной работы…"')}</section><section class="card"><h2><span aria-hidden="true">✎</span> Заметки для себя</h2>${field("В презентацию не попадут", "notes", l.notes, "textarea", 'maxlength="20000" placeholder="Что подготовить или учесть…"')}</section><div class="preparation-note"><strong>План уже становится материалом</strong>Переключитесь на карту, чтобы увидеть связи, или на слайды, чтобы провести урок.</div></aside></div>`;
}

function wrap(value, width) {
  const result = [];
  for (const paragraph of String(value).split("\n")) {
    let row = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (row && row.length + word.length + 1 > width) {
        result.push(row);
        row = "";
      }
      if (word.length > width) {
        if (row) {
          result.push(row);
          row = "";
        }
        for (let i = 0; i < word.length; i += width)
          result.push(word.slice(i, i + width));
      } else row += (row ? " " : "") + word;
    }
    if (row) result.push(row);
  }
  return result.length ? result : [""];
}
function mapSVG() {
  const l = current();
  const nodes = l.stages.map((s, i) => {
    const title = wrap(s.title || "Без названия", 34);
    const body = wrap(s.notes || "Добавьте конспект в плане урока", 49);
    return {
      s,
      i,
      title,
      body,
      height: 66 + title.length * 20 + body.length * 18,
    };
  });
  const left = nodes.filter((_, i) => i % 2 === 0),
    right = nodes.filter((_, i) => i % 2 === 1);
  const sideHeight = (side) => side.reduce((sum, n) => sum + n.height + 30, 0);
  const rootLines = wrap(lessonName(), 20);
  const rootHeight = Math.max(132, 60 + rootLines.length * 23);
  const height = Math.max(
    520,
    sideHeight(left) + 50,
    sideHeight(right) + 50,
    rootHeight + 80,
  );
  const center = height / 2;
  let connectors = "",
    boxes = "";
  for (const [side, x, edge] of [
    [left, 35, 425],
    [right, 1015, 1015],
  ]) {
    let y = (height - sideHeight(side) + 30) / 2;
    for (const node of side) {
      const { s, i, title, body } = node;
      const cy = y + node.height / 2;
      const rootX = x < 500 ? 575 : 865;
      connectors += `<path d="M${rootX},${center} C${(rootX + edge) / 2},${center} ${(rootX + edge) / 2},${cy} ${edge},${cy}" fill="none" stroke="${TONES[i % 5]}" stroke-width="2" opacity=".65"/>`;
      boxes += `<g class="map-node" role="button" tabindex="0" data-map-stage="${esc(s.id)}" aria-label="Изменить этап: ${esc(s.title)}"><title>${esc(s.title)} — перейти к редактированию</title><rect x="${x}" y="${y}" width="390" height="${node.height}" rx="13" fill="white" stroke="#e7e2f0"/><rect x="${x}" y="${y}" width="5" height="${node.height}" rx="2" fill="${TONES[i % 5]}"/><text x="${x + 22}" y="${y + 26}" font-family="system-ui,sans-serif" font-size="11" fill="${TONES[i % 5]}">${String(i + 1).padStart(2, "0")} · ${esc(s.type)} · ${s.minutes} мин</text><text font-family="system-ui,sans-serif" font-size="17" font-weight="600" fill="#4a435c">${title.map((t, k) => `<tspan x="${x + 22}" y="${y + 53 + k * 20}">${esc(t)}</tspan>`).join("")}</text><text class="map-note" font-family="system-ui,sans-serif" font-size="12" fill="#7c8091">${body.map((t, k) => `<tspan x="${x + 22}" y="${y + 75 + (title.length - 1) * 20 + k * 18}">${esc(t)}</tspan>`).join("")}</text></g>`;
      y += node.height + 30;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 ${height}" width="1440" height="${height}" aria-label="Майнд-карта: ${esc(lessonName())}"><title>${esc(lessonName())}</title><rect width="1440" height="${height}" fill="#fbfaff"/>${connectors}<rect x="575" y="${center - rootHeight / 2}" width="290" height="${rootHeight}" rx="18" fill="#8060cc"/><text class="map-root-text" fill="white" font-family="system-ui,sans-serif" font-weight="600" font-size="21" text-anchor="middle">${rootLines.map((t, i) => `<tspan x="720" y="${center - (rootLines.length * 23) / 2 + 12 + i * 23}">${esc(t)}</tspan>`).join("")}</text>${boxes}${nodes.length ? "" : '<text x="720" y="450" text-anchor="middle" fill="#9a8eac" font-family="system-ui,sans-serif">Добавьте этапы в плане урока</text>'}</svg>`;
}
function renderMap() {
  return `<div class="view-heading"><div><h2>От общей темы к деталям</h2><p>Все этапы и конспект — на одной карте. Нажмите на ветку, чтобы изменить её в плане.</p></div><div class="view-tools"><div class="zoom-control"><button data-action="zoom-out" aria-label="Уменьшить карту">−</button><output id="zoom-value">${zoom}%</output><button data-action="zoom-in" aria-label="Увеличить карту">＋</button><button data-action="zoom-fit" aria-label="Вписать карту">↔</button></div><button class="button outline" data-action="export-map">↓ SVG</button></div></div><div class="map-board"><div class="map-surface">${mapSVG()}</div></div>`;
}
function applyZoom() {
  const svg = $(".map-surface svg");
  if (!svg) return;
  const box = svg.viewBox.baseVal;
  svg.style.width = `${(1440 * zoom) / 100}px`;
  svg.style.height = `${(box.height * zoom) / 100}px`;
  $("#zoom-value").textContent = `${zoom}%`;
}

function chunks(text, max = 290) {
  const parts = wrap(text, 80);
  const result = [];
  let group = [];
  let size = 0;
  for (const part of parts) {
    if (group.length && (size + part.length > max || group.length >= 4)) {
      result.push(group);
      group = [];
      size = 0;
    }
    group.push(part);
    size += part.length;
  }
  if (group.length) result.push(group);
  return result.length ? result : [[]];
}
function deck() {
  const l = current();
  const slides = [];
  const add = (title, text, kicker, kind = "bullets") => {
    chunks(text).forEach((body, i) =>
      slides.push({
        title: title + (i ? " · продолжение" : ""),
        body,
        kicker,
        kind,
      }),
    );
  };
  add(
    lessonName(),
    l.goal || "Разберём тему, потренируемся и проверим понимание.",
    `${l.subject} · ${l.grade} · ${l.exam}`,
    "intro",
  );
  l.stages.forEach((s, i) =>
    add(
      s.title || "Без названия",
      s.notes || "Обсудим этот этап вместе.",
      `Этап ${i + 1} · ${s.minutes} мин`,
    ),
  );
  if (l.homework.trim())
    add("Практика после урока", l.homework, "Домашнее задание");
  return slides;
}
function slideHTML(slide, index, total, l = current()) {
  return `<section class="slide theme-${esc(l.theme)} ${slide.title.length > 80 ? "long-title" : ""}" aria-label="Слайд ${index + 1} из ${total}"><div class="slide-kicker">${esc(slide.kicker)}</div><h2>${esc(slide.title)}</h2>${slide.kind === "intro" ? `<p>${esc(slide.body.join("\n"))}</p>` : `<ul>${slide.body.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`}<div class="slide-footer"><span>Уроко · ${esc(l.subject)}</span><span>${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span></div></section>`;
}
function renderSlides() {
  const slides = deck();
  slideIndex = Math.max(0, Math.min(slideIndex, slides.length - 1));
  return `<div class="view-heading"><div><h2>Материал, готовый к показу</h2><p>Слайды собраны из плана. Меняйте текст в плане — презентация обновится.</p></div><div class="view-tools"><select id="theme" class="theme-picker" aria-label="Тема презентации"><option value="lavender" ${current().theme === "lavender" ? "selected" : ""}>Лаванда</option><option value="sage" ${current().theme === "sage" ? "selected" : ""}>Шалфей</option><option value="midnight" ${current().theme === "midnight" ? "selected" : ""}>Вечер</option></select><button data-action="present" class="button primary">▷ Начать показ</button></div></div><div class="slides-layout"><nav class="slide-thumbnails" aria-label="Слайды презентации">${slides.map((s, i) => `<button class="thumbnail ${i === slideIndex ? "active" : ""}" data-action="select-slide" data-index="${i}" aria-label="Слайд ${i + 1}: ${esc(s.title)}" ${i === slideIndex ? 'aria-current="true"' : ""}><div class="thumbnail-canvas"><strong>${esc(s.title)}</strong><small>${esc(s.kicker)}</small></div><span>${String(i + 1).padStart(2, "0")} / ${slides.length}</span></button>`).join("")}</nav><div><div id="slide-preview">${slideHTML(slides[slideIndex], slideIndex, slides.length)}</div><div class="slide-pagination"><button class="button outline" data-action="previous-slide" ${slideIndex === 0 ? "disabled" : ""} aria-label="Предыдущий слайд">←</button><span>${slideIndex + 1} из ${slides.length}</span><button class="button outline" data-action="next-slide" ${slideIndex === slides.length - 1 ? "disabled" : ""} aria-label="Следующий слайд">→</button><button class="button subtle" data-action="export-slides">↓ HTML</button></div><div class="slide-note"><strong>Только материал для ученика</strong>Личные заметки репетитора не включаются в слайды. Длинный конспект автоматически делится на несколько слайдов.</div></div></div>`;
}
function renderView() {
  $("#view-panel").innerHTML =
    view === "plan"
      ? renderPlan()
      : view === "map"
        ? renderMap()
        : renderSlides();
  if (view === "plan") renderSummary();
  if (view === "map") applyZoom();
}

function modal(title, content, footer = "") {
  const dialog = $("#modal");
  dialog.innerHTML = `<div class="modal-heading"><h2 id="modal-title">${title}</h2><button data-action="close-modal" aria-label="Закрыть диалог">×</button></div>${content}${footer}`;
  if (!dialog.open) dialog.showModal();
}
function closeModal() {
  $("#modal").close();
}
function newDialog() {
  if (state.lessons.length >= 100)
    return notify(
      "В библиотеке уже 100 уроков. Сохраните резервную копию и удалите ненужные.",
    );
  modal(
    "С чего начнём урок?",
    `<p class="modal-description">Чистый лист или редактируемый пример. Всё можно изменить под своего ученика.</p><form id="new-form"><label class="field"><span>Название (необязательно)</span><input name="title" maxlength="180" placeholder="Например, производная и её применение"></label><div class="template-grid">${[
      ["blank", "Чистый лист", "Структура без готового конспекта"],
      ["math", "Математика", "Квадратные уравнения"],
      ["russian", "Русский язык", "Чтение и аргументация"],
      ["biology", "Биология", "Строение клетки"],
    ]
      .map(
        ([value, title, desc], i) =>
          `<label class="template-option"><input type="radio" name="template" value="${value}" ${i === 0 ? "checked" : ""}><span>${title}<small>${desc}</small></span></label>`,
      )
      .join(
        "",
      )}</div><div class="modal-footer"><button type="button" data-action="close-modal" class="button outline">Отмена</button><button class="button primary" type="submit">Создать урок →</button></div></form>`,
  );
}
function exportDialog() {
  modal(
    "Забрать материалы с собой",
    `<p class="modal-description">${esc(lessonName())}. Файлы скачиваются на ваше устройство.</p><div class="export-options"><button class="export-option" data-action="export-plan">План урока → печать / PDF<small>План, конспект и домашнее задание. PDF сохраняется через диалог печати браузера.</small></button><button class="export-option" data-action="export-map">Майнд-карта → SVG<small>Векторная карта со всеми этапами и текстом конспекта.</small></button><button class="export-option" data-action="export-slides">Презентация → HTML<small>Открывается без интернета. Стрелки листают, клавиша P открывает печать.</small></button><button class="export-option" data-action="export-lesson">Этот урок → JSON<small>Редактируемая копия для переноса в Уроко на другом устройстве.</small></button><button class="export-option" data-action="backup">Вся библиотека → JSON<small>Резервная копия всех ${state.lessons.length} уроков. Импорт добавляет копии, не заменяя существующие.</small></button></div>`,
  );
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function exportJSON(all) {
  saveNow();
  download(
    all ? "Уроко — резервная копия.json" : `${slug(lessonName())}.json`,
    JSON.stringify(
      {
        format: "uroko",
        version: 1,
        lessons: all ? state.lessons : [current()],
      },
      null,
      2,
    ),
    "application/json",
  );
  closeModal();
  notify("JSON-копия скачана. Её можно открыть через «Импорт».");
}
function presentationDocument() {
  const l = current(),
    slides = deck();
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(lessonName())}</title><style>*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#f3efff;color:#443061}.slide{min-height:100vh;padding:8vh 9vw;display:flex;flex-direction:column;justify-content:center;position:relative;break-after:page}.slide[hidden]{display:none}.theme-sage{background:#edf3eb;color:#334b3b}.theme-midnight{background:#252c44;color:#faf8ff}.slide-kicker{font-size:14px;letter-spacing:2px;opacity:.65}.slide h2{font-size:clamp(28px,5vw,64px);line-height:1.15;overflow-wrap:anywhere}.slide ul,.slide p{font-size:clamp(18px,2.3vw,30px);line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.slide li+li{margin-top:14px}.slide-footer{display:flex;justify-content:space-between;font-size:12px;opacity:.6;margin-top:35px;gap:20px}.nav{position:fixed;bottom:16px;right:22px;display:flex;gap:8px;background:#ffffffdc;padding:8px;border-radius:10px;color:#443061}.nav button{font:14px system-ui;padding:8px 14px;border:1px solid #cfc3e9;background:white;border-radius:5px;cursor:pointer}.nav button:disabled{opacity:.3}@media print{.slide[hidden]{display:flex}.slide{min-height:180mm;break-inside:avoid;-webkit-print-color-adjust:exact;print-color-adjust:exact}.slide h2{font-size:32px}.slide ul,.slide p{font-size:19px}.nav{display:none}@page{size:A4 landscape;margin:12mm}}</style></head><body>${slides.map((s, i) => slideHTML(s, i, slides.length, l)).join("")}<nav class="nav" aria-label="Управление презентацией"><button id="prev" aria-label="Предыдущий слайд">←</button><button id="next" aria-label="Следующий слайд">→</button><button id="print">Печать</button></nav><script>const slides=[...document.querySelectorAll('.slide')];let index=0;function show(){slides.forEach((s,i)=>s.hidden=i!==index);document.querySelector('#prev').disabled=index===0;document.querySelector('#next').disabled=index===slides.length-1;}function move(n){index=Math.max(0,Math.min(slides.length-1,index+n));show();}document.querySelector('#prev').onclick=()=>move(-1);document.querySelector('#next').onclick=()=>move(1);document.querySelector('#print').onclick=()=>window.print();document.addEventListener('keydown',e=>{if(['ArrowRight','ArrowLeft',' '].includes(e.key)){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}if(e.key.toLowerCase()==='p')window.print();});show();</script></body></html>`;
}
function printPlan() {
  const l = current();
  const win = window.open("", "_blank");
  if (!win)
    return notify(
      "Браузер заблокировал окно печати. Разрешите всплывающие окна для сайта.",
    );
  win.opener = null;
  win.document.write(
    `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(lessonName())}</title><style>body{font:14px/1.7 system-ui,sans-serif;color:#25283a;max-width:850px;margin:40px auto;padding:0 25px}h1{font-size:32px;line-height:1.2}h2{font-size:19px;margin:26px 0 8px}h3{font-size:15px}p{white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:#7b7389}section{border-top:1px solid #ded8e9;margin-top:20px;padding-top:10px}button{padding:10px 18px;cursor:pointer;background:#7255d8;color:white;border:0;border-radius:7px}@media print{body{margin:0;max-width:none}button{display:none}h2,h3{break-after:avoid}section{break-inside:auto}@page{margin:20mm}}</style></head><body><button id="print">Печать / сохранить PDF</button><h1>${esc(lessonName())}</h1><p class="meta">${esc(l.subject)} · ${esc(l.grade)} · ${esc(l.exam)} · ${l.duration} мин</p><h2>Цель урока</h2><p>${esc(l.goal || "Не указана")}</p>${l.stages.map((s, i) => `<section><h2>${i + 1}. ${esc(s.title)} <span class="meta">· ${s.minutes} мин</span></h2><p class="meta">${esc(s.type)}</p><p>${esc(s.notes || "Конспект не добавлен")}</p></section>`).join("")}<section><h2>Домашнее задание</h2><p>${esc(l.homework || "Не задано")}</p></section><script>document.querySelector('#print').onclick=()=>window.print();</script></body></html>`,
  );
  win.document.close();
  closeModal();
}
function showPresenter() {
  const slides = deck();
  slideIndex = Math.min(slideIndex, slides.length - 1);
  $("#presenter-slide").innerHTML = slideHTML(
    slides[slideIndex],
    slideIndex,
    slides.length,
  );
  $("#presenter-counter").textContent =
    `${slideIndex + 1} / ${slides.length} · ${lessonName()}`;
  $('[data-action="previous-slide"]', $("#presenter")).disabled =
    slideIndex === 0;
  $('[data-action="next-slide"]', $("#presenter")).disabled =
    slideIndex === slides.length - 1;
}
function moveSlide(delta) {
  slideIndex = Math.max(0, Math.min(deck().length - 1, slideIndex + delta));
  if ($("#presenter").open) showPresenter();
  else renderView();
}
function deleteLessonDialog() {
  modal(
    "Удалить урок?",
    `<p class="modal-description">«${esc(lessonName())}» будет удалён с этого устройства. Для сохранения копии сначала используйте экспорт.${state.lessons.length === 1 ? " Вместо него откроется чистый лист." : ""}</p><div class="modal-footer"><button data-action="close-modal" class="button outline">Отмена</button><button data-action="confirm-delete-lesson" class="button outline danger">Удалить урок</button></div>`,
  );
}
function mutateStage(action, id) {
  const l = current(),
    index = l.stages.findIndex((s) => s.id === id);
  if (index < 0) return;
  if (action === "duplicate-stage") {
    if (l.stages.length >= 40)
      return notify("В уроке может быть до 40 этапов.");
    const copy = {
      ...l.stages[index],
      id: uid(),
      title: `${l.stages[index].title} — копия`.slice(0, 180),
    };
    l.stages.splice(index + 1, 0, copy);
    openedStage = copy.id;
  }
  if (action === "delete-stage") {
    const removed = l.stages[index];
    modal(
      "Удалить этап?",
      `<p class="modal-description">Этап «${esc(removed.title)}» и его конспект будут удалены из плана, карты и слайдов.</p><div class="modal-footer"><button data-action="close-modal" class="button outline">Отмена</button><button class="button outline danger" data-action="confirm-delete-stage" data-id="${esc(id)}">Удалить этап</button></div>`,
    );
    return;
  }
  if (action === "move-up" && index > 0)
    [l.stages[index - 1], l.stages[index]] = [
      l.stages[index],
      l.stages[index - 1],
    ];
  if (action === "move-down" && index < l.stages.length - 1)
    [l.stages[index + 1], l.stages[index]] = [
      l.stages[index],
      l.stages[index + 1],
    ];
  changed();
  renderView();
}

const actions = {
  new: newDialog,
  "close-modal": closeModal,
  "select-lesson": (button) => {
    saveNow();
    state.activeId = button.dataset.id;
    openedStage = null;
    slideIndex = 0;
    saveNow();
    render();
  },
  "add-stage": () => {
    if (current().stages.length >= 40)
      return notify("В уроке может быть до 40 этапов.");
    const s = stage("Новый этап", 5, "Практика", "");
    current().stages.push(s);
    openedStage = s.id;
    changed();
    renderView();
    const element = $(`[data-stage-id="${s.id}"]`);
    element.scrollIntoView({ block: "nearest", behavior: "smooth" });
    $('[data-field="stage.title"]', element).focus();
  },
  "confirm-delete-stage": (button) => {
    current().stages = current().stages.filter(
      (s) => s.id !== button.dataset.id,
    );
    openedStage = null;
    closeModal();
    changed();
    renderView();
  },
  "lesson-menu": () =>
    modal(
      "Действия с уроком",
      `<div class="export-options"><button class="export-option" data-action="duplicate-lesson">Дублировать урок<small>Создать независимую копию для другого ученика.</small></button><button class="export-option danger" data-action="delete-lesson">Удалить урок<small>Потребуется подтверждение. Экспортируйте копию, если она нужна.</small></button></div>`,
    ),
  "duplicate-lesson": () => {
    if (state.lessons.length >= 100)
      return notify("В библиотеке уже 100 уроков.");
    const l = validateLesson(current(), true);
    l.title = `${lessonName()} — копия`.slice(0, 180);
    state.lessons.unshift(l);
    state.activeId = l.id;
    openedStage = null;
    closeModal();
    saveNow();
    render();
    notify("Создана независимая копия урока.");
  },
  "delete-lesson": deleteLessonDialog,
  "confirm-delete-lesson": () => {
    state.lessons = state.lessons.filter((l) => l.id !== state.activeId);
    if (!state.lessons.length) state.lessons.push(template());
    state.activeId = state.lessons[0].id;
    openedStage = null;
    slideIndex = 0;
    closeModal();
    saveNow();
    render();
  },
  export: exportDialog,
  backup: () => exportJSON(true),
  "export-lesson": () => exportJSON(false),
  "export-map": () => {
    download(`${slug(lessonName())} — карта.svg`, mapSVG(), "image/svg+xml");
    closeModal();
  },
  "export-slides": () => {
    download(
      `${slug(lessonName())} — презентация.html`,
      presentationDocument(),
      "text/html",
    );
    closeModal();
  },
  "export-plan": printPlan,
  import: () => $("#import-file").click(),
  "zoom-in": () => {
    zoom = Math.min(150, zoom + 10);
    applyZoom();
  },
  "zoom-out": () => {
    zoom = Math.max(20, zoom - 10);
    applyZoom();
  },
  "zoom-fit": () => {
    zoom = Math.max(
      20,
      Math.min(
        100,
        Math.floor((($(".map-board").clientWidth - 65) / 1440) * 100),
      ),
    );
    applyZoom();
  },
  "select-slide": (button) => {
    slideIndex = Number(button.dataset.index);
    renderView();
  },
  "previous-slide": () => moveSlide(-1),
  "next-slide": () => moveSlide(1),
  present: () => {
    showPresenter();
    $("#presenter").showModal();
  },
  "close-presenter": () => {
    $("#presenter").close();
    renderView();
  },
  guide: () =>
    modal(
      "Один урок — три вида",
      `<ol class="guide-list"><li><strong>Соберите план.</strong> Задайте цель, добавьте этапы и их длительность. В конспекте пишите каждую мысль или задание с новой строки.</li><li><strong>Посмотрите на связи.</strong> Майнд-карта показывает тему, этапы и конспект. Нажатие на ветку возвращает к её редактированию.</li><li><strong>Проведите урок.</strong> Слайды собираются из тех же текстов. Выберите тему оформления и нажмите «Начать показ».</li><li><strong>Сохраните копию.</strong> Данные остаются в этом браузере. Экспортируйте JSON для резервной копии или переноса на другой компьютер.</li></ol><p class="help-callout">Это первая версия редактора без аккаунтов, облачной синхронизации и генерации через ИИ. Примеры можно менять. Задания и требования экзаменов проверяйте по актуальным материалам ФИПИ.</p>`,
    ),
};

document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) return setView(viewButton.dataset.view);
  const node = event.target.closest("[data-map-stage]");
  if (node) {
    openedStage = node.dataset.mapStage;
    setView("plan");
    $(`[data-stage-id="${openedStage}"]`)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
    return;
  }
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (
    ["move-up", "move-down", "duplicate-stage", "delete-stage"].includes(action)
  )
    return mutateStage(
      action,
      button.closest("[data-stage-id]").dataset.stageId,
    );
  actions[action]?.(button);
});

document.addEventListener("input", (event) => {
  const element = event.target,
    name = element.dataset.field;
  if (!name) return;
  if (element.type === "number" && !element.checkValidity()) return;
  const value =
    element.type === "number" ? Number(element.value) : element.value;
  if (name.startsWith("stage.")) {
    const card = element.closest("[data-stage-id]"),
      s = current().stages.find((x) => x.id === card.dataset.stageId);
    s[name.slice(6)] = value;
    if (name === "stage.title")
      $(".stage-summary-text strong", card).textContent =
        value || "Без названия";
    if (name === "stage.type")
      $(".stage-summary-text small", card).textContent = value;
    if (name === "stage.minutes")
      $(".stage-duration", card).textContent = `${value} мин`;
    renderSummary();
  } else {
    current()[name] = value;
    if (name === "title") {
      renderLibrary();
      document.title = `${lessonName()} — Уроко`;
    }
    if (["subject", "grade", "exam", "duration"].includes(name)) {
      renderMetadata();
      renderSummary();
      renderLibrary();
    }
  }
  changed();
});
document.addEventListener("focusout", (event) => {
  const el = event.target;
  if (el.dataset.field && el.type === "number" && !el.checkValidity()) {
    const s = el.closest("[data-stage-id]");
    el.value = s
      ? current().stages.find((x) => x.id === s.dataset.stageId).minutes
      : current().duration;
    notify("Длительность должна быть целым числом в указанном диапазоне.");
  }
});
document.addEventListener("change", (event) => {
  if (event.target.id === "theme") {
    current().theme = event.target.value;
    changed();
    renderView();
  }
});
document.addEventListener(
  "toggle",
  (event) => {
    if (event.target.matches?.(".stage[open]"))
      openedStage = event.target.dataset.stageId;
  },
  true,
);
$("#search").addEventListener("input", renderLibrary);
document.addEventListener("submit", (event) => {
  if (event.target.id !== "new-form") return;
  event.preventDefault();
  const data = new FormData(event.target);
  const l = template(data.get("template"));
  if (String(data.get("title")).trim())
    l.title = String(data.get("title")).trim();
  state.lessons.unshift(l);
  state.activeId = l.id;
  openedStage = null;
  slideIndex = 0;
  $("#search").value = "";
  closeModal();
  saveNow();
  setView("plan");
  render();
  $("#lesson-title").focus();
});
$("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 2 * 1024 * 1024) throw new Error("Файл больше 2 МБ.");
    const parsed = JSON.parse(await file.text());
    if (
      parsed.version !== 1 ||
      !Array.isArray(parsed.lessons) ||
      !parsed.lessons.length
    )
      throw new Error("Нужен JSON-файл урока или резервной копии Уроко.");
    if (parsed.lessons.length + state.lessons.length > 100)
      throw new Error("После импорта будет больше 100 уроков.");
    const imported = parsed.lessons.map((l) => validateLesson(l, true));
    state.lessons.unshift(...imported);
    state.activeId = imported[0].id;
    openedStage = null;
    slideIndex = 0;
    $("#search").value = "";
    saveNow();
    render();
    notify(
      `Добавлено уроков: ${imported.length}. Существующие уроки сохранены.`,
    );
  } catch (error) {
    notify(
      `Импорт не выполнен. ${error instanceof SyntaxError ? "Файл не является корректным JSON." : error.message}`,
    );
  }
  event.target.value = "";
});
document.addEventListener("keydown", (event) => {
  if (
    event.target.closest("[data-map-stage]") &&
    ["Enter", " "].includes(event.key)
  ) {
    event.preventDefault();
    event.target
      .closest("[data-map-stage]")
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return;
  }
  const tab = event.target.closest("[data-view]");
  if (tab && ["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const names = ["plan", "map", "slides"];
    let i = names.indexOf(view);
    i =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? 2
          : (i + (event.key === "ArrowRight" ? 1 : 2)) % 3;
    setView(names[i]);
    $(`[data-view="${view}"]`).focus();
    return;
  }
  if (
    $("#presenter").open &&
    !event.target.closest("input,textarea,select") &&
    ["ArrowRight", "ArrowLeft", " "].includes(event.key)
  ) {
    event.preventDefault();
    moveSlide(event.key === "ArrowLeft" ? -1 : 1);
  }
});
$("#presenter").addEventListener("close", () => {
  if (view === "slides") renderView();
});
window.addEventListener("pagehide", () => {
  if (!saved) saveNow();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !saved) saveNow();
});
render();
if (recoveryWarning) {
  saved = false;
  updateSaveStatus();
  notify(recoveryWarning);
} else saveNow();
