'use strict';

const thoughts = {
  self: [
    ['Можно не успеть всё.', 'Выбери одно дело, которое подождёт. Оставь немного сил для себя.'],
    ['Ты не обязан заслуживать отдых.', 'Отведи взгляд от экрана. Опусти плечи. Сделай спокойный выдох.'],
    ['Ошибка — не весь ты.', 'Вспомни, что сказал бы другу на твоём месте. Попробуй сказать это себе.'],
    ['У тебя есть право на «нет».', 'Если сил мало, можно честно сказать: «Сегодня я не смогу».'],
    ['Маленького шага достаточно.', 'Заметь одну вещь, которая у тебя сегодня получилась. Даже совсем небольшую.'],
    ['К себе тоже можно с теплом.', 'Налей себе воды или чаю. Без условия «сначала закончу все дела».'],
    ['Не каждый день должен быть подвигом.', 'Дай себе несколько минут без списка дел. Просто побудь.'],
    ['Не нужно сравнивать свой темп.', 'Выбери посильный шаг. Сегодня он может быть меньше, чем вчера.']
  ],
  others: [
    ['За привычным «спасибо» есть человек.', 'Поблагодари кого-нибудь за конкретную мелочь: «Спасибо, что подождал».'],
    ['Сначала услышать. Потом ответить.', 'В следующем разговоре дай человеку закончить мысль. Можно не спешить с советом.'],
    ['Тёплое слово можно не откладывать.', 'Напиши тому, о ком давно думаешь: «Вспомнил о тебе. Как ты?»'],
    ['Мы не знаем чужого дня целиком.', 'Прежде чем ответить резко, сделай паузу. Можно спросить: «Что случилось?»'],
    ['Забота любит конкретику.', 'Вместо «обращайся» предложи небольшую помощь, на которую у тебя правда есть силы.'],
    ['Замеченное хорошее становится ближе.', 'Скажи человеку, что тебе понравилось в его поступке. Без сравнения с другими.'],
    ['Можно начать разговор заново.', 'Если был резок, попробуй: «Я сказал это обидно. Прости. Попробую иначе».'],
    ['Быть рядом — уже немало.', 'Спроси близкого: «Хочешь, я послушаю, или лучше вместе подумаем, что делать?»']
  ],
  world: [
    ['Чуть чище. Чуть уютнее.', 'Если увидишь безопасный мусор по пути к урне, можно захватить и его.'],
    ['Добро бывает совсем незаметным.', 'Придержи дверь тому, кто идёт следом. Маленький жест — тоже жест.'],
    ['По ту сторону экрана — человек.', 'Перед отправкой комментария перечитай его. Можно сказать то же самое бережнее?'],
    ['Хорошую работу можно заметить.', 'Оставь честный тёплый отзыв о месте или человеке, который тебе помог.'],
    ['Вещь может пригодиться ещё кому-то.', 'Найди одну ненужную тебе вещь в хорошем состоянии. Возможно, её можно отдать.'],
    ['Помощь начинается с вопроса.', 'Если кто-то растерян, спроси: «Вам помочь?» И спокойно прими любой ответ.'],
    ['В общей суете есть место заботе.', 'Оставь общее пространство чуть удобнее: убери за собой стол или верни вещь на место.'],
    ['Не всё хорошее громко звучит.', 'Поделись полезной информацией с тем, кому она нужна. Проверь источник перед отправкой.']
  ]
};
const labels = { self: 'НЕМНОГО ТЕПЛА ДЛЯ СЕБЯ', others: 'НЕМНОГО ТЕПЛА ДЛЯ ДРУГИХ', world: 'НЕМНОГО ТЕПЛА ДЛЯ МИРА' };
const melodies = { warm: [261.63, 329.63, 392], bell: [523.25, 659.25, 783.99], drop: [587.33, 440, 349.23] };
const sun = document.querySelector('#beep');
const mute = document.querySelector('#mute');
const volume = document.querySelector('#volume');
const audioStatus = document.querySelector('#audio-status');
const bags = {};
let mode = 'self';
let muted = false;
let audio;
let master;
let voices = [];
let pauses = 0;
let animationTimer;
let toastTimer;
let soundRequest = 0;

