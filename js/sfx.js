// Звуки сценок и окна: заранее сгенерированные файлы audio/sfx/*.m4a (tools/sfx.py), не Web Audio.
// play() клонирует элемент, чтобы быстрые повторы (тики, клавиши) накладывались, а не обрывали друг друга.
const NAMES = ['win-open', 'win-close', 'tick', 'tick2', 'tick3', 'chirp1', 'chirp2', 'chirp3', 'chirp4', 'chirp5',
  'chord', 'bar-rise', 'ding', 'drop', 'drop2', 'drop3', 'key', 'key2', 'key3', 'carriage', 'access', 'boom', 'fanfare', 'type-key', 'word-full', 'reject'];
const cache = {};
const src = name => new URL(`../audio/sfx/${name}.m4a`, import.meta.url).href;

export function preload() {
  for (const n of NAMES) { const a = new Audio(src(n)); a.preload = 'auto'; cache[n] = a; }
}

const playing = new Set();
export function play(name) {
  const base = cache[name] ?? (cache[name] = new Audio(src(name)));
  const a = base.cloneNode();
  playing.add(a);
  a.onended = () => playing.delete(a);
  a.play().catch(() => playing.delete(a));
}

// Сценку пропустили или уровень перезапустили: длинные звуки (полоса, фанфара) не должны доигрывать.
export function stopAll() {
  for (const a of playing) { a.pause(); }
  playing.clear();
}

// Случайный из вариантов: tick/tick2/tick3, чтобы частые повторы не звучали пулемётом.
export function playVar(name, n) { const k = 1 + Math.floor(Math.random() * n); play(k === 1 ? name : name + k); }
