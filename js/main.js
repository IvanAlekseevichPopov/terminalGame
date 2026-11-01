import { LEVELS, NAMES, ALIASES } from '../levels.js';
import { pickEffect, GATE } from './fx.js';
import * as fxSfx from './sfx.js';
import * as netmap from './netmap.js';
import * as scope from './scope.js';

const HINT_AFTER = 3;
const NETMAP_FROM = 4; // индекс уровня, с которого видна карта сети (5-й)
const SCOPE_FROM = 9; // индекс уровня, с которого виден осциллограф (10-й)
const NEXT_WORD_MS = 150;

const $ = id => document.getElementById(id);
// Английская раскладка печатает русские буквы по тем же клавишам: ребёнок не переключает раскладку.
const LAYOUT = Object.fromEntries([...'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`'].map((c, i) =>
  [c === '[' ? 'BracketLeft' : c === ']' ? 'BracketRight' : c === ';' ? 'Semicolon' : c === '\'' ? 'Quote' : c === ',' ? 'Comma' : c === '.' ? 'Period' : c === '`' ? 'Backquote' : 'Key' + c.toUpperCase(),
   'йцукенгшщзхъфывапролджэячсмитьбюё'[i]]));
const norm = s => s.toLowerCase().replace(/ё/g, 'е');

let scene = 'login';
let level = 0, word = 0, typed = '', wrong = 0;
let menuSel = 0, nextTimer = null, fxRun = 0, skippable = false;
let audioCtx = null, voice = null;

function levelFromHash() {
  const m = location.hash.match(/level=(\d+)/) || location.search.match(/level=(\d+)/);
  const n = m ? +m[1] : 1;
  return Math.min(Math.max(n, 1), LEVELS.length) - 1;
}

// Номер пароля внутри уровня тоже в адресе: рефреш продолжает с того же слова, а не с начала уровня.
function wordFromHash(lvl) {
  const m = location.hash.match(/word=(\d+)/);
  return m ? Math.min(+m[1], LEVELS[lvl].length - 1) : 0;
}
function saveProgress() { history.replaceState(null, '', `#level=${level + 1}&word=${word}`); }

function target() { return LEVELS[level][word] ?? ''; }
// Все написания текущего пароля: само слово и его омофоны из ALIASES.
function variants() { const t = target(); return t ? [t, ...(ALIASES[t] ?? [])] : []; }
function isFull(s) { return s.length > 0 && variants().includes(s); }

function render() {
  $('lvl').textContent = level + 1;
  $('done').textContent = word;
  $('total').textContent = LEVELS[level].length;
  $('typed').textContent = typed.toUpperCase();
  netmap.update(level >= NETMAP_FROM, word, LEVELS[level].length);
  scope.update(level >= SCOPE_FROM);
  const show = wrong >= HINT_AFTER && typed.length < target().length;
  const next = show ? target()[typed.length] : '';
  $('hint').textContent = next === ' ' ? '␣' : next.toUpperCase();
  $('hint').classList.toggle('on', show);
  const full = isFull(typed);
  if (!target()) return;
  $('typed').classList.toggle('full', full);
  if (scene === 'accepting') return fit();
  status(full ? 'Enter' : '');
  fit();
}

// Длинная фраза ужимается, чтобы влезть в строку целиком: иначе курсор уезжает за край.
function fit() {
  const box = $('typed').parentElement;
  box.style.fontSize = '';
  const max = box.clientWidth, start = parseFloat(getComputedStyle(box).fontSize);
  const need = measure(target(), start);
  if (need > max) box.style.fontSize = Math.floor(start * max / need) + 'px';
}
// Ширина строки с полным словом и курсором: правый край слота минус левый край строки.
// scrollWidth блока тут не годится: он никогда не меньше clientWidth, и строка ужималась бы всегда.
function measure(text, px) {
  const el = $('typed');
  const saved = el.textContent;
  el.textContent = text.toUpperCase();
  const box = el.parentElement;
  const w = box.lastElementChild.getBoundingClientRect().right - box.getBoundingClientRect().left + px * 0.1;
  el.textContent = saved;
  return w;
}
// Строка под вводом: либо эквалайзер, либо «Enter ⏎», когда слово набрано целиком.
function status(text) {
  $('speakText').textContent = text === 'Enter' ? 'Enter ⏎' : '';
  $('speak').classList.toggle('enter', text === 'Enter');
}

