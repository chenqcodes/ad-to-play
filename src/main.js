import { Game, FixedStepper, CONFIG, LEVELS, WEAPONS, clamp } from './game.js';
import { Renderer } from './render.js';
import { readSaved, writeSaved, recordRun } from './storage.js';

const $ = id => document.getElementById(id), canvas = $('game'), game = new Game(), keys = new Set();
let storage;
try { storage = window.localStorage; } catch { /* Private browsing can deny storage. */ }
let saved = readSaved(storage), muted = saved.muted;
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion = saved.reducedMotion ?? motionQuery.matches;
const renderer = new Renderer(canvas, { reducedMotion });
let pointer = null, audio = null, lastTime = 0, visualTime = 0, toastUntil = 0, usedDrag = false, shownMode = null;
let lastSquad = -1, lastHudTime = -1, frameCount = 0, fps = 60, fpsTime = 0, resizePending = true, lastVibration = -10, recordedResult = null;

class Sound {
  constructor() { const Audio = window.AudioContext || window.webkitAudioContext; this.context = Audio ? new Audio() : null; this.lastFire = 0; }
  unlock() { if (this.context?.state === 'suspended') this.context.resume().catch(() => {}); }
  tone(freq, duration, type = 'sine', gain = .035, slide = 0) {
    if (!this.context || this.context.state !== 'running') return;
    const c = this.context, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + duration);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + duration); o.onended = () => { o.disconnect(); g.disconnect(); };
  }
  play(e) {
    if (muted) return;
    if (e.type === 'fire' && this.context?.currentTime - this.lastFire > .12) {
      const cannon = e.weapon === 'cannon', pierce = e.weapon === 'pierce', scatter = e.weapon === 'scatter';
      this.tone(cannon ? 130 : pierce ? 1100 : scatter ? 430 : 740, cannon ? .11 : .045, 'triangle', cannon ? .024 : .012, cannon ? -70 : -290);
      this.lastFire = this.context.currentTime;
    }
    if (e.type === 'upgrade' || e.type === 'weapon') { this.tone(900, .16, 'triangle', .035, 450); this.tone(1200, .23, 'sine', .025, 400); }
    if (e.type === 'gain') { this.tone(600, .12, 'sine', .04, 300); this.tone(900, .2, 'sine', .025, 300); }
    if (e.type === 'gateGrow') this.tone(480 + Math.max(0, e.value) * 22, .04, 'sine', .012, 80);
    if (e.type === 'hurt') this.tone(180, .2, 'triangle', .045, -110);
    if (e.type === 'kill') this.tone(130, .07, 'triangle', .014, -60);
    if (e.type === 'warning') this.tone(350, .3, 'sine', .025, 150);
    if (e.type === 'win') { this.tone(540, .5, 'sine', .045, 540); this.tone(810, .6, 'sine', .03, 270); }
    if (e.type === 'lose') this.tone(270, .5, 'triangle', .04, -180);
  }
}
function persist() { if (!writeSaved(storage, saved)) $('save-note').textContent = '当前浏览器无法保存纪录'; }
function unlockAudio() { if (!muted) { try { if (!audio) audio = new Sound(); audio.unlock(); } catch { /* Optional audio never blocks play. */ } } }
function toast(message, duration = 1.4) { $('toast').textContent = message; toastUntil = visualTime + duration; $('toast').classList.add('visible'); }
function releaseInput() { keys.clear(); if (pointer !== null) { try { canvas.releasePointerCapture(pointer.id); } catch {} pointer = null; } }
function pause() { if (game.mode !== 'playing') return; game.pause(); releaseInput(); stepper.reset(); syncUI(); }
function startOrResume() {
  unlockAudio(); releaseInput(); stepper.reset(); lastTime = 0;
  if (game.mode === 'paused') game.resume();
  else { game.start(); renderer.reset(); usedDrag = false; toastUntil = 0; recordedResult = null; lastHudTime = -1; $('toast').classList.remove('visible'); }
  syncUI(); canvas.focus({ preventScroll: true });
}
function selectLevel(id) {
  if (!game.selectLevel(id)) return;
  shownMode = null; lastSquad = -1; lastHudTime = -1; renderer.reset(); recordedResult = null;
  $('start-label').textContent = '开始这一关'; $('overlay-note').textContent = '三关都能直接玩 · 失败就再来';
  $('toast').classList.remove('visible'); syncUI();
}
function soundUI() {
  $('sound-button').setAttribute('aria-pressed', String(muted));
  $('sound-button').setAttribute('aria-label', muted ? '开启声音' : '静音');
  $('sound-button').title = muted ? '开启声音' : '静音'; $('sound-mark').hidden = !muted;
}
$('start-button').addEventListener('click', startOrResume);
$('pause-button').addEventListener('click', () => game.mode === 'paused' ? startOrResume() : pause());
$('restart-button').addEventListener('click', () => { game.reset('ready'); startOrResume(); });
$('next-level-button').addEventListener('click', () => { const index = LEVELS.findIndex(l => l.id === game.level.id); selectLevel(LEVELS[(index + 1) % LEVELS.length].id); startOrResume(); });
for (let i = 0; i < LEVELS.length; i++) $('level-' + i).addEventListener('click', () => selectLevel(LEVELS[i].id));
$('sound-button').addEventListener('click', () => { muted = !muted; saved.muted = muted; soundUI(); persist(); if (game.mode === 'playing') unlockAudio(); });
$('motion-setting').checked = reducedMotion;
$('motion-setting').addEventListener('change', () => {
  reducedMotion = $('motion-setting').checked; saved.reducedMotion = reducedMotion;
  if (renderer.setReducedMotion) renderer.setReducedMotion(reducedMotion); else { renderer.reducedMotion = reducedMotion; renderer.reset(); }
  $('game-frame').classList.toggle('motion-reduced', reducedMotion); persist();
});
motionQuery.addEventListener?.('change', e => {
  if (saved.reducedMotion !== null) return;
  reducedMotion = e.matches; $('motion-setting').checked = reducedMotion;
  if (renderer.setReducedMotion) renderer.setReducedMotion(reducedMotion);
  $('game-frame').classList.toggle('motion-reduced', reducedMotion);
});
$('vibration-setting').checked = saved.vibration;
$('vibration-setting').addEventListener('change', () => { saved.vibration = $('vibration-setting').checked; persist(); });
canvas.addEventListener('pointerdown', e => {
  if (game.mode !== 'playing' || pointer !== null) return;
  e.preventDefault(); canvas.focus({ preventScroll: true }); pointer = { id: e.pointerId, startX: e.clientX, worldX: game.x };
  canvas.setPointerCapture(e.pointerId); usedDrag = true;
});
canvas.addEventListener('pointermove', e => {
  if (!pointer || e.pointerId !== pointer.id || game.mode !== 'playing') return;
  const rect = canvas.getBoundingClientRect(); game.setTarget(pointer.worldX + (e.clientX - pointer.startX) / (rect.width * .41));
});
function pointerEnd(e) { if (pointer?.id === e.pointerId) pointer = null; }
canvas.addEventListener('pointerup', pointerEnd); canvas.addEventListener('pointercancel', pointerEnd); canvas.addEventListener('lostpointercapture', pointerEnd);
window.addEventListener('keydown', e => {
  const onButton = e.target instanceof HTMLButtonElement, onInput = e.target?.tagName === 'INPUT';
  if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code) && game.mode === 'playing' && !onInput) { e.preventDefault(); keys.add(e.code); usedDrag = true; }
  if (((e.code === 'Space' && !onButton && !onInput) || e.code === 'Escape') && !e.repeat && ['playing', 'paused'].includes(game.mode)) { e.preventDefault(); if (game.mode === 'playing') pause(); else startOrResume(); }
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { releaseInput(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); lastTime = 0; stepper.reset(); });
new ResizeObserver(() => { resizePending = true; }).observe($('game-frame'));
window.addEventListener('resize', () => { resizePending = true; });
function resize() { const rect = canvas.getBoundingClientRect(); renderer.resize(rect.width, rect.height, window.devicePixelRatio); resizePending = false; }
function bestLabel(levelId) {
  const record = saved.records[levelId];
  return record?.bestTime ? `本机最快 ${record.bestTime.toFixed(1)} 秒 · 已通关 ${record.wins} 次` : record?.progress ? `本机最远 ${Math.round(record.progress * 100)}% · 峰值 ${record.maxSquad} 人` : '首次挑战 · 无需解锁';
}
function syncUI() {
  if (game.squad !== lastSquad) { $('squad-count').textContent = String(game.squad).padStart(2, '0'); lastSquad = game.squad; }
  const seconds = Math.floor(game.time), level = game.level;
  if (seconds !== lastHudTime) { $('time-label').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`; $('progress-fill').style.width = `${Math.min(100, game.time / level.bossAt * 100)}%`; lastHudTime = seconds; }
  $('phase-label').textContent = game.phase; $('fire-rate').textContent = `射速 ×${game.fireRate.toFixed(2)}`;
  const weapon = WEAPONS[game.weapon] || WEAPONS.rifle; $('weapon-label').textContent = weapon.name; $('weapon-label').style.color = weapon.color;
  $('boss-hud').hidden = !game.boss || game.mode === 'won';
  if (game.boss) {
    const percent = Math.max(0, game.boss.hp / game.boss.maxHP * 100); $('boss-fill').style.width = `${percent}%`;
    $('boss-percent').textContent = `${Math.ceil(percent)}% · 剩 ${Math.max(0, Math.ceil(level.duration - game.time))} 秒`;
    $('boss-name').textContent = game.boss.enraged ? '终点守卫 · 加速攻击' : '终点守卫';
  }
  $('drag-hint').hidden = game.mode !== 'playing' || usedDrag || game.time > 5;
  if (game.mode === shownMode) return;
  shownMode = game.mode;
  const ended = ['won', 'lost'].includes(game.mode), active = ['playing', 'paused'].includes(game.mode);
  $('game-frame').classList.toggle('is-paused', game.mode === 'paused'); $('game-frame').classList.toggle('is-ended', ended);
  $('overlay').hidden = game.mode === 'playing'; $('start-copy').hidden = game.mode !== 'ready'; $('result-copy').hidden = ['ready', 'playing'].includes(game.mode);
  $('pause-button').disabled = !active; $('pause-button').textContent = game.mode === 'paused' ? '▷' : 'Ⅱ';
  $('pause-button').setAttribute('aria-label', game.mode === 'paused' ? '继续游戏' : '暂停游戏');
  $('next-level-button').hidden = game.mode !== 'won'; $('restart-button').hidden = game.mode !== 'paused';
  $('stage-corner').textContent = `LEVEL ${String(LEVELS.indexOf(level) + 1).padStart(2, '0')} / ${level.name}`;
  for (let i = 0; i < LEVELS.length; i++) { $('level-' + i).disabled = active; $('level-' + i).setAttribute('aria-pressed', String(level.id === LEVELS[i].id)); }
  $('level-summary').textContent = `${level.subtitle} · ${bestLabel(level.id)}`;
  if (game.mode === 'ready') { $('start-description').textContent = level.description; return; }
  if (game.mode === 'paused') {
    $('result-eyebrow').textContent = 'TAKE YOUR TIME'; $('result-title').textContent = '歇一会儿。'; $('result-detail').textContent = '小队等你回来，进度停在这里。';
    $('result-stats').replaceChildren(); $('result-route').textContent = ''; $('result-best').textContent = '';
    $('start-label').textContent = '继续开火'; $('overlay-note').textContent = '空格继续 · 下方重开会从头开始';
  } else if (ended) {
    const won = game.mode === 'won', result = game.result;
    if (recordedResult !== result) { saved = recordRun(saved, result); recordedResult = result; persist(); }
    $('result-eyebrow').textContent = won ? 'THAT’S HOW IT’S PLAYED' : 'ONE MORE TRY';
    $('result-title').textContent = won ? '这一关，通了！' : '再冲一次。';
    $('result-detail').textContent = won ? '路线选得漂亮。换一关，试试不同的火力。' : result.cause || (result.reason === 'timeout' ? '时间到了。打门招人、换枪升级，再对准守卫持续输出。' : result.reason === 'gate' ? '这扇门还是负数。对准靶门先打绿，或走另一边。' : '队友用完了。避开怪群与红色预警，留住火力。');
    const progress = Math.round((result.progress || 0) * 100);
    $('result-stats').replaceChildren(...[[`${game.time.toFixed(1)}s`, '本局用时'], [String(game.maxSquad), '峰值人数'], [won ? '通关' : `${progress}%`, '本局进度']].map(([value, label]) => { const cell = document.createElement('div'), strong = document.createElement('strong'), small = document.createElement('small'); strong.textContent = value; small.textContent = label; cell.append(strong, small); return cell; }));
    const route = (result.route || []).slice(-5).join(' → ');
    $('result-route').textContent = route ? `本局路线：${route}` : `本局武器：${weapon.name} · 击退 ${game.stats.kills} 名敌人`;
    $('result-best').textContent = bestLabel(level.id);
    $('level-summary').textContent = `${level.subtitle} · ${bestLabel(level.id)}`;
    $('start-label').textContent = won ? '再爽一局' : '立即再来';
    $('next-level-button').textContent = LEVELS.indexOf(level) === LEVELS.length - 1 ? '回到第一关 ↗' : '挑战下一关 ↗';
    $('overlay-note').textContent = '关卡按钮可随时换路线 · 没有局外养成';
  }
}
const stepper = new FixedStepper(dt => {
  if (game.mode !== 'playing') return;
  const direction = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
  if (direction) game.setTarget(game.targetX + direction * 2.4 * dt); game.update(dt);
});
function frame(now) {
  if (resizePending || renderer.dpr !== Math.min(window.devicePixelRatio || 1, 2)) resize();
  const dt = lastTime ? clamp((now - lastTime) / 1000, 0, .25) : 0; lastTime = now;
  if (!document.hidden) {
    visualTime += dt; if (game.mode === 'playing') stepper.advance(dt);
    for (const event of game.drainEvents()) {
      renderer.event(event); audio?.play(event);
      if (saved.vibration && !reducedMotion && visualTime - lastVibration > .25 && ['gain', 'hurt', 'weapon', 'win'].includes(event.type)) {
        try { window.navigator?.vibrate?.(event.type === 'hurt' ? 22 : 12); } catch {} lastVibration = visualTime;
      }
      if (event.type === 'gain') toast(event.capped ? `满编 ${CONFIG.maxSquad} 人 · 火力全开` : `+${event.amount} 位队友 · 火力增加`);
      if (event.type === 'upgrade') toast(`全队连射 · 射速 ×${event.rate.toFixed(2)}`, 1.8);
      if (event.type === 'weapon') toast(`${event.name} · ${WEAPONS[event.weapon]?.description || '全队换装'}`, 2);
      if (event.type === 'gateGrow' && event.value === 0) toast('打成零了！继续开火，让门变绿', 1);
      if (event.type === 'missGate') toast('从中间绕过了门', .9);
      if (event.type === 'bossPhase') toast('守卫半血 · 预警变快', 1.4);
      if (event.type === 'hurt') toast(`${event.amount} 位队友 · 留意红色预警`, .8);
      if (event.type === 'boss') toast('终点守卫 · 对准它，躲开红色区域', 2.2);
      if (event.type === 'warning') toast('红色区域即将开火，向旁边躲！', 1.2);
    }
    if (visualTime > toastUntil) $('toast').classList.remove('visible');
    if (game.mode !== 'paused') renderer.update(dt); renderer.draw(game, visualTime); syncUI();
    frameCount++; fpsTime += dt; if (fpsTime >= 1) { fps = frameCount / fpsTime; frameCount = 0; fpsTime = 0; }
  }
  requestAnimationFrame(frame);
}
soundUI(); $('game-frame').classList.toggle('motion-reduced', reducedMotion); syncUI(); requestAnimationFrame(frame);
// Explicit opt-in acceptance aid. No telemetry and no default global state.
if (new URLSearchParams(location.search).has('qa')) window.__NEON_QA__ = { game, renderer, stepper, getState: () => ({ mode: game.mode, level: game.level.id, weapon: game.weapon, time: game.time, squad: game.squad, rapid: game.rapid, fireRate: game.fireRate, x: game.x, targetX: game.targetX, bullets: game.bullets.count, enemies: game.enemies.count, particles: renderer.particles.count, fps, dpr: renderer.dpr, bossHP: game.boss?.hp, stats: { ...game.stats } }) };
