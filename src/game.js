/** Deterministic, DOM-free gameplay. Render rate never changes the rules. */
export const CONFIG = Object.freeze({
  step: 1 / 120, maxFrameDelta: .25,
  initialSquad: 4, maxSquad: 42, maxRapid: 2, rapidBonus: .35,
  maxBullets: 480, maxEnemies: 96,
  moveSpeed: 3.8, roadSpeed: 142, bulletSpeed: 780, fireInterval: .28,
  spawnZ: 880, gateZ: 30, playerRadius: .15,
  contactGrace: .45, bossAt: 42, bossHP: 1000, duration: 60,
});
const people = value => Object.freeze({ type: 'recruit', value });
const rapid = Object.freeze({ type: 'rapid', value: 1 });
// Only one new idea: take more people now, or make every member fire faster.
// The first door is close enough to reward the player within 2.4 seconds.
export const GATES = Object.freeze([
  { at: 0, z: 360, left: people(4), right: people(-2) },
  { at: 2.2, left: rapid, right: people(5) },
  { at: 8.2, left: people(6), right: people(-4) },
  { at: 15.2, left: people(6), right: rapid },
  { at: 22.2, left: people(-5), right: people(7) },
  { at: 29.2, left: rapid, right: people(5) },
]);
// Three readable waves of difficulty. The last spawn clears before the boss.
export const WAVES = Object.freeze([
  { at: .6, x: -.28, z: 540, count: 2, hp: 2 },
  { at: 3.1, x: -.49, count: 3, hp: 3 },
  { at: 5.4, x: .49, count: 3, hp: 3 },
  { at: 8.2, x: 0, count: 4, hp: 4 },
  { at: 10.8, x: -.49, count: 3, hp: 5 },
  { at: 13.3, x: .49, count: 3, rows: 2, hp: 5 },
  { at: 15.8, x: -.3, count: 4, hp: 6 },
  { at: 18.3, x: .49, count: 3, rows: 2, hp: 6 },
  { at: 20.8, x: 0, count: 1, hp: 25, heavy: true },
  { at: 22.7, x: -.49, count: 3, rows: 2, hp: 7 },
  { at: 24.9, x: .49, count: 3, rows: 2, hp: 7 },
  { at: 27.2, x: 0, count: 5, hp: 6 },
  { at: 29.5, x: -.38, count: 1, hp: 32, heavy: true },
  { at: 31.6, x: .42, count: 3, rows: 2, hp: 8 },
  { at: 33.9, x: 0, count: 5, hp: 7 },
]);
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export class ObjectPool {
  constructor(capacity) {
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, () => ({ active: false }));
    this.cursor = 0;
  }
  take(values) {
    for (let i = 0; i < this.capacity; i++) {
      const item = this.items[this.cursor];
      this.cursor = (this.cursor + 1) % this.capacity;
      if (!item.active) { Object.assign(item, values, { active: true }); return item; }
    }
    return null;
  }
  clear() { for (const item of this.items) item.active = false; this.cursor = 0; }
  get count() { let n = 0; for (const item of this.items) if (item.active) n++; return n; }
}
export function squadOffset(index, count) {
  const cols = count <= 3 ? count : count <= 12 ? 4 : count <= 30 ? 6 : 7;
  const row = Math.floor(index / cols);
  const rowCount = Math.min(cols, count - row * cols);
  return { x: (index % cols - (rowCount - 1) / 2) * .062, z: -row * 10 };
}
export class Game {
  constructor() {
    this.bullets = new ObjectPool(CONFIG.maxBullets);
    this.enemies = new ObjectPool(CONFIG.maxEnemies);
    this.events = [];
    this.reset('ready');
  }
  reset(mode = 'ready') {
    this.mode = mode; this.time = 0; this.x = 0; this.targetX = 0;
    this.squad = CONFIG.initialSquad; this.maxSquad = this.squad; this.rapid = 0;
    this.fireTimer = 0; this.hurtUntil = 0; this.nextGate = 0; this.nextWave = 0;
    this.gates = []; this.boss = null; this.result = null;
    this.bullets.clear(); this.enemies.clear(); this.events.length = 0;
    this.stats = { kills: 0, recruits: 0, gates: 0, upgrades: 0, shots: 0, damage: 0, hitsTaken: 0, dodges: 0 };
  }
  get fireRate() { return 1 + this.rapid * CONFIG.rapidBonus; }
  get fireInterval() { return CONFIG.fireInterval / this.fireRate; }
  get phase() { return this.time < 12 ? '热身集结' : this.time < 28 ? '火力升级' : this.time < CONFIG.bossAt ? '突破防线' : '终点守卫'; }
  start() { this.reset('playing'); this.emit('start'); }
  pause() { if (this.mode === 'playing') { this.mode = 'paused'; this.emit('pause'); } }
  resume() { if (this.mode === 'paused') { this.mode = 'playing'; this.emit('resume'); } }
  setTarget(x) { if (Number.isFinite(x)) this.targetX = clamp(x, -.79, .79); }
  emit(type, details = {}) { if (this.events.length < 128) this.events.push({ type, ...details }); }
  drainEvents() { const result = this.events; this.events = []; return result; }
  addSquad(delta, source = 'gate') {
    if (this.mode !== 'playing') return;
    const before = this.squad;
    this.squad = clamp(this.squad + delta, 0, CONFIG.maxSquad);
    const actual = this.squad - before;
    if (actual > 0) this.stats.recruits += actual;
    this.maxSquad = Math.max(this.maxSquad, this.squad);
    this.emit(actual >= 0 ? 'gain' : 'hurt', { amount: actual, source, x: this.x, z: 0, capped: this.squad === CONFIG.maxSquad });
    if (this.squad <= 0) this.finish(false, source === 'gate' ? 'gate' : 'squad');
  }
  hurt(amount, source) {
    if (this.mode !== 'playing' || this.time < this.hurtUntil) return false;
    this.hurtUntil = this.time + CONFIG.contactGrace;
    this.stats.hitsTaken++;
    this.addSquad(-amount, source);
    return true;
  }
  // At the rapid cap the door visibly changes to +5 people, never a wasted pick.
  gateEffect(effect) { return effect.type === 'rapid' && this.rapid >= CONFIG.maxRapid ? people(5) : effect; }
  takeGate(effect) {
    const chosen = this.gateEffect(effect);
    this.stats.gates++;
    if (chosen.type === 'recruit') this.addSquad(chosen.value);
    else {
      this.rapid++; this.stats.upgrades++;
      this.fireTimer = Math.min(this.fireTimer, this.fireInterval);
      this.emit('upgrade', { level: this.rapid, rate: this.fireRate, x: this.x, z: 0 });
    }
  }
  finish(won, reason = 'boss') {
    if (this.mode !== 'playing') return;
    this.mode = won ? 'won' : 'lost';
    this.result = { won, reason, time: this.time, squad: this.squad, rapid: this.rapid, ...this.stats };
    this.emit(won ? 'win' : 'lose', { x: this.x, z: 0 });
  }
  spawnGate(def) { this.gates.push({ ...def, z: def.z ?? CONFIG.spawnZ, resolved: false }); }
  spawnWave(def) {
    const rows = def.rows || 1;
    for (let row = 0; row < rows; row++) for (let i = 0; i < def.count; i++) {
      this.enemies.take({
        x: def.x + (i - (def.count - 1) / 2) * .18,
        z: (def.z ?? CONFIG.spawnZ) + row * 52,
        hp: def.hp, maxHP: def.hp, radius: def.heavy ? .15 : .1,
        speed: CONFIG.roadSpeed, hit: 0, phase: def.at + i,
        heavy: Boolean(def.heavy), damage: def.heavy ? 4 : 2,
      });
    }
  }
  fire() {
    let fired = 0;
    for (let i = 0; i < this.squad; i++) {
      const offset = squadOffset(i, this.squad);
      if (this.bullets.take({ x: this.x + offset.x, z: 42 + offset.z, prevZ: 42 + offset.z, age: 0 })) fired++;
    }
    this.stats.shots += fired;
    this.emit('fire', { count: fired, x: this.x, z: 0 });
  }
  update(dt) {
    if (this.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    this.time += dt;
    this.x += clamp((this.targetX - this.x) * (1 - Math.exp(-18 * dt)), -CONFIG.moveSpeed * dt, CONFIG.moveSpeed * dt);
    while (this.nextGate < GATES.length && GATES[this.nextGate].at <= this.time) this.spawnGate(GATES[this.nextGate++]);
    while (this.nextWave < WAVES.length && WAVES[this.nextWave].at <= this.time) this.spawnWave(WAVES[this.nextWave++]);
    this.fireTimer -= dt;
    while (this.fireTimer <= 0) { this.fire(); this.fireTimer += this.fireInterval; }
    for (const row of this.gates) {
      row.z -= CONFIG.roadSpeed * dt;
      if (!row.resolved && row.z <= CONFIG.gateZ) {
        row.resolved = true;
        if (Math.abs(this.x + .49) <= .39) this.takeGate(row.left);
        else if (Math.abs(this.x - .49) <= .39) this.takeGate(row.right);
        else this.emit('missGate');
      }
    }
    this.gates = this.gates.filter(row => row.z > -180);
    if (this.mode !== 'playing') return;
    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue;
      enemy.z -= enemy.speed * dt;
      enemy.hit = Math.max(0, enemy.hit - dt);
      if (enemy.z < 25) {
        if (Math.abs(enemy.x - this.x) < enemy.radius + CONFIG.playerRadius) this.hurt(enemy.damage ?? 2, 'enemy');
        enemy.active = false;
      }
    }
    if (this.mode !== 'playing') return;
    if (!this.boss && this.time >= CONFIG.bossAt) {
      this.boss = { hp: CONFIG.bossHP, maxHP: CONFIG.bossHP, x: 0, z: 780, radius: .29, hit: 0, nextAttack: this.time + 1.2, attack: null, enraged: false };
      this.emit('boss');
    }
    if (this.boss) {
      const b = this.boss;
      b.x = Math.sin((this.time - CONFIG.bossAt) * .65) * .48;
      b.z = Math.max(440, b.z - dt * 130);
      b.hit = Math.max(0, b.hit - dt);
      if (!b.enraged && b.hp <= b.maxHP * .5) { b.enraged = true; this.emit('bossPhase'); }
      if (b.attack && this.time >= b.attack.at) {
        if (Math.abs(this.x - b.attack.x) < .23) this.hurt(8, 'boss');
        else { this.stats.dodges++; this.emit('dodge'); }
        this.emit('beam', { x: b.attack.x, z: 0 }); b.attack = null;
      }
      if (this.time >= b.nextAttack && !b.attack) {
        b.attack = { x: this.x, at: this.time + (b.enraged ? 1 : 1.2), started: this.time };
        b.nextAttack = this.time + (b.enraged ? 2.4 : 2.9);
        this.emit('warning');
      }
    }
    if (this.mode !== 'playing') return;
    for (const bullet of this.bullets.items) {
      if (!bullet.active) continue;
      bullet.prevZ = bullet.z; bullet.z += CONFIG.bulletSpeed * dt; bullet.age += dt;
      let nearest = null;
      for (const enemy of this.enemies.items) {
        if (!enemy.active || Math.abs(bullet.x - enemy.x) > enemy.radius) continue;
        if (bullet.z >= enemy.z - 12 && bullet.prevZ <= enemy.z + 12 && (!nearest || enemy.z < nearest.z)) nearest = enemy;
      }
      if (nearest) {
        nearest.hp--; nearest.hit = .08; bullet.active = false; this.stats.damage++;
        this.emit('hit', { x: nearest.x, z: nearest.z });
        if (nearest.hp <= 0) { nearest.active = false; this.stats.kills++; this.emit('kill', { x: nearest.x, z: nearest.z }); }
      } else if (this.boss && Math.abs(bullet.x - this.boss.x) < this.boss.radius && bullet.z >= this.boss.z - 22 && bullet.prevZ <= this.boss.z + 22) {
        this.boss.hp--; this.boss.hit = .06; bullet.active = false; this.stats.damage++;
        this.emit('hitBoss', { x: bullet.x, z: this.boss.z });
        if (this.boss.hp <= 0) { this.finish(true); return; }
      }
      if (bullet.z > 1250 || bullet.age > 2) bullet.active = false;
    }
    if (this.time >= CONFIG.duration) this.finish(false, 'timeout');
  }
}
export class FixedStepper {
  constructor(update, step = CONFIG.step) { this.update = update; this.step = step; this.accumulator = 0; }
  reset() { this.accumulator = 0; }
  advance(realDelta) {
    if (!Number.isFinite(realDelta) || realDelta < 0) return 0;
    this.accumulator += Math.min(realDelta, CONFIG.maxFrameDelta);
    let steps = 0;
    while (this.accumulator + 1e-10 >= this.step) { this.update(this.step); this.accumulator -= this.step; steps++; }
    return steps;
  }
}
