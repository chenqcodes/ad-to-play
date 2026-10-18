import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GATES, CONFIG, squadOffset } from '../src/game.js';
import { Renderer } from '../src/render.js';
function renderer(reducedMotion = false) {
  const text = [], noop = () => {};
  const ctx = new Proxy({ fillText: (...args) => text.push(args), createLinearGradient: () => ({ addColorStop: noop }), measureText: str => ({ width: str.length * 18 }) }, { get: (o, key) => key in o ? o[key] : noop });
  const canvas = { getContext: () => ctx }, renderer = new Renderer(canvas, { reducedMotion });
  renderer.resize(320, 495, 3); return { renderer, canvas, text };
}
test('gate labels show the real next fire rate and capped fallback recruits', () => {
  const { renderer: r, text } = renderer(), g = new Game();
  r.gate({ ...GATES[1], z: 50 }, g); assert.ok(text.some(([value]) => value === '射速 ×1.35'));
  text.length = 0; g.rapid = 1; r.gate({ ...GATES[1], z: 50 }, g); assert.ok(text.some(([value]) => value === '射速 ×1.70'));
  text.length = 0; g.rapid = 2; r.gate({ ...GATES[1], z: 50 }, g);
  assert.equal(text.filter(([value]) => value === '+5').length, 2); assert.ok(!text.some(([value]) => value === '连射'));
});
test('DPR, particle and label budgets hold across heavy repeated effects', () => {
  for (const reduced of [false, true]) {
    const { renderer: r, canvas } = renderer(reduced); assert.equal(r.dpr, 2); assert.equal(canvas.width, 640); assert.equal(canvas.height, 990);
    for (let i = 0; i < 100; i++) { r.event({ type: 'gain', x: 0, amount: 5 }); r.event({ type: 'upgrade', x: 0, rate: 1.7 }); r.event({ type: 'hurt', x: 0, amount: -2 }); }
    assert.ok(r.particles.count <= (reduced ? 80 : 280)); assert.ok(r.labels.length <= 6); if (reduced) assert.equal(r.shake, 0);
    r.reset(); assert.equal(r.particles.count, 0); assert.equal(r.labels.length, 0);
  }
});
test('42-member rendered formation fits narrow mobile canvas at both edges', () => {
  const { renderer: r } = renderer();
  for (const edge of [-.79, .79]) for (let i = 0; i < CONFIG.maxSquad; i++) {
    const offset = squadOffset(i, CONFIG.maxSquad), x = r.project(edge + offset.x, 0).x, y = r.project(edge + offset.x, offset.z).y;
    const size = 13 * r.width / 420;
    assert.ok(x - size * .62 > 0 && x + size * .8 < r.width);
    assert.ok(y + size * .27 < r.height && y - size * 2.15 > 0);
  }
});
test('ready, rapid choice, heavy, Boss and protected-squad paths draw without state mutation', () => {
  const { renderer: r } = renderer(), g = new Game(); r.draw(g, 0);
  g.start(); g.squad = 42; g.rapid = 2; g.hurtUntil = 1; g.gates = [{ ...GATES[3], z: 90 }];
  g.spawnWave({ at: 0, x: .2, z: 100, count: 1, hp: 20, heavy: true });
  g.boss = { x: .4, z: 440, hp: 400, maxHP: 1000, enraged: true, attack: { x: 0, at: 1, started: 0 } };
  const before = JSON.stringify(g); r.draw(g, .1); assert.equal(JSON.stringify(g), before);
});
