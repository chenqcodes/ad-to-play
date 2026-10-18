import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, LEVELS, WEAPONS, CONFIG, squadOffset } from '../src/game.js';
import { Renderer } from '../src/render.js';

function renderer(reducedMotion = false) {
  const text = [], calls = [], noop = () => {};
  const base = {
    fillText: (...args) => { text.push(args); calls.push(['fillText', ...args]); },
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: str => ({ width: str.length * 8 }),
  };
  const ctx = new Proxy(base, {
    get: (o, key) => key in o ? o[key] : (...args) => calls.push([key, ...args]),
    set: (o, key, value) => { calls.push(['set', key, value]); o[key] = value; return true; },
  });
  const canvas = { getContext: () => ctx }, renderer = new Renderer(canvas, { reducedMotion });
  renderer.resize(320, 495, 3); return { renderer, canvas, text, calls };
}
const recruit = (value, cap = 12, extra = {}) => ({ type: 'recruit', value, cap, maxValue: cap, shootable: true, shotProgress: 3, shotCost: 6, hit: 0, ...extra });

test('shootable gates show current signed value, growth status and honest cap', () => {
  const { renderer: r, text } = renderer(), g = new Game();
  r.gate({ z: 50, left: recruit(-3), right: recruit(12) }, g);
  for (const label of ['-3', '+12', '射击 ↑', '成长已满', '上限 +12']) assert.ok(text.some(([value]) => value === label), label);
  assert.ok(!text.some(([value]) => /无限/.test(value)));
  text.length = 0;
  r.gate({ z: 50, left: recruit(5, 5, { shootable: false }), right: recruit(0) }, g);
  assert.ok(text.some(([value]) => value === '直接招募'));
  assert.ok(text.some(([value]) => value === '0'));
});

test('weapon doors name the exact weapon and explain distinct behavior', () => {
  const { renderer: r, text } = renderer(), g = new Game();
  r.gate({ z: 40, left: { type: 'weapon', weapon: 'scatter' }, right: { type: 'weapon', weapon: 'pierce' } }, g);
  g.weapon = 'pierce';
  r.gate({ z: 40, left: { type: 'weapon', weapon: 'cannon' }, right: { type: 'weapon', weapon: 'rifle' } }, g);
  for (const key of Object.keys(WEAPONS)) assert.ok(text.some(([value]) => value === WEAPONS[key].name), key);
  for (const label of ['扇形散射', '穿透敌群', '范围爆破', '稳定连射']) assert.ok(text.some(([value]) => value === label), label);
});

test('equipped weapon door shows the actual fixed recruitment fallback', () => {
  const { renderer: r, text } = renderer(), g = new Game(); g.weapon = 'scatter';
  r.gate({ z: 40, left: { type: 'weapon', weapon: 'scatter' }, right: { type: 'weapon', weapon: 'pierce' } }, g);
  assert.ok(text.some(([value]) => value === '+5'));
  assert.ok(text.some(([value]) => value === '直接招募'));
  assert.ok(!text.some(([value]) => value === WEAPONS.scatter.name));
  assert.ok(text.some(([value]) => value === WEAPONS.pierce.name));
});

test('rapid labels show actual next rate and capped fixed recruitment fallback', () => {
  const { renderer: r, text } = renderer(), g = new Game();
  const row = { z: 50, left: { type: 'rapid' }, right: { type: 'recruit', value: 5, shootable: false } };
  r.gate(row, g); assert.ok(text.some(([value]) => value === '射速 ×1.35'));
  text.length = 0; g.rapid = 1; r.gate(row, g); assert.ok(text.some(([value]) => value === '射速 ×1.70'));
  text.length = 0; g.rapid = 2; r.gate(row, g);
  assert.equal(text.filter(([value]) => value === '+5').length, 2);
  assert.ok(!text.some(([value]) => value === '连射'));
  assert.equal(text.filter(([value]) => value === '直接招募').length, 2);
});

