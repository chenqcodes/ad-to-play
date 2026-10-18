// Mocked DOM integration, not a substitute for Safari/Chrome device testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let run = 0;
async function harness() {
  const listeners = new Map();
  const on = (object, name, handler) => {
    const events = listeners.get(object) || new Map();
    const handlers = events.get(name) || []; handlers.push(handler); events.set(name, handlers); listeners.set(object, events);
  };
  const dispatch = (object, name, detail = {}) => {
    const event = { target: object, preventDefault() {}, ...detail };
    for (const handler of listeners.get(object)?.get(name) || []) handler(event);
  };
  const noop = () => {};
  const context = new Proxy({ createLinearGradient: () => ({ addColorStop: noop }), measureText: text => ({ width: text.length * 12 }) }, {
    get: (target, property) => property in target ? target[property] : noop,
  });
  class Element {
    constructor(id = '') { this.id = id; this.style = {}; this.attributes = {}; this.children = []; this.hidden = false; this.captured = new Set(); this.classes = new Set(); this.classList = { add: value => this.classes.add(value), remove: value => this.classes.delete(value), toggle: (value, enabled) => enabled ? this.classes.add(value) : this.classes.delete(value) }; }
    addEventListener(name, handler) { on(this, name, handler); }
    setAttribute(name, value) { this.attributes[name] = value; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    getBoundingClientRect() { return { width: 390, height: 699, left: 0, top: 0 }; }
    focus() { document.activeElement = this; }
    setPointerCapture(id) { this.captured.add(id); }
    releasePointerCapture(id) { this.captured.delete(id); }
    getContext() { return context; }
  }
  class Button extends Element {}
  const elements = new Map([...html.matchAll(/<([\w-]+)[^>]*\bid="([^"]+)"/g)].map(([, tag, id]) => [id, new (tag === 'button' ? Button : Element)(id)]));
  let callback, now = 1000, audioContexts = 0;
  const stored = new Map(), vibrations = [];
  class Audio {
    constructor() { audioContexts++; this.state = 'running'; this.currentTime = 1; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() { return { frequency: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop, disconnect: noop, start: noop, stop: noop }; }
    createGain() { return { gain: { setValueAtTime: noop, exponentialRampToValueAtTime: noop }, connect: noop, disconnect: noop }; }
  }
  globalThis.document = { hidden: false, getElementById: id => { assert.ok(elements.has(id), `HTML contains #${id}`); return elements.get(id); }, createElement: () => new Element(), addEventListener(name, handler) { on(this, name, handler); } };
  globalThis.window = { localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) }, navigator: { vibrate: duration => vibrations.push(duration) }, devicePixelRatio: 3, AudioContext: Audio, addEventListener(name, handler) { on(this, name, handler); } };
  globalThis.HTMLButtonElement = Button;
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.ResizeObserver = class { observe() {} };
  globalThis.requestAnimationFrame = fn => { callback = fn; };
  globalThis.location = { search: '?qa=1' };
  await import(`../src/main.js?harness=${++run}`);
  const frame = (count = 1) => { for (let i = 0; i < count; i++) { now += 1000 / 60; callback(now); } };
  const click = id => dispatch(elements.get(id), 'click');
  return { elements, frame, click, dispatch, stored, vibrations, game: window.__NEON_QA__.game, qa: window.__NEON_QA__, get audioContexts() { return audioContexts; } };
}
test('HTML IDs, initial HUD and DPR cap integrate without a browser', async () => {
  const h = await harness(); h.frame();
  assert.equal(h.game.mode, 'ready'); assert.equal(h.elements.get('squad-count').textContent, '04');
  assert.equal(h.elements.get('fire-rate').textContent, '射速 ×1.00'); assert.equal(h.qa.renderer.dpr, 2);
  assert.equal(h.elements.get('game').width, 780); assert.equal(h.audioContexts, 0);
});
test('audio waits for a start gesture and mute state remains explicit', async () => {
  const h = await harness(); h.click('sound-button'); assert.equal(h.audioContexts, 0);
  h.click('start-button'); assert.equal(h.game.mode, 'playing'); assert.equal(h.audioContexts, 1);
  h.click('sound-button'); assert.equal(h.elements.get('sound-button').attributes['aria-pressed'], 'true');
  h.click('sound-button'); assert.equal(h.audioContexts, 1);
});
test('relative drag captures one pointer and releases it on pause', async () => {
  const h = await harness(), c = h.elements.get('game'); h.click('start-button');
  h.dispatch(c, 'pointerdown', { pointerId: 1, clientX: 100 }); assert.ok(c.captured.has(1));
  h.dispatch(c, 'pointerdown', { pointerId: 2, clientX: 300 }); assert.ok(!c.captured.has(2));
  h.dispatch(c, 'pointermove', { pointerId: 2, clientX: 400 }); assert.equal(h.game.targetX, 0);
  h.dispatch(c, 'pointermove', { pointerId: 1, clientX: 180 }); assert.ok(h.game.targetX > .49 && h.game.targetX < .51);
  h.frame(20); assert.ok(h.game.x > 0); h.click('pause-button'); assert.equal(c.captured.size, 0);
  const before = h.game.time; h.frame(100); assert.equal(h.game.time, before);
  h.click('start-button'); assert.equal(h.game.mode, 'playing');
  h.dispatch(c, 'pointerdown', { pointerId: 3, clientX: 100 }); h.dispatch(c, 'pointercancel', { pointerId: 3 });
  const target = h.game.targetX; h.dispatch(c, 'pointermove', { pointerId: 3, clientX: 0 }); assert.equal(h.game.targetX, target);
});
test('keyboard, blur and hidden-page pause cannot advance background gameplay', async () => {
  const h = await harness(), c = h.elements.get('game'); h.click('start-button');
  h.dispatch(window, 'keydown', { target: c, code: 'ArrowRight' }); h.frame(20); assert.ok(h.game.x > .4);
  h.dispatch(window, 'keyup', { code: 'ArrowRight' }); const beforeButtonKey = h.game.targetX;
  h.dispatch(window, 'keydown', { target: h.elements.get('sound-button'), code: 'ArrowLeft' }); h.frame(10); assert.ok(h.game.targetX < beforeButtonKey);
  h.dispatch(window, 'keyup', { code: 'ArrowLeft' }); const targetBeforeBlur = h.game.targetX; h.dispatch(window, 'blur'); assert.equal(h.game.mode, 'paused'); const t = h.game.time; h.frame(60); assert.equal(h.game.time, t);
  h.click('start-button'); h.frame(10); assert.equal(h.game.targetX, targetBeforeBlur);
  document.hidden = true; h.dispatch(document, 'visibilitychange'); const t2 = h.game.time; h.frame(60); assert.equal(h.game.time, t2);
  document.hidden = false; h.dispatch(document, 'visibilitychange'); h.frame(10); assert.equal(h.game.mode, 'paused');
});
test('rapid HUD, Boss deadline and immediate retry reset every gameplay field', async () => {
  const h = await harness(); h.click('start-button'); h.game.takeGate({ type: 'rapid', value: 1 }); h.frame(2);
  assert.equal(h.elements.get('fire-rate').textContent, '射速 ×1.35');
  h.game.time = 42; h.frame(2); assert.match(h.elements.get('boss-percent').textContent, /剩 18 秒/);
  h.game.finish(false, 'timeout'); h.frame(); assert.equal(h.elements.get('start-label').textContent, '立即再来');
  h.click('start-button'); assert.equal(h.game.squad, 4); assert.equal(h.game.time, 0); assert.equal(h.game.rapid, 0); assert.equal(h.game.targetX, 0); assert.equal(h.game.boss, null);
  assert.equal(h.elements.get('fire-rate').textContent, '射速 ×1.00'); assert.equal(h.elements.get('overlay').hidden, true);
});

test('all three levels are immediately selectable, but a live run cannot be replaced accidentally', async () => {
  const h = await harness(); h.click('level-1');
  assert.equal(h.game.level.id, 'firepower'); assert.equal(h.game.squad, 6);
  assert.equal(h.elements.get('level-1').attributes['aria-pressed'], 'true');
  h.click('level-2'); assert.equal(h.game.level.id, 'survival'); assert.equal(h.game.squad, 8);
  h.click('start-button'); h.click('level-0'); assert.equal(h.game.level.id, 'survival');
  assert.equal(h.elements.get('level-0').disabled, true);
  h.game.finish(false, 'gate'); h.frame(); h.click('level-0');
  assert.equal(h.game.mode, 'ready'); assert.equal(h.game.level.id, 'growth'); assert.equal(h.game.squad, 4);
});
test('weapon HUD, next level and local records stay in sync', async () => {
  const h = await harness(); h.click('start-button');
  h.game.takeGate({ type: 'weapon', weapon: 'pierce' }); h.frame(2);
  assert.equal(h.elements.get('weapon-label').textContent, '穿透枪');
  h.game.time = 51; h.game.finish(true); h.frame(2);
  assert.equal(h.elements.get('next-level-button').hidden, false);
  assert.match(h.elements.get('result-best').textContent, /本机最快 51.0/);
  h.frame(10); const saved = JSON.parse([...h.stored.values()][0]);
  assert.equal(saved.records.growth.wins, 1);
  h.click('next-level-button'); assert.equal(h.game.level.id, 'firepower');
  assert.equal(h.game.mode, 'playing'); assert.equal(h.game.weapon, 'rifle'); assert.equal(h.game.time, 0);
});
test('motion and vibration preferences are explicit and vibration is quiet by default', async () => {
  const h = await harness(); h.click('start-button'); h.game.addSquad(2); h.frame(2);
  assert.deepEqual(h.vibrations, []);
  h.elements.get('vibration-setting').checked = true; h.dispatch(h.elements.get('vibration-setting'), 'change');
  h.game.addSquad(2); h.frame(2); assert.equal(h.vibrations.length, 1);
  h.elements.get('motion-setting').checked = true; h.dispatch(h.elements.get('motion-setting'), 'change');
  assert.equal(h.qa.renderer.reducedMotion, true);
  h.frame(30); h.game.addSquad(2); h.frame(2); assert.equal(h.vibrations.length, 1);
  const saved = JSON.parse([...h.stored.values()][0]); assert.equal(saved.reducedMotion, true); assert.equal(saved.vibration, true);
});
