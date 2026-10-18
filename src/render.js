import { CONFIG, WEAPONS, ObjectPool, squadOffset, clamp } from './game.js';

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const C = { lime: '#d9ff68', cyan: '#72ecff', red: '#ff6488' };
const WEAPON_COLORS = { rifle: C.cyan, scatter: '#ffd077', pierce: '#cba7ff', cannon: '#ffad68' };
const PALETTES = {
  growth: ['#101e2e', '#2f4656', '#213b49', '#78949a', '#4b6b76'],
  firepower: ['#252338', '#454b61', '#253c4c', '#989295', '#596d7b'],
  survival: ['#24233f', '#3b455d', '#273a4b', '#89939e', '#536a7c'],
};
const signed = value => value > 0 ? `+${value}` : `${value}`;
// Depth slices batch the horde; gates and bosses remain exact occlusion barriers.
const DEPTH_SLICE = 32;
const ENEMY_INK = '#152332';
const ENEMY_RIM = '#485768';
const DEATH_CAPACITY = 48;
const DEATH_EDGE_TIME = .035, DEATH_FALL_TIME = .12, DEATH_LIFE = .17;
const FIRE_FEEDBACK = {
  rifle: { muzzle: .035, recoil: .065, kick: .7, footprint: .07 },
  scatter: { muzzle: .055, recoil: .1, kick: 1.4, footprint: .11 },
  pierce: { muzzle: .04, recoil: .075, kick: 1, footprint: .08 },
  cannon: { muzzle: .085, recoil: .16, kick: 3.2, footprint: .18 },
};
const ENEMY_BODY_POINTS = [[-.45, -.64], [-.42, -.32], [-.27, -.4], [-.29, 0], [-.07, 0], [0, -.23], [.07, 0], [.29, 0], [.27, -.4], [.42, -.32], [.45, -.64], [.26, -.87]];
const weaponColor = weapon => WEAPONS[weapon]?.color || WEAPON_COLORS[weapon] || C.cyan;
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
// The death proxy keeps the same head, shoulders and split feet as a live enemy.
// Deforming path coordinates avoids 48 individual Canvas transforms/draw layers.
function enemySilhouette(ctx, x, y, s, width = 1, height = 1, lean = 0) {
  const px = (a, b) => x + s * (a * width - b * lean), py = b => y + s * b * height;
  ctx.moveTo(px(.23, -1.08), py(-1.08));
  ctx.ellipse(px(0, -1.08), py(-1.08), s * .23 * width, s * .23 * height, 0, 0, Math.PI * 2);
  ctx.moveTo(px(-.26, -.87), py(-.87));
  for (const [a, b] of ENEMY_BODY_POINTS) ctx.lineTo(px(a, b), py(b));
  ctx.closePath();
}

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.reducedMotion = reducedMotion;
    this.particles = new ObjectPool(reducedMotion ? 80 : 280);
    // Cosmetic snapshots only. This pool never participates in game collisions,
    // and a full particle pool cannot swallow a one-hit enemy's death silhouette.
    this.deathProxies = new ObjectPool(DEATH_CAPACITY);
    this.labels = [];
    this.shake = 0;
    this.flash = 0;
    this.beam = null;
    this.muzzle = 0;
    this.recoil = 0;
    this.fireWeapon = 'rifle';
    this.width = 420;
    this.height = 700;
    this.dpr = 1;
    this.palettes = {};
    this.killBatch = { count: 0, x: 0, z: 0, age: 0 };
    this.drawStats = { enemyBatches: 0, bulletBatches: 0, deathBatches: 0, enemies: 0, bullets: 0, deaths: 0 };
  }

  setReducedMotion(enabled) {
    const next = Boolean(enabled);
    if (next === this.reducedMotion) return;
    this.reducedMotion = next;
    this.particles = new ObjectPool(next ? 80 : 280);
    this.reset();
  }

  resize(width, height, dpr = 1) {
    this.width = width;
    this.height = height;
    this.dpr = Math.min(dpr || 1, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    for (const [id, colors] of Object.entries(PALETTES)) {
      const sky = this.ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, colors[0]); sky.addColorStop(.47, colors[1]); sky.addColorStop(1, colors[2]);
      const road = this.ctx.createLinearGradient(0, height * .2, 0, height);
      road.addColorStop(0, colors[3]); road.addColorStop(1, colors[4]);
      this.palettes[id] = { sky, road };
    }
  }

  // The last squad row stays above 85% of the viewport, clear of the drag area.
  // Gates, bullets, enemies and danger lanes all retain the same world projection.
  project(x, z) {
    const s = 1 / (1 + Math.max(-110, z) * .0042);
    return { x: this.width * .5 + x * this.width * .455 * s, y: this.height * .18 + this.height * .51 * s, s };
  }

  reset() {
    this.particles.clear(); this.deathProxies.clear(); this.labels.length = 0;
    this.shake = 0; this.flash = 0; this.beam = null; this.muzzle = 0; this.recoil = 0;
    this.fireWeapon = 'rifle';
    this.killBatch = { count: 0, x: 0, z: 0, age: 0 };
  }

  burst(x, z, color, count = 12, power = 70) {
    const p = this.project(x, z);
    const total = Math.min(this.particles.capacity, this.reducedMotion ? Math.ceil(count * .35) : count);
    for (let i = 0; i < total; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = this.reducedMotion ? 0 : (.3 + Math.random() * .7) * power;
      this.particles.take({ kind: 'spark', x: p.x, y: p.y - 12 * p.s,
        vx: Math.cos(angle) * speed, vy: this.reducedMotion ? 0 : Math.sin(angle) * speed - 25,
        life: .25 + Math.random() * .3, maxLife: .55,
        size: (2 + Math.random() * 3) * p.s, color });
    }
  }

  ring(x, z, color, radius = .24, depth = 0, kind = 'ring') {
    const p = this.project(x, z);
    const ry = depth > 0 ? Math.abs(this.project(x, z - depth).y - this.project(x, z + depth).y) / 2 : 7 * p.s;
    return this.particles.take({ kind, x: p.x, y: p.y - (kind === 'footprint' ? 0 : 7 * p.s),
      radius: Math.max(8, radius * this.width * .455 * p.s), radiusY: Math.max(4, ry),
      life: this.reducedMotion ? .22 : kind === 'footprint' ? .14 : .3,
      maxLife: this.reducedMotion ? .22 : kind === 'footprint' ? .14 : .3,
      size: Math.max(1, 2 * p.s), color });
  }

  death(e) {
    // Copy world coordinates/direction; an enemy pool slot may be reused on the
    // very next step. A proxy has no HP, radius or reference to the dead enemy.
    let dirX = Number.isFinite(e.dirX) ? clamp(e.dirX, -1, 1) : 0;
    let dirZ = Number.isFinite(e.dirZ) ? clamp(e.dirZ, -1, 1) : 1;
    const length = Math.hypot(dirX, dirZ);
    if (length > 1e-6) { dirX /= length; dirZ /= length; } else { dirX = 0; dirZ = 1; }
    const life = this.reducedMotion ? .16 : DEATH_LIFE;
    this.deathProxies.take({ x: e.x, z: e.z, dirX, dirZ, heavy: Boolean(e.heavy),
      enemyId: e.enemyId, impact: e.impact === 'blast' || e.impact === 'chain' ? e.impact : 'direct',
      age: 0, life, maxLife: life });
    // Existing tiny fragments still share the finite FX pool with sparks/rings.
    const p = this.project(e.x, e.z), size = (e.heavy ? 36 : 23) * p.s * this.width / 420;
    const count = this.reducedMotion ? 1 : e.heavy ? 3 : 2;
    for (let i = 0; i < count; i++) {
      const direction = i % 2 ? 1 : -1;
      this.particles.take({ kind: 'chunk', x: p.x + direction * size * .12, y: p.y - size * (.6 + i * .18),
        vx: this.reducedMotion ? 0 : direction * (11 + (e.enemyId || 0) % 7) * p.s,
        vy: this.reducedMotion ? 0 : -12 * p.s, size: size * (e.heavy ? .24 : .18),
        life: this.reducedMotion ? .16 : .25 + ((e.enemyId || 0) % 4) * .018,
        maxLife: this.reducedMotion ? .16 : .31, color: e.heavy ? '#3d3740' : ENEMY_INK });
    }
    const k = this.killBatch;
    k.count++; k.x += e.x; k.z += e.z;
  }

  flushKills() {
    const k = this.killBatch;
    if (!k.count) return;
    // One counter at most, refreshed only on a 300 ms cadence. It does not cover
    // the front with dozens of popups when a penetrating volley clears a row.
    this.labels = this.labels.filter(label => label.kind !== 'kills');
    this.label(`+${k.count}`, '#e5ff9b', k.x / k.count, k.z / k.count, 20, 'kills');
    if (!this.reducedMotion && k.count >= 8) this.shake = Math.max(this.shake, .045);
    this.killBatch = { count: 0, x: 0, z: 0, age: 0 };
  }

  label(text, color, x, z = 0, size = 28, kind = 'notice') {
    // Event bursts can be much larger than one frame. Both pools are strictly bounded.
    if (this.labels.length >= 6) this.labels.shift();
    this.labels.push({ text, color, x, z, age: 0, size, kind });
  }

  event(e) {
    const color = weaponColor(e.weapon);
    if (e.type === 'fire') {
      const feedback = FIRE_FEEDBACK[e.weapon] || FIRE_FEEDBACK.rifle;
      if (!this.reducedMotion) {
        this.fireWeapon = e.weapon in FIRE_FEEDBACK ? e.weapon : 'rifle';
        this.muzzle = feedback.muzzle; this.recoil = feedback.recoil;
        if (this.fireWeapon === 'cannon') this.shake = Math.max(this.shake, .04);
      }
      const footprint = this.ring(e.x || 0, 0, color, .13 + (e.tier || 0) * .065, 0, 'footprint');
      if (footprint && !this.reducedMotion) footprint.life = footprint.maxLife = feedback.footprint;
    }
    // Fodder's own short hit tint is enough; no per-hit particle storm.
    if (e.type === 'hitBoss') this.burst(e.x, e.z, '#ffcba0', 2, 30);
    if (e.type === 'gateHit') this.burst(e.x, e.z, e.value >= 0 ? C.lime : '#ffb0bf', 2, 25);
    if (e.type === 'gateGrow') {
      this.ring(e.x, e.z, e.value >= 0 ? C.lime : '#ffb0bf', .17);
      // The gate itself displays every increment. Avoid obscuring it with a label storm.
      if (e.value > 0 && e.value - e.amount <= 0) this.label('转正！', C.lime, e.x, e.z, 20);
    }
    if (e.type === 'explosion') {
      this.ring(e.x, e.z, e.chain ? '#ffe2a2' : weaponColor('cannon'), e.radius, e.depth || 0);
      if (!this.reducedMotion) this.burst(e.x, e.z, weaponColor('cannon'), e.chain ? 3 : 4, 45);
    }
    if (e.type === 'kill') {
      this.death(e);
    }
    if (e.type === 'gain') {
      this.burst(e.x, 0, C.lime, 28, 95);
      this.label(e.amount ? `+${e.amount}` : '人数已满', C.lime, e.x);
      if (!this.reducedMotion) this.flash = .12;
    }
    if (e.type === 'power') {
      this.burst(e.x, 0, e.tier >= 2 ? '#ffe29a' : color, 20, 65);
      this.ring(e.x, 0, e.tier >= 2 ? '#ffe29a' : color, .32);
      this.label(e.name || '火力升级', e.tier >= 2 ? '#ffe29a' : color, e.x, 0, 25);
    }
    if (e.type === 'weapon') {
      this.burst(e.x, 0, color, 28, 95);
      this.ring(e.x, 0, color, .22);
      this.label(e.name || WEAPONS[e.weapon]?.name || '武器升级', color, e.x, 0, 24);
    }
    if (e.type === 'upgrade') {
      this.burst(e.x, 0, C.cyan, 24, 85);
      this.label(`连射 ×${e.rate.toFixed(2)}`, C.cyan, e.x, 0, 22);
    }
    if (e.type === 'hurt') {
      this.burst(e.x, 0, C.red, 20, 90);
      this.label(`${e.amount}`, C.red, e.x);
      if (!this.reducedMotion) this.shake = .17;
    }
    if (e.type === 'beam') {
      this.beam = { x: e.x, life: .24 };
      if (!this.reducedMotion) this.shake = .11;
    }
    if (e.type === 'win') {
      this.burst(0, 300, C.lime, 80, 230);
      this.burst(.3, 150, C.cyan, 50, 210);
    }
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const safeDt = Math.min(dt, .05);
    this.shake = Math.max(0, this.shake - safeDt);
    this.flash = Math.max(0, this.flash - safeDt);
    this.muzzle = Math.max(0, this.muzzle - safeDt);
    this.recoil = Math.max(0, this.recoil - safeDt);
    for (const proxy of this.deathProxies.items) {
      if (!proxy.active) continue;
      proxy.age += safeDt; proxy.life = Math.max(0, proxy.maxLife - proxy.age);
      if (proxy.life <= 1e-9) proxy.active = false;
    }
    if (this.beam) { this.beam.life -= safeDt; if (this.beam.life <= 0) this.beam = null; }
    for (const p of this.particles.items) {
      if (!p.active) continue;
      p.life -= safeDt;
      if (p.life <= 0) { p.active = false; continue; }
      if (!this.reducedMotion && (p.kind === 'spark' || p.kind === 'chunk')) { p.x += p.vx * safeDt; p.y += p.vy * safeDt; p.vy += (p.kind === 'chunk' ? 55 : 150) * safeDt; }
    }
    this.labels = this.labels.filter(l => (l.age += safeDt) < .9);
    if (this.killBatch.count) { this.killBatch.age += safeDt; if (this.killBatch.age + 1e-9 >= .3) this.flushKills(); }
  }

  draw(game, visualTime = 0) {
    const { ctx, width: w, height: h } = this;
    const palette = this.palettes[game.level?.id] || this.palettes.growth;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1; ctx.fillStyle = palette?.sky || '#123244'; ctx.fillRect(0, 0, w, h);
    ctx.save();
    if (!this.reducedMotion && this.shake > 0) ctx.translate(Math.sin(visualTime * 110) * this.shake * 18, Math.cos(visualTime * 95) * this.shake * 13);
    this.background(game.time, palette?.road || '#1a4156');
    if (game.boss?.attack) this.warning(game.boss.attack, game.time, false);
    if (this.beam) this.drawBeam(this.beam);
    const objects = [], idle = game.mode === 'ready';
    this.drawStats = { enemyBatches: 0, bulletBatches: 0, deathBatches: 0, enemies: 0, bullets: 0, deaths: 0 };
    // The ready overlay owns the center. Every other actor uses its actual
    // gameplay position; removed bodies leave real gaps instead of painted fog.
    if (!idle) {
      for (const gate of game.gates) if (!gate.resolved) objects.push({ entity: gate, z: gate.z, kind: 'gate' });
      for (const enemy of game.enemies.items) if (enemy.active) objects.push({ entity: enemy, z: enemy.z, kind: 'enemy' });
      for (const proxy of this.deathProxies.items) if (proxy.active) objects.push({ entity: proxy, z: this.deathPose(proxy).z, kind: 'death' });
      if (game.boss && game.mode !== 'won') objects.push({ entity: game.boss, z: game.boss.z, kind: 'boss' });
    }
    for (const bullet of game.bullets.items) if (bullet.active) objects.push({ entity: bullet, z: bullet.z, kind: 'bullet' });
    objects.sort((a, b) => b.z - a.z);
    let group = [], slice = null;
    const flush = () => {
      if (!group.length) return;
      const enemies = [], bullets = [], deaths = [];
      for (const item of group) (item.kind === 'enemy' ? enemies : item.kind === 'death' ? deaths : bullets).push(item.entity);
      // Approximate ordering only inside one 32-unit depth slice. Gate/boss
      // barriers flush both batches at their exact depth, so shots never show
      // through a nearer gate. Depth extent is much shorter than a bullet trail.
      if (bullets.length === 1) this.bullet(bullets[0]);
      else if (bullets.length) this.bulletsBatch(bullets);
      if (deaths.length) this.deathsBatch(deaths);
      if (enemies.length === 1) this.enemy(enemies[0], visualTime);
      else if (enemies.length) this.enemiesBatch(enemies, visualTime);
      group = [];
    };
    for (const item of objects) {
      if (item.kind === 'gate' || item.kind === 'boss') {
        flush(); slice = null;
        if (item.kind === 'gate') this.gate(item.entity, game); else this.boss(item.entity, visualTime);
      } else {
        const next = Math.floor(item.z / DEPTH_SLICE);
        if (next !== slice) { flush(); slice = next; }
        group.push(item);
      }
    }
    flush();
    this.squad(game, idle ? 0 : visualTime);
    this.effects();
    for (const l of this.labels) {
      const p = this.project(l.x, l.z);
      ctx.globalAlpha = Math.min(1, (.9 - l.age) * 3);
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.font = `800 ${Math.min(l.size, w * .082)}px ${FONT}`; ctx.fillStyle = l.color;
      ctx.shadowColor = '#102f43'; ctx.shadowBlur = 10;
      const half = ctx.measureText(l.text).width / 2 + 8;
      ctx.fillText(l.text, clamp(p.x, half, w - half), p.y - 48 - (this.reducedMotion ? 0 : l.age * 36));
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    if (game.boss?.attack) this.warningLabel(game.boss.attack, game.time);
    if (!this.reducedMotion && this.flash > 0) { ctx.fillStyle = `rgba(217,255,104,${this.flash * .22})`; ctx.fillRect(0, 0, w, h); }
    ctx.restore();
  }

  effects() {
    const { ctx } = this;
    ctx.save();
    // Shared, finite pool; alpha bins keep a whole death group in a few fills.
    const groups = new Map();
    for (const p of this.particles.items) {
      if (!p.active) continue;
      const alpha = Math.ceil(clamp(p.life / p.maxLife, 0, 1) * 4) / 4;
      const key = `${p.kind}:${p.color}:${alpha}`;
      if (!groups.has(key)) groups.set(key, { kind: p.kind, color: p.color, alpha, items: [] });
      groups.get(key).items.push(p);
    }
    for (const group of groups.values()) {
      ctx.globalAlpha = group.alpha * (this.reducedMotion ? .6 : 1);
      ctx.fillStyle = group.color; ctx.strokeStyle = group.color; ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const p of group.items) {
        if (p.kind === 'ring' || p.kind === 'footprint') {
          const expansion = this.reducedMotion || p.kind === 'footprint' ? 1 : .82 + (1 - p.life / p.maxLife) * .18;
          const rx = p.radius * expansion, ry = p.radiusY * expansion;
          ctx.moveTo(p.x + rx, p.y); ctx.ellipse(p.x, p.y, rx, ry, 0, 0, Math.PI * 2);
        } else if (p.kind === 'chunk') {
          ctx.moveTo(p.x - p.size, p.y - p.size * .55); ctx.lineTo(p.x + p.size * .5, p.y - p.size);
          ctx.lineTo(p.x + p.size, p.y + p.size * .5); ctx.lineTo(p.x - p.size * .5, p.y + p.size); ctx.closePath();
        } else ctx.rect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      if (group.kind === 'ring' || group.kind === 'footprint') ctx.stroke(); else ctx.fill();
    }
    ctx.restore();
  }

  background(time, roadFill) {
    const { ctx, width: w, height: h } = this;
    ctx.strokeStyle = '#427587'; ctx.lineWidth = 1; ctx.globalAlpha = .18;
    ctx.beginPath(); ctx.arc(w * .5, h * .29, w * .24, Math.PI * 1.04, Math.PI * 1.96); ctx.stroke();
    ctx.beginPath(); ctx.arc(w * .5, h * .29, w * .18, Math.PI * 1.07, Math.PI * 1.93); ctx.stroke();
    ctx.globalAlpha = .5;
    for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 7; i++) {
      const x = w * .5 + side * (w * .16 + i * w * .053), bh = h * (.045 + ((i * 13) % 7) * .009);
      ctx.fillStyle = i % 2 ? '#17394c' : '#113347'; ctx.fillRect(x - w * .023, h * .36 - bh, w * .045, bh + h * .06);
      ctx.fillStyle = '#326678'; ctx.fillRect(x - w * .013, h * .36 - bh + 7, 2, Math.max(2, bh - 14));
    }
    ctx.globalAlpha = 1;
    const far = this.project(1, 1900), near = this.project(1, -100);
    ctx.fillStyle = roadFill; ctx.beginPath(); ctx.moveTo(w - far.x, far.y); ctx.lineTo(far.x, far.y); ctx.lineTo(near.x, near.y); ctx.lineTo(w - near.x, near.y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#4b8a98'; ctx.lineWidth = 1; ctx.globalAlpha = .55;
    for (const x of [-1, 1]) { const a = this.project(x, 1900), b = this.project(x, -100); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    for (const x of [-.96, .96]) { const a = this.project(x, 1900), b = this.project(x, -100); ctx.strokeStyle = '#81d8cf'; ctx.globalAlpha = .32; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
    const offset = (time * CONFIG.roadSpeed) % 150;
    for (let z = -offset; z < 1700; z += 150) {
      const a = this.project(-1, z), b = this.project(1, z);
      ctx.globalAlpha = .14; ctx.strokeStyle = '#79b2c2'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const c = this.project(0, z), d = this.project(0, z + 47);
      ctx.globalAlpha = .35; ctx.strokeStyle = '#70a6b9'; ctx.lineWidth = Math.max(1, 2 * c.s); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
      for (const x of [-1.06, 1.06]) { const p = this.project(x, z); ctx.fillStyle = z % 300 < 150 ? C.lime : C.cyan; ctx.globalAlpha = .7; ctx.fillRect(p.x - 2 * p.s, p.y - 8 * p.s, 4 * p.s, 8 * p.s); }
    }
    ctx.globalAlpha = .12; ctx.fillStyle = '#a1f5ea'; ctx.fillRect(w * .35, h * .298, w * .3, 1); ctx.globalAlpha = 1;
  }

  gate(row, game) {
    const { ctx } = this;
    for (const [x, original] of [[-.49, row.left], [.49, row.right]]) {
      if (!original) continue;
      const effect = game.gateEffect(original);
      const weapon = effect.type === 'weapon', rapid = effect.type === 'rapid';
      const shootable = effect.type === 'recruit' && effect.shootable;
      const positive = rapid || weapon || effect.value >= 0;
      const key = effect.weapon || effect.value;
      const color = weapon ? weaponColor(key) : rapid ? C.cyan : positive ? C.lime : C.red;
      const p = this.project(x, row.z), width = this.width * .352 * p.s, height = 116 * p.s;
      const capped = shootable && effect.value >= (effect.cap ?? effect.maxValue);
      const selected = game.mode === 'playing' && Math.abs(game.x - x) <= .39;
      const hit = !this.reducedMotion && effect.hit > 0;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = hit ? '#f4ffdc66' : weapon ? '#132b44e6' : positive ? '#1d4638dd' : '#502d42dd';
      ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, (selected ? 2.8 : 1.8) * p.s);
      roundRect(ctx, -width / 2, -height, width, height, 5 * p.s); ctx.fill(); ctx.stroke();
      ctx.fillStyle = color; ctx.globalAlpha = .85;
      ctx.fillRect(-width / 2 - 2 * p.s, -height, 4 * p.s, height + 4 * p.s);
      ctx.fillRect(width / 2 - 2 * p.s, -height, 4 * p.s, height + 4 * p.s);
      ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (weapon) {
        this.weaponIcon(key, 0, -height * .69, 21 * p.s, color);
        ctx.font = `800 ${22 * p.s}px ${FONT}`; ctx.fillStyle = color;
        ctx.fillText(WEAPONS[key]?.name || '武器', 0, -height * .4);
        ctx.font = `600 ${10 * p.s}px ${FONT}`; ctx.fillStyle = '#e1e9ef';
        ctx.fillText(key === 'scatter' ? '扇形散射' : key === 'pierce' ? '穿透敌群' : key === 'cannon' ? '范围爆破' : '稳定连射', 0, -height * .17);
      } else if (rapid) {
        ctx.font = `800 ${32 * p.s}px ${FONT}`; ctx.fillText('连射', 0, -height * .56);
        ctx.font = `600 ${11 * p.s}px ${FONT}`; ctx.fillText(`射速 ×${(1 + (game.rapid + 1) * CONFIG.rapidBonus).toFixed(2)}`, 0, -height * .2);
      } else {
        ctx.font = `700 ${10 * p.s}px ${FONT}`;
        if (shootable) {
          ctx.fillText(capped ? '成长已满' : '射击 ↑', 0, -height * .83);
          // A permanent crosshair distinguishes a shootable value even before the first shot.
          const cx = -width * .34, cy = -height * .83, rr = 3.8 * p.s;
          ctx.strokeStyle = color; ctx.lineWidth = Math.max(.7, p.s);
          ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI * 2);
          ctx.moveTo(cx - rr * 1.5, cy); ctx.lineTo(cx + rr * 1.5, cy);
          ctx.moveTo(cx, cy - rr * 1.5); ctx.lineTo(cx, cy + rr * 1.5); ctx.stroke();
        } else ctx.fillText('直接招募', 0, -height * .83);
        ctx.font = `800 ${47 * p.s}px ${FONT}`; ctx.fillStyle = color;
        ctx.fillText(signed(effect.value), 0, -height * .51);
        ctx.font = `600 ${10 * p.s}px ${FONT}`; ctx.fillStyle = '#eff7e9';
        ctx.fillText(shootable ? `上限 +${effect.cap ?? effect.maxValue}` : positive ? '加入小队' : '减少队友', 0, -height * .2);
        if (shootable) {
          const progress = capped ? 1 : clamp((effect.shotProgress || 0) / (effect.shotCost || 1), 0, 1);
          ctx.fillStyle = '#0c202dcc'; roundRect(ctx, -width * .35, -height * .09, width * .7, 3 * p.s, 1.5 * p.s); ctx.fill();
          if (progress > 0) { ctx.fillStyle = color; roundRect(ctx, -width * .35, -height * .09, width * .7 * progress, 3 * p.s, 1.5 * p.s); ctx.fill(); }
        }
      }
      if (selected) {
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(-5 * p.s, 8 * p.s); ctx.lineTo(0, 2 * p.s); ctx.lineTo(5 * p.s, 8 * p.s); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = .16; ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, 4 * p.s, width * .56, 7 * p.s, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  weaponIcon(weapon, x, y, size, color = weaponColor(weapon)) {
    const { ctx } = this;
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = Math.max(1.2, size * .13); ctx.lineCap = 'round';
    if (weapon === 'scatter') {
      for (const direction of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(0, size * .5); ctx.lineTo(direction * size * .7, -size * .65); ctx.stroke(); }
    } else if (weapon === 'cannon') {
      ctx.beginPath(); ctx.arc(0, 0, size * .42, 0, Math.PI * 2); ctx.fill();
      for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) { ctx.beginPath(); ctx.moveTo(Math.cos(angle) * size * .64, Math.sin(angle) * size * .64); ctx.lineTo(Math.cos(angle) * size * .88, Math.sin(angle) * size * .88); ctx.stroke(); }
    } else {
      ctx.beginPath(); ctx.moveTo(0, size * .65); ctx.lineTo(0, -size * .65); ctx.lineTo(-size * .25, -size * .3); ctx.moveTo(0, -size * .65); ctx.lineTo(size * .25, -size * .3); ctx.stroke();
      if (weapon === 'pierce') { for (const py of [-.1, .3]) { ctx.beginPath(); ctx.moveTo(-size * .55, size * py); ctx.lineTo(size * .55, size * py); ctx.stroke(); } }
    }
    ctx.restore();
  }

  bullet(b) { this.bulletsBatch([b]); }

  bulletsBatch(bullets) {
    const { ctx } = this, groups = new Map();
    for (const b of bullets) {
      const key = b.weapon || 'rifle', tier = b.tier || 0, groupKey = `${key}:${tier}`;
      if (!groups.has(groupKey)) groups.set(groupKey, { key, tier, points: [] });
      const p = this.project(b.x, b.z);
      const length = (key === 'pierce' ? 72 : key === 'scatter' ? 22 : 34) * (1 + tier * .28);
      // Tail follows the simulated velocity, including the real fan/sweep lanes.
      const tailX = b.x - (b.vx || 0) * length / (b.speed || WEAPONS[key]?.speed || 780);
      const tail = this.project(tailX, b.z - length);
      groups.get(groupKey).points.push({ p, tail, radius: b.radius || .012 });
    }
    ctx.save(); ctx.lineCap = 'round';
    for (const { key, tier, points } of groups.values()) {
      const scale = points.reduce((sum, value) => sum + value.p.s, 0) / points.length;
      const color = weaponColor(key), unit = this.width / 420;
      const radius = points.reduce((sum, value) => sum + value.radius, 0) / points.length;
      const physicalWidth = radius * this.width * .91 * scale;
      ctx.strokeStyle = color; ctx.globalAlpha = tier >= 2 ? .35 : .3;
      ctx.lineWidth = Math.max(physicalWidth, (key === 'pierce' ? 7 + tier * 3 : key === 'cannon' ? 9 + tier * 3 : 5 + tier * 2) * scale * unit);
      ctx.beginPath();
      for (const { p, tail } of points) { ctx.moveTo(p.x, p.y); ctx.lineTo(tail.x, tail.y); }
      ctx.stroke();
      if (key === 'cannon') {
        ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.beginPath();
        for (const { p } of points) { const radius = Math.max(2, (5.2 + tier * 1.3) * p.s * unit); ctx.moveTo(p.x + radius, p.y); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); }
        ctx.fill(); ctx.fillStyle = tier >= 2 ? '#fff2bf' : '#fff4dc'; ctx.beginPath();
        for (const { p } of points) { const radius = Math.max(.8, (2 + tier * .6) * p.s * unit); ctx.moveTo(p.x + radius, p.y); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); }
        ctx.fill();
      } else {
        ctx.globalAlpha = 1; ctx.strokeStyle = tier >= 2 ? '#fff0bc' : key === 'scatter' ? '#ffe6b2' : key === 'pierce' ? '#eee0ff' : '#d4ffff';
        ctx.lineWidth = Math.max(.9, physicalWidth * .32, ((key === 'scatter' ? 2.4 : 1.8) + tier * .65) * scale * unit);
        ctx.beginPath();
        for (const { p, tail } of points) { ctx.moveTo(p.x, p.y); ctx.lineTo(tail.x, tail.y); }
        ctx.stroke();
      }
      this.drawStats.bulletBatches++;
    }
    this.drawStats.bullets += bullets.length;
    ctx.restore();
  }

  enemy(e, time) { this.enemiesBatch([e], time); }

  deathPose(proxy) {
    const reduced = this.reducedMotion;
    const fall = reduced ? 0 : clamp((proxy.age - DEATH_EDGE_TIME) / (DEATH_FALL_TIME - DEATH_EDGE_TIME), 0, 1);
    const travel = fall * (2 - fall), strength = proxy.impact === 'direct' ? 1 : 1.25;
    const x = proxy.x + proxy.dirX * .035 * travel * strength;
    const z = proxy.z + proxy.dirZ * 14 * travel * strength;
    const p = this.project(x, z), stage = reduced ? 'fade' : proxy.age < DEATH_EDGE_TIME ? 'edge' : proxy.age < DEATH_FALL_TIME ? 'fall' : 'residue';
    return { x, z, screenX: p.x, screenY: p.y, size: (proxy.heavy ? 43 : 24) * p.s * this.width / 420,
      // Even the first frame is inset. The later narrow, low silhouette exposes
      // the cleared lane immediately instead of replacing it with corpse fog.
      width: .91 - .28 * fall, height: .91 - .74 * fall, lean: proxy.dirX * .08 * fall,
      stage, alpha: reduced ? .38 * proxy.life / proxy.maxLife : stage === 'edge' ? .95 : stage === 'fall' ? .76 - .2 * fall : .35 * clamp(proxy.life / (DEATH_LIFE - DEATH_FALL_TIME), 0, 1) };
  }

  deathsBatch(proxies) {
    const { ctx } = this, groups = new Map(), unit = this.width / 420;
    for (const proxy of proxies) {
      const pose = this.deathPose(proxy), alpha = Math.ceil(clamp(pose.alpha, 0, 1) * 8) / 8;
      const key = `${proxy.heavy}:${pose.stage}:${alpha}`;
      if (!groups.has(key)) groups.set(key, { heavy: proxy.heavy, stage: pose.stage, alpha, poses: [] });
      groups.get(key).poses.push(pose);
    }
    ctx.save();
    for (const { heavy, stage, alpha, poses } of groups.values()) {
      ctx.globalAlpha = alpha; ctx.fillStyle = heavy ? '#252936' : ENEMY_INK;
      ctx.strokeStyle = stage === 'edge' ? '#fff0be' : heavy ? '#9d805f' : ENEMY_RIM;
      ctx.lineWidth = Math.max(.65, unit * (stage === 'edge' ? 1.25 : .75));
      ctx.beginPath();
      for (const p of poses) enemySilhouette(ctx, p.screenX, p.screenY, p.size, p.width, p.height, p.lean);
      ctx.fill();
      if (stage === 'edge' || stage === 'fall') ctx.stroke();
      this.drawStats.deathBatches++;
    }
    this.drawStats.deaths += proxies.length;
    ctx.restore();
  }

  enemiesBatch(enemies, time = 0) {
    const { ctx } = this, groups = new Map(), unit = this.width / 420;
    for (const e of enemies) {
      const heavy = Boolean(e.heavy), hit = !this.reducedMotion && e.hit > 0;
      const key = `${heavy}:${hit}`;
      if (!groups.has(key)) groups.set(key, { heavy, hit, points: [] });
      const p = this.project(e.x, e.z), size = (heavy ? 43 : 24) * p.s * unit;
      const bob = this.reducedMotion ? 0 : Math.sin(time * 9 + (e.phase || 0)) * .65 * p.s * unit;
      groups.get(key).points.push({ e, x: p.x, y: p.y + bob, size, scale: p.s });
    }
    ctx.save();
    for (const { heavy, hit, points } of groups.values()) {
      ctx.fillStyle = '#132a3e44'; ctx.beginPath();
      for (const { x, y, size } of points) { ctx.moveTo(x + size * .52, y + size * .05); ctx.ellipse(x, y + size * .05, size * .52, size * .18, 0, 0, Math.PI * 2); }
      ctx.fill();
      ctx.fillStyle = hit ? '#e9e2c8' : heavy ? '#252936' : ENEMY_INK;
      ctx.strokeStyle = heavy ? '#f3b66e' : ENEMY_RIM; ctx.lineWidth = heavy ? Math.max(1.1, unit * 1.6) : .65 * unit;
      ctx.beginPath();
      for (const { x, y, size: s } of points) {
        // A rounded head, angular shoulders and separated feet read as a compact
        // rushing crowd rather than pink boxes. One compound path per depth row.
        enemySilhouette(ctx, x, y, s);
      }
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = heavy ? '#f3b66e' : '#c38270'; ctx.beginPath();
      for (const { x, y, size: s } of points) {
        ctx.rect(x - s * .14, y - s * 1.12, s * .1, s * .055);
        ctx.rect(x + s * .04, y - s * 1.12, s * .1, s * .055);
        if (heavy) { ctx.rect(x - s * .32, y - s * .73, s * .15, s * .1); ctx.rect(x + s * .17, y - s * .73, s * .15, s * .1); }
      }
      ctx.fill();
      // Fodder never has a health bar. The rare heavy retains an honest compact
      // health indicator and gold shoulders so it stays legible inside a pack.
      if (heavy) {
        ctx.fillStyle = '#28303e'; ctx.beginPath();
        for (const { x, y, size: s } of points) ctx.rect(x - s * .43, y - s * 1.53, s * .86, Math.max(1.4, s * .065));
        ctx.fill(); ctx.fillStyle = '#f3b66e'; ctx.beginPath();
        for (const { e, x, y, size: s } of points) ctx.rect(x - s * .43, y - s * 1.53, s * .86 * clamp(e.hp / e.maxHP, 0, 1), Math.max(1.4, s * .065));
        ctx.fill();
      }
      this.drawStats.enemyBatches++;
    }
    this.drawStats.enemies += enemies.length;
    ctx.restore();
  }

  boss(b, time) {
    const { ctx } = this, p = this.project(b.x, b.z), size = 140 * p.s;
    ctx.save(); ctx.translate(p.x, p.y); ctx.fillStyle = '#041b2c77'; ctx.beginPath(); ctx.ellipse(0, 10 * p.s, size * .7, size * .2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.translate(0, this.reducedMotion ? 0 : Math.sin(time * 3) * 4 * p.s);
    ctx.fillStyle = !this.reducedMotion && b.hit > 0 ? '#ffeac8' : '#e66c92'; roundRect(ctx, -size * .43, -size * .9, size * .86, size * .78, 10 * p.s); ctx.fill();
    ctx.fillStyle = '#ff9bbb'; ctx.beginPath(); ctx.moveTo(-size * .43, -size * .9); ctx.lineTo(-size * .25, -size * 1.08); ctx.lineTo(size * .58, -size * 1.08); ctx.lineTo(size * .43, -size * .9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a84571'; ctx.beginPath(); ctx.moveTo(size * .43, -size * .9); ctx.lineTo(size * .58, -size * 1.08); ctx.lineTo(size * .58, -size * .28); ctx.lineTo(size * .43, -size * .12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#622f57'; roundRect(ctx, -size * .34, -size * .69, size * .68, size * .22, 3 * p.s); ctx.fill(); ctx.fillStyle = b.enraged ? C.red : C.lime; ctx.fillRect(-size * .27, -size * .62, size * .18, size * .07); ctx.fillRect(size * .09, -size * .62, size * .18, size * .07);
    ctx.fillStyle = '#732c54'; for (const x of [-.57, .57]) { roundRect(ctx, size * x - size * .10, -size * .58, size * .2, size * .46, 4 * p.s); ctx.fill(); }
    ctx.fillStyle = '#fdb4c9'; for (const x of [-.57, .57]) ctx.fillRect(size * x - size * .06, -size * .2, size * .12, size * .09);
    ctx.strokeStyle = '#ffd1bb'; ctx.lineWidth = 2 * p.s; ctx.beginPath(); ctx.moveTo(-size * .14, -size * .3); ctx.lineTo(size * .14, -size * .3); ctx.stroke(); ctx.restore();
  }

  squad(game, time) {
    const { ctx } = this, weapon = game.weapon || 'rifle', color = weaponColor(weapon), tier = game.weaponTier || 0;
    const soldiers = [], size = 13 * this.width / 420;
    const feedback = FIRE_FEEDBACK[this.fireWeapon] || FIRE_FEEDBACK.rifle;
    const kick = this.reducedMotion ? 0 : feedback.kick * this.width / 420 * (this.recoil / feedback.recoil) ** 2;
    for (let i = 0; i < game.squad; i++) {
      const o = squadOffset(i, game.squad), projected = this.project(game.x + o.x, o.z);
      soldiers.push({ x: this.project(game.x + o.x, 0).x, y: projected.y + kick + (this.reducedMotion ? 0 : Math.sin(time * 13 + i * .9) * 1.2) });
    }
    ctx.save(); if (game.time < game.hurtUntil) ctx.globalAlpha = .65;
    const layer = (fill, shape) => {
      ctx.fillStyle = fill; ctx.beginPath();
      for (const { x, y } of soldiers) shape(x, y);
      ctx.fill();
    };
    layer('#17344377', (x, y) => { ctx.moveTo(x + size * .6, y + 2); ctx.ellipse(x, y + 2, size * .6, size * .27, 0, 0, Math.PI * 2); });
    layer('#a4c95b', (x, y) => { ctx.rect(x - size * .37, y - size * .45, size * .28, size * .52); ctx.rect(x + size * .09, y - size * .45, size * .28, size * .52); });
    layer(C.lime, (x, y) => ctx.roundRect(x - size * .44, y - size * 1.3, size * .88, size * .92, size * .16));
    layer('#91d3dc', (x, y) => { ctx.rect(x - size * .62, y - size * 1.2, size * .2, size * .62); ctx.rect(x + size * .42, y - size * 1.2, size * .2, size * .62); });
    layer('#e8ff9a', (x, y) => ctx.roundRect(x - size * .48, y - size * 1.85, size * .96, size * .65, size * .23));
    layer('#244a54', (x, y) => ctx.roundRect(x - size * .35, y - size * 1.66, size * .7, size * .22, size * .06));
    const barrelWidth = weapon === 'cannon' ? .3 : weapon === 'scatter' ? .24 : .17;
    const barrelLength = weapon === 'pierce' ? 1.12 : .8;
    layer(color, (x, y) => { ctx.rect(x - size * .26, y - size * 1.61, size * .18, size * .07); ctx.rect(x + size * .43, y - size * (.78 + barrelLength), size * barrelWidth, size * barrelLength); });
    if (weapon === 'scatter' || tier > 0) layer(tier >= 2 ? '#ffe4a3' : '#fff0c8', (x, y) => ctx.rect(x + size * .4, y - size * 1.65, size * .3, size * .12));
    if (!this.reducedMotion && this.muzzle > 0 && game.mode === 'playing') layer(color, (x, y) => {
      const mx = x + size * .56, my = y - size * 1.65;
      if (weapon === 'cannon') {
        const radius = size * (.17 + .1 * this.muzzle / feedback.muzzle);
        ctx.moveTo(mx + radius, my - size * .17); ctx.ellipse(mx, my - size * .17, radius, radius * .7, 0, 0, Math.PI * 2);
      } else {
        const spread = weapon === 'scatter' ? .3 : .16, reach = weapon === 'pierce' ? .5 : .38;
        ctx.moveTo(mx, my); ctx.lineTo(mx - size * spread, my - size * reach);
        ctx.lineTo(mx, my - size * reach * .7); ctx.lineTo(mx + size * spread, my - size * reach); ctx.closePath();
      }
    });
    const p = this.project(game.x, 0); ctx.strokeStyle = '#d9ff6877'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(p.x - 13, p.y + 13); ctx.lineTo(p.x, p.y + 19); ctx.lineTo(p.x + 13, p.y + 13); ctx.stroke(); ctx.restore();
  }

  warning(attack, time, showLabel = true) {
    const { ctx } = this, width = attack.width ?? .23;
    const a = this.project(attack.x - width, 1000), b = this.project(attack.x + width, 1000), c = this.project(attack.x + width, -100), d = this.project(attack.x - width, -100);
    ctx.save(); ctx.fillStyle = 'rgba(255,84,120,.18)'; ctx.strokeStyle = '#ff91ae'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.closePath(); ctx.fill(); ctx.stroke();
    // Fixed high-contrast chevrons and a countdown communicate danger without flashing.
    ctx.strokeStyle = '#ffb8c9'; ctx.lineWidth = 2;
    for (const z of [80, 200, 400]) { const p = this.project(attack.x, z), size = 12 * p.s; ctx.beginPath(); ctx.moveTo(p.x - size, p.y - size * .5); ctx.lineTo(p.x, p.y); ctx.lineTo(p.x + size, p.y - size * .5); ctx.stroke(); }
    ctx.restore();
    if (showLabel) this.warningLabel(attack, time);
  }

  warningLabel(attack, time) {
    const { ctx } = this;
    const remaining = Math.max(0, attack.at - time);
    ctx.save();
    const p = this.project(attack.x, 0), labelWidth = 102;
    const labelX = clamp(p.x, labelWidth / 2 + 6, this.width - labelWidth / 2 - 6), labelY = p.y - 62;
    ctx.fillStyle = '#42263ff2'; roundRect(ctx, labelX - labelWidth / 2, labelY - 17, labelWidth, 28, 7); ctx.fill(); ctx.strokeStyle = '#ff91ae'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = '#ffe0e8'; ctx.font = `800 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`避开红区 ${remaining.toFixed(1)}s`, labelX, labelY - 2);
    ctx.restore();
  }

  drawBeam(beam) {
    const { ctx } = this, a = this.project(beam.x, 900), b = this.project(beam.x, -100);
    ctx.save(); ctx.strokeStyle = `rgba(255,122,159,${Math.min(.65, beam.life * 3)})`; ctx.lineWidth = this.width * .18;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.strokeStyle = '#ffe2ec'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
  }
}
