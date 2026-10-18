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

test('crowd silhouettes batch by depth and never draw fodder HP bars', () => {
  const { renderer: r, calls } = renderer();
  const enemies = Array.from({ length: 192 }, (_, id) => ({
    active: true, id, x: (id % 16 - 7.5) * .105, z: 240 + Math.floor(id / 16) * 22,
    hp: 1, maxHP: 3, phase: id * .3, hit: 0, heavy: false,
  }));
  calls.length = 0; r.enemiesBatch(enemies, 1);
  assert.equal(r.drawStats.enemyBatches, 1);
  assert.equal(calls.filter(([kind]) => kind === 'fill').length, 3);
  assert.equal(calls.filter(([kind]) => kind === 'stroke').length, 1);
  assert.equal(calls.filter(([kind]) => kind === 'rect').length, 192 * 2, 'two eye marks each, no HP rectangles');
  assert.ok(calls.some(([kind, prop, value]) => kind === 'set' && prop === 'fillStyle' && value === '#152332'));
  assert.ok(!calls.some(([kind, prop, value]) => kind === 'set' && prop === 'fillStyle' && value === '#e85e87'));
  calls.length = 0; r.enemy({ ...enemies[0], heavy: true, hp: 10, maxHP: 20 }, 1);
  assert.equal(calls.filter(([kind]) => kind === 'rect').length, 6, 'heavy eyes, shoulder marks and health bar');
  assert.ok(calls.some(([kind, prop, value]) => kind === 'set' && prop === 'strokeStyle' && value === '#f3b66e'));
});

test('a group death leaves bounded dark fragments and one aggregated kill counter', () => {
  const { renderer: r } = renderer();
  for (let i = 0; i < 40; i++) r.event({ type: 'kill', x: -.5 + i / 40, z: 180 + i, enemyId: i, heavy: false, batch: 1 });
  assert.equal(r.particles.count, 80);
  assert.ok(r.particles.items.filter(p => p.active).every(p => p.kind === 'chunk' && p.color === '#152332'));
  assert.equal(r.labels.filter(l => l.kind === 'kills').length, 0);
  for (let i = 0; i < 6; i++) r.update(.05);
  assert.equal(r.labels.filter(l => l.kind === 'kills').length, 1);
  assert.equal(r.labels.find(l => l.kind === 'kills').text, '+40');
  assert.ok(r.shake <= .045, 'kill burst camera impulse stays below one pixel');
  for (let i = 0; i < 12; i++) r.event({ type: 'kill', x: .2, z: 100, enemyId: i, heavy: true, batch: 2 });
  for (let i = 0; i < 6; i++) r.update(.05);
  assert.equal(r.labels.filter(l => l.kind === 'kills').length, 1);
  assert.equal(r.labels.find(l => l.kind === 'kills').text, '+12');
  assert.equal(r.killBatch.count, 0);
});

test('large death/event storms share the same fixed FX pool and reset kill state', () => {
  for (const reduced of [false, true]) {
    const { renderer: r } = renderer(reduced);
    for (let i = 0; i < 1000; i++) {
      r.event({ type: 'kill', x: 0, z: 200, enemyId: i, heavy: i % 7 === 0 });
      r.event({ type: 'fire', x: 0, weapon: 'pierce', tier: 2, batch: i });
      r.event({ type: 'explosion', x: 0, z: 200, radius: .52, depth: 150, tier: 2 });
      r.event({ type: 'power', x: 0, name: '横扫支援', weapon: 'cannon', tier: 2 });
    }
    assert.equal(r.particles.items.length, reduced ? 80 : 280);
    assert.ok(r.particles.count <= (reduced ? 80 : 280));
    assert.ok(r.labels.length <= 6);
    r.reset(); assert.equal(r.killBatch.count, 0); assert.equal(r.particles.count, 0); assert.equal(r.labels.length, 0);
  }
});

test('reduced motion leaves FX positions/radii static and disables every camera/flash response', () => {
  const { renderer: r, calls } = renderer(true);
  for (const event of [
    { type: 'kill', x: 0, z: 200, enemyId: 2 },
    { type: 'fire', x: 0, weapon: 'pierce', tier: 2 },
    { type: 'power', x: 0, name: '横扫支援', weapon: 'cannon', tier: 2 },
    { type: 'explosion', x: .2, z: 200, radius: .52, depth: 150, tier: 2 },
    { type: 'hurt', x: 0, amount: -3 },
    { type: 'gain', x: 0, amount: 4 },
  ]) r.event(event);
  const before = r.particles.items.filter(p => p.active).map(p => ({ x: p.x, y: p.y, radius: p.radius, radiusY: p.radiusY }));
  r.update(.05);
  assert.deepEqual(r.particles.items.filter(p => p.active).map(p => ({ x: p.x, y: p.y, radius: p.radius, radiusY: p.radiusY })), before);
  assert.equal(r.shake, 0); assert.equal(r.flash, 0); assert.equal(r.muzzle, 0);
  calls.length = 0; r.effects(); const shapes = calls.filter(([name]) => name === 'ellipse');
  r.update(.05); calls.length = 0; r.effects();
  assert.deepEqual(calls.filter(([name]) => name === 'ellipse'), shapes, 'no ring expansion');
});

