import { CONFIG, WEAPONS, ObjectPool, squadOffset, clamp } from './game.js';

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
const C = { lime: '#d9ff68', cyan: '#72ecff', red: '#ff6488' };
const WEAPON_COLORS = { rifle: C.cyan, scatter: '#ffd077', pierce: '#cba7ff', cannon: '#ffad68' };
const PALETTES = {
  growth: ['#0d263b', '#17445a', '#102f43', '#214e60', '#1a4156'],
  firepower: ['#222239', '#414357', '#26394b', '#4b4d5b', '#293e50'],
  survival: ['#24233f', '#3b3e5e', '#222e4a', '#414c68', '#293c58'],
};
const signed = value => value > 0 ? `+${value}` : `${value}`;
const weaponColor = weapon => WEAPONS[weapon]?.color || WEAPON_COLORS[weapon] || C.cyan;
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

export class Renderer {
  constructor(canvas, { reducedMotion = false } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.reducedMotion = reducedMotion;
    this.particles = new ObjectPool(reducedMotion ? 80 : 280);
    this.labels = [];
    this.shake = 0;
    this.flash = 0;
    this.beam = null;
    this.muzzle = 0;
    this.width = 420;
    this.height = 700;
    this.dpr = 1;
    this.palettes = {};
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
    this.particles.clear(); this.labels.length = 0;
    this.shake = 0; this.flash = 0; this.beam = null; this.muzzle = 0;
  }

  burst(x, z, color, count = 12, power = 70) {
    const p = this.project(x, z);
    const total = Math.min(this.particles.capacity, this.reducedMotion ? Math.ceil(count * .35) : count);
    for (let i = 0; i < total; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (.3 + Math.random() * .7) * power * (this.reducedMotion ? .45 : 1);
      this.particles.take({ kind: 'spark', x: p.x, y: p.y - 12 * p.s,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25,
        life: .25 + Math.random() * .3, maxLife: .55,
        size: (2 + Math.random() * 3) * p.s, color });
    }
  }

  ring(x, z, color, radius = .24) {
    const p = this.project(x, z);
    this.particles.take({ kind: 'ring', x: p.x, y: p.y - 10 * p.s,
      radius: Math.max(9, radius * this.width * .455 * p.s),
      life: this.reducedMotion ? .18 : .35, maxLife: this.reducedMotion ? .18 : .35,
      size: 2 * p.s, color });
  }

  label(text, color, x, z = 0, size = 28) {
    // Event bursts can be much larger than one frame. Both pools are strictly bounded.
    if (this.labels.length >= 6) this.labels.shift();
    this.labels.push({ text, color, x, z, age: 0, size });
  }

