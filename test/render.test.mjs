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

test('full enemy/projectile/FX/squad stress frame stays under 600 Canvas draw calls', t => {
  for (const reduced of [false, true]) {
    const { renderer: r, calls } = renderer(reduced), g = new Game(); g.start();
    g.squad = CONFIG.maxSquad; g.weaponTier = 2; g.weapon = 'scatter';
    for (let id = 0; id < CONFIG.maxEnemies; id++) g.enemies.take({ id, x: (id % 16 - 7.5) * .105, z: 160 + Math.floor(id / 16) * 22, hp: 1, maxHP: 2, heavy: id % 48 === 0, phase: id, hit: id % 5 ? 0 : .04 });
    for (let i = 0; i < CONFIG.maxBullets; i++) g.bullets.take({ x: (i % 25 - 12) * .06, z: 30 + (i % 32) * 24, weapon: 'scatter', tier: 2, radius: .035, vx: (i % 7 - 3) * .38, speed: 1150 });
    for (let i = 0; i < r.particles.capacity; i++) r.particles.take({ kind: 'chunk', x: i % 320, y: 150 + i % 200, size: 3, color: i % 2 ? '#152332' : '#3d3740', life: .1 + (i % 4) * .04, maxLife: .31 });
    r.event({ type: 'fire', x: 0, weapon: 'scatter', tier: 2 });
    calls.length = 0; r.draw(g, 10);
    const count = calls.filter(([name]) => ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'drawImage'].includes(name)).length;
    t.diagnostic(`${reduced ? 'Reduced' : 'Normal'} motion: ${count} Canvas draws, ${r.drawStats.enemyBatches} enemy batches, ${r.drawStats.bulletBatches} projectile batches, ${CONFIG.maxBullets} projectiles`);
    assert.equal(r.drawStats.enemies, CONFIG.maxEnemies); assert.equal(r.drawStats.bullets, CONFIG.maxBullets);
    assert.ok(count < 600, `Measured ${count} Canvas draw calls`);
    assert.ok(r.drawStats.enemyBatches < 45);
  }
});

test('a one-hit kill still renders its original silhouette when live enemy and FX slots are unavailable', () => {
  const { renderer: r, calls } = renderer(), g = new Game(); g.start();
  const enemy = g.enemies.take({ id: 991, x: .2, z: 220, hp: 1, maxHP: 1, hit: 0, heavy: false });
  for (let i = 0; i < r.particles.capacity; i++) r.particles.take({ kind: 'chunk', x: 0, y: 0, size: 1, color: '#152332', life: .3, maxLife: .3, vx: 0, vy: 0 });
  g.damageEnemy(enemy, 1, { weapon: 'rifle', vx: 0, speed: 780 });
  for (const event of g.drainEvents()) r.event(event);
  assert.equal(enemy.active, false); assert.equal(enemy.hp, 0); assert.equal(g.stats.kills, 1);
  assert.equal(r.particles.count, r.particles.capacity); assert.equal(r.deathProxies.count, 1);
  const proxy = r.deathProxies.items.find(p => p.active);
  assert.equal(proxy.x, .2); assert.equal(proxy.z, 220); assert.equal(proxy.enemyId, 991);
  assert.ok(!Object.values(proxy).includes(enemy)); assert.ok(!('hp' in proxy) && !('radius' in proxy));
  r.update(1 / 60); calls.length = 0; const before = JSON.stringify(g); r.draw(g, 1);
  assert.equal(JSON.stringify(g), before); assert.equal(r.drawStats.enemies, 0); assert.equal(r.drawStats.deaths, 1);
  assert.ok(calls.some(([kind, property, value]) => kind === 'set' && property === 'strokeStyle' && value === '#fff0be'));
  assert.equal(r.deathPose(proxy).stage, 'edge'); assert.equal(r.flash, 0);
  assert.ok(r.deathPose(proxy).width < 1 && r.deathPose(proxy).height < 1, 'original silhouette is inset from the live body');
});

