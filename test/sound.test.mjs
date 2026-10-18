import test from 'node:test';
import assert from 'node:assert/strict';
import { Sound } from '../src/sound.js';
function audio(withNoise = false) {
  const nodes = [];
  class Audio {
    constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 8000; this.destination = {}; this.buffers = 0; }
    resume() { this.state = 'running'; return Promise.resolve(); }
    createOscillator() {
      const o = { stops: 0, disconnected: false, frequency: { setValueAtTime: (v) => { o.frequencyValue = v; }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() { o.disconnected = true; }, start() {}, stop() { o.stops++; } };
      nodes.push(o); return o;
    }
    createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
  }
  if (withNoise) {
    Audio.prototype.createBuffer = function (_channels, length) { this.buffers++; const data = new Float32Array(length); return { getChannelData: () => data }; };
    Audio.prototype.createBufferSource = function () { const o = { kind: 'noise', stops: 0, connect() {}, disconnect() {}, start() {}, stop() { o.stops++; } }; nodes.push(o); return o; };
    Audio.prototype.createBiquadFilter = () => ({ frequency: { setValueAtTime() {} }, connect() {}, disconnect() {} });
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

test('real delayed-chain event produces its own beat after100ms, not during primary impact', () => {
  const { sound, nodes } = audio(true);
  sound.playBatch([{ type: 'explosion', chain: false, batch: 1, time: 5 }]);
  assert.equal(nodes.length, 2); assert.equal(nodes[0].frequencyValue, 95);
  sound.context.currentTime += .05; sound.playBatch([]); assert.equal(nodes.length, 2);
  sound.context.currentTime += .05;
  sound.playBatch([{ type: 'explosion', chain: true, batch: 1, time: 5.1 }]);
  assert.equal(nodes.length, 4); assert.equal(nodes[2].frequencyValue, 145);
  sound.playBatch([{ type: 'explosion', chain: true, batch: 1, time: 5.1 }]);
  assert.equal(nodes.length, 4, 'same frame group is one chain beat');
});
test('noise shares the twelve-voice cap and reuses its locally generated buffer', () => {
  const { sound, nodes } = audio(true);
  for (let i = 0; i < 50; i++) { sound.tone(400, .1); sound.noise(); }
  assert.equal(nodes.length, 12); assert.equal(sound.context.buffers, 1);
  sound.silence(); assert.ok(nodes.every(n => n.stops === 2)); assert.equal(sound.voices.size, 0);
  assert.equal(sound.noise(), true); assert.equal(sound.context.buffers, 1);
  sound.context.state = 'suspended'; assert.equal(sound.noise(), false);
});
test('mute suppresses oscillator and noise layers including chain events', () => {
  const { sound, nodes } = audio(true);
  sound.playBatch([{ type: 'fire', weapon: 'cannon' }, { type: 'explosion' }, { type: 'explosion', chain: true }], true);
  assert.equal(nodes.length, 0); assert.equal(sound.context.buffers, 0);
  sound.playBatch([{ type: 'fire', weapon: 'cannon' }]);
  assert.equal(nodes.length, 2); assert.equal(nodes[1].kind, 'noise');
});

test('replay resets cooldowns and stops previous-run sound without recreating the context', () => {
  const { sound, nodes } = audio(true), context = sound.context;
  sound.playBatch([{ type: 'fire', weapon: 'cannon' }, { type: 'explosion', chain: true }]);
  const count = nodes.length; assert.ok(count > 0);
  sound.reset(); assert.equal(sound.voices.size, 0); assert.ok(nodes.every(n => n.stops === 2));
  sound.playBatch([{ type: 'fire', weapon: 'cannon' }, { type: 'explosion', chain: true }]);
  assert.equal(nodes.length, count * 2); assert.equal(sound.context, context);
});
