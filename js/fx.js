// Сценки принятого пароля: короткие картинки в терминальном стиле, по очереди, чтобы не надоедали.
// Каждая рисует текстом в #fx внутри окна и обещает закончить за свои ms; последний кадр
// держится ещё hold, потом main.js закрывает окно. У каждой свои ms и hold: где есть текст,
// ребёнок должен успеть его прочитать, где картинка — разглядеть.
// ctx.alive() говорит, что уровень не перезапущен: иначе кадры останавливаются.
// ctx.sfx — { play, playVar } из sfx.js; звуки привязаны к кадрам: тики на бег знаков, чирик на букву,
// аккорд на жёлтый кадр. Без sfx (служебная страница без звука) сценки работают молча.

const quiet = { play() {}, playVar() {} };

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
      const t = Math.min(1, Math.max(0, (now - t0) / ms));
      frame(t, (now - last) / 16.7);
      last = now;
      if (t < 1) requestAnimationFrame(tick); else resolve();
    })(t0);
  });
}

// Расшифровка: буквы слова мелькают случайными знаками и по одной застывают слева направо.
const DECODE = {
  ms: 3200, hold: 600,
  tick: 32, // знаки меняются не каждый кадр, а раз в tick мс: быстрее глаз не успевает
  run: ({ fx, word, alive, sfx = quiet }) => {
    const w = word.toUpperCase();
    fx.className = 'center huge';
    // Длинная фраза ужимается под ширину окна: 14vh — потолок, 70vw — ширина окна.
    fx.style.fontSize = `min(14vh, ${(70 / (w.length * 0.64)).toFixed(1)}vw)`;
    let noise = '', step = -1, lastFixed = 0, done = false;
    return animate(DECODE.ms, alive, t => {
      const fixed = Math.floor(t * (w.length + 1));
      const now = Math.floor(t * DECODE.ms / DECODE.tick);
      if (now !== step) { step = now; noise = [...w].map(() => glyph()).join(''); if (now % 3 === 0 && t < 1) sfx.playVar('tick', 3); }
      if (fixed > lastFixed) { lastFixed = fixed; if (fixed <= w.length && w[fixed - 1] !== ' ') sfx.play('chirp' + (1 + Math.floor((fixed - 1) / w.length * 5))); }
      const text = [...w].map((c, i) => i < fixed || c === ' ' ? c : noise[i]).join('');
      fx.innerHTML = t >= 1 ? lit(text) : esc(text);
      if (t >= 1 && !done) { done = true; sfx.play('chord'); }
    });
  },
};

// Полоса загрузки с процентами и «OK» в конце.
const BAR = {
  ms: 2000, hold: 600,
  run: ({ fx, alive, sfx = quiet }) => { let ok = false; sfx.play('bar-rise'); return animate(BAR.ms, alive, t => {
    const p = Math.min(t / 0.8, 1), n = Math.round(p * 26), pct = String(Math.round(p * 100)).padStart(3);
    if (t >= 0.85 && !ok) { ok = true; sfx.play('ding'); }
    fx.className = 'center';
    // «OK» рядом с заголовком и всегда в разметке, до поры невидимый: пробелы в конце строки pre
    // «висят» и ширину не держат, а невидимый текст держит, и заголовок не прыгает.
    fx.innerHTML = `проверка пароля<span class="lit"${t >= 0.85 ? '' : ' style="visibility:hidden"'}>  OK</span>\n\n[${'█'.repeat(n)}${'░'.repeat(26 - n)}] ${pct}%`;
  }); },
};