test('projectile color and geometry distinguish four actual weapon types', () => {
  const { renderer: r, calls } = renderer();
  const snapshots = {};
  for (const weapon of Object.keys(WEAPONS)) {
    calls.length = 0; r.bullet({ x: .2, z: 220, weapon, vx: weapon === 'scatter' ? .23 : 0 });
    assert.ok(calls.some(([method, prop, value]) => method === 'set' && (prop === 'fillStyle' || prop === 'strokeStyle') && value === WEAPONS[weapon].color), weapon);
    snapshots[weapon] = [...calls];
  }
  assert.ok(snapshots.cannon.some(([method]) => method === 'arc'));
  assert.ok(!snapshots.rifle.some(([method]) => method === 'arc'));
  const firstLine = entries => entries.find(([method]) => method === 'lineTo');
  assert.ok(firstLine(snapshots.pierce)[2] > firstLine(snapshots.rifle)[2], 'pierce has a longer trail');
  assert.notEqual(firstLine(snapshots.scatter)[1], firstLine(snapshots.rifle)[1], 'scatter trail reflects actual lateral velocity');
  assert.equal(new Set(Object.values(WEAPONS).map(weapon => weapon.color)).size, 4);
});

test('DPR, particle and label budgets hold across heavy repeated effects', () => {
  for (const reduced of [false, true]) {
    const { renderer: r, canvas } = renderer(reduced);
    assert.equal(r.dpr, 2); assert.equal(canvas.width, 640); assert.equal(canvas.height, 990);
    for (let i = 0; i < 100; i++) {
      r.event({ type: 'gain', x: 0, amount: 5 });
      r.event({ type: 'weapon', weapon: 'cannon', x: 0 });
      r.event({ type: 'hurt', x: 0, amount: -2 });
      r.event({ type: 'explosion', x: 0, z: 200, radius: .24 });
      r.event({ type: 'gateGrow', x: 0, z: 80, value: 1, amount: 1 });
    }
    assert.ok(r.particles.count <= (reduced ? 80 : 280));
    assert.equal(r.particles.items.length, reduced ? 80 : 280);
    assert.ok(r.labels.length <= 6);
    if (reduced) { assert.equal(r.shake, 0); assert.equal(r.flash, 0); assert.equal(r.muzzle, 0); }
    for (let i = 0; i < 30; i++) r.update(.05);
    assert.equal(r.particles.count, 0); assert.equal(r.labels.length, 0);
    r.reset(); assert.equal(r.particles.count, 0); assert.equal(r.labels.length, 0);
  }
});

test('runtime reduced-motion toggle clears transients and changes the pool budget', () => {
  const { renderer: r } = renderer();
  r.event({ type: 'hurt', x: 0, amount: -2 }); r.event({ type: 'gain', x: 0, amount: 4 });
  assert.ok(r.shake > 0 && r.flash > 0 && r.particles.count > 0);
  r.setReducedMotion(true);
  assert.equal(r.particles.capacity, 80); assert.equal(r.particles.count, 0);
  assert.equal(r.shake, 0); assert.equal(r.flash, 0); assert.equal(r.labels.length, 0);
  r.event({ type: 'fire', weapon: 'scatter' }); assert.equal(r.muzzle, 0);
  r.setReducedMotion(false); assert.equal(r.particles.capacity, 280);
});

test('42-member formation fits narrow mobile edges and leaves lower 15% clear', () => {
  const { renderer: r } = renderer();
  for (const [width, height] of [[320, 495], [360, 580], [420, 700]]) {
    r.resize(width, height);
    for (const edge of [-.79, .79]) for (let i = 0; i < CONFIG.maxSquad; i++) {
      const offset = squadOffset(i, CONFIG.maxSquad), x = r.project(edge + offset.x, 0).x, y = r.project(edge + offset.x, offset.z).y;
      const size = 13 * r.width / 420;
      assert.ok(x - size * .62 > 0 && x + size * .8 < r.width);
      assert.ok(y + size * .27 + 1.2 < r.height * .85 && y - size * 2.15 > 0);
    }
  }
});