test('death snapshots move away from impact, stay narrow and survive source reuse and resize', () => {
  for (const [dirX, dirZ, impact] of [[.6, .8, 'direct'], [-.6, -.8, 'blast'], [1, 0, 'chain']]) {
    const { renderer: r } = renderer();
    const source = { type: 'kill', x: .2, z: 220, dirX, dirZ, impact, enemyId: 7, heavy: true };
    r.event(source); const proxy = r.deathProxies.items.find(p => p.active);
    source.x = -10; source.z = 2000; source.dirX = -dirX;
    r.update(.05); r.update(.05); const pose = r.deathPose(proxy);
    assert.equal(proxy.x, .2); assert.equal(proxy.z, 220);
    if (dirX) assert.ok((pose.x - proxy.x) * dirX > 0);
    if (dirZ) assert.ok((pose.z - proxy.z) * dirZ > 0);
    assert.ok(Math.abs(pose.x - proxy.x) <= .04375 + 1e-9 && Math.abs(pose.z - proxy.z) <= 17.5 + 1e-9);
    assert.ok(pose.height < .4 && pose.width < .75, 'knockdown exposes the lane');
    assert.ok(.45 * pose.width + 1.31 * Math.abs(pose.lean) < .45, 'lean cannot widen the silhouette past a live body');
    r.resize(420, 700); const resized = r.deathPose(proxy), projected = r.project(resized.x, resized.z);
    assert.equal(resized.x, pose.x); assert.equal(resized.z, pose.z);
    assert.equal(resized.screenX, projected.x); assert.equal(resized.screenY, projected.y);
    assert.notEqual(resized.screenX, pose.screenX);
  }
});

test('missing, zero and malformed kill directions use a finite forward fallback', () => {
  const { renderer: r } = renderer();
  for (const direction of [{}, { dirX: 0, dirZ: 0 }, { dirX: Infinity, dirZ: NaN }, { dirX: 100, dirZ: -100 }]) {
    r.reset(); r.event({ type: 'kill', x: 0, z: 180, ...direction });
    const proxy = r.deathProxies.items.find(p => p.active);
    assert.ok(Number.isFinite(proxy.dirX) && Number.isFinite(proxy.dirZ));
    assert.ok(Math.abs(Math.hypot(proxy.dirX, proxy.dirZ) - 1) < 1e-9);
    if (direction.dirX !== 100) { assert.equal(proxy.dirX, 0); assert.equal(proxy.dirZ, 1); }
  }
});

test('death edge, directional fall and residue finish inside 170 ms', () => {
  const { renderer: r } = renderer(); r.event({ type: 'kill', x: 0, z: 200, dirX: 1, dirZ: 0 });
  const proxy = r.deathProxies.items.find(p => p.active);
  assert.equal(r.deathPose(proxy).stage, 'edge');
  r.update(1 / 30); assert.equal(r.deathPose(proxy).stage, 'edge', 'edge survives the first 30 fps frame');
  r.update(.003); assert.equal(r.deathPose(proxy).stage, 'fall');
  r.update(.05); r.update(.035); assert.equal(r.deathPose(proxy).stage, 'residue');
  assert.equal(proxy.active, true); assert.ok(r.deathPose(proxy).height <= .18);
  r.update(.048); assert.equal(proxy.active, true);
  r.update(.002); assert.equal(proxy.active, false); assert.equal(r.deathProxies.count, 0);
});

test('death proxy pool has an independent hard cap and reuses only inactive snapshots', () => {
  for (const reduced of [false, true]) {
    const { renderer: r } = renderer(reduced);
    for (let i = 0; i < 1000; i++) r.event({ type: 'kill', x: i / 1000, z: 200, enemyId: i, dirX: 0, dirZ: 1 });
    assert.equal(r.deathProxies.capacity, 48); assert.equal(r.deathProxies.items.length, 48); assert.equal(r.deathProxies.count, 48);
    assert.equal(r.particles.capacity, reduced ? 80 : 280); assert.equal(r.particles.count, r.particles.capacity);
    assert.ok(r.deathProxies.items.every(p => !r.particles.items.includes(p)));
    const before = JSON.stringify(r.deathProxies.items);
    r.particles.clear(); r.burst(0, 0, '#fff', 280, 100);
    assert.equal(JSON.stringify(r.deathProxies.items), before);
    for (let i = 0; i < 4; i++) r.update(.05);
    assert.equal(r.deathProxies.count, 0);
    for (let i = 1000; i < 1048; i++) r.event({ type: 'kill', x: 0, z: 100, enemyId: i });
    assert.equal(r.deathProxies.count, 48); assert.ok(r.deathProxies.items.every(p => p.enemyId >= 1000));
    r.reset(); assert.equal(r.deathProxies.count, 0); assert.equal(r.particles.count, 0);
  }
});

