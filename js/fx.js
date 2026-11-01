// Сценки принятого пароля: короткие картинки в терминальном стиле, по очереди, чтобы не надоедали.
// Каждая рисует текстом в #fx внутри окна и обещает закончить за свои ms. Последний кадр
// держится HOLD_MS, потом main.js закрывает окно.
// ctx.alive() говорит, что уровень не перезапущен: иначе кадры останавливаются.

const GLYPHS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ0123456789#$%&*+=?@';
const rnd = n => Math.floor(Math.random() * n);
const glyph = () => GLYPHS[rnd(GLYPHS.length)];
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const lit = s => `<span class="lit">${esc(s)}</span>`;

function animate(ms, alive, frame) {
  return new Promise(resolve => {
    const t0 = performance.now();
    let last = t0;
    (function tick(now) {
      if (!alive()) return;
      const t = Math.min(1, (now - t0) / ms);
      frame(t, (now - last) / 16.7);
      last = now;
      if (t < 1) requestAnimationFrame(tick); else resolve();
    })(t0);
  });
}

// Сейф: диск крутится, щелчок, дверца распахивается, внутри звёзды.
const SAFE = {
  ms: 1400,
  run: ({ fx, alive }) => {
    const dial = '\\|/-';
    const closed = d => [
      '╔════════════════╗',
      '║ ┌────────────┐ ║',
      `║ │   (${d})   ▐▐ │ ║`,
      '║ │   ───   ▐▐ │ ║',
      '║ └────────────┘ ║',
      '╚════════════════╝',
    ].join('\n');
    const ajar = [
      '╔════════════════╗',
      '║█               ║',
      '║█      ★        ║',
      '║█               ║',
      '║█               ║',
      '╚════════════════╝',
    ].join('\n');
    const open = [
      '╔════════════════╗',
      '║███   ★    ★    ║',
      '║███ ★    ★   ★  ║',
      '║███   ★  ★      ║',
      '║███      ★      ║',
      '╚════════════════╝',
    ].join('\n');
    return animate(SAFE.ms, alive, t => {
      fx.className = 'center big';
      if (t < 0.5) fx.textContent = closed(dial[Math.floor(t * 20) % 4]);
      else if (t < 0.65) fx.innerHTML = lit(ajar);
      else fx.innerHTML = lit(open);
    });
  },
};

// Расшифровка: буквы слова мелькают случайными знаками и по одной застывают слева направо.
const DECODE = {
  ms: 900,
  run: ({ fx, word, alive }) => {
    const w = word.toUpperCase();
    fx.className = 'center ' + (w.length <= 7 ? 'huge' : 'big');
    return animate(DECODE.ms, alive, t => {
      const fixed = Math.floor(t * (w.length + 1));
      const text = [...w].map((c, i) => i < fixed || c === ' ' ? c : glyph()).join('');
      fx.innerHTML = t >= 1 ? lit(text) : esc(text);
    });
  },
};

// Полоса загрузки с процентами и «OK» в конце.
const BAR = {
  ms: 1000,
  run: ({ fx, alive }) => animate(BAR.ms, alive, t => {
    const p = Math.min(t / 0.8, 1), n = Math.round(p * 32), pct = String(Math.round(p * 100)).padStart(3);
    fx.className = 'center';
    fx.innerHTML = `\nпроверка пароля\n\n[${'█'.repeat(n)}${'░'.repeat(32 - n)}] ${pct}%` + (t >= 0.85 ? lit('  OK') : '');
  }),
};

// Дождь знаков, сквозь который проступает «ДОСТУП».
const RAIN = {
  ms: 1200,
  cols: 40, rows: 6,
  run: ({ fx, alive }) => {
    const { cols, rows } = RAIN;
    const drops = [];
    for (let x = 0; x < cols; x++) for (let k = 0; k < 2; k++) drops.push({ x, y: -rnd(rows * 2), v: 0.25 + Math.random() * 0.25 });
    const word = ' ДОСТУП ', wx = Math.floor((cols - word.length) / 2), wy = 3;
    return animate(RAIN.ms, alive, (t, dt) => {
      const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
      for (const d of drops) {
        d.y += d.v * dt;
        if (d.y > rows + 4) d.y = -rnd(rows);
        for (let k = 0; k < 4; k++) { const y = Math.floor(d.y) - k; if (y >= 0 && y < rows) grid[y][d.x] = k === 0 ? glyph() : grid[y][d.x] === ' ' ? glyph() : grid[y][d.x]; }
      }
      let html = '';
      for (let y = 0; y < rows; y++) {
        if (y === wy && t > 0.45) {
          const shown = Math.min(word.length, Math.floor((t - 0.45) / 0.06));
          html += esc(grid[y].slice(0, wx).join('')) + lit(word.slice(0, shown).padEnd(word.length)) + esc(grid[y].slice(wx + word.length).join(''));
        } else html += esc(grid[y].join(''));
        html += '\n';
      }
      fx.className = 'center';
      fx.innerHTML = html;
    });
  },
};

// Печатная машинка: три строки лога печатаются по букве, простыми словами.
const TYPE = {
  ms: 1200,
  run: ({ fx, word, alive }) => {
    const lines = [`пароль ......... ${word.toUpperCase()}`, 'проверка ....... да', 'замок .......... открыт'];
    const total = lines.reduce((s, l) => s + l.length + 1, 0);
    return animate(TYPE.ms, alive, t => {
      let left = Math.floor(t * total), out = [];
      for (const l of lines) { out.push(l.slice(0, left)); left -= l.length + 1; if (left < 0) break; }
      fx.className = '';
      fx.innerHTML = '\n' + out.map((l, i) => i === 2 && t >= 1 ? lit(l) : esc(l)).join('\n') + (t < 1 ? '_' : '');
    });
  },
};

// Hex-дамп: короткие строки с кодами бегут вверх, под ними проступает само слово.
const HEX = {
  ms: 1000,
  run: ({ fx, word, alive }) => {
    const hex = () => rnd(256).toString(16).padStart(2, '0').toUpperCase();
    const row = i => `${(i * 4).toString(16).padStart(4, '0').toUpperCase()}  ${Array.from({ length: 4 }, hex).join(' ')}  |${Array.from({ length: 4 }, glyph).join('')}|`;
    const lines = Array.from({ length: 4 }, (_, i) => row(i));
    let shown = 0;
    return animate(HEX.ms, alive, t => {
      const want = Math.floor(Math.min(t / 0.7, 1) * 12);
      while (shown < want) { lines.push(row(4 + shown)); lines.shift(); shown++; }
      fx.className = 'center';
      fx.innerHTML = esc(lines.join('\n')) + '\n\n' + (t > 0.6 ? lit(`|${word.toUpperCase()}|  OK`) : '');
    });
  },
};

// Отсчёт: 3, 2, 1 крупно и «ДОСТУП».
const COUNT = {
  ms: 1300,
  run: ({ fx, alive }) => animate(COUNT.ms, alive, t => {
    const step = Math.floor(t / 0.3);
    const text = step < 3 ? String(3 - step) : 'ДОСТУП';
    fx.className = 'center huge';
    fx.innerHTML = step < 3 ? esc(text) : lit(text);
  }),
};

export const EFFECTS = [SAFE, DECODE, BAR, RAIN, TYPE, HEX, COUNT];

let last = -1;
export function pickEffect() {
  let i;
  do i = rnd(EFFECTS.length); while (i === last);
  last = i;
  return EFFECTS[i];
}
