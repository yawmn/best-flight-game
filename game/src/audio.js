// Basalt Horizon — audio.js
// Procedural sound, nothing downloaded: a WebAudio engine hum that follows
// the throttle, wind noise that follows the airspeed, and small chimes for
// rings, landings and crashes. Starts on the first user gesture.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineGain = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.windGain = null;
    this.started = false;
  }

  ensure() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    } catch {
      return;
    }
    this.started = true;
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // Engine: two detuned saws through a low-pass, pitch follows throttle.
    this.engineOsc1 = ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc1.frequency.value = 55;
    this.engineOsc2 = ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 82;
    const engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc1.connect(engineFilter);
    this.engineOsc2.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc1.start();
    this.engineOsc2.start();

    // Wind: looped noise buffer through a band-pass, gain follows speed.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.master);
    noise.start();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Called every frame while flying.
  update(throttle, speed, flying) {
    if (!this.started || !this.ctx) return;
    const t = this.ctx.currentTime;
    const eng = flying ? 0.05 + throttle * 0.11 : 0;
    this.engineGain.gain.setTargetAtTime(eng, t, 0.1);
    this.engineOsc1.frequency.setTargetAtTime(50 + throttle * 70, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(75 + throttle * 105, t, 0.1);
    const wind = flying ? Math.min(0.16, (speed / 92) * 0.16) : 0;
    this.windGain.gain.setTargetAtTime(wind, t, 0.15);
  }

  blip(freq, dur, type = 'sine', vol = 0.25) {
    if (!this.started || !this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur);
  }

  ring() { this.blip(880, 0.18); setTimeout(() => this.blip(1318, 0.25), 90); }
  warn() { this.blip(220, 0.2, 'square', 0.12); }
  land() { this.blip(392, 0.3); setTimeout(() => this.blip(523, 0.4), 120); }
  crash() {
    if (!this.started || !this.ctx) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(g);
    g.connect(this.master);
    src.start();
  }
  complete() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.3), i * 110));
  }
}
