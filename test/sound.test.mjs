import test from 'node:test';
import assert from 'node:assert/strict';
import { Sound } from '../src/sound.js';
function audio() {
  const nodes = [];
  class Audio {
    constructor() { this.state = 'running'; this.currentTime = 1; this.destination = {}; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() {
      const o = { stops: 0, disconnected: false, frequency: { setValueAtTime: (v) => { o.frequencyValue = v; }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() { o.disconnected = true; }, start() {}, stop() { o.stops++; } };
      nodes.push(o); return o;
    }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  const sound = new Sound(Audio); return { sound, nodes };
}
test('dense simultaneous deaths coalesce into one two-layer impact', () => {
  const { sound, nodes } = audio();
  sound.playBatch(Array.from({ length: 200 }, () => ({ type: 'kill' })));
  assert.equal(nodes.length, 2);
  sound.playBatch(Array.from({ length: 200 }, () => ({ type: 'kill' })));
  assert.equal(nodes.length, 2, 'same audio tick cannot produce repeated impact chatter');
  sound.context.currentTime += .1; sound.playBatch([{ type: 'kill' }]);
  assert.equal(nodes.length, 3);
});
test('voice cap is hard and completed voices are reusable', () => {
  const { sound, nodes } = audio();
  for (let i = 0; i < 100; i++) sound.tone(440, .1);
  assert.equal(nodes.length, 12); assert.equal(sound.voices.size, 12);
  nodes[0].onended(); assert.equal(nodes[0].disconnected, true);
  assert.equal(sound.tone(440, .1), true); assert.equal(sound.voices.size, 12);
});
test('muted or suspended audio emits nothing; pause stops every active voice', () => {
  const { sound, nodes } = audio();
  sound.playBatch([{ type: 'power', tier: 2 }, { type: 'kill' }], true); assert.equal(nodes.length, 0);
  sound.context.state = 'suspended'; sound.playBatch([{ type: 'fire' }]); assert.equal(nodes.length, 0);
  sound.unlock(); sound.playBatch([{ type: 'power', tier: 2 }]); assert.equal(nodes.length, 3);
  sound.silence(); assert.equal(sound.voices.size, 0); assert.ok(nodes.every(n => n.stops === 2));
  assert.doesNotThrow(() => new Sound(null).playBatch([{ type: 'kill' }]));
});
test('weapon tiers and cannon have distinct synthesized pitches, with throttled fire', () => {
  const { sound, nodes } = audio();
  sound.playBatch([{ type: 'fire', weapon: 'rifle', tier: 0 }]);
  sound.playBatch([{ type: 'fire', weapon: 'rifle', tier: 2 }]); assert.equal(nodes.length, 1);
  sound.context.currentTime += .1; sound.playBatch([{ type: 'fire', weapon: 'rifle', tier: 2 }]);
  sound.context.currentTime += .1; sound.playBatch([{ type: 'fire', weapon: 'cannon', tier: 2 }]);
  assert.deepEqual(nodes.map(n => n.frequencyValue), [650, 470, 130]);
});
