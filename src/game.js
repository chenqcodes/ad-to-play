/** Deterministic, DOM-free gameplay. Render rate never changes the rules. */
export const CONFIG = Object.freeze({
  step: 1 / 120, maxFrameDelta: .25,
  initialSquad: 4, maxSquad: 42, maxRapid: 2, rapidBonus: .35,
  maxBullets: 768, maxEnemies: 240,
  moveSpeed: 3.8, roadSpeed: 142, bulletSpeed: 780, fireInterval: .28,
  spawnZ: 880, gateZ: 30, playerRadius: .15,
  contactGrace: .45, bossAt: 42, bossHP: 1200, duration: 60,
});
export const WEAPONS = Object.freeze({
  rifle: Object.freeze({ name: '步枪', short: '步枪', description: '稳定直射 · 集中火力', color: '#72ecff', interval: .44, pellets: 1, damage: 1, speed: 780, lifetime: 1.6, radius: .008, pierce: 1, spread: 0 }),
  scatter: Object.freeze({ name: '散射枪', short: '散射', description: '三发扇形 · 清理宽阵', color: '#ffc176', interval: .74, pellets: 3, damage: 1.05, speed: 900, lifetime: 1.28, radius: .018, pierce: 1, spread: .23 }),
  pierce: Object.freeze({ name: '穿透枪', short: '穿透', description: '贯穿三敌 · 破解纵队', color: '#cba7ff', interval: .36, pellets: 1, damage: 1.45, speed: 940, lifetime: 1.4, radius: .012, pierce: 3, spread: 0 }),
  cannon: Object.freeze({ name: '爆破炮', short: '爆破', description: '慢速重炮 · 小范围爆炸', color: '#ff8d6b', interval: .9, pellets: 1, damage: 3.9, speed: 720, lifetime: 1.8, radius: .03, pierce: 1, spread: 0, splashRadius: .24, splashDepth: 76, splashLimit: 8 }),
});
// Supports are announced from the beginning and never interrupt movement or aiming.
export const SUPPORTS = Object.freeze([
  Object.freeze({ at: 7, tier: 1, name: '破阵支援' }),
  Object.freeze({ at: 23, tier: 2, name: '横扫支援' }),
]);
export const POWER_LABELS = Object.freeze(['基础火力', '破阵火力', '横扫火力']);
const tierWeapon = (base, changes) => Object.freeze({ ...base, ...changes });
export const WEAPON_TIERS = Object.freeze(Object.fromEntries(Object.entries(WEAPONS).map(([name, base]) => [name, Object.freeze([
  base,
  tierWeapon(base, {
    rifle: { pellets: 2, interval: .32, damage: 1.15, radius: .025, pierce: 3, spread: .30, lifetime: 1.15, speed: 1000 },
    scatter: { pellets: 5, interval: .78, damage: 1.15, radius: .026, pierce: 2, spread: .28, lifetime: 1.15, speed: 1050 },
    pierce: { interval: .32, damage: 1.9, radius: .055, pierce: 7, lifetime: 1.25, speed: 1050 },
    cannon: { interval: .85, damage: 4.8, radius: .04, splashRadius: .38, splashDepth: 110, splashLimit: 24, lifetime: 1.5, speed: 820 },
  }[name]),
  tierWeapon(base, {
    rifle: { pellets: 3, interval: .36, damage: 1.3, radius: .045, pierce: 5, spread: .46, lifetime: 1.1, speed: 1100 },
    scatter: { pellets: 7, interval: .85, damage: 1.3, radius: .035, pierce: 3, spread: .38, lifetime: .94, speed: 1150 },
    pierce: { interval: .29, damage: 2.5, radius: .11, pierce: 12, lifetime: 1.2, speed: 1120 },
    cannon: { interval: .78, damage: 5.5, radius: .05, splashRadius: .52, splashDepth: 150, splashLimit: 48, chain: true, chainRadius: .34, chainDepth: 95, chainLimit: 24, lifetime: 1.4, speed: 900 },
  }[name]),
])])));
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
      { at: 10, z: 280, left: people(4, 7, 4), right: people(-5, 14, 2) },
      { at: 20, z: 280, left: weapon('scatter'), right: people(5, 9, 6) },
      { at: 30, z: 280, left: people(-6, 12, 4), right: rapid },
      { at: 37, z: 210, left: people(4, 8, 7), right: people(-8, 15, 5) },
      { at: 39.2, z: 210, left: weapon('cannon'), right: people(5, 9, 6) },
    ]),
    waves: waves([
      { at: 2.5, x: 0, z: 440, count: 15, rows: 10, spacing: .112, rowSpacing: 22, speed: 90, hp: 1, gap: .18, gapX: .28 },
      { at: 6.45, x: 0, z: 360, count: 18, rows: 6, spacing: .095, rowSpacing: 22, speed: 132, hp: 1, gap: .15, gapX: -.3 },
      { at: 12.1, x: 0, z: 460, count: 17, rows: 10, spacing: .1, rowSpacing: 22, speed: 90, hp: 1, gap: .14, gapX: -.3 },
      { at: 15.3, x: 0, z: 360, count: 18, rows: 4, spacing: .095, rowSpacing: 22, speed: 108, hp: 1, gap: .15, gapX: .3 },
      { at: 22.1, x: 0, z: 450, count: 18, rows: 10, spacing: .095, rowSpacing: 22, speed: 140, hp: 1, gap: .15, gapX: .3 },
      { at: 22.85, x: 0, z: 540, count: 18, rows: 4, spacing: .095, rowSpacing: 22, speed: 145, hp: 1, gap: .15, gapX: -.3 },
      { at: 27.1, x: 0, z: 200, count: 16, rows: 6, spacing: .108, rowSpacing: 20, speed: 120, hp: 1, gap: .15, gapX: .3 },
      { at: 32.1, x: 0, z: 340, count: 16, rows: 8, spacing: .108, rowSpacing: 20, speed: 104, hp: 1, gap: .14, gapX: -.28 },
      { at: 34.5, x: 0, z: 220, count: 18, rows: 4, spacing: .095, rowSpacing: 22, speed: 130, hp: 1, gap: .15, gapX: -.3 },
      { at: 44, x: 0, z: 680, count: 15, rows: 4, spacing: .11, rowSpacing: 25, speed: 95, hp: 1, gap: .14, gapX: .3 },
      { at: 50, x: 0, z: 670, count: 15, rows: 4, spacing: .11, rowSpacing: 25, speed: 100, hp: 1, gap: .14, gapX: -.3 },
    ]),
  }),
  Object.freeze({
    id: 'firepower', name: '火力试炼', subtitle: '02 · 武器取舍', description: '散射清横排，穿透破纵队。换枪后立刻看见不同打法。',
    focus: 'weapons', initialSquad: 6, bossAt: 42, bossHP: 1160, duration: 60, bossDamage: 8,
    gates: gates([
      { at: 0, z: 360, left: weapon('scatter'), right: weapon('pierce') },
      { at: 10, z: 280, left: people(4, 9, 4), right: people(-5, 13, 2) },
      { at: 20, z: 280, left: rapid, right: people(5, 9, 6) },
      { at: 30, z: 280, left: weapon('cannon'), right: weapon('scatter') },
      { at: 37, z: 210, left: people(-7, 14, 4), right: people(4, 8, 6) },
      { at: 39.2, z: 210, left: weapon('pierce'), right: people(5, 9, 6) },
    ]),
    waves: waves([
      { at: 2.5, x: 0, z: 440, count: 16, rows: 9, spacing: .108, rowSpacing: 24, speed: 90, hp: 1, gap: .15, gapX: -.28 },
      { at: 6.45, x: 0, z: 360, count: 18, rows: 6, spacing: .095, rowSpacing: 22, speed: 132, hp: 1, gap: .15, gapX: -.3 },
      { at: 12.1, x: 0, z: 450, count: 18, rows: 10, spacing: .095, rowSpacing: 22, speed: 90, hp: 1, gap: .15, gapX: .28 },
      { at: 15.3, x: 0, z: 360, count: 18, rows: 4, spacing: .095, rowSpacing: 22, speed: 108, hp: 1, gap: .15, gapX: .3 },
      { at: 22.1, x: 0, z: 450, count: 18, rows: 10, spacing: .095, rowSpacing: 22, speed: 140, hp: 1, gap: .15, gapX: -.28 },
      { at: 22.85, x: 0, z: 540, count: 18, rows: 4, spacing: .095, rowSpacing: 22, speed: 145, hp: 1, gap: .15, gapX: -.3 },
      { at: 27.1, x: 0, z: 200, count: 16, rows: 6, spacing: .108, rowSpacing: 20, speed: 120, hp: 1, gap: .15, gapX: .3 },
      { at: 32.1, x: 0, z: 340, count: 18, rows: 8, spacing: .095, rowSpacing: 20, speed: 104, hp: 1, gap: .14, gapX: .3 },
      { at: 34.5, x: 0, z: 220, count: 18, rows: 4, spacing: .095, rowSpacing: 22, speed: 130, hp: 1, gap: .15, gapX: -.3 },
      { at: 44, x: 0, z: 680, count: 17, rows: 4, spacing: .1, rowSpacing: 25, speed: 95, hp: 1, gap: .14, gapX: -.3 },
      { at: 50, x: 0, z: 670, count: 17, rows: 4, spacing: .1, rowSpacing: 25, speed: 100, hp: 1, gap: .14, gapX: .3 },
    ]),
  }),
  Object.freeze({
    id: 'survival', name: '守卫封锁', subtitle: '03 · 闪避生存', description: '重装敌人逼近，提前让出红色预警区，保住最后一名队员。',
    focus: 'survival', initialSquad: 8, bossAt: 42, bossHP: 1360, duration: 60, bossDamage: 10,
    gates: gates([
      { at: 0, z: 360, left: weapon('cannon'), right: people(5, 8, 10) },
      { at: 10, z: 280, left: people(-5, 14, 2), right: people(4, 8, 4) },
      { at: 20, z: 280, left: rapid, right: weapon('pierce') },
      { at: 30, z: 280, left: people(4, 8, 6), right: people(-6, 14, 4) },
      { at: 37, z: 210, left: weapon('scatter'), right: people(5, 9, 6) },
      { at: 39.2, z: 210, left: weapon('cannon'), right: people(5, 9, 6) },
    ]),
    waves: waves([
      { at: 2.5, x: 0, z: 440, count: 16, rows: 9, spacing: .108, rowSpacing: 24, speed: 90, hp: 1, gap: .17, gapX: .3 },
      { at: 6.45, x: 0, z: 360, count: 18, rows: 6, spacing: .095, rowSpacing: 22, speed: 132, hp: 1, gap: .15, gapX: -.3 },
      { at: 12.1, x: 0, z: 450, count: 18, rows: 10, spacing: .095, rowSpacing: 22, speed: 90, hp: 1, gap: .15, gapX: -.3, heavyEvery: 45, heavyHP: 9 },
      { at: 15.3, x: 0, z: 360, count: 18, rows: 4, spacing: .095, rowSpacing: 22, speed: 108, hp: 1, gap: .15, gapX: .3 },
      { at: 22.1, x: 0, z: 450, count: 18, rows: 10, spacing: .095, rowSpacing: 22, speed: 140, hp: 1, gap: .15, gapX: .3, heavyEvery: 45, heavyHP: 10 },
      { at: 22.85, x: 0, z: 540, count: 18, rows: 4, spacing: .095, rowSpacing: 22, speed: 145, hp: 1, gap: .15, gapX: -.3 },
      { at: 27.1, x: 0, z: 200, count: 16, rows: 6, spacing: .108, rowSpacing: 20, speed: 120, hp: 1, gap: .15, gapX: .3 },
      { at: 32.1, x: 0, z: 340, count: 18, rows: 8, spacing: .095, rowSpacing: 20, speed: 104, hp: 1, gap: .14, gapX: -.3, heavyEvery: 35, heavyHP: 10 },
      { at: 34.5, x: 0, z: 220, count: 18, rows: 4, spacing: .095, rowSpacing: 22, speed: 130, hp: 1, gap: .15, gapX: -.3 },
      { at: 44, x: 0, z: 680, count: 17, rows: 4, spacing: .1, rowSpacing: 25, speed: 95, hp: 1, gap: .14, gapX: .3 },
      { at: 50, x: 0, z: 670, count: 17, rows: 4, spacing: .1, rowSpacing: 25, speed: 100, hp: 1, gap: .14, gapX: -.3 },
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
/** Allocation-bounded broadphase; only populated cells in the swept region are tested. */
export class SpatialBuckets {
  constructor(width = .16, depth = 48) { this.width = width; this.depth = depth; this.cells = new Map(); this.activeCells = []; this.maxRadius = .15; }
  rebuild(items) {
    for (const cell of this.activeCells) cell.length = 0;
    this.activeCells.length = 0; this.maxRadius = .15;
    for (const item of items) if (item.active) {
      const key = `${Math.floor(item.x / this.width)},${Math.floor(item.z / this.depth)}`;
      let cell = this.cells.get(key);
      if (!cell) { cell = []; this.cells.set(key, cell); }
      if (!cell.length) this.activeCells.push(cell);
      cell.push(item); this.maxRadius = Math.max(this.maxRadius, item.radius ?? .1);
    }
  }
  query(x0, x1, z0, z1, visit) {
    for (let z = Math.floor(z0 / this.depth); z <= Math.floor(z1 / this.depth); z++) {
      for (let x = Math.floor(x0 / this.width); x <= Math.floor(x1 / this.width); x++) {
        const cell = this.cells.get(`${x},${z}`);
        if (cell) for (const item of cell) if (item.active) visit(item);
      }
    }
  }
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
    this.enemyGrid = new SpatialBuckets(); this.events = []; this.reset('ready');
  }
  selectLevel(id) {
    const selected = LEVELS.find(level => level.id === id);
    if (!selected || ['playing', 'paused'].includes(this.mode)) return false;
    this.level = selected; this.reset('ready'); return true;
  }
  reset(mode = 'ready') {
    this.mode = mode; this.time = 0; this.x = 0; this.targetX = 0;
    this.squad = this.level.initialSquad; this.maxSquad = this.squad; this.rapid = 0; this.weapon = 'rifle'; this.weaponTier = 0; this.nextSupportIndex = 0; this.volleySerial = 0;
    this.fireTimer = 0; this.hurtUntil = 0; this.nextGate = 0; this.nextWave = 0; this.enemySerial = 0;
    this.gates = []; this.pendingEnemies = []; this.boss = null; this.result = null; this.route = []; this.lastHitSource = null;
    this.bullets.clear(); this.enemies.clear(); this.events.length = 0;
    this.stats = { kills: 0, recruits: 0, gates: 0, upgrades: 0, shots: 0, damage: 0, hitsTaken: 0, dodges: 0, gateGrowth: 0, powerUps: 0, reloads: 0, spawned: 0, peakEnemies: 0 };
    this.metrics = { collisionChecks: 0, splashChecks: 0, maxCollisionChecks: 0, maxSplashChecks: 0, steps: 0 };
  }
  get weaponDefinition() { return WEAPON_TIERS[this.weapon][this.weaponTier]; }
  get powerLabel() { return POWER_LABELS[this.weaponTier]; }
  get nextSupport() { return SUPPORTS[this.nextSupportIndex] ?? null; }
  setPowerTier(tier) {
    if (this.mode !== 'playing' || !Number.isInteger(tier) || tier <= this.weaponTier || tier > 2) return false;
    this.weaponTier = tier; this.bullets.clear(); this.fireTimer = 0; this.stats.powerUps++;
    while (this.nextSupport && this.nextSupport.tier <= tier) this.nextSupportIndex++;
    this.emit('power', { tier, name: SUPPORTS[tier - 1].name, weapon: this.weapon, x: this.x, z: 0 }); return true;
  }
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
      rapid: this.rapid, weapon: this.weapon, weaponTier: this.weaponTier, levelId: this.level.id, progress: won ? 1 : clamp(this.boss ? .7 + .29 * (1 - this.boss.hp / this.boss.maxHP) : .7 * this.time / this.level.bossAt, 0, .99), route: [...this.route], ...this.stats };
    this.emit(won ? 'win' : 'lose', { x: this.x, z: 0 });
  }
  spawnGate(def) { this.gates.push({ ...def, left: mutableEffect(def.left), right: mutableEffect(def.right), z: def.z ?? CONFIG.spawnZ, resolved: false }); }
  spawnWave(def) {
    const rows = def.rows || 1; let count = 0;
    for (let row = 0; row < rows; row++) for (let i = 0; i < def.count; i++) {
      const x = def.x + (i - (def.count - 1) / 2) * (def.spacing ?? .18) + (row % 2 ? .012 : -.012);
      if (def.gap && Math.abs(x - (def.gapX ?? 0)) < def.gap / 2) continue;
      const heavy = Boolean(def.heavy || (def.heavyEvery && (row * def.count + i) % def.heavyEvery === 0));
      const hp = heavy ? (def.heavyHP ?? def.hp) : def.hp;
      const values = {
        id: ++this.enemySerial, x, z: (def.z ?? CONFIG.spawnZ) + row * (def.rowSpacing ?? 52),
        hp, maxHP: hp, radius: heavy ? .085 : .044, speed: def.speed ?? CONFIG.roadSpeed, hit: 0, phase: def.at + i,
        heavy, fodder: !heavy, row, wave: def.at, damage: def.damage ?? (heavy ? 4 : 1),
      };
      // Catch-up/debug time jumps age waves rather than materializing expired packs.
      if (this.time - def.at > CONFIG.step * 2) values.z -= values.speed * (this.time - def.at);
      if (values.z < 25) continue;
      if (!this.enemies.take(values)) this.pendingEnemies.push({ values, queuedAt: this.time });
      else count++;
    }
    this.stats.spawned += count; this.stats.peakEnemies = Math.max(this.stats.peakEnemies, this.enemies.count);
    this.emit('horde', { count, wave: def.at });
    if (this.pendingEnemies.length) this.emit('capacity', { pool: 'enemies', pending: this.pendingEnemies.length });
  }
  fire() {
    const w = this.weaponDefinition, expectedCount = this.squad * w.pellets;
    // An entire real volley is deferred rather than partially dropping members or crashing.
    // Exhaustive normal cadence/transition tests verify this branch is never needed in play.
    if (this.bullets.count + expectedCount > this.bullets.capacity) {
      this.stats.reloads++; this.emit('reload', { expectedCount, weapon: this.weapon }); return false;
    }
    const batch = ++this.volleySerial; let fired = 0;
    for (let i = 0; i < this.squad; i++) {
      const offset = squadOffset(i, this.squad);
      for (let pellet = 0; pellet < w.pellets; pellet++) {
        this.bullets.take({ x: this.x + offset.x, z: 42 + offset.z, prevZ: 42 + offset.z, age: 0,
          weapon: this.weapon, tier: this.weaponTier, batch, damage: w.damage, gateDamage: w.interval / CONFIG.fireInterval / w.pellets,
          vx: w.pellets > 1 ? (pellet - (w.pellets - 1) / 2) * w.spread : 0,
          speed: w.speed, lifetime: w.lifetime, radius: w.radius, pierceLeft: w.pierce, hitIds: [], member: i, pellet,
          splashRadius: w.splashRadius, splashDepth: w.splashDepth, splashLimit: w.splashLimit,
          chain: w.chain, chainRadius: w.chainRadius, chainDepth: w.chainDepth, chainLimit: w.chainLimit }); fired++;
      }
    }
    this.stats.shots += fired;
    this.emit('fire', { count: fired, expectedCount, weapon: this.weapon, tier: this.weaponTier, batch, pellets: w.pellets, x: this.x, z: 0 });
    return true;
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
  damageEnemy(enemy, amount, bullet = {}) {
    const actual = Math.min(enemy.hp, amount); enemy.hp = Math.max(0, enemy.hp - amount); enemy.hit = .08; this.stats.damage += actual;
    this.emit('hit', { x: enemy.x, z: enemy.z });
    if (enemy.hp <= 1e-8) { enemy.hp = 0; enemy.active = false; this.stats.kills++; this.emit('kill', { enemyId: enemy.id, heavy: enemy.heavy, weapon: bullet.weapon ?? this.weapon, tier: bullet.tier ?? this.weaponTier, batch: bullet.batch ?? 0, x: enemy.x, z: enemy.z }); }
  }
  damageBoss(amount, x) {
    const b = this.boss; this.stats.damage += Math.min(b.hp, amount); b.hp = Math.max(0, b.hp - amount); b.hit = .06;
    this.emit('hitBoss', { x, z: b.z }); if (b.hp <= 1e-8) { b.hp = 0; this.finish(true); }
  }
  blastBlocked(from, enemy) {
    return this.gates.some(row => !row.resolved && row.z > Math.min(from.z, enemy.z) && row.z < Math.max(from.z, enemy.z) &&
      ((row.left.shootable && Math.abs(enemy.x + .49) <= .39) || (row.right.shootable && Math.abs(enemy.x - .49) <= .39)));
  }
  explode(bullet, target) {
    const w = { ...WEAPON_TIERS.cannon[bullet.tier ?? 0], ...Object.fromEntries(Object.entries(bullet).filter(([, value]) => value !== undefined)) };
    const hit = new Set([target.id]); let chainTarget = null;
    const blast = (center, radius, depth, limit, chain) => {
      this.emit('explosion', { x: center.x, z: center.z, radius, depth, tier: bullet.tier ?? 0, chain });
      const nearby = [];
      this.enemyGrid.query(center.x - radius, center.x + radius, center.z - depth, center.z + depth, enemy => {
        this.metrics.splashChecks++;
        if (!hit.has(enemy.id) && Math.abs(enemy.x - center.x) <= radius && Math.abs(enemy.z - center.z) <= depth && !this.blastBlocked(center, enemy)) nearby.push(enemy);
      });
      nearby.sort((a, b) => Math.abs(a.z - center.z) - Math.abs(b.z - center.z) || a.id - b.id);
      for (const enemy of nearby.slice(0, limit)) {
        hit.add(enemy.id); this.damageEnemy(enemy, bullet.damage * .7, bullet);
        // The last affected body carries one secondary blast further into the pack.
        chainTarget = { x: enemy.x, z: enemy.z, id: enemy.id };
      }
    };
    blast(target, w.splashRadius, w.splashDepth, w.splashLimit - 1, false);
    if (w.chain && chainTarget) blast(chainTarget, w.chainRadius, w.chainDepth, w.chainLimit, true);
  }
  update(dt) {
    if (this.mode !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
    this.time += dt;
    this.metrics.collisionChecks = 0; this.metrics.splashChecks = 0; this.metrics.steps++;
    while (this.nextSupport && this.time + 1e-9 >= this.nextSupport.at) this.setPowerTier(this.nextSupport.tier);
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
    if (this.pendingEnemies.length) {
      const waiting = [];
      for (const entry of this.pendingEnemies) {
        const values = { ...entry.values, z: entry.values.z - entry.values.speed * (this.time - entry.queuedAt) };
        if (values.z < 25) continue;
        if (this.enemies.take(values)) this.stats.spawned++;
        else waiting.push(entry);
      }
      this.pendingEnemies = waiting;
    }
    this.enemyGrid.rebuild(this.enemies.items);
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
      const margin = this.enemyGrid.maxRadius + (bullet.radius ?? 0);
      this.enemyGrid.query(Math.min(previousX, bullet.x) - margin, Math.max(previousX, bullet.x) + margin,
        bullet.prevZ - 12, bullet.z + 12, enemy => {
          this.metrics.collisionChecks++;
          if (!(bullet.hitIds ?? []).includes(enemy.id) && intersects(enemy.x, enemy.z, enemy.radius, 12)) candidates.push({ kind: 'enemy', target: enemy, z: enemy.z - 12 });
        });
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
        this.damageEnemy(enemy, bullet.damage ?? 1, bullet);
        if (bullet.weapon === 'cannon') this.explode(bullet, enemy);
        bullet.hitIds ??= []; bullet.hitIds.push(enemy.id);
        bullet.pierceLeft = (bullet.pierceLeft ?? 1) - 1;
        if (bullet.pierceLeft <= 0) bullet.active = false;
      }
      if (bullet.z > 1250 || bullet.age >= (bullet.lifetime ?? 1.6)) bullet.active = false;
      if (this.mode !== 'playing') return;
    }
    this.metrics.maxCollisionChecks = Math.max(this.metrics.maxCollisionChecks, this.metrics.collisionChecks);
    this.metrics.maxSplashChecks = Math.max(this.metrics.maxSplashChecks, this.metrics.splashChecks);
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