function nextThought() {
  if (!bags[mode]?.length) {
    const previous = bags[mode]?.last;
    const shuffled = thoughts[mode].map((_, i) => i);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    if (shuffled.at(-1) === previous) [shuffled[0], shuffled[shuffled.length - 1]] = [shuffled.at(-1), shuffled[0]];
    bags[mode] = shuffled;
  }
  const index = bags[mode].pop();
  bags[mode].last = index;
  return thoughts[mode][index];
}

function stopNotes() {
  if (!audio) return;
  const now = audio.currentTime;
  for (const { oscillator, envelope } of voices) {
    envelope.gain.cancelScheduledValues(now);
    envelope.gain.setTargetAtTime(0, now, 0.015);
    try { oscillator.stop(now + 0.06); } catch { /* Already ended. */ }
  }
  voices = [];
}

async function playSound() {
  const request = ++soundRequest;
  stopNotes();
  if (muted || Number(volume.value) === 0) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Web Audio unavailable');
    if (!audio || audio.state === 'closed') {
      audio = new AudioContext();
      master = audio.createGain();
      master.connect(audio.destination);
    }
    if (audio.state !== 'running') await audio.resume();
    if (request !== soundRequest || muted || Number(volume.value) === 0) return;
    master.gain.setValueAtTime(Number(volume.value) / 100 * 0.3, audio.currentTime);
    const sound = document.querySelector('#sound').value;
    melodies[sound].forEach((frequency, i) => {
      const start = audio.currentTime + 0.015 + i * 0.13;
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      if (sound === 'drop') oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.8, start + 0.4);
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.65, start + 0.025);
      envelope.gain.exponentialRampToValueAtTime(0.001, start + 1.1);
      envelope.gain.linearRampToValueAtTime(0, start + 1.2);
      oscillator.connect(envelope);
      envelope.connect(master);
      const voice = { oscillator, envelope };
      voices.push(voice);
      oscillator.onended = () => {
        oscillator.disconnect(); envelope.disconnect();
        voices = voices.filter(item => item !== voice);
      };
      oscillator.start(start);
      oscillator.stop(start + 1.22);
    });
    audioStatus.textContent = '';
  } catch {
    audioStatus.textContent = 'Звук сейчас недоступен. Тёплые слова остаются с тобой.';
  }
}

function makePause() {
  const [title, action] = nextThought();
  document.querySelector('#message-title').textContent = title;
  document.querySelector('#message-action').textContent = action;
  document.querySelector('#message-label').textContent = labels[mode];
  document.querySelector('#session-note').textContent = `Тёплых пауз в этой сессии: ${++pauses}`;
  const card = document.querySelector('.message');
  card.classList.remove('changed');
  void card.offsetWidth;
  card.classList.add('changed');
  sun.classList.add('is-warm');
  clearTimeout(animationTimer);
  animationTimer = setTimeout(() => sun.classList.remove('is-warm'), 300);
  void playSound();
}

sun.addEventListener('click', makePause);
for (const radio of document.querySelectorAll('[name="mode"]')) {
  radio.addEventListener('change', () => { mode = radio.value; makePause(); });
}
mute.addEventListener('click', () => {
  muted = !muted;
  mute.setAttribute('aria-pressed', String(muted));
  mute.querySelector('span').textContent = muted ? 'Без звука' : 'Звук включён';
  audioStatus.textContent = '';
  ++soundRequest;
  if (muted) stopNotes();
});
volume.addEventListener('input', () => {
  if (master) master.gain.setTargetAtTime(Number(volume.value) / 100 * 0.3, audio.currentTime, 0.02);
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest('button, input, textarea, select, a, [contenteditable]')) return;
  event.preventDefault();
  makePause();
});
document.querySelector('#copy').addEventListener('click', async () => {
  const text = `${document.querySelector('#message-title').textContent}\n\n${document.querySelector('#message-action').textContent}`;
  const toast = document.querySelector('#toast');
  try {
    await navigator.clipboard.writeText(text);
    toast.textContent = 'Мысль скопирована. Можно отправить её близкому ♡';
  } catch {
    toast.textContent = 'Не удалось скопировать. Можно выделить и скопировать текст карточки.';
  }
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
});
