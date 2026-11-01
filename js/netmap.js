// Карта сети в подвале справа, с 5 уровня (IDEAS.md): узлы и провода, по проводам бегут пакеты,
// каждый принятый пароль захватывает ещё узел (жёлтый), к концу уровня сеть твоя. Антураж без механики.
const W = 36, H = 9;
const NODES = [[2, 1], [14, 1], [26, 1], [8, 4], [20, 4], [32, 4], [14, 7]];
const LINKS = [[0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 6], [4, 6]];
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const rnd = n => Math.floor(Math.random() * n);

// Провод идёт от узла по горизонтали, потом по вертикали; клетки в порядке движения пакета.
// from/to — края узлов, чтобы концы провода смотрели в узел.
function path([x1, y1], [x2, y2]) {
  const cells = [];
  const sx = Math.sign(x2 - x1), sy = Math.sign(y2 - y1);
  const xEnd = sy ? x2 : x2 - 2 * sx;
  for (let x = x1 + 2 * sx; sx && x !== xEnd + sx; x += sx) cells.push([x, y1]);
  for (let y = y1 + sy; sy && y !== y2; y += sy) cells.push([x2, y]);
  return { cells, from: [x1 + sx, y1], to: sy ? [x2, y2] : [x2 - sx, y2] };
}
const PATHS = LINKS.map(([a, b]) => path(NODES[a], NODES[b]));

// Клетка провода знает, куда из неё идут линии; по набору направлений выбирается знак рамки.
const L = 1, R = 2, U = 4, D = 8;
const BOX = { [L | R]: '─', [U | D]: '│', [R | D]: '┌', [L | D]: '┐', [R | U]: '└', [L | U]: '┘',
  [L | R | D]: '┬', [L | R | U]: '┴', [U | D | R]: '├', [U | D | L]: '┤', [L | R | U | D]: '┼' };
const wires = new Map();
for (const { cells, from, to } of PATHS) {
  cells.forEach(([x, y], i) => {
    const key = `${x},${y}`;
    let m = wires.get(key) ?? 0;
    for (const n of [cells[i - 1] ?? from, cells[i + 1] ?? to]) m |= n[0] < x ? L : n[0] > x ? R : n[1] < y ? U : D;
    wires.set(key, m);
  });
}

let el = null, timer = null, captured = 0, packets = [];

export function mount(element) { el = element; }

// shown — показывать ли карту; done/total — прогресс уровня, из него число захваченных узлов.
export function update(shown, done, total) {
  if (!el) return;
  if (!shown) { stop(); return; }
  const was = captured;
  captured = Math.min(NODES.length, Math.round(done / total * NODES.length));
  // Последний пароль уровня: вся сеть захвачена, узлы вспыхивают перед воротами («сеть твоя»).
  el.classList.toggle('full', captured === NODES.length && (was < NODES.length || el.classList.contains('full')));
  if (!timer) { packets = []; timer = setInterval(frame, 80); frame(); }
}
export function stop() {
  clearInterval(timer); timer = null;
  if (el) { el.textContent = ''; el.classList.remove('full'); }
}

function frame() {
  // Пакеты бегут по проводам, у которых хотя бы один конец захвачен.
  const live = LINKS.map((l, i) => i).filter(i => LINKS[i].some(n => n < captured));
  if (live.length && packets.length < 3 && Math.random() < 0.12) packets.push({ link: live[rnd(live.length)], at: 0 });
  packets = packets.filter(p => (p.at += 1) < PATHS[p.link].cells.length);
  const grid = Array.from({ length: H }, () => Array(W).fill(' '));
  const cls = Array.from({ length: H }, () => Array(W).fill(''));
  for (const [k, m] of wires) { const [x, y] = k.split(',').map(Number); grid[y][x] = BOX[m] ?? '·'; }
  for (const p of packets) { const [x, y] = PATHS[p.link].cells[p.at]; grid[y][x] = '●'; cls[y][x] = 'pk'; }
  NODES.forEach(([x, y], i) => {
    const on = i < captured;
    [...(on ? '[■]' : '[ ]')].forEach((c, k) => { grid[y][x - 1 + k] = c; cls[y][x - 1 + k] = on ? 'lit' : ''; });
  });
  el.innerHTML = grid.map((row, y) => row.map((c, x) => cls[y][x] ? `<span class="${cls[y][x]}">${esc(c)}</span>` : esc(c)).join('')).join('\n');
}
