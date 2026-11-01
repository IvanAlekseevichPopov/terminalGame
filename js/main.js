import { LEVELS } from '../levels.js';
import { pickEffect } from './fx.js';
import * as fxSfx from './sfx.js';

const HINT_AFTER = 3;
const NEXT_WORD_MS = 150;
const GRANTED_MS = 2600;

const $ = id => document.getElementById(id);
// Английская раскладка печатает русские буквы по тем же клавишам: ребёнок не переключает раскладку.
const LAYOUT = Object.fromEntries([...'qwertyuiop[]asdfghjkl;\'zxcvbnm,.`'].map((c, i) =>
  [c === '[' ? 'BracketLeft' : c === ']' ? 'BracketRight' : c === ';' ? 'Semicolon' : c === '\'' ? 'Quote' : c === ',' ? 'Comma' : c === '.' ? 'Period' : c === '`' ? 'Backquote' : 'Key' + c.toUpperCase(),
   'йцукенгшщзхъфывапролджэячсмитьбюё'[i]]));
const norm = s => s.toLowerCase().replace(/ё/g, 'е');

let scene = 'login';
let level = 0, word = 0, typed = '', wrong = 0;
let menuSel = 0, nextTimer = null, fxRun = 0;
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

function render() {
  $('lvl').textContent = level + 1;
  $('done').textContent = word;
  $('total').textContent = LEVELS[level].length;
  $('typed').textContent = typed.toUpperCase();
  const show = wrong >= HINT_AFTER && typed.length < target().length;
  const next = show ? target()[typed.length] : '';
  $('hint').textContent = next === ' ' ? '␣' : next.toUpperCase();
  $('hint').classList.toggle('on', show);
  const full = typed.length > 0 && typed === target();
  if (!target()) return;
  $('typed').classList.toggle('full', full);
  if (scene === 'accepting') return fit();
  if (full) status('Enter'); else if (!voice) status('печатай');
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
function measure(text, px) {
  const el = $('typed');
  const saved = el.textContent;
  el.textContent = text.toUpperCase();
  const w = el.parentElement.scrollWidth + px * 1.2;
  el.textContent = saved;
  return w;
}
function status(text) { $('speakText').textContent = text; }

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
  access: () => { beep(660, 90); setTimeout(() => beep(990, 160), 90); },
  granted: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 180), i * 120)),
};

function speak() {
  if (voice) { voice.pause(); voice = null; }
  const a = new Audio(`audio/${encodeURIComponent(target())}.m4a`);
  voice = a;
  $('speak').classList.add('on');
  status('слушай…');
  $('typed').classList.remove('won');
  const done = () => {
    if (voice !== a) return;
    voice = null;
    $('speak').classList.remove('on');
    render();
  };
  a.onended = a.onerror = done;
  a.play().catch(done);
}

function startLevel(n, w = 0) {
  clearTimeout(nextTimer);
  fxRun++;
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
  const c = $('cur');
  c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake');
  render();
}

function accept() {
  scene = 'accepting';
  $('typed').classList.add('won');
  status('');
  document.body.classList.add('accepting');
  const run = ++fxRun, alive = () => run === fxRun;
  // Уровень перезапустили во время сценки: цепочка обрывается, startLevel уже прибрал окно.
  const step = f => () => alive() ? f() : new Promise(() => {});
  const effect = pickEffect();
  openWin()
    .then(step(() => effect.run({ fx: $('fx'), word: target(), alive, sfx: fxSfx })))
    .then(step(() => wait(effect.hold)))
    .then(step(() => { fxSfx.play('access'); return wait(250); }))
    .then(step(closeWin))
    .then(step(accepted));
}
const wait = ms => new Promise(r => setTimeout(r, ms));
function openWin() {
  const w = $('win');
  $('fx').textContent = ''; $('fx').className = ''; $('fx').style.fontSize = '';
  w.className = 'win on opening';
  fxSfx.play('win-open');
  return wait(280).then(() => { w.className = 'win on ready'; });
}
function closeWin() {
  const w = $('win');
  w.className = 'win on closing';
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
  scene = 'granted';
  sfx.granted();
  $('grantedText').textContent = `уровень ${level + 1} открыт`;
  $('granted').classList.add('on');
  nextTimer = setTimeout(() => {
    $('granted').classList.remove('on');
    if (level + 1 < LEVELS.length) { scene = 'playing'; startLevel(level + 1); }
    else { scene = 'final'; $('final').classList.add('on'); document.body.classList.add('final'); }
  }, GRANTED_MS);
}

function typeChar(ch) {
  const t = target();
  if (typed.length >= t.length) return;
  if (ch === ' ' && (typed.length === 0 || typed.endsWith(' '))) return;
  if (norm(ch) === norm(t[typed.length])) {
    typed += t[typed.length];
    wrong = 0;
    if (typed === t) sfx.full(); else sfx.key();
    render();
  } else reject();
}

function onPlayingKey(e) {
  if (e.key === 'Escape') { openMenu('pause'); return; }
  if (e.key === 'Enter') { if (typed === target()) accept(); else speak(); return; }
  if (e.key === 'Backspace') { typed = typed.slice(0, -1); wrong = 0; render(); return; }
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeChar(LAYOUT[e.code] && /[a-z\[\];',.`]/i.test(e.key) ? LAYOUT[e.code] : e.key);
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
  if (scene === 'login') begin();
  else if (scene === 'playing') onPlayingKey(e);
  else if (scene === 'pause') onMenuKey(e, 'pause', [() => { scene = 'playing'; }, () => { scene = 'playing'; startLevel(level); }]);
});
document.addEventListener('mousedown', () => { if (scene === 'login') begin(); });
// Родитель может набрать #level=N в той же вкладке, в том числе с финального экрана и из паузы.
window.addEventListener('hashchange', () => {
  if (!['playing', 'accepting', 'pause', 'final'].includes(scene) || levelFromHash() === level) return;
  $('pause').classList.remove('on'); $('final').classList.remove('on'); document.body.classList.remove('final');
  scene = 'playing';
  startLevel(levelFromHash());
});
window.addEventListener('resize', () => { if (scene !== 'login') render(); });

setInterval(() => { $('clock').textContent = new Date().toTimeString().slice(0, 8); }, 1000);
setInterval(() => { $('sys1').textContent = 'root@tty1 · 0x' + Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0').toUpperCase(); }, 4000);
