import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, LEVELS, GATES, WAVES, WEAPONS, Game, FixedStepper, ObjectPool, squadOffset } from '../src/game.js';
import { PROFILE_NAMES, simulate } from './policies.mjs';
const close = (a, b, epsilon = 1e-8) => assert.ok(Math.abs(a - b) <= epsilon, `${a} ≠ ${b}`);
const recruit = (value, maxValue = value, shotCost = 2) => ({ type: 'recruit', value, maxValue, cap: maxValue, shotCost, shootable: true });
function bare(levelId = 'growth') { const g = new Game(levelId); g.start(); g.nextGate = g.level.gates.length; g.nextWave = g.level.waves.length; return g; }
function ticks(g, seconds) { for (let i = 0; i < Math.round(seconds / CONFIG.step); i++) g.update(CONFIG.step); }
function enemy(g, values = {}) { return g.enemies.take({ id: ++g.enemySerial, x: 0, z: 200, hp: 100, maxHP: 100, radius: .1, speed: 0, hit: 0, damage: 2, ...values }); }
function shot(g, values = {}) { return g.bullets.take({ x: 0, z: 170, prevZ: 170, age: 0, weapon: 'rifle', damage: 1, gateDamage: 1, vx: 0, speed: 780, lifetime: 1.6, radius: 0, pierceLeft: 1, hitIds: [], ...values }); }
function cross(g, left, right = recruit(1), x = -.49) { g.x = g.targetX = x; g.spawnGate({ left, right, z: CONFIG.gateZ }); g.update(CONFIG.step); }
function bossGame(id = 'growth') { const g = bare(id); g.time = g.level.bossAt; g.fireTimer = 999; g.squad = 30; g.update(CONFIG.step); g.drainEvents(); return g; }
const cache = new Map();
function complete(style = 'good', fps = 60, level = 'growth') { const key = `${style}:${fps}:${level}`; if (!cache.has(key)) cache.set(key, simulate(style, fps, level)); return cache.get(key); }

