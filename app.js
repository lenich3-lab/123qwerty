'use strict';

const pitch = document.querySelector('#pitch');
const volume = document.querySelector('#volume');
const beep = document.querySelector('#beep');
const status = document.querySelector('#status');
const panel = document.querySelector('.console');
let audio;
let count = 0;
let feedbackTimer;
let playing = false;

pitch.addEventListener('input', () => {
  document.querySelector('#frequency').textContent = pitch.value;
});
volume.addEventListener('input', () => {
  document.querySelector('#volume-value').textContent = `${volume.value}%`;
});

function tone(context, frequency, start, duration, type = 'sine', endFrequency) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
  const level = Number(volume.value) / 100 * 0.35;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(level, start + 0.012);
  gain.gain.setValueAtTime(level, start + duration * 0.65);
  gain.gain.linearRampToValueAtTime(0, start + duration);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.01);
  oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
}

async function play(sound = 'beep') {
  if (playing) return;
  playing = true;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Audio unavailable');
    audio ??= new AudioContext();
    if (audio.state !== 'running') await audio.resume();
    const now = audio.currentTime + 0.01;
    const base = Number(pitch.value);
    let duration = 0.24;
    if (sound === 'coin') {
      tone(audio, base, now, 0.09, 'square');
      tone(audio, base * 1.5, now + 0.10, 0.26, 'square');
      duration = 0.38;
    } else if (sound === 'robot') {
      [1, 0.7, 1.3, 0.85].forEach((ratio, index) => tone(audio, base * ratio, now + index * 0.10, 0.08, 'sawtooth'));
      duration = 0.42;
    } else if (sound === 'ufo') {
      tone(audio, base * 2, now, 0.65, 'sine', base * 0.4);
      duration = 0.68;
    } else {
      tone(audio, base, now, duration);
    }
    document.querySelector('#count').textContent = String(++count).padStart(3, '0');
    status.textContent = 'ПИ-И-ИК!';
    panel.classList.add('sounding');
    beep.classList.add('playing');
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      status.textContent = 'ЕЩЁ РАЗОК?';
      panel.classList.remove('sounding');
      beep.classList.remove('playing');
      playing = false;
    }, duration * 1000 + 30);
  } catch {
    status.textContent = 'ЗВУК НЕДОСТУПЕН';
    playing = false;
  }
}

beep.addEventListener('click', () => play());
document.querySelectorAll('[data-sound]').forEach(button => {
  button.addEventListener('click', () => play(button.dataset.sound));
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target.closest('button, input, textarea, select, a, [contenteditable]')) return;
  event.preventDefault();
  play();
});