// Эквалайзер под голос: AnalyserNode на элементе с файлом голоса (Web Audio тут только слушает).
const EQ_BARS = 9, EQ_GLYPHS = '▁▂▃▄▅▆▇█';
// Полосы по частотам шире к верху, иначе половина столбиков сидит на басах и стоит на месте.
const EQ_BINS = [[1, 2], [3, 4], [5, 6], [7, 9], [10, 12], [13, 16], [17, 21], [22, 26], [27, 31]];
let analyser = null, eqTimer = 0;
function eqAttach(a) {
  if (!audioCtx) return;
  try {
    if (!analyser) {
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; analyser.smoothingTimeConstant = 0.55;
      analyser.connect(audioCtx.destination);
    }
    audioCtx.createMediaElementSource(a).connect(analyser);
  } catch (e) { analyser = null; }
}
function eqStart() {
  clearInterval(eqTimer);
  if (!analyser) return;
  const data = new Uint8Array(analyser.frequencyBinCount);
  eqTimer = setInterval(() => {
    analyser.getByteFrequencyData(data);
    let out = '';
    for (let b = 0; b < EQ_BARS; b++) {
      let v = 0;
      for (let i = EQ_BINS[b][0]; i <= EQ_BINS[b][1]; i++) v = Math.max(v, data[i]);
      out += EQ_GLYPHS[Math.min(7, Math.floor(v / 256 * 9))];
    }
    $('wave').textContent = out;
    if (!voice) { clearInterval(eqTimer); $('wave').textContent = '▁'.repeat(EQ_BARS); }
  }, 40);
}

function sysLine(text) {
  const d = document.createElement('div');
  d.className = 'sys';
  d.textContent = text;
  $('log').appendChild(d);
  trimLog();
}
function okLine(text) {
  const d = document.createElement('div');
  d.className = 'ok';
  d.textContent = '> ' + text.toUpperCase();
  $('log').appendChild(d);
  trimLog();
}
function trimLog() {
  const log = $('log');
  while (log.children.length > 9) log.removeChild(log.firstChild);
}

function beep(freq, ms, type = 'square', gain = 0.05) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, audioCtx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + ms / 1000);
  o.connect(g).connect(audioCtx.destination);
  o.start(); o.stop(audioCtx.currentTime + ms / 1000);
}
const sfx = {
  key: () => beep(1200, 40, 'square', 0.025),
  full: () => { beep(880, 60, 'square', 0.03); setTimeout(() => beep(1320, 90, 'square', 0.03), 60); },
  reject: () => beep(110, 90, 'triangle', 0.12),
};

function speak() {
  if (voice) { voice.pause(); voice = null; }
  const a = new Audio(`audio/${encodeURIComponent(target())}.m4a`);
  voice = a;
  eqAttach(a);
  $('speak').classList.add('on');
  status('');
  $('typed').classList.remove('won');
  const done = () => {
    if (voice !== a) return;
    voice = null;
    $('speak').classList.remove('on');
    render();
  };
  a.onended = a.onerror = done;
  a.play().then(eqStart).catch(done);
}

function startLevel(n, w = 0) {
  clearTimeout(nextTimer);
  fxRun++; skippable = false;
  fxSfx.stopAll();
  document.body.classList.remove('accepting');
  $('win').className = 'win';
  if (voice) { voice.pause(); voice = null; }
  $('typed').classList.remove('won');
  level = n; word = w; typed = ''; wrong = 0;
  saveProgress();
  $('log').innerHTML = '';
  sysLine(`[ OK ] уровень ${level + 1} ........... найден`);
  sysLine(`[ OK ] паролей ................ ${LEVELS[level].length}`);
  sysLine(`[ -- ] доступ ................. закрыт`);
  render();
  speak();
}

function reject() {
  wrong++;
  sfx.reject();
  scope.pulse('bad');
  const c = $('cur');
  c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
  render();
}