  event(e) {
    const color = weaponColor(e.weapon);
    if (e.type === 'fire' && !this.reducedMotion) this.muzzle = .06;
    if (e.type === 'hit' || e.type === 'hitBoss') {
      this.burst(e.x, e.z, e.type === 'hitBoss' ? '#ffcba0' : color, 3, 35);
    }
    if (e.type === 'gateHit') this.burst(e.x, e.z, e.value >= 0 ? C.lime : '#ffb0bf', 2, 25);
    if (e.type === 'gateGrow') {
      this.ring(e.x, e.z, e.value >= 0 ? C.lime : '#ffb0bf', .17);
      // The gate itself displays every increment. Avoid obscuring it with a label storm.
      if (e.value > 0 && e.value - e.amount <= 0) this.label('转正！', C.lime, e.x, e.z, 20);
    }
    if (e.type === 'explosion') {
      this.ring(e.x, e.z, weaponColor('cannon'), e.radius);
      this.burst(e.x, e.z, weaponColor('cannon'), 13, 85);
    }
    if (e.type === 'kill') {
      this.burst(e.x, e.z, C.red, 14, 75);
      this.ring(e.x, e.z, '#ffbdcf', .09);
    }
    if (e.type === 'gain') {
      this.burst(e.x, 0, C.lime, 28, 95);
      this.label(e.amount ? `+${e.amount}` : '人数已满', C.lime, e.x);
      if (!this.reducedMotion) this.flash = .12;
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
    if (this.beam) { this.beam.life -= safeDt; if (this.beam.life <= 0) this.beam = null; }
    for (const p of this.particles.items) {
      if (!p.active) continue;
      p.life -= safeDt;
      if (p.life <= 0) { p.active = false; continue; }
      if (p.kind === 'spark') { p.x += p.vx * safeDt; p.y += p.vy * safeDt; p.vy += 150 * safeDt; }
    }
    this.labels = this.labels.filter(l => (l.age += safeDt) < .9);
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
    // The ready overlay owns the center: keep its instructions clear of demo gates.
    if (!idle) {
      for (const gate of game.gates) if (!gate.resolved) objects.push({ ...gate, kind: 'gate' });
      for (const enemy of game.enemies.items) if (enemy.active) objects.push({ ...enemy, kind: 'enemy' });
      if (game.boss && game.mode !== 'won') objects.push({ ...game.boss, kind: 'boss' });
    }
    for (const bullet of game.bullets.items) if (bullet.active) objects.push({ ...bullet, kind: 'bullet' });
    // Bullets share depth sorting with targets, so a rear shot cannot paint over a nearer gate.
    objects.sort((a, b) => b.z - a.z);
    for (const o of objects) {
      if (o.kind === 'gate') this.gate(o, game);
      else if (o.kind === 'boss') this.boss(o, visualTime);
      else if (o.kind === 'bullet') this.bullet(o);
      else this.enemy(o, visualTime);
    }
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
    for (const p of this.particles.items) {
      if (!p.active) continue;
      ctx.globalAlpha = clamp(p.life / p.maxLife * 1.5, 0, 1);
      if (p.kind === 'ring') {
        const progress = this.reducedMotion ? .8 : 1 - p.life / p.maxLife;
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.size);
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.radius * (.4 + progress), p.radius * (.25 + progress * .45), 0, 0, Math.PI * 2); ctx.stroke();
      } else { ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
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

  bullet(b) {
    const { ctx } = this, key = b.weapon || 'rifle', p = this.project(b.x, b.z);
    const length = key === 'pierce' ? 72 : key === 'scatter' ? 22 : 34;
    const tailX = b.x - (b.vx || 0) * (key === 'scatter' ? .035 : .025);
    const tail = this.project(tailX, b.z - length), color = weaponColor(key);
    ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = color;
    if (key === 'cannon') {
      ctx.globalAlpha = .3; ctx.lineWidth = 8 * p.s; ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.3, 5.2 * p.s), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff4c3'; ctx.beginPath(); ctx.arc(p.x - p.s, p.y - p.s, Math.max(1, 2.1 * p.s), 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.globalAlpha = key === 'pierce' ? .3 : .25; ctx.lineWidth = (key === 'pierce' ? 7 : 5) * p.s;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
      ctx.globalAlpha = 1; ctx.strokeStyle = key === 'scatter' ? '#ffe6b2' : key === 'pierce' ? '#eee0ff' : '#d4ffff';
      ctx.lineWidth = Math.max(.8, (key === 'scatter' ? 2.4 : 1.8) * p.s);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tail.x, tail.y); ctx.stroke();
    }
    ctx.restore();
  }

