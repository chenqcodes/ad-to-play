/** Repeatable input scenarios, not estimates of human win rates. */
import { CONFIG, FixedStepper, Game, LEVELS } from '../src/game.js';
export const PROFILE_NAMES = Object.freeze(['good', 'people', 'rapid', 'average', 'poor', 'center', 'noDodge']);
const ROUTES = {
  growth: { good: 'LRRRRL', average: 'RLRRLL' },
  firepower: { good: 'RRRLLL', average: 'RLRLRR' },
  survival: { good: 'LLLRRL', average: 'LRLRRL' },
};
export function pilot(game, style = 'good') {
  if (!PROFILE_NAMES.includes(style)) throw new RangeError(`Unknown pilot: ${style}`);
  if (game.mode !== 'playing') return;
  if (style === 'center') { game.setTarget(0); return; }
  if (game.boss) {
    let x = style === 'average'
      ? Math.sin((game.time - .35 - game.level.bossAt) * .65) * .48
      : game.boss.x;
    const attack = game.boss.attack;
    if (style === 'poor') x = attack?.x ?? 0;
    if (style === 'average' && attack && attack.started < game.level.bossAt + 2) x = attack.x;
    else if (!['poor', 'noDodge'].includes(style) && attack && attack.at - game.time < (style === 'average' ? .65 : .85)) {
      x = attack.x > 0 ? attack.x - .4 : attack.x + .4;
    }
    game.setTarget(x); return;
  }
  const row = game.gates.find(gate => !gate.resolved);
  if (row) {
    const index = row.id ?? game.level.gates.findIndex(gate => gate.at === row.at);
    if (style === 'poor') {
      if (row.z > 150) { game.setTarget(0); return; }
      const leftValue = row.left.type === 'recruit' ? row.left.initialValue : 0;
      const rightValue = row.right.type === 'recruit' ? row.right.initialValue : 0;
      game.setTarget(leftValue <= rightValue ? -.49 : .49); return;
    }
    if (style === 'average' && index === 4) { game.setTarget(0); return; }
    if (style === 'average' && row.z > 620) { game.setTarget(0); return; }
    let takeLeft = ROUTES[game.level.id][style === 'average' ? 'average' : 'good'][index] === 'L';
    if (style === 'people') {
      const score = effect => effect.type === 'recruit' ? effect.maxValue : -10;
      takeLeft = score(row.left) >= score(row.right);
    }
    if (style === 'rapid') {
      if (row.left.type === 'rapid') takeLeft = true;
      else if (row.right.type === 'rapid') takeLeft = false;
    }
    game.setTarget(takeLeft ? -.49 : .49); return;
  }
  const enemies = game.enemies.items.filter(enemy => enemy.active).sort((a, b) => a.z - b.z);
  game.setTarget(style === 'poor' ? 0 : enemies[0]?.x ?? 0);
}
export function simulate(style = 'good', fps = 60, levelId = LEVELS[0].id) {
  if (!PROFILE_NAMES.includes(style)) throw new RangeError(`Unknown pilot: ${style}`);
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError('A positive render rate is required');
  const game = new Game(levelId); game.start();
  let ticks = 0, maxBullets = 0, maxEnemies = 0, minSquad = game.squad, bossStart = null, bossPhases = 0, missingShots = 0;
  const first = { hit: null, kill: null, reward: null, boss: null, gateGrowth: null }, timeline = [];
  const interesting = new Set(['gain', 'hurt', 'upgrade', 'weapon', 'missGate', 'boss', 'bossPhase', 'beam', 'dodge', 'win', 'lose']);
  const stepper = new FixedStepper(dt => {
    if (game.mode !== 'playing') return;
    pilot(game, style); game.update(dt); ticks++;
    maxBullets = Math.max(maxBullets, game.bullets.count); maxEnemies = Math.max(maxEnemies, game.enemies.count); minSquad = Math.min(minSquad, game.squad);
    for (const event of game.drainEvents()) {
      if (event.type === 'fire') missingShots += event.expectedCount - event.count;
      if (event.type === 'hit' && first.hit === null) first.hit = game.time;
      if (event.type === 'kill' && first.kill === null) first.kill = game.time;
      if (event.type === 'gateGrow' && first.gateGrowth === null) first.gateGrowth = game.time;
      if (['gain', 'upgrade', 'weapon'].includes(event.type) && first.reward === null) first.reward = game.time;
      if (event.type === 'boss') { first.boss = game.time; bossStart = { time: game.time, squad: game.squad, rapid: game.rapid, weapon: game.weapon, enemies: game.enemies.count }; }
      if (event.type === 'bossPhase') bossPhases++;
      if (interesting.has(event.type)) timeline.push({ time: game.time, type: event.type, squad: game.squad, rapid: game.rapid, weapon: game.weapon,
        ...('source' in event ? { source: event.source } : {}), ...('amount' in event ? { amount: event.amount } : {}) });
    }
  });
  let frames = 0;
  const frameLimit = Math.ceil((game.level.duration + 1) * fps);
  while (game.mode === 'playing' && frames++ < frameLimit) stepper.advance(1 / fps);
  if (game.mode === 'playing') throw new Error(`Pilot ${style} failed to reach a terminal state`);
  return { game, summary: { result: { ...game.result }, maxSquad: game.maxSquad, minSquad, maxBullets, maxEnemies, missingShots, ticks, first, bossStart,
    bossHP: game.boss?.hp ?? null, bossPhases, timeline } };
}
