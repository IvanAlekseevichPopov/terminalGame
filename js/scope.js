// Осциллограф над картой сети, с 10 уровня (IDEAS.md): бегущая волна, верная буква — всплеск,
// неверная — линия на миг гаснет. Экран отзывается на печать, проигрыша нет.
const N = 36;
const GLYPHS = ' ▁▂▃▄▅▆▇█';
let el = null, timer = null, buf = [], t = 0, spike = 0, flat = 0;

export function mount(element) { el = element; }

export function update(shown) {
  if (!el) return;
  if (!shown) { clearInterval(timer); timer = null; el.textContent = ''; return; }
  if (!timer) { buf = Array(N).fill(0.3); timer = setInterval(frame, 70); frame(); }
}

// kind: 'ok' — верная буква, 'bad' — неверная.
export function pulse(kind) {
  if (!timer) return;
  if (kind === 'ok') spike = 5; else flat = 6;
}

function frame() {
  t++;
  let v = 0.3 + 0.18 * Math.sin(t / 2.3) + 0.08 * Math.sin(t / 0.9) + (Math.random() - 0.5) * 0.1;
  if (spike > 0) { v = spike >= 4 ? 1 : spike === 3 ? 0.05 : 0.7; spike--; }
  if (flat > 0) { v = 0; flat--; }
  buf.push(Math.max(0, Math.min(1, v))); buf.shift();
  // Три строки блоков снизу вверх, каждая на треть амплитуды; всплеск жёлтым. line-height 1, чтобы блоки стыковались.
  const ROWS = 3;
  const cell = (x, row) => {
    const v = Math.max(0, Math.min(1, x * ROWS - row));
    const g = GLYPHS[Math.round(v * (GLYPHS.length - 1))];
    return x >= 0.95 ? `<span class="lit">${g}</span>` : g;
  };
  el.innerHTML = Array.from({ length: ROWS }, (_, i) => {
    const row = ROWS - 1 - i;
    return `<span class="dim">${row === 0 ? 'scope ' : '      '}</span>` + buf.map(x => cell(x, row)).join('');
  }).join('\n');
}
