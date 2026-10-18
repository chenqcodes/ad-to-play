/** Deterministic acceptance pilots, shared by tests and local balance reports.
 * These are repeatable input scenarios, not estimates of human win rates.
 */
import { CONFIG, FixedStepper, GATES, Game } from '../src/game.js';

export const PROFILE_NAMES = Object.freeze(['good', 'people', 'rapid', 'average', 'poor', 'center', 'noDodge']);

export function pilot(game, style = 'good') {
  if (!PROFILE_NAMES.includes(style)) throw new RangeError(`Unknown pilot: ${style}`);
  if (game.mode !== 'playing') return;
  if (style === 'center') { game.setTarget(0); return; }
  const row = game.gates.find(gate => !gate.resolved);
  if (game.boss) {
    let x = style === 'average'
      ? Math.sin((game.time - .35 - CONFIG.bossAt) * .65) * .48
      : game.boss.x;
    const dodges = ['good', 'people', 'rapid', 'average'].includes(style);
    const attack = game.boss.attack;
    // Average: 350ms tracking delay, one missed recruit gate, first beam taken.
    if (dodges && attack && attack.at - game.time < (style === 'average' ? .65 : .85)
        && !(style === 'average' && attack.started < 45)) {
      x = attack.x > 0 ? attack.x - .38 : attack.x + .38;
    }
    game.setTarget(x);
  } else if (row) {
    const index = GATES.findIndex(definition => definition.at === row.at);
    if (style === 'average' && index === 2) { game.setTarget(0); return; }
    if (style === 'poor') { game.setTarget(index % 2 ? -.49 : .49); return; }
    const left = game.gateEffect(row.left);
    const right = game.gateEffect(row.right);
    let takeLeft = left.type === 'recruit' && left.value > 0;
    if (style === 'rapid') takeLeft = left.type === 'rapid' || (right.type !== 'rapid' && takeLeft);
    if (style === 'good' || style === 'average') {
      takeLeft = index < 3 ? takeLeft : left.type === 'rapid' || (right.type !== 'rapid' && takeLeft);
    }
    game.setTarget(takeLeft ? -.49 : .49);
  }
}

export function simulate(style = 'good', fps = 60) {
  if (!PROFILE_NAMES.includes(style)) throw new RangeError(`Unknown pilot: ${style}`);
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('A positive render rate is required');
  const game = new Game();
  game.start();
  let ticks = 0, maxBullets = 0, maxEnemies = 0, minSquad = game.squad;
  const first = { hit: null, kill: null, reward: null, boss: null };
  const timeline = [];
  let bossStart = null, bossPhases = 0, missingShots = 0;
  const interesting = new Set(['gain', 'hurt', 'upgrade', 'missGate', 'boss', 'bossPhase', 'beam', 'dodge', 'win', 'lose']);
  const stepper = new FixedStepper(dt => {
    if (game.mode !== 'playing') return;
    pilot(game, style);
    const firingSquad = game.squad;
    game.update(dt);
    ticks++;
    maxBullets = Math.max(maxBullets, game.bullets.count);
    maxEnemies = Math.max(maxEnemies, game.enemies.count);
    minSquad = Math.min(minSquad, game.squad);
    for (const event of game.drainEvents()) {
      if (event.type === 'fire') missingShots += firingSquad - event.count;
      if (event.type === 'hit' && first.hit === null) first.hit = game.time;
      if (event.type === 'kill' && first.kill === null) first.kill = game.time;
      if (['gain', 'upgrade'].includes(event.type) && first.reward === null) first.reward = game.time;
      if (event.type === 'boss') {
        first.boss = game.time;
        bossStart = { time: game.time, squad: game.squad, rapid: game.rapid, enemies: game.enemies.count };
      }
      if (event.type === 'bossPhase') bossPhases++;
      if (interesting.has(event.type)) timeline.push({
        time: game.time, type: event.type, squad: game.squad, rapid: game.rapid,
        ...('source' in event ? { source: event.source } : {}),
        ...('amount' in event ? { amount: event.amount } : {}),
      });
    }
  });
  let frames = 0;
  const frameLimit = Math.ceil((CONFIG.duration + 1) * fps);
  while (game.mode === 'playing' && frames++ < frameLimit) stepper.advance(1 / fps);
  if (game.mode === 'playing') throw new Error(`Pilot ${style} failed to reach a terminal state`);
  return {
    game,
    summary: {
      result: { ...game.result }, maxSquad: game.maxSquad, minSquad,
      maxBullets, maxEnemies, missingShots, ticks, first, bossStart,
      bossHP: game.boss?.hp ?? null, bossPhases, timeline,
    },
  };
}
