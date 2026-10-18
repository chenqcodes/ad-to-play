import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, GATES, WAVES, Game, FixedStepper, ObjectPool, squadOffset } from '../src/game.js';
import { PROFILE_NAMES, simulate } from './policies.mjs';

const RECRUIT = value => ({ type: 'recruit', value });
const RAPID = { type: 'rapid', value: 1 };
const close = (actual, expected, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} ≠ ${expected}`);
function bareGame() {
  const game = new Game(); game.start(); game.nextGate = GATES.length; game.nextWave = WAVES.length;
  return game;
}
function ticks(game, seconds) { for (let i = 0; i < Math.round(seconds / CONFIG.step); i++) game.update(CONFIG.step); }
function contact(game, values = {}) {
  return game.enemies.take({ x: game.x, z: 24, hp: 100, maxHP: 100, radius: .1, speed: 0, hit: 0, damage: 2, ...values });
}
function cross(game, definition, x = -.49) {
  game.x = game.targetX = x; game.spawnGate(definition); game.gates.at(-1).z = CONFIG.gateZ; game.update(CONFIG.step);
}
function bossGame() {
  const game = bareGame(); game.squad = 30; game.time = CONFIG.bossAt; game.fireTimer = 999;
  game.update(CONFIG.step); game.drainEvents(); return game;
}
const cached = new Map();
function complete(style = 'good', fps = 60) {
  const key = `${style}:${fps}`;
  if (!cached.has(key)) cached.set(key, simulate(style, fps));
  return cached.get(key);
}

// The original 23 coverage areas remain, updated for the v0.2 rules.
test('initial ready state cannot advance or shoot before starting', () => {
  const game = new Game(); game.update(1);
  assert.equal(game.time, 0); assert.equal(game.bullets.count, 0);
  game.start(); assert.equal(game.squad, 4); assert.equal(game.rapid, 0); assert.equal(game.mode, 'playing');
});
test('movement is smooth, bounded and invalid input is ignored', () => {
  const game = bareGame(); game.setTarget(100); ticks(game, 1);
  assert.ok(game.x > .78 && game.x <= .79); game.setTarget(NaN); assert.equal(game.targetX, .79);
  game.setTarget(Infinity); assert.equal(game.targetX, .79);
  game.setTarget(-100); ticks(game, 1); assert.ok(game.x < -.78 && game.x >= -.79);
});
test('one positive gate is consumed once, not once per frame or per soldier', () => {
  const game = bareGame(); cross(game, GATES[0]);
  assert.equal(game.squad, 8); assert.equal(game.stats.gates, 1);
  ticks(game, .5); assert.equal(game.squad, 8); assert.equal(game.stats.gates, 1);
});
test('one row cannot apply both sides by changing lanes after crossing', () => {
  const game = bareGame(); cross(game, GATES[0]); game.x = game.targetX = .49; ticks(game, .4);
  assert.equal(game.squad, 8); assert.equal(game.stats.gates, 1);
});
test('negative gate removes exact count and can immediately end a run', () => {
  const game = bareGame(); cross(game, GATES[0], .49); assert.equal(game.squad, 2);
  cross(game, GATES[0], .49); assert.equal(game.squad, 0); assert.equal(game.mode, 'lost');
  assert.equal(game.result.reason, 'gate');
});
test('safe middle gap misses both gates and emits explicit feedback', () => {
  const game = bareGame(); cross(game, GATES[0], 0);
  assert.equal(game.squad, 4); assert.equal(game.stats.gates, 0); assert.ok(game.gates[0].resolved);
  assert.equal(game.drainEvents().filter(event => event.type === 'missGate').length, 1);
});
test('every scheduled row has a beneficial choice and enough travel time to switch lanes', () => {
  assert.equal(GATES.length, 6);
  for (const gate of GATES) {
    const effects = [gate.left, gate.right];
    assert.ok(effects.some(effect => effect.type === 'rapid' || effect.value > 0));
    for (const effect of effects) assert.ok(['recruit', 'rapid'].includes(effect.type));
  }
  assert.equal(GATES.filter(gate => [gate.left, gate.right].some(effect => effect.type === 'rapid')).length, 3);
  const arrivals = GATES.map(gate => gate.at + ((gate.z ?? CONFIG.spawnZ) - CONFIG.gateZ) / CONFIG.roadSpeed);
  for (let i = 1; i < arrivals.length; i++) assert.ok(arrivals[i] - arrivals[i - 1] > 1 / CONFIG.moveSpeed);
});
test('maximum count and actual recruited stat agree', () => {
  const game = bareGame(); game.addSquad(100);
  assert.equal(game.squad, 42); assert.equal(game.stats.recruits, 38);
  game.addSquad(5); assert.equal(game.stats.recruits, 38); assert.equal(game.squad, 42);
  assert.equal(game.maxSquad, 42);
});
test('every living squad member fires exactly one real projectile per volley', () => {
  const game = bareGame();
  for (let count = 1; count <= CONFIG.maxSquad; count++) {
    game.bullets.clear(); game.squad = count; const before = game.stats.shots; game.fire();
    const bullets = game.bullets.items.filter(bullet => bullet.active);
    assert.equal(bullets.length, count); assert.equal(game.stats.shots - before, count);
    const positions = new Set(bullets.map(bullet => `${bullet.x}:${bullet.z}`));
    assert.equal(positions.size, count, 'projectiles originate from distinct members');
    for (let i = 0; i < count; i++) {
      const offset = squadOffset(i, count);
      assert.ok(positions.has(`${game.x + offset.x}:${42 + offset.z}`));
    }
  }
});
test('projectile swept collision damages exactly one nearest enemy', () => {
  const game = bareGame(); game.fireTimer = 999;
  const a = contact(game, { x: 0, z: 200, hp: 2 }); const b = contact(game, { x: 0, z: 210, hp: 2 });
  game.bullets.take({ x: 0, z: 180, prevZ: 180, age: 0 }); game.update(1 / 30);
  assert.equal(a.hp, 1); assert.equal(b.hp, 2); assert.equal(game.stats.damage, 1); assert.equal(game.bullets.count, 0);
});
test('projectile misses outside enemy radius', () => {
  const game = bareGame(); game.fireTimer = 999; const enemy = contact(game, { x: .5, z: 100, hp: 2 });
  game.bullets.take({ x: 0, z: 90, prevZ: 90, age: 0 }); game.update(CONFIG.step); assert.equal(enemy.hp, 2);
});
test('enemy contact damages once and removes that enemy', () => {
  const game = bareGame(); game.fireTimer = 999; const enemy = contact(game); game.update(CONFIG.step);
  assert.equal(game.squad, 2); assert.equal(enemy.active, false); assert.equal(game.stats.hitsTaken, 1);
  game.update(CONFIG.step); assert.equal(game.squad, 2);
});
test('player can dodge enemy contact entirely', () => {
  const game = bareGame(); game.fireTimer = 999; game.x = game.targetX = -.7;
  contact(game, { x: .4 }); game.update(CONFIG.step); assert.equal(game.squad, 4); assert.equal(game.stats.hitsTaken, 0);
});
test('boss warning can be avoided and damage applies once', () => {
  const game = bossGame(); game.squad = 20;
  game.boss.attack = { x: 0, at: game.time + CONFIG.step, started: game.time - 1 };
  game.x = game.targetX = .6; game.update(CONFIG.step); assert.equal(game.squad, 20); assert.equal(game.stats.dodges, 1);
  game.boss.attack = { x: .6, at: game.time + CONFIG.step, started: game.time - 1 };
  game.update(CONFIG.step); assert.equal(game.squad, 12); assert.equal(game.stats.hitsTaken, 1);
  game.update(CONFIG.step); assert.equal(game.squad, 12);
  assert.equal(game.drainEvents().filter(event => event.type === 'beam').length, 2);
});
test('boss defeat enters victory once and freezes gameplay', () => {
  const game = bossGame(); game.boss.hp = 1; game.boss.x = 0; game.boss.z = 440;
  game.bullets.take({ x: 0, z: 430, prevZ: 430, age: 0 }); game.update(CONFIG.step);
  assert.equal(game.mode, 'won'); const time = game.time; game.update(1); assert.equal(game.time, time);
  assert.equal(game.drainEvents().filter(event => event.type === 'win').length, 1);
});
test('deadline ends a run with a clear timeout reason', () => {
  const game = bareGame(); game.time = CONFIG.duration - .001; game.squad = CONFIG.maxSquad; game.update(CONFIG.step);
  assert.equal(game.mode, 'lost'); assert.equal(game.result.reason, 'timeout');
  assert.ok(game.time <= CONFIG.duration + CONFIG.step);
});
test('pause/resume preserves progress and cannot create background damage', () => {
  const game = bareGame(); ticks(game, 1); game.rapid = 2; game.hurtUntil = game.time + .3;
  const snapshot = () => JSON.stringify({ time: game.time, squad: game.squad, rapid: game.rapid, hurtUntil: game.hurtUntil, fireTimer: game.fireTimer, bullets: game.bullets.items });
  const before = snapshot(); game.pause(); ticks(game, 20); assert.equal(snapshot(), before);
  game.resume(); game.update(CONFIG.step); assert.ok(game.time > 1);
});
test('restart clears gates, bullets, boss, stats, target, upgrades, grace and old result', () => {
  const { game } = simulate('good'); game.hurtUntil = 100; game.start();
  assert.equal(game.time, 0); assert.equal(game.squad, 4); assert.equal(game.maxSquad, 4); assert.equal(game.rapid, 0);
  assert.equal(game.x, 0); assert.equal(game.targetX, 0); assert.equal(game.hurtUntil, 0); assert.equal(game.fireTimer, 0);
  assert.equal(game.boss, null); assert.equal(game.gates.length, 0); assert.equal(game.bullets.count, 0);
  assert.equal(game.enemies.count, 0); assert.equal(game.result, null); assert.equal(game.nextGate, 0); assert.equal(game.nextWave, 0);
  assert.deepEqual(game.stats, { kills: 0, recruits: 0, gates: 0, upgrades: 0, shots: 0, damage: 0, hitsTaken: 0, dodges: 0 });
});
test('a normal no-upgrade route wins in 45–60 seconds', () => {
  const { game, summary } = complete('people');
  assert.equal(game.mode, 'won'); assert.equal(game.stats.gates, 6); assert.equal(game.rapid, 0);
  assert.ok(game.time >= 45 && game.time <= 60); assert.ok(summary.maxBullets < CONFIG.maxBullets); assert.ok(summary.maxEnemies < CONFIG.maxEnemies);
});
test('30, 60, 120 and 144 Hz renders produce identical results and timelines for every full-route pilot', () => {
  for (const style of PROFILE_NAMES) {
    const expected = complete(style, 60).summary;
    for (const fps of [30, 120, 144]) assert.deepEqual(complete(style, fps).summary, expected, `${style} at ${fps} Hz`);
  }
});
test('stepper clamps long stalls, ignores invalid delta and resets backlog', () => {
  let steps = 0; const stepper = new FixedStepper(() => steps++);
  assert.equal(stepper.advance(100), 30); assert.equal(stepper.advance(NaN), 0); assert.equal(stepper.advance(-1), 0);
  stepper.advance(.004); stepper.reset(); assert.equal(stepper.advance(.005), 0); assert.equal(steps, 30);
});
test('object pools enforce hard caps and reuse inactive entries', () => {
  const pool = new ObjectPool(2); const first = pool.take({ value: 1 }); pool.take({ value: 2 });
  assert.equal(pool.take({ value: 3 }), null); first.active = false; assert.equal(pool.take({ value: 4 }), first);
  pool.clear(); assert.equal(pool.count, 0); assert.equal(pool.cursor, 0);
});
test('full 42-member formation is finite and remains inside the road at either movement edge', () => {
  for (let count = 1; count <= CONFIG.maxSquad; count++) for (let index = 0; index < count; index++) {
    const offset = squadOffset(index, count);
    assert.ok(Number.isFinite(offset.x) && Number.isFinite(offset.z));
    assert.ok(Math.abs(offset.x) <= .1860000001); assert.ok(offset.z >= -50 && offset.z <= 0);
    for (const edge of [-.79, .79]) assert.ok(Math.abs(edge + offset.x) < 1);
  }
  assert.equal(new Set(Array.from({ length: 42 }, (_, i) => squadOffset(i, 42).z)).size, 6);
});

// v0.2 mechanics and regression checks.
test('opening enemy is hittable quickly and first recruit reward arrives before 2.4 seconds', () => {
  const { first } = complete('good').summary;
  assert.ok(first.hit > 0 && first.hit <= 1.2); assert.ok(first.kill <= 1.5);
  assert.ok(first.reward >= 2 && first.reward <= 2.4);
});
test('rapid gate upgrades once and immediately shortens the remaining firing wait', () => {
  const game = bareGame(); game.fireTimer = 10;
  cross(game, GATES[1]);
  assert.equal(game.squad, 4); assert.equal(game.rapid, 1); assert.equal(game.stats.upgrades, 1); assert.equal(game.stats.gates, 1);
  close(game.fireRate, 1.35); close(game.fireInterval, .28 / 1.35); assert.ok(game.fireTimer <= game.fireInterval);
  ticks(game, .5); assert.equal(game.rapid, 1); assert.equal(game.stats.upgrades, 1);
  assert.equal(game.drainEvents().filter(event => event.type === 'upgrade').length, 1);
});
test('rapid has exactly two levels and a capped rapid door visibly becomes +5 recruits', () => {
  const game = bareGame(); game.takeGate(RAPID); game.takeGate(RAPID);
  assert.equal(game.rapid, 2); close(game.fireRate, 1.7); close(game.fireInterval, .28 / 1.7);
  assert.deepEqual(game.gateEffect(RAPID), RECRUIT(5)); assert.deepEqual(RAPID, { type: 'rapid', value: 1 });
  const before = game.squad; game.takeGate(RAPID);
  assert.equal(game.squad, before + 5); assert.equal(game.rapid, 2); assert.equal(game.stats.upgrades, 2); assert.equal(game.stats.gates, 3);
  assert.equal(game.stats.recruits, 5);
});
test('capped rapid fallback respects the squad cap and counts only actual recruits', () => {
  const game = bareGame(); game.squad = 40; game.rapid = CONFIG.maxRapid; game.takeGate(RAPID);
  assert.equal(game.squad, 42); assert.equal(game.stats.recruits, 2); assert.equal(game.stats.upgrades, 0);
  game.takeGate(RAPID); assert.equal(game.squad, 42); assert.equal(game.stats.recruits, 2);
});
test('rapid changes cadence without multiplying projectiles within a volley', () => {
  const totals = [];
  for (const rapid of [0, 1, 2]) {
    const game = bareGame(); game.rapid = rapid; game.squad = 7;
    let volleys = 0;
    for (let i = 0; i < 1200; i++) {
      game.update(CONFIG.step);
      for (const event of game.drainEvents()) if (event.type === 'fire') { assert.equal(event.count, 7); volleys++; }
    }
    const expected = Math.floor(10 / game.fireInterval) + 1;
    assert.equal(volleys, expected); assert.equal(game.stats.shots, volleys * 7); totals.push(volleys);
  }
  assert.ok(totals[0] < totals[1] && totals[1] < totals[2]);
});
test('42 members at rapid level 2 sustain real projectiles without exhausting entity pools', () => {
  const game = bareGame(); game.squad = 42; game.rapid = 2;
  let maxBullets = 0, volleys = 0;
  for (let i = 0; i < 1200; i++) {
    game.update(CONFIG.step); maxBullets = Math.max(maxBullets, game.bullets.count);
    for (const event of game.drainEvents()) if (event.type === 'fire') { assert.equal(event.count, 42); volleys++; }
  }
  assert.equal(game.stats.shots, volleys * 42); assert.equal(volleys, Math.floor(10 / game.fireInterval) + 1);
  assert.ok(maxBullets > 0 && maxBullets < CONFIG.maxBullets, `peak bullets: ${maxBullets}`);
  assert.ok(game.enemies.count <= CONFIG.maxEnemies);
});
test('contact grace allows one cluster hit, expires, and then permits another hit', () => {
  const game = bareGame(); game.squad = 20; game.fireTimer = 999;
  const cluster = Array.from({ length: 6 }, () => contact(game)); game.update(CONFIG.step);
  assert.equal(game.squad, 18); assert.equal(game.stats.hitsTaken, 1); assert.ok(cluster.every(enemy => !enemy.active));
  contact(game); game.update(CONFIG.step); assert.equal(game.squad, 18);
  ticks(game, CONFIG.contactGrace); contact(game); game.update(CONFIG.step);
  assert.equal(game.squad, 16); assert.equal(game.stats.hitsTaken, 2);
});
test('contact grace never cancels red gate losses', () => {
  const game = bareGame(); game.squad = 10; assert.equal(game.hurt(2, 'enemy'), true);
  assert.equal(game.hurt(2, 'enemy'), false); assert.equal(game.squad, 8);
  cross(game, GATES[0], .49); assert.equal(game.squad, 6); assert.equal(game.stats.hitsTaken, 1);
  assert.equal(game.stats.gates, 1);
});
test('heavy enemies have their stated health and contact damage', () => {
  const game = bareGame(); const definition = WAVES.find(wave => wave.heavy); game.spawnWave(definition);
  const heavy = game.enemies.items.find(enemy => enemy.active);
  assert.equal(heavy.hp, definition.hp); assert.equal(heavy.damage, 4); assert.equal(heavy.radius, .15); assert.equal(heavy.heavy, true);
  game.squad = 10; game.fireTimer = 999; heavy.z = 24; heavy.x = game.x; game.update(CONFIG.step);
  assert.equal(game.squad, 6); assert.equal(game.stats.hitsTaken, 1);
});
test('phase labels switch at 12, 28 and 42 seconds', () => {
  const game = bareGame();
  for (const [time, phase] of [[0, '热身集结'], [11.999, '热身集结'], [12, '火力升级'], [27.999, '火力升级'], [28, '突破防线'], [41.999, '突破防线'], [42, '终点守卫']]) {
    game.time = time; assert.equal(game.phase, phase);
  }
});
test('scheduled waves fit pool capacity and their last row clears before the boss', () => {
  const game = bareGame();
  for (const wave of WAVES) game.spawnWave(wave);
  assert.equal(game.enemies.count, WAVES.reduce((sum, wave) => sum + wave.count * (wave.rows ?? 1), 0));
  assert.ok(game.enemies.count < CONFIG.maxEnemies);
  for (const wave of WAVES) {
    const lastRow = (wave.z ?? CONFIG.spawnZ) + ((wave.rows ?? 1) - 1) * 52;
    assert.ok(wave.at + (lastRow - 25) / CONFIG.roadSpeed < CONFIG.bossAt);
  }
});
test('boss spawns at 42 seconds with a single warning phase and no early spawn', () => {
  const game = bareGame(); game.time = CONFIG.bossAt - CONFIG.step * 1.5; game.update(CONFIG.step);
  assert.equal(game.boss, null); game.update(CONFIG.step); assert.ok(game.boss); assert.equal(game.boss.hp, 1000);
  assert.equal(game.boss.enraged, false); close(game.boss.nextAttack - game.time, 1.2);
  assert.equal(game.drainEvents().filter(event => event.type === 'boss').length, 1);
});
test('boss half-health phase triggers once and accelerates subsequent warnings', () => {
  const game = bossGame(); game.boss.hp = game.boss.maxHP / 2 + 1; game.update(CONFIG.step);
  assert.equal(game.boss.enraged, false);
  game.boss.hp = game.boss.maxHP / 2; game.boss.nextAttack = game.time + CONFIG.step; game.update(CONFIG.step);
  assert.equal(game.boss.enraged, true); close(game.boss.attack.at - game.time, 1); close(game.boss.nextAttack - game.time, 2.4);
  game.update(CONFIG.step); assert.equal(game.drainEvents().filter(event => event.type === 'bossPhase').length, 1);
});
test('boss ordinary warning retains its 1.2 second dodge window before half health', () => {
  const game = bossGame(); game.boss.nextAttack = game.time + CONFIG.step; game.update(CONFIG.step);
  close(game.boss.attack.at - game.time, 1.2); close(game.boss.nextAttack - game.time, 2.9);
});

const EXPECTED = {
  people: { won: true, ticks: 6212, squad: 37, rapid: 0, gates: 6, hitsTaken: 0, dodges: 3, shots: 4560, kills: 39 },
  good: { won: true, ticks: 6064, squad: 26, rapid: 2, gates: 6, hitsTaken: 0, dodges: 3, shots: 4900, kills: 37 },
  rapid: { won: true, ticks: 6149, squad: 24, rapid: 2, gates: 6, hitsTaken: 1, dodges: 3, shots: 4504, kills: 34 },
  average: { won: true, ticks: 6951, squad: 12, rapid: 2, gates: 5, hitsTaken: 1, dodges: 5, shots: 4028, kills: 32 },
  poor: { won: false, ticks: 1370, squad: 0, rapid: 1, gates: 2, hitsTaken: 1, dodges: 0, shots: 108, kills: 4 },
  center: { won: false, ticks: 3987, squad: 0, rapid: 0, gates: 0, hitsTaken: 2, dodges: 0, shots: 394, kills: 6 },
  noDodge: { won: true, ticks: 6309, squad: 21, rapid: 0, gates: 6, hitsTaken: 2, dodges: 2, shots: 4367, kills: 39 },
};
for (const [style, expected] of Object.entries(EXPECTED)) {
  test(`full-route acceptance: ${style}`, () => {
    const { summary } = complete(style);
    for (const [key, value] of Object.entries(expected)) assert.equal(key === 'ticks' ? summary.ticks : summary.result[key], value, `${style}.${key}`);
    close(summary.result.time, expected.ticks * CONFIG.step, 1e-8);
    assert.equal(summary.missingShots, 0); assert.ok(summary.maxBullets < CONFIG.maxBullets); assert.ok(summary.maxEnemies < CONFIG.maxEnemies);
    if (expected.won) {
      assert.equal(summary.result.reason, 'boss'); assert.equal(summary.bossHP, 0); assert.equal(summary.bossPhases, 1);
      assert.ok(summary.result.time >= 45 && summary.result.time <= 60); assert.equal(summary.bossStart.enemies, 0);
    } else assert.equal(summary.result.reason, 'squad');
  });
}
test('average acceptance specifically misses one recruit gate, takes the first beam and remains recoverable', () => {
  const summary = complete('average').summary;
  assert.equal(summary.timeline.filter(event => event.type === 'missGate').length, 1);
  const hurts = summary.timeline.filter(event => event.type === 'hurt');
  assert.equal(hurts.length, 1); assert.equal(hurts[0].source, 'boss'); assert.equal(hurts[0].amount, -8);
  assert.ok(hurts[0].time > 44 && hurts[0].time < 45);
  assert.equal(summary.bossStart.squad, 20); assert.equal(summary.bossStart.rapid, 2);
  assert.ok(summary.result.time < 58); assert.ok(summary.result.squad > 0);
});
test('skill is rewarded without a single mandatory upgrade route', () => {
  const people = complete('people').summary.result;
  const mixed = complete('good').summary.result;
  const rapid = complete('rapid').summary.result;
  const average = complete('average').summary.result;
  assert.ok([people, mixed, rapid, average].every(result => result.won));
  assert.ok(mixed.time < people.time && mixed.time < rapid.time && mixed.time < average.time);
  assert.ok(people.squad > mixed.squad && people.squad > rapid.squad, 'recruit route keeps a survivability advantage');
});