// Дождь знаков, сквозь который проступает «ДОСТУП РАЗРЕШЁН»; с появлением фразы дождь уходит в тень.
// Дождь молчит: капли-блипы отвергнуты родителем («не в тему»), аккорд один раз на допечатанной фразе.
const RAIN = {
  ms: 2600, hold: 800,
  cols: 36, rows: 6,
  run: ({ fx, alive, sfx = quiet }) => {
    const { cols, rows } = RAIN;
    let chord = false;
    const drops = [];
    for (let x = 0; x < cols; x++) for (let k = 0; k < 2; k++) drops.push({ x, y: -rnd(rows * 2), v: 0.25 + Math.random() * 0.25 });
    const word = '  ДОСТУП РАЗРЕШЁН  ', wx = Math.floor((cols - word.length) / 2), wy = 3;
    const bg = s => `<span class="bg">${esc(s)}</span>`;
    return animate(RAIN.ms, alive, (t, dt) => {
      const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
      for (const d of drops) {
        d.y += d.v * dt;
        if (d.y > rows + 4) d.y = -rnd(rows);
        for (let k = 0; k < 4; k++) { const y = Math.floor(d.y) - k; if (y >= 0 && y < rows) grid[y][d.x] = k === 0 ? glyph() : grid[y][d.x] === ' ' ? glyph() : grid[y][d.x]; }
      }
      let html = '';
      // Над фразой и под ней дождь не идёт, чтобы знаки не прилипали к буквам.
      if (t > 0.45) for (const y of [wy - 1, wy + 1]) grid[y].fill(' ', wx, wx + word.length);
      for (let y = 0; y < rows; y++) {
        if (y === wy && t > 0.45) {
          const shown = Math.min(word.length, Math.floor((t - 0.45) / 0.03));
          if (shown === word.length && !chord) { chord = true; sfx.play('chord'); }
          html += bg(grid[y].slice(0, wx).join('')) + lit(word.slice(0, shown).padEnd(word.length)) + bg(grid[y].slice(wx + word.length).join(''));
        } else html += bg(grid[y].join(''));
        html += '\n';
      }
      fx.className = 'center';
      fx.style.setProperty('--bg-dim', String(1 - 0.85 * Math.min(1, Math.max(0, (t - 0.45) / 0.25))));
      fx.innerHTML = html;
    });
  },
};

// Печатная машинка: три строки лога печатаются по букве, простыми словами.
const TYPE = {
  ms: 3000, hold: 1000,
  run: ({ fx, word, alive, sfx = quiet }) => {
    const lines = [`пароль ......... ${word.toUpperCase()}`, 'проверка ....... да', 'замок .......... открыт'];
    const total = lines.reduce((s, l) => s + l.length + 1, 0);
    let typed = 0, ended = 0;
    // Ширина блока фиксирована по самой длинной строке: иначе центровка тянет текст влево с каждой буквой.
    fx.style.width = (Math.max(...lines.map(l => l.length)) + 1) + 'ch';
    return animate(TYPE.ms, alive, t => {
      const n = Math.floor(t * total);
      let left = n, out = [], full = 0;
      for (const l of lines) { out.push(l.slice(0, left)); if (left >= l.length) full++; left -= l.length + 1; if (left < 0) break; }
      if (n > typed) { typed = n; if (out[out.length - 1].slice(-1).trim()) sfx.playVar('key', 3); }
      if (full > ended) { ended = full; sfx.play('carriage'); }
      fx.className = '';
      fx.innerHTML = out.map((l, i) => i === 2 && t >= 1 ? lit(l) : esc(l)).join('\n') + (t < 1 ? '_' : '');
    });
  },
};

// Hex-дамп: короткие строки с кодами бегут вверх, под ними проступает само слово, коды при этом гаснут.
const HEX = {
  ms: 2000, hold: 800,
  run: ({ fx, word, alive, sfx = quiet }) => {
    let ding = false;
    const hex = () => rnd(256).toString(16).padStart(2, '0').toUpperCase();
    const row = i => `${(i * 4).toString(16).padStart(4, '0').toUpperCase()}  ${Array.from({ length: 4 }, hex).join(' ')}  |${Array.from({ length: 4 }, glyph).join('')}|`;
    const lines = Array.from({ length: 4 }, (_, i) => row(i));
    let shown = 0;
    return animate(HEX.ms, alive, t => {
      const want = Math.floor(Math.min(t / 0.7, 1) * 12);
      while (shown < want) { lines.push(row(4 + shown)); lines.shift(); shown++; sfx.playVar('tick', 3); }
      if (t > 0.6 && !ding) { ding = true; sfx.play('ding'); }
      fx.className = 'center';
      fx.style.setProperty('--bg-dim', String(1 - 0.75 * Math.min(1, Math.max(0, (t - 0.6) / 0.25))));
      // Строка со словом в разметке с первого кадра, до поры невидимая: иначе блок подрастает и прыгает вверх.
      fx.innerHTML = `<span class="bg">${esc(lines.join('\n'))}</span>\n\n<span class="lit"${t > 0.6 ? '' : ' style="visibility:hidden"'}><span class="bars">${esc(word.toUpperCase())}</span>  OK</span>`;
    });
  },
};