function accept() {
  scene = 'accepting';
  if (voice) { voice.pause(); voice = null; $('speak').classList.remove('on'); }
  $('typed').classList.add('won');
  status('');
  document.body.classList.add('accepting');
  const [alive, step] = newRun();
  const effect = pickEffect();
  openWin()
    .then(step(() => { skippable = true; return effect.run({ fx: $('fx'), word: target(), alive, sfx: fxSfx }); }))
    .then(step(() => wait(effect.hold)))
    .then(step(() => finishScene(step)));
}
// Уровень перезапустили во время сценки (или сценку пропустили клавишей): fxRun сменился,
// кадры останавливаются, а цепочка обещаний обрывается на ближайшем шаге.
function newRun() {
  const run = ++fxRun, alive = () => run === fxRun;
  return [alive, f => () => alive() ? f() : new Promise(() => {})];
}
function finishScene(step) {
  skippable = false;
  fxSfx.play('access');
  return wait(250).then(step(closeWin)).then(step(accepted));
}
// Ребёнок хочет печатать дальше, а не смотреть: любая клавиша во время сценки закрывает окно.
function skipScene() {
  if (!skippable) return;
  const [, step] = newRun();
  fxSfx.stopAll();
  finishScene(step);
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function openWin(kind = '') {
  const w = $('win');
  $('fx').textContent = ''; $('fx').className = ''; $('fx').removeAttribute('style');
  w.firstElementChild.classList.remove('shake');
  w.className = `win on opening ${kind}`;
  fxSfx.play('win-open');
  return wait(280).then(() => { w.className = `win on ready ${kind}`; });
}
function closeWin() {
  const w = $('win');
  w.className = w.className.replace(/\b(opening|ready|flash)\b/g, '') + ' closing';
  fxSfx.play('win-close');
  return wait(180).then(() => { w.className = 'win'; });
}
function accepted() {
  document.body.classList.remove('accepting');
  okLine(target());
  word++; typed = ''; wrong = 0;
  if (word < LEVELS[level].length) saveProgress();
  render();
  const d = $('done');
  d.classList.remove('pulse'); void d.offsetWidth; d.classList.add('pulse');
  if (word < LEVELS[level].length) { scene = 'playing'; nextTimer = setTimeout(speak, NEXT_WORD_MS); return; }
  // Конец уровня: сцена ворот во весь экран, потом следующий уровень или финал.
  scene = 'granted';
  const [alive, step] = newRun();
  openWin('full')
    .then(step(() => GATE.run({ fx: $('fx'), level: level + 1, name: NAMES[level], alive, sfx: fxSfx, win: $('win') })))
    .then(step(() => wait(300)))
    .then(step(closeWin))
    .then(step(() => {
      if (level + 1 < LEVELS.length) { scene = 'playing'; startLevel(level + 1); }
      else { scene = 'final'; $('final').classList.add('on'); document.body.classList.add('final'); }
    }));
}

function typeChar(ch) {
  // Буква верна, если продолжает любое из написаний пароля (код и кот); печатается буква этого написания.
  const v = variants().find(w => w.startsWith(typed) && typed.length < w.length && norm(ch) === norm(w[typed.length]));
  if (ch === ' ' && (typed.length === 0 || typed.endsWith(' '))) return;
  if (v) {
    typed += v[typed.length];
    wrong = 0;
    scope.pulse('ok');
    if (isFull(typed)) sfx.full(); else sfx.key();
    render();
  } else if (typed.length < target().length) reject();
}

function onPlayingKey(e) {
  if (e.key === 'Escape') { openMenu('pause'); return; }
  if (e.key === 'Enter') { if (isFull(typed)) accept(); else speak(); return; }
  if (e.key === 'Backspace') { typed = typed.slice(0, -1); wrong = 0; render(); return; }
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeChar(LAYOUT[e.code] && /^[\x21-\x7e]$/.test(e.key) ? LAYOUT[e.code] : e.key);
}

function openMenu(id) {
  scene = id; menuSel = 0;
  drawMenu(id);
  $(id).classList.add('on');
}
function drawMenu(id) {
  [...$(id).querySelectorAll('.menu div')].forEach((d, i) => d.classList.toggle('sel', i === menuSel));
}
function onMenuKey(e, id, actions) {
  const n = actions.length;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { menuSel = (menuSel + (e.key === 'ArrowUp' ? n - 1 : 1)) % n; drawMenu(id); }
  else if (e.key === 'Enter') { $(id).classList.remove('on'); actions[menuSel](); }
  else if (e.key === 'Escape' && id === 'pause') { $(id).classList.remove('on'); scene = 'playing'; }
}

function begin() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume();
  } catch (e) { audioCtx = null; }
  $('login').classList.remove('on');
  fxSfx.preload();
  netmap.mount($('net'));
  scope.mount($('scope'));
  scene = 'playing';
  const lvl = levelFromHash();
  startLevel(lvl, wordFromHash(lvl));
}

// Ширины строки считаются по шрифту: ждём его до секунды, чтобы первый fit() не мерил запасной.
document.body.style.visibility = 'hidden';
Promise.race([document.fonts.load('400 100px "Game Mono"'), new Promise(r => setTimeout(r, 1000))])
  .finally(() => { document.body.style.visibility = ''; });

document.addEventListener('keydown', e => {
  if (e.key === 'Tab' || e.key === 'F5' || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  if (e.repeat) return;
  if (scene === 'login') { if (e.key !== 'Escape') begin(); }
  else if (scene === 'playing') onPlayingKey(e);
  else if (scene === 'accepting') skipScene();
  else if (scene === 'pause') onMenuKey(e, 'pause', [() => { scene = 'playing'; }, () => { scene = 'playing'; startLevel(level); }]);
});
document.addEventListener('mousedown', () => { if (scene === 'login') begin(); });
// Родитель может набрать #level=N в той же вкладке, в том числе с финального экрана и из паузы.
// Свои replaceState событие не дают, так что любой hashchange — от человека, в том числе тот же уровень заново.
window.addEventListener('hashchange', () => {
  if (!['playing', 'accepting', 'pause', 'granted', 'final'].includes(scene)) return;
  for (const id of ['pause', 'final']) $(id).classList.remove('on');
  document.body.classList.remove('final');
  scene = 'playing';
  const lvl = levelFromHash();
  startLevel(lvl, wordFromHash(lvl));
});
window.addEventListener('resize', () => { if (scene !== 'login') render(); });

setInterval(() => { $('clock').textContent = new Date().toTimeString().slice(0, 8); }, 1000);
setInterval(() => { $('sys1').textContent = 'root@tty1 · 0x' + Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0').toUpperCase(); }, 4000);