  enemy(e, time) {
    const { ctx } = this, p = this.project(e.x, e.z), size = (e.heavy ? 44 : 30) * p.s;
    const bob = this.reducedMotion ? 0 : Math.sin(time * 8 + e.phase) * 2 * p.s;
    const hit = !this.reducedMotion && e.hit > 0;
    ctx.save(); ctx.translate(p.x, p.y + bob); ctx.fillStyle = '#071d2f66'; ctx.beginPath(); ctx.ellipse(0, 1, size * .65, size * .23, 0, 0, Math.PI * 2); ctx.fill();
    if (!this.reducedMotion) ctx.rotate(Math.sin(time * 5 + e.phase) * .05);
    ctx.fillStyle = hit ? '#fff6da' : e.heavy ? '#e5a34e' : '#e85e87'; roundRect(ctx, -size * .44, -size * 1.1, size * .88, size * .9, size * .15); ctx.fill();
    ctx.fillStyle = hit ? '#fff' : e.heavy ? '#ffd68e' : '#ff95ac'; ctx.beginPath(); ctx.moveTo(-size * .44, -size * 1.1); ctx.lineTo(-size * .25, -size * 1.3); ctx.lineTo(size * .58, -size * 1.3); ctx.lineTo(size * .44, -size * 1.1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a63362'; ctx.beginPath(); ctx.moveTo(size * .44, -size * 1.1); ctx.lineTo(size * .58, -size * 1.3); ctx.lineTo(size * .58, -size * .35); ctx.lineTo(size * .44, -size * .2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#572c55'; ctx.fillRect(-size * .31, -size * .87, size * .61, size * .19); ctx.fillStyle = '#ffe5ad'; ctx.fillRect(-size * .25, -size * .84, size * .15, size * .09); ctx.fillRect(size * .1, -size * .84, size * .15, size * .09);
    ctx.fillStyle = '#b24269'; ctx.fillRect(-size * .34, -size * .2, size * .2, size * .24); ctx.fillRect(size * .14, -size * .2, size * .2, size * .24);
    if (e.heavy || e.hp < e.maxHP) { ctx.fillStyle = '#572d48'; ctx.fillRect(-size * .5, -size * 1.55, size, 3 * p.s); ctx.fillStyle = e.heavy ? '#ffd68e' : '#ff96af'; ctx.fillRect(-size * .5, -size * 1.55, size * clamp(e.hp / e.maxHP, 0, 1), 3 * p.s); }
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
    const { ctx } = this, weapon = game.weapon || 'rifle', color = weaponColor(weapon);
    ctx.save(); if (game.time < game.hurtUntil) ctx.globalAlpha = .65;
    for (let i = 0; i < game.squad; i++) {
      const o = squadOffset(i, game.squad), projected = this.project(game.x + o.x, o.z);
      const p = { x: this.project(game.x + o.x, 0).x, y: projected.y };
      const size = 13 * (this.width / 420), bob = this.reducedMotion ? 0 : Math.sin(time * 13 + i * .9) * 1.2;
      ctx.save(); ctx.translate(p.x, p.y + bob); ctx.fillStyle = '#06223580'; ctx.beginPath(); ctx.ellipse(0, 2, size * .6, size * .27, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#a4c95b'; ctx.fillRect(-size * .37, -size * .45, size * .28, size * .52); ctx.fillRect(size * .09, -size * .45, size * .28, size * .52);
      ctx.fillStyle = C.lime; roundRect(ctx, -size * .44, -size * 1.3, size * .88, size * .92, size * .16); ctx.fill();
      ctx.fillStyle = '#91d3dc'; ctx.fillRect(-size * .62, -size * 1.2, size * .2, size * .62); ctx.fillRect(size * .42, -size * 1.2, size * .2, size * .62);
      ctx.fillStyle = '#e8ff9a'; roundRect(ctx, -size * .48, -size * 1.85, size * .96, size * .65, size * .23); ctx.fill();
      ctx.fillStyle = '#244a54'; roundRect(ctx, -size * .35, -size * 1.66, size * .7, size * .22, size * .06); ctx.fill();
      ctx.fillStyle = color; ctx.fillRect(-size * .26, -size * 1.61, size * .18, size * .07);
      const barrelWidth = weapon === 'cannon' ? .3 : weapon === 'scatter' ? .24 : .17;
      const barrelLength = weapon === 'pierce' ? 1.12 : .8;
      ctx.fillRect(size * .43, -size * (.78 + barrelLength), size * barrelWidth, size * barrelLength);
      if (weapon === 'scatter') { ctx.fillStyle = '#fff0c8'; ctx.fillRect(size * .4, -size * 1.65, size * .3, size * .12); }
      if (!this.reducedMotion && this.muzzle > 0 && game.mode === 'playing') {
        ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(size * .56, -size * 1.65); ctx.lineTo(size * .28, -size * 2.15); ctx.lineTo(size * .56, -size * 2); ctx.lineTo(size * .8, -size * 2.15); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
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