test('real tier projectile width and velocity control the visible pattern', () => {
  const { renderer: r, calls } = renderer();
  const widths = [];
  for (const [tier, radius] of [[0, .012], [1, .055], [2, .11]]) {
    calls.length = 0; r.bullet({ x: .2, z: 200, weapon: 'pierce', tier, radius, vx: 0, speed: 1120 });
    widths.push(calls.find(([kind, prop]) => kind === 'set' && prop === 'lineWidth')[2]);
  }
  assert.ok(widths[2] > widths[1] * 1.6 && widths[1] > widths[0] * 1.6);
  const b = { x: .1, z: 200, weapon: 'scatter', tier: 2, radius: .035, vx: .76, speed: 1150 };
  calls.length = 0; r.bullet(b);
  const tail = r.project(b.x - b.vx * (22 * 1.56) / b.speed, b.z - 22 * 1.56);
  const firstLine = calls.find(([kind]) => kind === 'lineTo');
  assert.ok(Math.abs(firstLine[1] - tail.x) < 1e-9 && Math.abs(firstLine[2] - tail.y) < 1e-9);
});

test('volley and actual explosion footprints occupy real locations and damage extents', () => {
  const { renderer: r } = renderer();
  r.event({ type: 'fire', weapon: 'rifle', tier: 0, x: .2, batch: 1 });
  r.event({ type: 'explosion', weapon: 'cannon', tier: 2, chain: true, x: -.25, z: 220, radius: .34, depth: 95 });
  const footprint = r.particles.items.find(p => p.active && p.kind === 'footprint');
  assert.equal(footprint.x, r.project(.2, 0).x); assert.equal(footprint.y, r.project(.2, 0).y);
  const explosion = r.particles.items.find(p => p.active && p.kind === 'ring');
  assert.equal(explosion.x, r.project(-.25, 220).x);
  assert.equal(explosion.radius, .34 * r.width * .455 * r.project(-.25, 220).s);
  assert.equal(explosion.radiusY, Math.abs(r.project(-.25, 125).y - r.project(-.25, 315).y) / 2);
});

test('dead enemies are omitted at their actual world positions without replacement haze', () => {
  const { renderer: r } = renderer(), g = new Game(); g.start();
  g.enemies.take({ id: 1, x: -.4, z: 200, hp: 1, maxHP: 1 });
  g.enemies.take({ id: 2, x: 0, z: 200, hp: 1, maxHP: 1 });
  g.enemies.take({ id: 3, x: .4, z: 200, hp: 1, maxHP: 1 });
  const positions = []; r.enemiesBatch = objects => positions.push(...objects.map(o => o.x));
  g.enemies.items.find(e => e.id === 2).active = false;
  r.draw(g, 0); assert.deepEqual(positions, [-.4, .4]);
  assert.equal(r.particles.count, 0);
});

test('nearby gates split depth batches at exact z even within one slice', () => {
  const { renderer: r } = renderer(), g = new Game(), order = []; g.start();
  g.gates = [{ z: 205, resolved: false }];
  g.enemies.take({ x: 0, z: 210 }); g.enemies.take({ x: 0, z: 200 });
  g.bullets.take({ x: 0, z: 208 }); g.bullets.take({ x: 0, z: 202 });
  r.background = () => {}; r.squad = () => {}; r.effects = () => {};
  r.gate = o => order.push(['gate', o.z]); r.enemy = o => order.push(['enemy', o.z]); r.bullet = o => order.push(['bullet', o.z]);
  r.draw(g, 0);
  const barrier = order.findIndex(([kind]) => kind === 'gate');
  assert.ok(order.slice(0, barrier).every(([, z]) => z > 205));
  assert.ok(order.slice(barrier + 1).every(([, z]) => z < 205));
});

test('192-enemy plus full projectile/FX/squad stress frame stays under 600 Canvas draw calls', t => {
  for (const reduced of [false, true]) {
    const { renderer: r, calls } = renderer(reduced), g = new Game(); g.start();
    g.squad = CONFIG.maxSquad; g.weaponTier = 2; g.weapon = 'scatter';
    for (let id = 0; id < 192; id++) g.enemies.take({ id, x: (id % 16 - 7.5) * .105, z: 160 + Math.floor(id / 16) * 22, hp: 1, maxHP: 2, heavy: id % 48 === 0, phase: id, hit: id % 5 ? 0 : .04 });
    for (let i = 0; i < CONFIG.maxBullets; i++) g.bullets.take({ x: (i % 25 - 12) * .06, z: 30 + (i % 32) * 24, weapon: 'scatter', tier: 2, radius: .035, vx: (i % 7 - 3) * .38, speed: 1150 });
    for (let i = 0; i < r.particles.capacity; i++) r.particles.take({ kind: 'chunk', x: i % 320, y: 150 + i % 200, size: 3, color: i % 2 ? '#152332' : '#3d3740', life: .1 + (i % 4) * .04, maxLife: .31 });
    r.event({ type: 'fire', x: 0, weapon: 'scatter', tier: 2 });
    calls.length = 0; r.draw(g, 10);
    const count = calls.filter(([name]) => ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'drawImage'].includes(name)).length;
    t.diagnostic(`${reduced ? 'Reduced' : 'Normal'} motion: ${count} Canvas draws, ${r.drawStats.enemyBatches} enemy batches, ${r.drawStats.bulletBatches} projectile batches, ${CONFIG.maxBullets} projectiles`);
    assert.equal(r.drawStats.enemies, 192); assert.equal(r.drawStats.bullets, CONFIG.maxBullets);
    assert.ok(count < 600, `Measured ${count} Canvas draw calls`);
    assert.ok(r.drawStats.enemyBatches < 45);
  }
});