test('reduced motion disables enemy bob, rotation, hit flash and boss bob', () => {
  const { renderer: r, calls } = renderer(true);
  const e = { x: .2, z: 100, hp: 4, maxHP: 8, hit: .1, phase: 2 };
  calls.length = 0; r.enemy(e, 0); const first = JSON.stringify(calls);
  calls.length = 0; r.enemy({ ...e, hit: 0 }, 12); assert.equal(JSON.stringify(calls), first);
  assert.ok(!calls.some(([method]) => method === 'rotate'));
  const b = { x: .1, z: 440, hit: .1, enraged: true };
  calls.length = 0; r.boss(b, 0); const firstBoss = JSON.stringify(calls);
  calls.length = 0; r.boss({ ...b, hit: 0 }, 10); assert.equal(JSON.stringify(calls), firstBoss);
});

test('boss warning is static high-contrast geometry with accurate countdown', () => {
  const { renderer: r, calls, text } = renderer();
  const attack = { x: .79, width: .23, at: 12, started: 10.8 };
  r.warning(attack, 11);
  assert.ok(text.some(([value]) => value === '避开红区 1.0s'));
  const fill = calls.find(([method, prop]) => method === 'set' && prop === 'fillStyle')[2];
  calls.length = 0; text.length = 0; r.warning(attack, 11.5);
  assert.equal(calls.find(([method, prop]) => method === 'set' && prop === 'fillStyle')[2], fill);
  assert.ok(text.some(([value, x]) => value === '避开红区 0.5s' && x + 51 < r.width));
});

test('target and projectile depth sorting preserves near-target occlusion', () => {
  const { renderer: r } = renderer(), g = new Game(), order = [];
  g.start(); g.gates = [{ z: 200, resolved: false }];
  g.enemies.take({ x: 0, z: 400 }); g.bullets.take({ x: 0, z: 300 });
  r.background = () => {}; r.squad = () => {}; r.effects = () => {};
  r.gate = o => order.push(['gate', o.z]); r.enemy = o => order.push(['enemy', o.z]); r.bullet = o => order.push(['bullet', o.z]);
  r.draw(g, 0);
  assert.deepEqual(order, [['enemy', 400], ['bullet', 300], ['gate', 200]]);
});

test('boss countdown remains above projectiles, squad and impact effects', () => {
  const { renderer: r } = renderer(), g = new Game(), order = [];
  g.start(); g.boss = { x: 0, z: 440, attack: { x: 0, at: 1, started: 0 } };
  g.bullets.take({ x: 0, z: 150 });
  r.background = () => {}; r.boss = () => {};
  r.warning = () => order.push('lane'); r.bullet = () => order.push('bullet');
  r.squad = () => order.push('squad'); r.effects = () => order.push('effects');
  r.warningLabel = () => order.push('countdown');
  r.draw(g, 0);
  assert.deepEqual(order, ['lane', 'bullet', 'squad', 'effects', 'countdown']);
});

test('all level, weapon, gate, heavy and boss paths draw without game mutations', () => {
  for (const level of LEVELS) for (const reduced of [false, true]) {
    const { renderer: r } = renderer(reduced), g = new Game(level.id);
    const ready = JSON.stringify(g); r.draw(g, 0); assert.equal(JSON.stringify(g), ready);
    g.start(); g.squad = 42; g.rapid = 2; g.hurtUntil = 1;
    g.spawnGate({ ...level.gates[0], z: 90 });
    g.spawnWave({ at: 0, x: .2, z: 100, count: 1, hp: 20, heavy: true });
    g.boss = { x: .4, z: 440, hp: 400, maxHP: 1000, hit: .1, enraged: true, attack: { x: 0, at: 1, started: 0, width: .23 } };
    for (const weapon of Object.keys(WEAPONS)) {
      g.weapon = weapon; g.fire();
      const before = JSON.stringify(g); r.draw(g, .1); assert.equal(JSON.stringify(g), before);
    }
  }
});
