// Звуки сценок и окна: заранее сгенерированные файлы audio/sfx/*.m4a (tools/sfx.py), не Web Audio.
// play() клонирует элемент, чтобы быстрые повторы (тики, клавиши) накладывались, а не обрывали друг друга.
const NAMES = ['win-open', 'win-close', 'tick', 'tick2', 'tick3', 'chirp1', 'chirp2', 'chirp3', 'chirp4', 'chirp5',
  'chord', 'bar-rise', 'ding', 'drop', 'drop2', 'drop3', 'key', 'key2', 'key3', 'carriage', 'access'];
const cache = {};
const src = name => new URL(`../audio/sfx/${name}.m4a`, import.meta.url).href;

export function preload() {
  for (const n of NAMES) { const a = new Audio(src(n)); a.preload = 'auto'; cache[n] = a; }
}

export function play(name, volume = 1) {
  const base = cache[name] ?? (cache[name] = new Audio(src(name)));
  const a = base.cloneNode();
  a.volume = volume;
  a.play().catch(() => {});
}

// Случайный из вариантов: tick/tick2/tick3, чтобы частые повторы не звучали пулемётом.
export function playVar(name, n) { const k = 1 + Math.floor(Math.random() * n); play(k === 1 ? name : name + k); }