test('reduced-motion deaths are static faint silhouette fades with no bright edge or deformation', () => {
  const { renderer: r, calls } = renderer(true);
  r.event({ type: 'kill', x: -.2, z: 150, dirX: .8, dirZ: -.6, impact: 'blast', heavy: true });
  const proxy = r.deathProxies.items.find(p => p.active), original = r.deathPose(proxy);
  calls.length = 0; r.deathsBatch([proxy]);
  const geometry = calls.filter(([name]) => ['moveTo', 'lineTo', 'ellipse', 'closePath'].includes(name));
  assert.ok(!calls.some(([name]) => ['stroke', 'translate', 'scale', 'rotate'].includes(name)));
  assert.ok(!calls.some(([name, property, value]) => name === 'set' && property === 'strokeStyle' && value === '#fff0be'));
  for (let i = 0; i < 2; i++) {
    r.update(.05); const current = r.deathPose(proxy);
    for (const key of ['x', 'z', 'screenX', 'screenY', 'size', 'width', 'height', 'lean', 'stage']) assert.equal(current[key], original[key]);
    assert.ok(current.alpha < original.alpha && current.alpha < .4);
    calls.length = 0; r.deathsBatch([proxy]);
    assert.deepEqual(calls.filter(([name]) => ['moveTo', 'lineTo', 'ellipse', 'closePath'].includes(name)), geometry);
  }
  for (const weapon of Object.keys(WEAPONS)) r.event({ type: 'fire', weapon });
  assert.equal(r.recoil, 0); assert.equal(r.muzzle, 0); assert.equal(r.shake, 0); assert.equal(r.flash, 0);
  r.update(.05); assert.equal(proxy.active, true); r.update(.01); assert.equal(proxy.active, false);
});

test('pause draws do not age death proxies and reset or motion toggles clear every transient', () => {
  const { renderer: r } = renderer(), g = new Game(); g.start();
  r.event({ type: 'kill', x: 0, z: 200, dirX: 1, dirZ: 0 }); r.event({ type: 'fire', weapon: 'cannon', x: 0 });
  g.pause(); const before = JSON.stringify(r.deathProxies.items), recoil = r.recoil;
  for (const visualTime of [1, 100, 1000]) r.draw(g, visualTime);
  for (const dt of [0, -1, NaN, Infinity]) r.update(dt);
  assert.equal(JSON.stringify(r.deathProxies.items), before); assert.equal(r.recoil, recoil);
  r.update(10); assert.equal(r.deathProxies.items.find(p => p.active).age, .05, 'resume dt is bounded');
  r.reset(); assert.equal(r.deathProxies.count, 0); assert.equal(r.recoil, 0); assert.equal(r.muzzle, 0);
  r.event({ type: 'kill', x: 0, z: 200 }); r.event({ type: 'fire', weapon: 'cannon' }); r.setReducedMotion(true);
  assert.equal(r.deathProxies.count, 0); assert.equal(r.recoil, 0); assert.equal(r.shake, 0);
  r.event({ type: 'kill', x: 0, z: 200 }); r.setReducedMotion(false); assert.equal(r.deathProxies.count, 0);
});

test('death proxies respect exact gate occlusion rather than overlaying gate labels', () => {
  const { renderer: r } = renderer(), g = new Game(), order = []; g.start();
  g.gates = [{ z: 205, resolved: false }];
  for (const z of [210, 200]) r.event({ type: 'kill', x: 0, z });
  r.background = () => {}; r.squad = () => {}; r.effects = () => {};
  r.gate = gate => order.push(['gate', gate.z]); r.deathsBatch = proxies => order.push(...proxies.map(p => ['death', p.z]));
  r.draw(g, 0); assert.deepEqual(order, [['death', 210], ['gate', 205], ['death', 200]]);
});

test('rifle has a short beat while cannon kicks the whole squad with a longer bounded pulse', () => {
  const pulses = {};
  for (const weapon of ['rifle', 'cannon']) {
    const { renderer: r, calls } = renderer(), g = new Game(); g.start(); g.weapon = weapon; g.squad = 42;
    calls.length = 0; r.squad(g, 0); const baseline = calls.filter(([name]) => name === 'ellipse').slice(0, g.squad).map(call => call[2]);
    const before = JSON.stringify(g); r.event({ type: 'fire', weapon, x: g.x });
    pulses[weapon] = { muzzle: r.muzzle, recoil: r.recoil };
    calls.length = 0; r.squad(g, 0); const fired = calls.filter(([name]) => name === 'ellipse').slice(0, g.squad).map(call => call[2]);
    const kick = fired[0] - baseline[0]; pulses[weapon].kick = kick;
    assert.ok(kick > 0 && kick <= 3.2 * r.width / 420 + 1e-9);
    assert.ok(fired.every((y, i) => Math.abs(y - baseline[i] - kick) < 1e-9), 'one coherent squad impulse');
    assert.equal(JSON.stringify(g), before, 'cosmetic recoil never changes controls, collision or actual projectiles');
    r.update(.04); assert.equal(r.muzzle > 0, weapon === 'cannon');
    for (let i = 0; i < 4; i++) r.update(.05);
    assert.equal(r.recoil, 0); assert.equal(r.muzzle, 0);
  }
  assert.ok(pulses.cannon.muzzle > pulses.rifle.muzzle * 2);
  assert.ok(pulses.cannon.recoil > pulses.rifle.recoil * 2);
  assert.ok(pulses.cannon.kick > pulses.rifle.kick * 4);
});