test('ready state cannot advance or fire; all three levels are directly selectable', () => {
  const g = new Game(); g.update(1); assert.equal(g.time, 0); assert.equal(g.bullets.count, 0);
  assert.equal(LEVELS.length, 3);
  for (const level of LEVELS) { assert.equal(g.selectLevel(level.id), true); assert.equal(g.level, level); assert.equal(g.squad, level.initialSquad); }
  assert.equal(g.selectLevel('missing'), false); g.start(); assert.equal(g.selectLevel('growth'), false); g.pause(); assert.equal(g.selectLevel('growth'), false);
});
test('movement is smooth, bounded and invalid input is ignored', () => {
  const g = bare(); g.setTarget(100); ticks(g, 1); assert.ok(g.x > .78 && g.x <= .79);
  g.setTarget(NaN); assert.equal(g.targetX, .79); g.setTarget(Infinity); assert.equal(g.targetX, .79);
  g.setTarget(-100); ticks(g, 1); assert.ok(g.x < -.78 && g.x >= -.79);
});
test('positive gate is consumed once; changing lanes cannot consume the other half', () => {
  const g = bare(); cross(g, recruit(5)); assert.equal(g.squad, 9); assert.equal(g.stats.gates, 1);
  g.x = g.targetX = .49; ticks(g, .5); assert.equal(g.squad, 9); assert.equal(g.stats.gates, 1); assert.equal(g.route.length, 1);
});
test('negative gate removes exact count, ignores contact grace, and explains fatal loss', () => {
  const g = bare(); g.hurtUntil = 999; cross(g, recruit(-2)); assert.equal(g.squad, 2);
  cross(g, recruit(-2)); assert.equal(g.mode, 'lost'); assert.equal(g.result.reason, 'gate'); assert.match(g.result.cause, /数字门/);
});
test('safe middle gap misses both gates and records a single route decision', () => {
  const g = bare(); cross(g, recruit(5), recruit(9), 0); assert.equal(g.squad, 4); assert.equal(g.stats.gates, 0);
  assert.equal(g.drainEvents().filter(e => e.type === 'missGate').length, 1); assert.deepEqual(g.route, ['中路 · 跳过']);
});
test('negative gate grows through zero to positive, exactly at shotCost thresholds', () => {
  const g = bare(); g.fireTimer = 999; g.spawnGate({ z: 200, left: recruit(-2, 4, 2), right: recruit(3) });
  const effect = g.gates[0].left;
  for (let i = 0; i < 6; i++) { shot(g, { x: -.49, z: g.gates[0].z - 8 }); g.update(CONFIG.step); }
  assert.equal(effect.value, 1); assert.equal(effect.shotProgress, 0); assert.equal(g.stats.gateGrowth, 3);
  assert.equal(g.drainEvents().filter(e => e.type === 'gateGrow').length, 3); assert.equal(g.stats.gates, 0);
});
test('gate growth caps, stays absorbing at cap, and never modifies its frozen definition', () => {
  const g = bare(); g.fireTimer = 999; const definition = { z: 200, left: recruit(-1, 2, 1), right: recruit(3) }; g.spawnGate(definition);
  const effect = g.gates[0].left; for (let i = 0; i < 10; i++) g.shootGate(effect, 1, -.49, 200);
  assert.equal(effect.value, 2); assert.equal(effect.shotProgress, 0); assert.equal(g.stats.gateGrowth, 3); assert.equal(definition.left.value, -1);
  const behind = enemy(g, { x: -.49, z: 210 }); shot(g, { x: -.49, z: 180 }); g.update(1 / 20);
  assert.equal(g.bullets.count, 0); assert.equal(behind.hp, 100); assert.equal(effect.value, 2);
});
test('gate mutations are per-run and per-instance; restart restores initial negative values', () => {
  const a = bare(), b = bare(); a.spawnGate(GATES[0]); b.spawnGate(GATES[0]); a.shootGate(a.gates[0].left, 999, -.49, 200);
  assert.equal(a.gates[0].left.value, 8); assert.equal(b.gates[0].left.value, -2); assert.equal(GATES[0].left.value, -2);
  a.start(); a.update(CONFIG.step); assert.equal(a.gates[0].left.value, -2);
});
test('weapon and rapid gates are immune to bullets and do not hide enemies behind them', () => {
  for (const effect of [{ type: 'weapon', weapon: 'scatter' }, { type: 'rapid', value: 1 }]) {
    const g = bare(); g.fireTimer = 999; g.spawnGate({ z: 200, left: effect, right: recruit(3) });
    const target = enemy(g, { x: -.49, z: 212 }); shot(g, { x: -.49, z: 180 }); g.update(1 / 20); assert.equal(target.hp, 99);
    assert.equal(g.stats.gateGrowth, 0);
  }
});
test('normalized gate energy is independent of pellet count and weapon cadence', () => {
  for (const [name, w] of Object.entries(WEAPONS)) {
    const g = bare(); g.setWeapon(name); g.squad = 1; g.bullets.clear(); g.fire();
    const energy = g.bullets.items.filter(b => b.active).reduce((sum, b) => sum + b.gateDamage, 0);
    close(energy / w.interval, 1 / CONFIG.fireInterval);
    g.spawnGate({ left: recruit(-10, 100, 3), right: recruit(1) });
    for (let i = 0; i < 100; i++) { g.shootGate(g.gates[0].left, energy / w.pellets, 0, 100); assert.ok(g.gates[0].left.shotProgress >= 0); }
  }
});
test('maximum squad and actual recruited stat agree', () => {
  const g = bare(); g.addSquad(100); assert.equal(g.squad, 42); assert.equal(g.stats.recruits, 38); g.addSquad(5);
  assert.equal(g.stats.recruits, 38); assert.equal(g.maxSquad, 42);
});
test('all living members fire actual weapon-defined pellets from their own positions', () => {
  for (const [name, w] of Object.entries(WEAPONS)) for (const count of [1, 4, 17, 42]) {
    const g = bare(); g.setWeapon(name); g.squad = count; g.fire(); const active = g.bullets.items.filter(b => b.active);
    assert.equal(active.length, count * w.pellets); assert.equal(g.stats.shots, active.length);
    for (let member = 0; member < count; member++) {
      const bullets = active.filter(b => b.member === member), offset = squadOffset(member, count);
      assert.equal(bullets.length, w.pellets); for (const b of bullets) { close(b.x, g.x + offset.x); close(b.z, 42 + offset.z); assert.equal(b.weapon, name); }
    }
  }
});
test('scatter produces three real angled pellets, piercing is straight, cannon is slower and stronger', () => {
  const g = bare(); g.squad = 1; g.setWeapon('scatter'); g.fire(); assert.deepEqual(g.bullets.items.filter(b => b.active).map(b => b.vx), [-.23, 0, .23]);
  assert.equal(WEAPONS.pierce.pierce, 3); assert.ok(WEAPONS.cannon.speed < WEAPONS.pierce.speed); assert.ok(WEAPONS.cannon.damage > WEAPONS.pierce.damage);
});
for (const weapon of Object.keys(WEAPONS)) {
  test(`${weapon}: swept collision processes the nearest enemy before farther objects`, () => {
    const g = bare(); g.fireTimer = 999; const near = enemy(g, { z: 200 }), far = enemy(g, { z: 220 });
    const w = WEAPONS[weapon]; shot(g, { weapon, damage: w.damage, pierceLeft: w.pierce, z: 170 }); g.update(.1);
    close(near.hp, 100 - w.damage);
    if (weapon === 'pierce') close(far.hp, 100 - w.damage);
    else if (weapon === 'cannon') close(far.hp, 100 - w.damage * .7);
    else assert.equal(far.hp, 100);
  });
  test(`${weapon}: a nearer numeric gate absorbs once, shielding enemies behind it`, () => {
    const g = bare(); g.fireTimer = 999; g.spawnGate({ z: 200, left: recruit(-2, 8, 1), right: recruit(3) });
    const target = enemy(g, { x: -.49, z: 240 }); const w = WEAPONS[weapon]; shot(g, { x: -.49, weapon, damage: w.damage, pierceLeft: w.pierce }); g.update(.1);
    assert.equal(target.hp, 100); assert.equal(g.gates[0].left.value, -1); assert.equal(g.bullets.count, 0);
    g.update(CONFIG.step); assert.equal(g.gates[0].left.value, -1);
  });
}
test('piercing hits at most three distinct enemies and never re-hits one on a later frame', () => {
  const g = bare(); g.fireTimer = 999; const targets = [200, 210, 220, 230].map(z => enemy(g, { z }));
  shot(g, { weapon: 'pierce', damage: 2, pierceLeft: 3 }); g.update(.1);
  assert.deepEqual(targets.map(e => e.hp), [98, 98, 98, 100]); assert.equal(g.bullets.count, 0);
  const h = bare(); h.fireTimer = 999; const one = enemy(h); shot(h, { z: 185, weapon: 'pierce', damage: 2, pierceLeft: 3 });
  ticks(h, .1); assert.equal(one.hp, 98);
});
test('piercing is stopped by a gate even after it has hit a nearer enemy', () => {
  const g = bare(); g.fireTimer = 999; const a = enemy(g, { x: -.49, z: 180 }), b = enemy(g, { x: -.49, z: 260 });
  g.spawnGate({ z: 220, left: recruit(-2, 8, 1), right: recruit(3) }); shot(g, { x: -.49, z: 150, weapon: 'pierce', damage: 2, pierceLeft: 3 });
  g.update(.15); assert.equal(a.hp, 98); assert.equal(b.hp, 100); assert.equal(g.gates[0].left.value, -1);
});
test('cannon splash is bounded by target count and does not damage beyond a blocking gate', () => {
  const g = bare(); g.fireTimer = 999; const targets = Array.from({ length: 12 }, (_, i) => enemy(g, { z: 200 + i, x: -.49 }));
  shot(g, { x: -.49, z: 170, weapon: 'cannon', damage: 4 }); g.update(.1); assert.equal(targets.filter(e => e.hp < 100).length, 8);
  const h = bare(); h.fireTimer = 999; enemy(h, { x: -.49, z: 180 }); const shielded = enemy(h, { x: -.49, z: 240 });
  h.spawnGate({ z: 220, left: recruit(-2, 8, 1), right: recruit(3) }); shot(h, { x: -.49, z: 150, weapon: 'cannon', damage: 4 }); h.update(.1);
  assert.equal(shielded.hp, 100);
});
test('scatter reaches a wide line while piercing reaches three separated depth rows', () => {
  const hitCount = (weapon, layout) => {
    const g = bare(); g.squad = 1; g.setWeapon(weapon); const targets = layout.map(v => enemy(g, { radius: .025, ...v }));
    g.fire(); g.fireTimer = 999; ticks(g, 1.1); return targets.filter(e => e.hp < 100).length;
  };
  const wide = [-.14, 0, .14].map(x => ({ x, z: 600 }));
  assert.equal(hitCount('scatter', wide), 3); assert.equal(hitCount('rifle', wide), 1);
  const deep = [200, 350, 500].map(z => ({ x: 0, z }));
  assert.equal(hitCount('pierce', deep), 3); assert.equal(hitCount('cannon', deep), 1);
});
test('projectiles outside the hit radius miss; boss never overrides a nearer numeric gate', () => {
  const g = bare(); g.fireTimer = 999; const target = enemy(g, { x: .5 }); shot(g); g.update(.1); assert.equal(target.hp, 100);
  const h = bossGame(); h.boss.z = 500; h.spawnGate({ z: 400, left: recruit(-2, 8, 1), right: recruit(3) });
  shot(h, { x: -.2, z: 370 }); h.update(.15);
  assert.equal(h.boss.hp, h.boss.maxHP); assert.equal(h.gates[0].left.value, -1); assert.equal(h.bullets.count, 0);
});
test('enemy contact damages once; one cluster hit is followed by a finite grace period', () => {
  const g = bare(); g.squad = 20; g.fireTimer = 999;
  const cluster = Array.from({ length: 6 }, () => enemy(g, { z: 24 })); g.update(CONFIG.step);
  assert.equal(g.squad, 18); assert.equal(g.stats.hitsTaken, 1); assert.ok(cluster.every(e => !e.active));
  enemy(g, { z: 24 }); g.update(CONFIG.step); assert.equal(g.squad, 18); ticks(g, CONFIG.contactGrace);
  enemy(g, { z: 24 }); g.update(CONFIG.step); assert.equal(g.squad, 16);
});
test('enemy contact can be dodged and heavy fatal contact has a specific explanation', () => {
  const g = bare(); g.fireTimer = 999; g.x = g.targetX = -.7; enemy(g, { z: 24, x: .4 }); g.update(CONFIG.step); assert.equal(g.squad, 4);
  enemy(g, { z: 24, x: -.7, damage: 5, heavy: true }); g.update(CONFIG.step); assert.equal(g.result.lastHitSource, 'heavy'); assert.match(g.result.cause, /重装/);
});
test('boss warning lasts at least one second, locks its lane, and applies damage once', () => {
  const g = bossGame(); g.boss.nextAttack = g.time + CONFIG.step; g.update(CONFIG.step);
  close(g.boss.attack.at - g.time, 1.2); const lane = g.boss.attack.x; g.setTarget(.7); ticks(g, .2); assert.equal(g.boss.attack.x, lane);
  g.boss.attack = { x: .7, at: g.time + CONFIG.step, started: g.time - 1, width: .23 }; g.x = g.targetX = .7; g.update(CONFIG.step);
  assert.equal(g.squad, 22); g.update(CONFIG.step); assert.equal(g.squad, 22);
});
test('boss beam can be dodged; half-health phase occurs once with a full warning window', () => {
  const g = bossGame(); g.boss.attack = { x: 0, at: g.time + CONFIG.step, started: g.time - 1 }; g.x = g.targetX = .6; g.update(CONFIG.step);
  assert.equal(g.stats.dodges, 1); assert.equal(g.squad, 30);
  g.boss.hp = g.boss.maxHP / 2; g.boss.nextAttack = g.time + CONFIG.step; g.update(CONFIG.step);
  assert.equal(g.boss.enraged, true); close(g.boss.attack.at - g.time, 1); g.update(CONFIG.step);
  assert.equal(g.drainEvents().filter(e => e.type === 'bossPhase').length, 1);
});
test('boss defeat finishes once, freezes gameplay, and produces the expanded result schema', () => {
  const g = bossGame(); g.boss.hp = 1; g.boss.z = 440; shot(g, { x: 0, z: 430 }); g.update(CONFIG.step);
  assert.equal(g.mode, 'won'); const before = g.time; g.update(1); assert.equal(g.time, before);
  assert.equal(g.result.progress, 1); assert.equal(g.result.weapon, 'rifle'); assert.equal(g.result.levelId, 'growth'); assert.ok(Array.isArray(g.result.route));
  assert.equal(g.drainEvents().filter(e => e.type === 'win').length, 1);
});
test('timeouts and fatal boss beams give distinct causes', () => {
  const g = bare(); g.time = g.level.duration - .001; g.update(CONFIG.step); assert.equal(g.result.reason, 'timeout'); assert.match(g.result.cause, /时间/); assert.ok(g.result.progress < 1);
  const h = bossGame(); h.squad = 1; h.boss.attack = { x: h.x, at: h.time + CONFIG.step }; h.update(CONFIG.step); assert.match(h.result.cause, /光束/);
});
test('pause/resume freezes gate growth, projectiles, warnings and cooldowns', () => {
  const g = bare(); g.spawnGate(GATES[0]); ticks(g, 1); g.setWeapon('scatter'); g.rapid = 2;
  const snapshot = () => JSON.stringify({ time: g.time, squad: g.squad, gates: g.gates, bullets: g.bullets.items, timer: g.fireTimer, weapon: g.weapon, stats: g.stats });
  const before = snapshot(); g.pause(); ticks(g, 20); assert.equal(snapshot(), before); g.resume(); g.update(CONFIG.step); assert.ok(g.time > 1);
});
test('restart retains selected level while clearing all run state and upgrades', () => {
  const g = bare('survival'); g.setWeapon('pierce'); g.rapid = 2; g.hurtUntil = 100; g.takeGate(recruit(8)); g.start();
  assert.equal(g.level.id, 'survival'); assert.equal(g.squad, 8); assert.equal(g.time, 0); assert.equal(g.weapon, 'rifle'); assert.equal(g.rapid, 0);
  assert.equal(g.hurtUntil, 0); assert.equal(g.result, null); assert.equal(g.boss, null); assert.equal(g.bullets.count, 0); assert.equal(g.enemies.count, 0);
  assert.deepEqual(g.route, []); assert.equal(g.stats.gateGrowth, 0); assert.equal(g.lastHitSource, null);
});
test('rapid has two levels; capped upgrades and duplicate weapons become +5 recruits', () => {
  const g = bare(); const rapid = { type: 'rapid', value: 1 }; g.takeGate(rapid); g.takeGate(rapid); close(g.fireRate, 1.7);
  g.takeGate(rapid); assert.equal(g.rapid, 2); assert.equal(g.squad, 9); g.setWeapon('cannon');
  assert.deepEqual(g.gateEffect({ type: 'weapon', weapon: 'cannon' }), { type: 'recruit', value: 5, shootable: false });
  g.takeGate({ type: 'weapon', weapon: 'cannon' }); assert.equal(g.squad, 14); assert.equal(g.weapon, 'cannon');
});
test('switching weapons clears old projectiles and shortens an excessive wait immediately', () => {
  const g = bare(); g.fire(); g.fireTimer = 10; assert.ok(g.bullets.count); g.setWeapon('pierce'); assert.equal(g.bullets.count, 0);
  assert.ok(g.fireTimer <= g.fireInterval); g.fire(); assert.ok(g.bullets.items.filter(b => b.active).every(b => b.weapon === 'pierce'));
  assert.equal(g.setWeapon('invalid'), false);
});
for (const weapon of Object.keys(WEAPONS)) test(`${weapon}: 42 members at rapid2 sustain every pellet without exhausting the 480 pool`, () => {
  const g = bare(); g.squad = 42; g.rapid = 2; g.setWeapon(weapon); let volleys = 0, peak = 0;
  for (let i = 0; i < 2400; i++) { g.update(CONFIG.step); peak = Math.max(peak, g.bullets.count); for (const event of g.drainEvents()) if (event.type === 'fire') { assert.equal(event.count, 42 * WEAPONS[weapon].pellets); volleys++; } }
  assert.equal(g.stats.shots, volleys * 42 * WEAPONS[weapon].pellets); assert.ok(peak < 480, `${weapon} peak ${peak}`);
});
test('all ordered weapon switches stay within the hard pool budget at full squad and rapid2', () => {
  for (const first of Object.keys(WEAPONS)) for (const second of Object.keys(WEAPONS)) for (const phase of [.1, .43, 1.27, 2]) {
    const g = bare(); g.squad = 42; g.rapid = 2; g.setWeapon(first); ticks(g, phase); g.setWeapon(second); ticks(g, 2); assert.ok(g.bullets.count < 480);
  }
});
test('critical outcome events survive cosmetic event-buffer pressure', () => {
  const g = bare(); for (let i = 0; i < 300; i++) g.emit('hit'); g.finish(false, 'timeout');
  assert.equal(g.events.length, 256); assert.equal(g.events.at(-1).type, 'lose');
});
test('stepper clamps stalls, ignores invalid deltas, and resets backlog', () => {
  let steps = 0; const s = new FixedStepper(() => steps++); assert.equal(s.advance(100), 30); assert.equal(s.advance(NaN), 0); assert.equal(s.advance(-1), 0);
  s.advance(.004); s.reset(); assert.equal(s.advance(.005), 0); assert.equal(steps, 30);
});
test('object pools enforce hard caps and reuse inactive entries', () => {
  const pool = new ObjectPool(2), first = pool.take({ value: 1 }); pool.take({ value: 2 }); assert.equal(pool.take({ value: 3 }), null);
  first.active = false; assert.equal(pool.take({ value: 4 }), first); pool.clear(); assert.equal(pool.count, 0); assert.equal(pool.cursor, 0);
});
test('42-member formation stays finite and within the road at both movement edges', () => {
  for (let count = 1; count <= 42; count++) for (let i = 0; i < count; i++) { const o = squadOffset(i, count); assert.ok(Number.isFinite(o.x) && Number.isFinite(o.z)); assert.ok(Math.abs(o.x) <= .18600001); assert.ok(o.z >= -50 && o.z <= 0); for (const edge of [-.79, .79]) assert.ok(Math.abs(edge + o.x) < 1); }
});
test('each level has fair selectable choices, separated waves, full warning windows, and a bounded schedule', () => {
  for (const l of LEVELS) {
    assert.equal(l.gates.length, 6); assert.equal(l.duration, 60); assert.equal(l.bossAt, 42); assert.ok(l.initialSquad >= 4);
    for (const row of l.gates) assert.ok([row.left, row.right].some(e => e.type !== 'recruit' || e.value > 0));
    const arrivals = l.gates.map(row => row.at + ((row.z ?? CONFIG.spawnZ) - CONFIG.gateZ) / CONFIG.roadSpeed);
    assert.ok(arrivals[0] < 2.4); for (let i = 1; i < arrivals.length; i++) assert.ok(arrivals[i] - arrivals[i - 1] > 3);
    for (const wave of l.waves) {
      const lastZ = (wave.z ?? CONFIG.spawnZ) + ((wave.rows ?? 1) - 1) * 52;
      assert.ok(wave.at + (lastZ - 25) / CONFIG.roadSpeed < l.bossAt); assert.ok(wave.count * (wave.rows ?? 1) <= CONFIG.maxEnemies);
    }
  }
  assert.equal(GATES, LEVELS[0].gates); assert.equal(WAVES, LEVELS[0].waves);
});
for (const level of LEVELS) {
  test(`${level.id}: skilled and imperfect pilots win; poor and unattended pilots lose`, () => {
    for (const style of PROFILE_NAMES) {
      const { game, summary: s } = complete(style, 60, level.id);
      assert.equal(game.mode, ['poor', 'center'].includes(style) ? 'lost' : 'won', style);
      assert.equal(s.missingShots, 0); assert.ok(s.maxBullets < 480 && s.maxEnemies < 96);
      if (s.result.won) { assert.ok(s.result.time >= 45 && s.result.time <= 60); assert.equal(s.bossHP, 0); assert.equal(s.bossStart.enemies, 0); assert.equal(s.bossPhases, 1); }
    }
    const good = complete('good', 60, level.id).summary, average = complete('average', 60, level.id).summary;
    assert.ok(good.result.time < average.result.time); assert.ok(good.result.squad > average.result.squad);
    assert.equal(average.timeline.filter(e => e.type === 'missGate').length, 1); assert.ok(average.timeline.some(e => e.type === 'hurt' && e.source === 'boss'));
  });
  test(`${level.id}: 30/60/120/144fps give identical full results and event timelines`, () => {
    for (const style of PROFILE_NAMES) {
      const expected = complete(style, 60, level.id).summary;
      for (const fps of [30, 120, 144]) assert.deepEqual(complete(style, fps, level.id).summary, expected, `${style}@${fps}`);
    }
  });
}
test('opening teaches shootable growth before one second and rewards the choice before 2.4s', () => {
  const s = complete().summary; assert.ok(s.first.gateGrowth > 0 && s.first.gateGrowth < 1); assert.ok(s.first.reward > 2 && s.first.reward < 2.4);
});
test('distinct weapon choices are all accessible, with no unlocks or metagame', () => {
  const picks = new Set(LEVELS.flatMap(l => l.gates.flatMap(r => [r.left, r.right]).filter(e => e.type === 'weapon').map(e => e.weapon)));
  assert.deepEqual([...picks].sort(), ['cannon', 'pierce', 'scatter']);
  const g = new Game(); for (const l of LEVELS) { g.selectLevel(l.id); assert.equal(g.start(), true); g.finish(false, 'timeout'); }
});