export const EFFECTS = [DECODE, BAR, RAIN, TYPE, HEX];

// Конец уровня, окно во весь экран: ворота с номером уровня, под ними бегут коды «подбираю ключ»,
// щелчок, вспышка и тряска, ворота разлетаются во все стороны, потом имя уровня огромным.
// Ребёнок-ревьюер: не «сектор», а «уровень», без слова «закрыто» (похоже на проигрыш), взрыв во все стороны.
export const GATE = {
  ms: 4200,
  run: ({ fx, level, name, alive, sfx = quiet, win }) => {
    const W = 50, H = 13, gw = 26, gh = 7, gx = (W - gw) / 2, gy = 2;
    const label = ` УРОВЕНЬ ${level} `;
    const gate = Array.from({ length: gh }, (_, y) => {
      const row = Array(gw).fill('▓');
      if (y === 3) [...label].forEach((c, i) => { row[Math.floor((gw - label.length) / 2) + i] = c; });
      return row;
    });
    const pieces = [];
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const dx = (x - gw / 2 + 0.5) / (gw / 2), dy = (y - gh / 2 + 0.5) / (gh / 2);
      pieces.push({ x: gx + x, y: gy + y, vx: dx * 30 + (Math.random() - 0.5) * 10, vy: dy * 12 + (Math.random() - 0.5) * 6 - 3, ch: gate[y][x] });
    }
    const hex = () => rnd(256).toString(16).padStart(2, '0').toUpperCase();
    let codes = '', codeStep = -1, phase = 0;
    const T1 = 0.3, T2 = 0.55;
    return animate(GATE.ms, alive, t => {
      fx.className = 'center';
      if (t < T1) {
        const step = Math.floor(t * GATE.ms / 100);
        if (step !== codeStep) { codeStep = step; codes = Array.from({ length: 4 }, hex).join(' '); sfx.playVar('tick', 3); }
        const grid = Array.from({ length: H }, () => Array(W).fill(' '));
        gate.forEach((row, y) => row.forEach((c, x) => { grid[gy + y][gx + x] = c; }));
        const line = `подбираю ключ  ${codes}`;
        [...line].forEach((c, i) => { grid[gy + gh + 2][Math.floor((W - line.length) / 2) + i] = c; });
        fx.innerHTML = grid.map((r, y) => y === gy + 3 ? esc(r.join('')) : `<span class="bg">${esc(r.join(''))}</span>`).join('\n');
        return;
      }
      if (phase === 0) {
        phase = 1; sfx.play('ding'); sfx.play('boom');
        if (win) { win.classList.add('flash'); win.firstElementChild.classList.add('shake'); }
      }
      if (t < T2) {
        const k = (t - T1) / (T2 - T1), sec = k * 1.1;
        const grid = Array.from({ length: H }, () => Array(W).fill(' '));
        for (const p of pieces) {
          const x = Math.round(p.x + p.vx * sec), y = Math.round(p.y + p.vy * sec + 6 * sec * sec);
          if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = k < 0.35 ? p.ch : k < 0.7 ? '▒' : '░';
        }
        fx.innerHTML = lit(grid.map(r => r.join('')).join('\n'));
        return;
      }
      if (phase === 1) { phase = 2; sfx.play('fanfare'); }
      const k = (t - T2) / (1 - T2);
      fx.innerHTML = `\n<span class="lit" style="font-size:2.6em;line-height:1.2">${esc(name.toUpperCase())}</span>\n\n`
        + (k > 0.3 ? esc(`уровень ${level} открыт`) : ' ');
    });
  },
};

let last = -1;
export function pickEffect() {
  let i;
  do i = rnd(EFFECTS.length); while (i === last);
  last = i;
  return EFFECTS[i];
}
