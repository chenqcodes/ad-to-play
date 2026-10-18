/** Deterministic, DOM-free gameplay. Render rate never changes the rules. */
export const CONFIG = Object.freeze({
  step: 1 / 120, maxFrameDelta: .25,
  initialSquad: 4, maxSquad: 42, maxRapid: 2, rapidBonus: .35,
  maxBullets: 480, maxEnemies: 96,
  moveSpeed: 3.8, roadSpeed: 142, bulletSpeed: 780, fireInterval: .28,
  spawnZ: 880, gateZ: 30, playerRadius: .15,
  contactGrace: .45, bossAt: 42, bossHP: 1200, duration: 60,
});
export const WEAPONS = Object.freeze({
  rifle: Object.freeze({ name: '步枪', short: '步枪', description: '稳定直射 · 集中火力', color: '#72ecff', interval: .28, pellets: 1, damage: 1, speed: 780, lifetime: 1.6, radius: .008, pierce: 1, spread: 0 }),
  scatter: Object.freeze({ name: '散射枪', short: '散射', description: '三发扇形 · 清理宽阵', color: '#ffc176', interval: .74, pellets: 3, damage: 1.05, speed: 900, lifetime: 1.28, radius: .018, pierce: 1, spread: .23 }),
  pierce: Object.freeze({ name: '穿透枪', short: '穿透', description: '贯穿三敌 · 破解纵队', color: '#cba7ff', interval: .36, pellets: 1, damage: 1.45, speed: 940, lifetime: 1.4, radius: .012, pierce: 3, spread: 0 }),
  cannon: Object.freeze({ name: '爆破炮', short: '爆破', description: '慢速重炮 · 小范围爆炸', color: '#ff8d6b', interval: .9, pellets: 1, damage: 3.9, speed: 720, lifetime: 1.8, radius: .03, pierce: 1, spread: 0, splashRadius: .24, splashDepth: 76, splashLimit: 8 }),
});
const people = (value, cap = value, shotCost = 12) => Object.freeze({ type: 'recruit', value, shootable: true, maxValue: cap, cap, shotCost });
const weapon = name => Object.freeze({ type: 'weapon', weapon: name });
const rapid = Object.freeze({ type: 'rapid', value: 1 });
const gates = definitions => Object.freeze(definitions.map((definition, id) => Object.freeze({ id, ...definition })));
const waves = definitions => Object.freeze(definitions.map(definition => Object.freeze(definition)));
export const LEVELS = Object.freeze([
  Object.freeze({
    id: 'growth', name: '集结大道', subtitle: '01 · 人数成长', description: '瞄准数字门，把负数打成增援，再带整支小队冲线。',
    focus: 'troops', initialSquad: 4, bossAt: 42, bossHP: 1280, duration: 60, bossDamage: 8,
    gates: gates([
      { at: 0, z: 360, left: people(-2, 8, 3), right: people(3, 5, 5) },
      { at: 4.5, left: people(4, 7, 18), right: people(-5, 14, 10) },
      { at: 11, left: weapon('scatter'), right: people(5, 9, 22) },
      { at: 18, left: people(-6, 12, 18), right: rapid },
      { at: 25, left: people(4, 8, 28), right: people(-8, 15, 20) },
      { at: 31, left: weapon('cannon'), right: people(5, 9, 26) },
    ]),
    waves: waves([
      { at: 2.5, x: -.35, z: 650, count: 3, hp: 3 },
      { at: 10.6, x: .4, z: 650, count: 3, rows: 2, hp: 5 },
      { at: 17.1, x: 0, z: 650, count: 5, hp: 5 },
      { at: 24.1, x: -.32, z: 650, count: 3, rows: 2, hp: 7 },
      { at: 31.1, x: .3, z: 650, count: 1, hp: 48, heavy: true },
      { at: 37.1, x: 0, z: 500, count: 5, hp: 9 },
    ]),
  }),
  Object.freeze({
    id: 'firepower', name: '火力试炼', subtitle: '02 · 武器取舍', description: '散射清横排，穿透破纵队。换枪后立刻看见不同打法。',
    focus: 'weapons', initialSquad: 6, bossAt: 42, bossHP: 1160, duration: 60, bossDamage: 8,
    gates: gates([
      { at: 0, z: 360, left: weapon('scatter'), right: weapon('pierce') },
      { at: 4.5, left: people(4, 9, 14), right: people(-5, 13, 10) },
      { at: 11, left: rapid, right: people(5, 9, 22) },
      { at: 18, left: weapon('cannon'), right: weapon('scatter') },
      { at: 25, left: people(-7, 14, 18), right: people(4, 8, 26) },
      { at: 31, left: weapon('pierce'), right: people(5, 9, 25) },
    ]),
    waves: waves([
      { at: 2.5, x: .35, z: 650, count: 2, rows: 3, hp: 5 },
      { at: 10.6, x: 0, z: 650, count: 7, rows: 2, hp: 5 },
      { at: 17.1, x: -.34, z: 650, count: 2, rows: 4, hp: 7 },
      { at: 24.1, x: .24, z: 650, count: 3, rows: 3, hp: 8 },
      { at: 31.1, x: -.35, z: 650, count: 1, rows: 2, hp: 40, heavy: true },
      { at: 37.1, x: 0, z: 490, count: 6, rows: 2, hp: 8 },
    ]),
  }),
  Object.freeze({
    id: 'survival', name: '守卫封锁', subtitle: '03 · 闪避生存', description: '重装敌人逼近，提前让出红色预警区，保住最后一名队员。',
    focus: 'survival', initialSquad: 8, bossAt: 42, bossHP: 1360, duration: 60, bossDamage: 10,
    gates: gates([
      { at: 0, z: 360, left: weapon('cannon'), right: people(5, 8, 10) },
      { at: 4.5, left: people(-5, 14, 10), right: people(4, 8, 18) },
      { at: 11, left: rapid, right: weapon('pierce') },
      { at: 18, left: people(4, 8, 24), right: people(-6, 14, 18) },
      { at: 25, left: weapon('scatter'), right: people(5, 9, 26) },
      { at: 31, left: weapon('cannon'), right: people(5, 9, 26) },
    ]),
    waves: waves([
      { at: 2.5, x: -.4, z: 650, count: 1, hp: 28, heavy: true, damage: 5 },
      { at: 10.6, x: .35, z: 650, count: 3, rows: 2, hp: 9, damage: 3 },
      { at: 17.1, x: -.35, z: 650, count: 2, hp: 44, heavy: true, damage: 5 },
      { at: 24.1, x: .38, z: 650, count: 2, rows: 2, hp: 18, heavy: true, damage: 5 },
      { at: 31.1, x: 0, z: 650, count: 5, rows: 2, hp: 11, damage: 3 },
      { at: 37.1, x: -.28, z: 500, count: 2, hp: 64, heavy: true, damage: 5 },
    ]),
  }),
]);
// Kept for v0.2 clients; new code should use game.level.gates / waves.
export const GATES = LEVELS[0].gates;
export const WAVES = LEVELS[0].waves;
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
export class ObjectPool {
  constructor(capacity) {
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, () => ({ active: false }));
    this.cursor = 0;
  }
  take(values) {
    for (let i = 0; i < this.capacity; i++) {
      const item = this.items[this.cursor]; this.cursor = (this.cursor + 1) % this.capacity;
      if (!item.active) { Object.assign(item, values, { active: true }); return item; }
    }
    return null;
  }
  clear() { for (const item of this.items) item.active = false; this.cursor = 0; }
  get count() { let n = 0; for (const item of this.items) if (item.active) n++; return n; }
}
export function squadOffset(index, count) {
  const cols = count <= 3 ? count : count <= 12 ? 4 : count <= 30 ? 6 : 7;
  const row = Math.floor(index / cols), rowCount = Math.min(cols, count - row * cols);
  return { x: (index % cols - (rowCount - 1) / 2) * .062, z: -row * 10 };
}
function mutableEffect(effect) {
  if (effect.type !== 'recruit') return { ...effect };
  const cap = Math.max(effect.value, effect.maxValue ?? effect.cap ?? effect.value);
  return { ...effect, initialValue: effect.value, shootable: effect.shootable !== false,
    shotProgress: 0, shotCost: Math.max(1, effect.shotCost ?? 12), maxValue: cap, cap, hit: 0 };
}
const CAUSES = Object.freeze({ boss: '击败终点守卫', timeout: '时间耗尽，火力还差一点', gate: '数字门扣光了队员，先射击再通过', squad: '小队耗尽，提前躲开敌人和红色预警' });
export class Game {
  constructor(levelId = LEVELS[0].id) {
    this.level = LEVELS.find(level => level.id === levelId) ?? LEVELS[0];
    this.bullets = new ObjectPool(CONFIG.maxBullets); this.enemies = new ObjectPool(CONFIG.maxEnemies);
    this.events = []; this.reset('ready');
  }
  selectLevel(id) {
    const selected = LEVELS.find(level => level.id === id);
    if (!selected || ['playing', 'paused'].includes(this.mode)) return false;
    this.level = selected; this.reset('ready'); return true;
  }
  reset(mode = 'ready') {
    this.mode = mode; this.time = 0; this.x = 0; this.targetX = 0;
    this.squad = this.level.initialSquad; this.maxSquad = this.squad; this.rapid = 0; this.weapon = 'rifle';
    this.fireTimer = 0; this.hurtUntil = 0; this.nextGate = 0; this.nextWave = 0; this.enemySerial = 0;
    this.gates = []; this.boss = null; this.result = null; this.route = []; this.lastHitSource = null;
    this.bullets.clear(); this.enemies.clear(); this.events.length = 0;
    this.stats = { kills: 0, recruits: 0, gates: 0, upgrades: 0, shots: 0, damage: 0, hitsTaken: 0, dodges: 0, gateGrowth: 0 };
  }
  get weaponDefinition() { return WEAPONS[this.weapon]; }
  get fireRate() { return 1 + this.rapid * CONFIG.rapidBonus; }
  get fireInterval() { return this.weaponDefinition.interval / this.fireRate; }
  get power() { return Math.round(this.squad * this.weaponDefinition.damage * this.weaponDefinition.pellets / this.fireInterval); }
  get phase() {
    if (this.time >= this.level.bossAt) return '终点守卫';
    if (this.time < 12) return this.level.id === 'growth' ? '射击增援' : this.level.id === 'firepower' ? '选择武器' : '重装突围';
    return this.time < 28 ? '火力升级' : '突破防线';
  }
  start(levelId = this.level.id) {
    const selected = LEVELS.find(level => level.id === levelId);
    if (!selected) return false;
    this.level = selected; this.reset('playing'); this.emit('start', { levelId }); return true;
  }
  pause() { if (this.mode === 'playing') { this.mode = 'paused'; this.emit('pause'); } }
  resume() { if (this.mode === 'paused') { this.mode = 'playing'; this.emit('resume'); } }
  setTarget(x) { if (Number.isFinite(x)) this.targetX = clamp(x, -.79, .79); }
  emit(type, details = {}) {
    if (this.events.length >= 256) {
      if (['hit', 'hitBoss', 'gateHit', 'fire', 'explosion'].includes(type)) return;
      const cosmetic = this.events.findIndex(event => ['hit', 'hitBoss', 'gateHit', 'fire', 'explosion'].includes(event.type));
      this.events.splice(cosmetic < 0 ? 0 : cosmetic, 1);
    }
    this.events.push({ type, ...details });
  }
  drainEvents() { const result = this.events; this.events = []; return result; }
  addSquad(delta, source = 'gate') {
    if (this.mode !== 'playing') return;
    const before = this.squad; this.squad = clamp(this.squad + delta, 0, CONFIG.maxSquad);
    const actual = this.squad - before;
    if (actual > 0) this.stats.recruits += actual;
    this.maxSquad = Math.max(this.maxSquad, this.squad);
    this.emit(actual >= 0 ? 'gain' : 'hurt', { amount: actual, source, x: this.x, z: 0, capped: this.squad === CONFIG.maxSquad });
    if (this.squad <= 0) this.finish(false, source === 'gate' ? 'gate' : 'squad');
  }
  hurt(amount, source) {
    if (this.mode !== 'playing' || this.time < this.hurtUntil) return false;
    this.hurtUntil = this.time + CONFIG.contactGrace; this.stats.hitsTaken++; this.lastHitSource = source;
    this.addSquad(-amount, source); return true;
  }
  gateEffect(effect) {
    const redundant = (effect.type === 'rapid' && this.rapid >= CONFIG.maxRapid) || (effect.type === 'weapon' && effect.weapon === this.weapon);
    return redundant ? { type: 'recruit', value: 5, shootable: false } : effect;
  }
  setWeapon(name) {
    if (!WEAPONS[name] || this.mode !== 'playing') return false;
    if (this.weapon !== name) this.bullets.clear();
    this.weapon = name; this.stats.upgrades++;
    this.fireTimer = Math.min(this.fireTimer, this.fireInterval);
    this.emit('weapon', { weapon: name, name: WEAPONS[name].name, color: WEAPONS[name].color, x: this.x, z: 0 }); return true;
  }
  takeGate(effect, side = '') {
    if (this.mode !== 'playing') return;
    const chosen = this.gateEffect(effect); this.stats.gates++;
    const title = chosen.type === 'recruit' ? `${chosen.value >= 0 ? '+' : ''}${chosen.value} 人` : chosen.type === 'weapon' ? WEAPONS[chosen.weapon].name : '连射升级';
    this.route.push(`${side ? `${side} · ` : ''}${title}`);
    if (chosen.type === 'recruit') this.addSquad(chosen.value);
    else if (chosen.type === 'weapon') this.setWeapon(chosen.weapon);
    else {
      this.rapid++; this.stats.upgrades++; this.fireTimer = Math.min(this.fireTimer, this.fireInterval);
      this.emit('upgrade', { level: this.rapid, rate: this.fireRate, x: this.x, z: 0 });
    }
  }
  finish(won, reason = 'boss') {
    if (this.mode !== 'playing') return;
    this.mode = won ? 'won' : 'lost';
    const cause = reason === 'squad' ? (this.lastHitSource === 'boss' ? '被守卫光束击中，提前离开红色预警区' : this.lastHitSource === 'heavy' ? '被重装敌人撞散，集中火力或提前绕开' : '被敌人撞散，射击清路或横移避开') : CAUSES[reason] ?? reason;
    this.result = { won, reason, cause, lastHitSource: this.lastHitSource, time: this.time, squad: this.squad, maxSquad: this.maxSquad,
      rapid: this.rapid, weapon: this.weapon, levelId: this.level.id, progress: won ? 1 : clamp(this.boss ? .7 + .29 * (1 - this.boss.hp / this.boss.maxHP) : .7 * this.time / this.level.bossAt, 0, .99), route: [...this.route], ...this.stats };
    this.emit(won ? 'win' : 'lose', { x: this.x, z: 0 });
  }
  spawnGate(def) { this.gates.push({ ...def, left: mutableEffect(def.left), right: mutableEffect(def.right), z: def.z ?? CONFIG.spawnZ, resolved: false }); }
  spawnWave(def) {
    const rows = def.rows || 1;
    for (let row = 0; row < rows; row++) for (let i = 0; i < def.count; i++) {
      const spawned = this.enemies.take({
        id: ++this.enemySerial, x: def.x + (i - (def.count - 1) / 2) * .18,
        z: (def.z ?? CONFIG.spawnZ) + row * 52, hp: def.hp, maxHP: def.hp, radius: def.heavy ? .15 : .1,
        speed: CONFIG.roadSpeed, hit: 0, phase: def.at + i,
        heavy: Boolean(def.heavy), damage: def.damage ?? (def.heavy ? 4 : 2),
      });
      if (!spawned) throw new Error('Enemy pool exhausted: level must stay within its tested budget');
    }
  }
  fire() {
    const w = this.weaponDefinition, expectedCount = this.squad * w.pellets;
    // Never silently drop a member's projectile. The worst-case 42-member/rapid-2
    // configurations are tested below capacity for every weapon.
    if (this.bullets.count + expectedCount > this.bullets.capacity) throw new Error('Projectile pool exhausted');
    let fired = 0;
    for (let i = 0; i < this.squad; i++) {
      const offset = squadOffset(i, this.squad);
      for (let pellet = 0; pellet < w.pellets; pellet++) {
        this.bullets.take({ x: this.x + offset.x, z: 42 + offset.z, prevZ: 42 + offset.z, age: 0,
          weapon: this.weapon, damage: w.damage, gateDamage: w.interval / CONFIG.fireInterval / w.pellets,
          vx: w.pellets > 1 ? (pellet - (w.pellets - 1) / 2) * w.spread : 0,
          speed: w.speed, lifetime: w.lifetime, radius: w.radius, pierceLeft: w.pierce, hitIds: [], member: i, pellet }); fired++;
      }
    }
    this.stats.shots += fired; this.emit('fire', { count: fired, expectedCount, weapon: this.weapon, x: this.x, z: 0 });
  }
  shootGate(effect, amount, x, z) {
    effect.hit = .09;
    if (effect.value >= effect.maxValue) return;
    effect.shotProgress += amount;
    let growth = 0;
    while (effect.shotProgress + 1e-9 >= effect.shotCost && effect.value < effect.maxValue) {
      effect.shotProgress = Math.max(0, effect.shotProgress - effect.shotCost); effect.value++; growth++; this.stats.gateGrowth++;
    }
    if (effect.value >= effect.maxValue) effect.shotProgress = 0;
    if (growth) this.emit('gateGrow', { x, z, value: effect.value, amount: growth, capped: effect.value >= effect.maxValue });
    this.emit('gateHit', { x, z, value: effect.value, progress: effect.shotProgress, cost: effect.shotCost, cap: effect.maxValue });
  }
  damageEnemy(enemy, amount) {
    const actual = Math.min(enemy.hp, amount); enemy.hp = Math.max(0, enemy.hp - amount); enemy.hit = .08; this.stats.damage += actual;
    this.emit('hit', { x: enemy.x, z: enemy.z });
    if (enemy.hp <= 1e-8) { enemy.hp = 0; enemy.active = false; this.stats.kills++; this.emit('kill', { x: enemy.x, z: enemy.z }); }
  }
  damageBoss(amount, x) {
    const b = this.boss; this.stats.damage += Math.min(b.hp, amount); b.hp = Math.max(0, b.hp - amount); b.hit = .06;
    this.emit('hitBoss', { x, z: b.z }); if (b.hp <= 1e-8) { b.hp = 0; this.finish(true); }
  }
  explode(bullet, target) {
    const w = WEAPONS.cannon;
    this.emit('explosion', { x: target.x, z: target.z, radius: w.splashRadius });
    const nearby = this.enemies.items.filter(enemy => enemy.active && enemy !== target &&
      Math.abs(enemy.x - target.x) <= w.splashRadius && Math.abs(enemy.z - target.z) <= w.splashDepth &&
      !this.gates.some(row => !row.resolved && row.z > target.z && row.z < enemy.z &&
        ((row.left.shootable && Math.abs(enemy.x + .49) <= .39) || (row.right.shootable && Math.abs(enemy.x - .49) <= .39))));
    nearby.sort((a, b) => Math.abs(a.z - target.z) - Math.abs(b.z - target.z) || a.id - b.id);
    for (const enemy of nearby.slice(0, w.splashLimit - 1)) this.damageEnemy(enemy, bullet.damage * .7);
  }
  update(dt) {
    if (this.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    this.time += dt;
    this.x += clamp((this.targetX - this.x) * (1 - Math.exp(-18 * dt)), -CONFIG.moveSpeed * dt, CONFIG.moveSpeed * dt);
    while (this.nextGate < this.level.gates.length && this.level.gates[this.nextGate].at <= this.time) this.spawnGate(this.level.gates[this.nextGate++]);
    while (this.nextWave < this.level.waves.length && this.level.waves[this.nextWave].at <= this.time) this.spawnWave(this.level.waves[this.nextWave++]);
    this.fireTimer -= dt;
    while (this.fireTimer <= 1e-10) { this.fire(); this.fireTimer += this.fireInterval; }
    for (const row of this.gates) {
      row.z -= CONFIG.roadSpeed * dt;
      for (const effect of [row.left, row.right]) effect.hit = Math.max(0, (effect.hit ?? 0) - dt);
      if (!row.resolved && row.z <= CONFIG.gateZ) {
        row.resolved = true;
        if (Math.abs(this.x + .49) <= .39) this.takeGate(row.left, '左');
        else if (Math.abs(this.x - .49) <= .39) this.takeGate(row.right, '右');
        else { this.route.push('中路 · 跳过'); this.emit('missGate'); }
      }
    }
    this.gates = this.gates.filter(row => row.z > -180);
    if (this.mode !== 'playing') return;
    for (const enemy of this.enemies.items) {
      if (!enemy.active) continue;
      enemy.z -= enemy.speed * dt; enemy.hit = Math.max(0, enemy.hit - dt);
      if (enemy.z < 25) {
        if (Math.abs(enemy.x - this.x) < enemy.radius + CONFIG.playerRadius) this.hurt(enemy.damage ?? 2, enemy.heavy ? 'heavy' : 'enemy');
        enemy.active = false;
      }
    }
    if (this.mode !== 'playing') return;
    if (!this.boss && this.time >= this.level.bossAt) {
      this.boss = { hp: this.level.bossHP, maxHP: this.level.bossHP, x: 0, z: 780, radius: .29, hit: 0,
        nextAttack: this.time + 1.2, attack: null, enraged: false };
      this.emit('boss');
    }
    if (this.boss) {
      const b = this.boss;
      b.x = Math.sin((this.time - this.level.bossAt) * .65) * .48; b.z = Math.max(440, b.z - dt * 130); b.hit = Math.max(0, b.hit - dt);
      if (!b.enraged && b.hp <= b.maxHP * .5) { b.enraged = true; this.emit('bossPhase'); }
      if (b.attack && this.time >= b.attack.at) {
        if (Math.abs(this.x - b.attack.x) < (b.attack.width ?? .23)) this.hurt(this.level.bossDamage, 'boss');
        else { this.stats.dodges++; this.emit('dodge'); }
        this.emit('beam', { x: b.attack.x, z: 0 }); b.attack = null;
      }
      if (this.time >= b.nextAttack && !b.attack) {
        const survival = this.level.id === 'survival';
        b.attack = { x: this.x, at: this.time + (b.enraged ? 1 : 1.2), started: this.time, width: .23 };
        b.nextAttack = this.time + (b.enraged ? (survival ? 2.15 : 2.4) : (survival ? 2.6 : 2.9)); this.emit('warning');
      }
    }
    if (this.mode !== 'playing') return;
    for (const bullet of this.bullets.items) {
      if (!bullet.active) continue;
      const previousX = bullet.x; bullet.prevZ = bullet.z;
      bullet.z += (bullet.speed ?? CONFIG.bulletSpeed) * dt; bullet.x += (bullet.vx ?? 0) * dt; bullet.age += dt;
      const candidates = [];
      const intersects = (x, z, radius, depth) => {
        if (bullet.z < z - depth || bullet.prevZ > z + depth) return false;
        const t = clamp((z - depth - bullet.prevZ) / Math.max(.0001, bullet.z - bullet.prevZ), 0, 1);
        return Math.abs(previousX + (bullet.x - previousX) * t - x) <= radius + (bullet.radius ?? 0);
      };
      for (const enemy of this.enemies.items) {
        if (enemy.active && !(bullet.hitIds ?? []).includes(enemy.id) && intersects(enemy.x, enemy.z, enemy.radius, 12)) candidates.push({ kind: 'enemy', target: enemy, z: enemy.z - 12 });
      }
      for (const row of this.gates) if (!row.resolved) for (const [x, effect] of [[-.49, row.left], [.49, row.right]]) {
        if (effect.type === 'recruit' && effect.shootable && intersects(x, row.z, .39, 5)) candidates.push({ kind: 'gate', target: effect, x, row, z: row.z - 5 });
      }
      if (this.boss && intersects(this.boss.x, this.boss.z, this.boss.radius, 22)) candidates.push({ kind: 'boss', target: this.boss, z: this.boss.z - 22 });
      candidates.sort((a, b) => a.z - b.z || (a.kind === 'gate' ? -1 : b.kind === 'gate' ? 1 : 0));
      for (const collision of candidates) {
        if (!bullet.active || this.mode !== 'playing') break;
        if (collision.kind === 'gate') {
          this.shootGate(collision.target, bullet.gateDamage ?? 1, collision.x, collision.row.z); bullet.active = false; break;
        }
        if (collision.kind === 'boss') { this.damageBoss(bullet.damage ?? 1, bullet.x); bullet.active = false; break; }
        const enemy = collision.target;
        if (!enemy.active) continue;
        this.damageEnemy(enemy, bullet.damage ?? 1);
        if (bullet.weapon === 'cannon') this.explode(bullet, enemy);
        bullet.hitIds ??= []; bullet.hitIds.push(enemy.id);
        bullet.pierceLeft = (bullet.pierceLeft ?? 1) - 1;
        if (bullet.pierceLeft <= 0) bullet.active = false;
      }
      if (bullet.z > 1250 || bullet.age >= (bullet.lifetime ?? 1.6)) bullet.active = false;
      if (this.mode !== 'playing') return;
    }
    if (this.time >= this.level.duration) this.finish(false, 'timeout');
  }
}
export class FixedStepper {
  constructor(update, step = CONFIG.step) { this.update = update; this.step = step; this.accumulator = 0; }
  reset() { this.accumulator = 0; }
  advance(realDelta) {
    if (!Number.isFinite(realDelta) || realDelta < 0) return 0;
    this.accumulator += Math.min(realDelta, CONFIG.maxFrameDelta); let steps = 0;
    while (this.accumulator + 1e-10 >= this.step) { this.update(this.step); this.accumulator -= this.step; steps++; }
    return steps;
  }
}
