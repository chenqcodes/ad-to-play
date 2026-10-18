import test from 'node:test';
import assert from 'node:assert/strict';
import { readSaved, writeSaved, recordRun } from '../src/storage.js';
test('storage denial and malformed content never block the game', () => {
  const bad = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  assert.deepEqual(readSaved(bad), { muted: true, vibration: false, reducedMotion: null, records: {} });
  assert.equal(writeSaved(bad, {}), false);
  for (const json of ['{bad', 'null', '42']) assert.deepEqual(readSaved({ getItem: () => json }).records, {});
});
test('local records update once per supplied run with independent level bests', () => {
  let saved = readSaved();
  saved = recordRun(saved, { levelId: 'growth', won: false, time: 30, maxSquad: 17, progress: .4 });
  assert.equal(saved.records.growth.wins, 0); assert.equal(saved.records.growth.progress, .4);
  saved = recordRun(saved, { levelId: 'growth', won: true, time: 54, maxSquad: 21, progress: 1 });
  saved = recordRun(saved, { levelId: 'growth', won: true, time: 52, maxSquad: 20, progress: 1 });
  saved = recordRun(saved, { levelId: 'survival', won: false, time: 35, maxSquad: 12, progress: .5 });
  assert.deepEqual(saved.records.growth, { wins: 2, bestTime: 52, progress: 1, maxSquad: 21 });
  assert.equal(saved.records.survival.wins, 0);
});
test('saved input is bounded and never used as HTML', () => {
  const saved = readSaved({ getItem: () => JSON.stringify({ muted: false, vibration: true, reducedMotion: true, records: { growth: { wins: -3, bestTime: -6, progress: 50, maxSquad: 999 } } }) });
  assert.equal(saved.muted, false); assert.equal(saved.vibration, true); assert.equal(saved.reducedMotion, true);
  assert.deepEqual(saved.records.growth, { wins: 0, bestTime: null, progress: 1, maxSquad: 42 });
});