test('chain impact appears exactly when an explosion event arrives and never from a queued or kill cue', () => {
  const { renderer: r } = renderer();
  r.event({ type: 'fire', weapon: 'cannon', x: 0, tier: 2 });
  r.event({ type: 'kill', x: .2, z: 220, impact: 'chain' });
  const ringCount = () => r.particles.items.filter(p => p.active && p.kind === 'ring').length;
  for (let i = 0; i < 2; i++) r.update(.05);
  assert.equal(ringCount(), 0, 'no renderer-owned timer or fake pre-hit');
  r.event({ type: 'explosion', chain: true, x: .2, z: 220, radius: .34, depth: 95 });
  assert.equal(ringCount(), 1); r.update(.05); assert.equal(ringCount(), 1);
  for (let i = 0; i < 6; i++) r.update(.05);
  assert.equal(ringCount(), 0, 'one event produces only one impact');
});

test('240 enemies, 768 bullets, full FX, 48 death proxies and readable gates stay under 600 draws', t => {
  for (const reduced of [false, true]) {
    const { renderer: r, calls, text } = renderer(reduced), g = new Game(); g.start();
    g.squad = CONFIG.maxSquad; g.weapon = 'cannon'; g.weaponTier = 2;
    g.gates = [110, 233, 388].map((z, id) => ({ id, z, resolved: false, left: recruit(-3), right: recruit(12) }));
    for (let id = 0; id < CONFIG.maxEnemies; id++) g.enemies.take({ id, x: (id % 16 - 7.5) * .105, z: 160 + Math.floor(id / 16) * 22, hp: 1, maxHP: 2, heavy: id % 48 === 0, phase: id, hit: id % 5 ? 0 : .04 });
    for (let i = 0; i < CONFIG.maxBullets; i++) g.bullets.take({ x: (i % 25 - 12) * .06, z: 30 + (i % 32) * 24, weapon: 'scatter', tier: 2, radius: .035, vx: (i % 7 - 3) * .38, speed: 1150 });
    for (let id = 0; id < 48; id++) {
      r.event({ type: 'kill', x: (id % 16 - 7.5) * .105, z: 150 + id * 6, heavy: id % 7 === 0, dirX: id % 2 ? 1 : -1, dirZ: .5, impact: 'blast', enemyId: id });
      const p = r.deathProxies.items.find(p => p.active && p.enemyId === id); p.age = .01 + id % 3 * .055; p.life = p.maxLife - p.age;
    }
    while (r.particles.take({ kind: 'chunk', x: 100, y: 200, size: 3, color: '#152332', life: .14, maxLife: .31, vx: 0, vy: 0 })) {}
    r.event({ type: 'fire', x: 0, weapon: 'cannon', tier: 2 });
    const before = JSON.stringify(g); calls.length = 0; text.length = 0; r.draw(g, 10);
    const draws = calls.filter(([name]) => ['fill', 'stroke', 'fillRect', 'strokeRect', 'fillText', 'drawImage'].includes(name)).length;
    assert.equal(JSON.stringify(g), before); assert.equal(r.drawStats.enemies, 240); assert.equal(r.drawStats.bullets, 768); assert.equal(r.drawStats.deaths, 48);
    assert.equal(r.deathProxies.items.length, 48); assert.equal(r.particles.count, reduced ? 80 : 280);
    assert.equal(text.filter(([value]) => value === '-3').length, 3); assert.equal(text.filter(([value]) => value === '+12').length, 3);
    assert.ok(draws < 600, `Measured ${draws} Canvas draws`);
    t.diagnostic(`${reduced ? 'Reduced' : 'Normal'} motion: ${draws} draws, ${r.drawStats.deathBatches} death batches; 240 live enemies / 768 actual projectiles / 48 cosmetic proxies`);
  }
});
