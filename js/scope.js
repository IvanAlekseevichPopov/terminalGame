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
  // Две строки блоков: нижняя заполняется до половины амплитуды, верхняя — остальное; всплеск жёлтым.
  const cell = (x, half) => {
    const v = Math.max(0, Math.min(1, (x - half * 0.5) * 2));
    const g = GLYPHS[Math.round(v * (GLYPHS.length - 1))];
    return x >= 0.95 ? `<span class="lit">${g}</span>` : g;
  };
  el.innerHTML = '<span class="dim">      </span>' + buf.map(x => cell(x, 1)).join('') + '\n<span class="dim">scope </span>' + buf.map(x => cell(x, 0)).join('');
}
