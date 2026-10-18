/** Bounded synthesized audio. A wave of kills is one layered sound, not 100 voices. */
export class Sound {
  constructor(Audio = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext) {
    this.context = Audio ? new Audio() : null;
    this.voices = new Set(); this.maxVoices = 12;
    this.lastFire = -1; this.lastImpact = -1; this.lastGate = -1; this.lastBlast = -1;
  }
  unlock() { if (this.context?.state === 'suspended') this.context.resume().catch(() => {}); }
  silence() { for (const voice of [...this.voices]) { try { voice.stop(); } catch {} } this.voices.clear(); }
  tone(freq, duration, type = 'sine', gain = .025, slide = 0) {
    if (!this.context || this.context.state !== 'running' || this.voices.size >= this.maxVoices) return false;
    const c = this.context, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + duration);
    g.gain.setValueAtTime(.001, t);
    if (g.gain.linearRampToValueAtTime) g.gain.linearRampToValueAtTime(Math.min(.055, gain), t + .003);
    else g.gain.setValueAtTime(Math.min(.055, gain), t);
    g.gain.exponentialRampToValueAtTime(.001, t + duration);
    o.connect(g); g.connect(c.destination); this.voices.add(o);
    o.onended = () => { this.voices.delete(o); o.disconnect(); g.disconnect(); };
    o.start(t); o.stop(t + duration); return true;
  }
  playBatch(events, muted = false) {
    if (muted || !this.context || this.context.state !== 'running' || !events.length) return;
    const now = this.context.currentTime;
    // Important cues take priority over optional texture.
    const power = events.find(e => e.type === 'power');
    if (power) {
      this.tone(130, .24, 'triangle', .04, 170);
      this.tone(power.tier >= 2 ? 660 : 440, .32, 'sine', .03, 440);
      this.tone(power.tier >= 2 ? 990 : 660, .24, 'sine', .018, 220);
    } else if (events.some(e => ['weapon', 'upgrade'].includes(e.type))) {
      this.tone(660, .17, 'triangle', .026, 330); this.tone(990, .21, 'sine', .018, 330);
    }
    if (events.some(e => e.type === 'warning')) this.tone(350, .22, 'sine', .025, 150);
    if (events.some(e => e.type === 'hurt')) this.tone(170, .16, 'triangle', .036, -95);
    if (events.some(e => e.type === 'win')) { this.tone(540, .5, 'sine', .04, 540); this.tone(810, .55, 'sine', .025, 270); }
    else if (events.some(e => e.type === 'lose')) this.tone(270, .4, 'triangle', .03, -180);
    else if (events.some(e => e.type === 'gain')) this.tone(650, .13, 'sine', .025, 330);
    const fire = events.find(e => e.type === 'fire');
    if (fire && now - this.lastFire >= .085) {
      const tier = fire.tier || 0;
      const cannon = fire.weapon === 'cannon', pierce = fire.weapon === 'pierce';
      this.tone(cannon ? 130 : pierce ? 950 : 650 - tier * 90, cannon ? .1 : .045, 'triangle', cannon ? .027 : .013 + tier * .003, cannon ? -65 : -300);
      this.lastFire = now;
    }
    const kills = events.reduce((sum, e) => sum + (e.type === 'kill' ? 1 : 0), 0);
    if (kills && now - this.lastImpact >= .075) {
      // The low body and short upper crack communicate a group breaking apart.
      const mass = Math.min(kills, 20) / 20;
      this.tone(150 - mass * 45, .055 + mass * .035, 'triangle', .013 + mass * .018, -65);
      if (kills >= 3) this.tone(1050 - mass * 250, .035, 'triangle', .009 + mass * .008, -600);
      this.lastImpact = now;
    }
    if (events.some(e => e.type === 'explosion') && now - this.lastBlast >= .15) {
      this.tone(95, .12, 'sine', .035, -50); this.lastBlast = now;
    }
    if (events.some(e => e.type === 'gateGrow') && now - this.lastGate >= .16) {
      this.tone(740, .035, 'sine', .009, 90); this.lastGate = now;
    }
  }
}
