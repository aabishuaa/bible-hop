// Every sound in the game is made here, in the browser, from oscillators and filtered noise.
// There are no audio files to download, so the first page flip is as quick as the hundredth.
import type { Tier } from '../../../shared/rules.ts';
import type { LossReason } from '../../../shared/types.ts';

export type FlipTier = Tier | 'home';

interface ToneOpts {
  freq: number;
  to?: number; // glide to this pitch
  type?: OscillatorType;
  at?: number; // seconds from now
  dur?: number;
  gain?: number;
  attack?: number;
  pan?: number;
  wet?: number; // how much goes to the reverb
  lowpass?: number;
  vibrato?: { rate: number; depth: number };
}

interface NoiseOpts {
  at?: number;
  dur?: number;
  gain?: number;
  attack?: number;
  type?: BiquadFilterType;
  freq?: number;
  to?: number;
  q?: number;
  pan?: number;
  wet?: number;
  highpass?: number;
}

// pitches, in Hz
const N = {
  D3: 146.83, A3: 220, D4: 293.66, E4: 329.63, Fs4: 369.99, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
  Fs5: 739.99, G5: 783.99, Gs5: 830.61, A5: 880, B5: 987.77, D6: 1174.66, E6: 1318.51, Fs6: 1479.98, A6: 1760,
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private noiseBuf!: AudioBuffer;
  enabled = true;
  volume = 0.8;

  /** Browsers only let sound start from a tap or a key press; call this from one. */
  unlock(): void {
    if (!this.enabled) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        return;
      }
      const ctx = this.ctx;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(limiter).connect(ctx.destination);
      // a small warm room, made from decaying noise
      const len = Math.floor(ctx.sampleRate * 1.7);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let smooth = 0;
        for (let i = 0; i < len; i++) {
          const t = i / len;
          smooth = smooth * 0.55 + (Math.random() * 2 - 1) * 0.45;
          d[i] = smooth * Math.pow(1 - t, 2.6);
        }
      }
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.55;
      this.reverb.connect(wet).connect(this.master);
      const nlen = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
      const nd = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  private ready(): AudioContext | null {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return null;
    return this.ctx;
  }

  private out(ctx: AudioContext, node: AudioNode, pan = 0, wet = 0): void {
    let last = node;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      last.connect(p);
      last = p;
    }
    last.connect(this.master);
    if (wet > 0) {
      const send = ctx.createGain();
      send.gain.value = wet;
      last.connect(send).connect(this.reverb);
    }
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const dur = o.dur ?? 0.2;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    if (o.vibrato) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = o.vibrato.rate;
      depth.gain.value = o.vibrato.depth;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.05);
    }
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = osc.connect(g);
    if (o.lowpass) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lowpass;
      node = node.connect(f);
    }
    this.out(ctx, node, o.pan, o.wet);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.at ?? 0);
    const dur = o.dur ?? 0.15;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 2000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    const peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + (o.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node: AudioNode = src.connect(f);
    if (o.highpass) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = o.highpass;
      node = node.connect(hp);
    }
    node = node.connect(g);
    this.out(ctx, node, o.pan, o.wet);
    src.start(t0, Math.random() * 1.5);
    src.stop(t0 + dur + 0.05);
  }

  private bell(freq: number, at = 0, gain = 0.12, dur = 1.1, pan = 0): void {
    this.tone({ freq, at, dur, gain, attack: 0.003, wet: 0.6, pan });
    this.tone({ freq: freq * 2.01, at, dur: dur * 0.6, gain: gain * 0.35, attack: 0.003, wet: 0.5, pan });
    this.tone({ freq: freq * 3.02, at, dur: dur * 0.35, gain: gain * 0.15, attack: 0.002, wet: 0.4, pan });
  }

  private pluck(freq: number, at = 0, gain = 0.16, pan = 0): void {
    this.tone({ freq, type: 'triangle', at, dur: 0.22, gain, attack: 0.003, wet: 0.25, pan });
    this.tone({ freq: freq * 2, at, dur: 0.09, gain: gain * 0.3, attack: 0.002, pan });
  }

  // ---------------------------------------------------------------------------- the game's sounds

  /** The cover of the Bible lifting open: a leather creak and a breath of pages. */
  cover(): void {
    this.noise({ dur: 0.5, gain: 0.1, freq: 320, to: 1400, q: 2.2, attack: 0.2, wet: 0.4 });
    this.tone({ freq: 70, to: 48, dur: 0.35, gain: 0.22, at: 0.05 });
    this.noise({ at: 0.75, dur: 0.35, gain: 0.12, freq: 1800, to: 700, q: 0.7, highpass: 400, wet: 0.3 });
    this.tone({ at: 1.05, freq: 150, to: 60, dur: 0.18, gain: 0.2 });
  }

  click(): void {
    this.noise({ dur: 0.02, gain: 0.05, freq: 3200, q: 1.2 });
    this.tone({ freq: 1500, dur: 0.03, gain: 0.03 });
  }

  /** Tapping a word: each tier has its own voice. */
  door(tier: Tier): void {
    if (tier === 'wall') return this.wall();
    this.noise({ dur: 0.018, gain: 0.05, freq: 4200, q: 1.5 });
    if (tier === 'crumb') this.tone({ freq: N.G4, type: 'triangle', dur: 0.1, gain: 0.1, lowpass: 1400 });
    if (tier === 'loaf') this.pluck(N.C5, 0, 0.16);
    if (tier === 'fish') {
      this.pluck(N.E5, 0, 0.15);
      this.tone({ freq: 420, to: 760, dur: 0.09, gain: 0.07, at: 0.03 });
    }
    if (tier === 'pearl') {
      this.bell(N.B5, 0, 0.11, 0.9);
      this.bell(N.Fs6, 0.07, 0.06, 0.8);
    }
    if (tier === 'nugget') {
      [N.D6, N.Fs6, N.A6].forEach((f, i) => this.bell(f, i * 0.05, 0.09, 1.1, (i - 1) * 0.3));
      this.noise({ dur: 0.5, gain: 0.03, type: 'highpass', freq: 7500, wet: 0.5 });
    }
  }

  /** A Golden Nugget found: a shower of coins and a rising fanfare. */
  nugget(at = 0): void {
    for (let i = 0; i < 14; i++) this.tone({ at: at + i * 0.045, freq: 1400 + ((i * 337) % 900), to: 2100 + ((i * 211) % 700), dur: 0.08, gain: 0.06, wet: 0.3, pan: ((i % 5) - 2) * 0.2 });
    [N.D5, N.Fs5, N.A5, N.D6, N.Fs6, N.A6].forEach((f, i) => this.bell(f, at + 0.15 + i * 0.08, 0.1, 1.6, (i - 2.5) * 0.18));
    this.tone({ at: at + 0.1, freq: N.D3, dur: 1.4, gain: 0.08, attack: 0.1, type: 'triangle', lowpass: 1500, wet: 0.6 });
  }

  wall(): void {
    this.tone({ freq: 120, to: 62, dur: 0.14, gain: 0.3 });
    this.noise({ dur: 0.05, gain: 0.12, type: 'lowpass', freq: 500 });
  }

  used(): void {
    this.tone({ freq: 240, dur: 0.05, gain: 0.08, type: 'triangle', lowpass: 900 });
    this.tone({ freq: 200, dur: 0.05, gain: 0.07, type: 'triangle', lowpass: 900, at: 0.07 });
  }

  sheet(open: boolean): void {
    this.noise({ dur: 0.13, gain: 0.05, freq: open ? 900 : 2600, to: open ? 2800 : 800, q: 0.6 });
  }

  wording(): void {
    this.noise({ dur: 0.11, gain: 0.07, freq: 1800, to: 2600, q: 0.7 });
  }

  /** One page turning. Crumbs flick, loaves turn briskly, fish glide, pearls sweep slowly. */
  flip(tier: FlipTier, dir: number, at = 0): void {
    const d = { crumb: 0.1, loaf: 0.15, fish: 0.24, pearl: 0.34, nugget: 0.38, home: 0.3, wall: 0.15 }[tier];
    const bright = { crumb: 5200, loaf: 4200, fish: 3400, pearl: 3000, nugget: 3800, home: 3600, wall: 4000 }[tier];
    const pan = -0.35 * dir;
    // the rush of the paper through the air, then the slap as it lands
    this.noise({ at, dur: d, gain: 0.16, freq: bright * 0.5, to: bright, q: 0.7, highpass: 500, pan: -pan, attack: d * 0.35 });
    this.noise({ at: at + d * 0.8, dur: 0.07, gain: 0.2, freq: bright * 0.8, to: 900, q: 0.9, highpass: 400, pan });
    this.tone({ at: at + d * 0.2, freq: 190, to: 90, dur: d * 0.9, gain: 0.07 });
    if (tier === 'fish') this.noise({ at, dur: d, gain: 0.05, freq: 900, to: 1800, q: 4, pan });
  }

  /** Arriving on a verse. */
  land(tier: FlipTier, at = 0): void {
    this.tone({ at, freq: 150, to: 62, dur: 0.16, gain: 0.26 });
    this.noise({ at, dur: 0.06, gain: 0.07, type: 'lowpass', freq: 700 });
    if (tier === 'crumb') this.tone({ at: at + 0.02, freq: N.G4, type: 'triangle', dur: 0.12, gain: 0.08, lowpass: 1600 });
    if (tier === 'loaf') {
      this.pluck(N.C5, at + 0.03, 0.15);
      this.pluck(N.E5, at + 0.13, 0.13);
    }
    if (tier === 'fish') {
      this.tone({ at: at + 0.02, freq: 300, to: 680, dur: 0.11, gain: 0.14, wet: 0.3 });
      this.pluck(N.E5, at + 0.1, 0.13);
      this.pluck(N.G5, at + 0.2, 0.12);
      this.pluck(N.B5, at + 0.3, 0.1);
    }
    if (tier === 'nugget') this.nugget(at + 0.05);
    if (tier === 'pearl') {
      [N.E5, N.Gs5, N.B5, N.E6].forEach((f, i) => this.bell(f, at + 0.05 + i * 0.11, 0.11 - i * 0.012, 1.4, (i - 1.5) * 0.25));
      this.noise({ at: at + 0.05, dur: 0.7, gain: 0.025, type: 'highpass', freq: 7000, wet: 0.5 });
    }
  }

  /** Manna counting up: one bright tick per few manna, like coins into a jar. */
  manna(amount: number, at = 0): void {
    const ticks = Math.max(1, Math.min(9, Math.round(amount / 3)));
    for (let i = 0; i < ticks; i++) {
      this.tone({ at: at + i * 0.045, freq: 1100 + i * 110, to: 1500 + i * 130, dur: 0.06, gain: 0.07, wet: 0.15 });
    }
  }

  oilBurn(drops: number, at = 0): void {
    for (let i = 0; i < Math.min(3, drops); i++) this.noise({ at: at + i * 0.09, dur: 0.07, gain: 0.035, type: 'highpass', freq: 5200 });
  }

  /** The widow's jar refilling: three soft glugs. */
  oilRefill(drops: number, at = 0): void {
    for (let i = 0; i < Math.max(1, Math.min(4, drops)); i++) this.tone({ at: at + i * 0.13, freq: 290 + i * 30, to: 560 + i * 40, dur: 0.1, gain: 0.16, wet: 0.2 });
  }

  refuse(): void {
    this.tone({ freq: 232, type: 'triangle', dur: 0.07, gain: 0.16, lowpass: 1200 });
    this.tone({ freq: 196, type: 'triangle', dur: 0.09, gain: 0.16, lowpass: 1200, at: 0.09 });
  }

  ask(): void {
    this.pluck(N.E5, 0, 0.1);
    this.pluck(N.A5, 0.1, 0.1);
  }

  strike(n: number): void {
    const f = 147 - n * 6;
    this.tone({ freq: f, type: 'square', dur: 0.26, gain: 0.1, lowpass: 700 });
    this.tone({ freq: f * 1.06, type: 'square', dur: 0.26, gain: 0.1, lowpass: 700 });
    this.tone({ freq: 90, to: 50, dur: 0.2, gain: 0.3 });
    this.noise({ dur: 0.08, gain: 0.1, type: 'lowpass', freq: 600 });
  }

  /** Cock-a-doodle-doo, more or less. */
  rooster(at = 0.25): void {
    const voice = (freq: number, to: number, t: number, dur: number, vib = 0) => {
      this.tone({ at: at + t, freq, to, type: 'sawtooth', dur, gain: 0.1, attack: 0.02, lowpass: 2400, wet: 0.35, vibrato: vib ? { rate: 9, depth: vib } : undefined });
      this.tone({ at: at + t, freq: freq * 2, to: to * 2, type: 'square', dur, gain: 0.025, attack: 0.02, lowpass: 3200 });
      this.noise({ at: at + t, dur, gain: 0.02, freq: 2400, q: 2 });
    };
    voice(520, 600, 0, 0.11);
    voice(600, 660, 0.15, 0.1);
    voice(700, 820, 0.29, 0.16);
    voice(820, 900, 0.48, 0.12);
    voice(960, 1090, 0.64, 0.5, 22);
    voice(1090, 560, 1.12, 0.32);
  }

  graceOffer(): void {
    this.bell(N.A5, 0, 0.09, 1.6);
    this.bell(N.Fs5, 0.22, 0.09, 1.8);
    this.tone({ freq: N.D4, dur: 1.6, gain: 0.05, attack: 0.3, wet: 0.7 });
  }

  graceUse(): void {
    [N.D4, N.Fs4, N.A4, N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => this.bell(f, i * 0.065, 0.085, 1.5, (i - 3) * 0.14));
    this.noise({ at: 0.1, dur: 0.9, gain: 0.02, type: 'highpass', freq: 6500, wet: 0.6 });
  }

  /** Looking back: the air drawn backwards, and a pinch of salt. */
  lookBack(): void {
    this.noise({ dur: 0.3, gain: 0.14, freq: 500, to: 3200, q: 0.8, attack: 0.24 });
    for (let i = 0; i < 4; i++) this.noise({ at: 0.32 + i * 0.05, dur: 0.03, gain: 0.07, type: 'highpass', freq: 6000 });
    this.tone({ at: 0.3, freq: 170, to: 80, dur: 0.14, gain: 0.18 });
  }

  // ---------------------------------------------------------------------- the mini games

  /** A run of right answers: each one a step higher. */
  combo(n: number, at = 0): void {
    const scale = [N.E5, N.Fs5, N.Gs5, N.A5, N.B5, 1108.73, N.E6, 1479.98];
    const f = scale[Math.min(scale.length - 1, Math.max(0, n - 1))];
    this.pluck(f, at, 0.14);
    this.bell(f * 2, at + 0.06, 0.05, 0.6);
    if (n >= 3) this.noise({ at: at + 0.05, dur: 0.3, gain: 0.03, type: 'highpass', freq: 7000, wet: 0.5 });
  }

  /** The last seconds: a heartbeat. */
  heartbeat(): void {
    this.tone({ freq: 70, to: 48, dur: 0.12, gain: 0.22, lowpass: 300 });
    this.tone({ at: 0.16, freq: 64, to: 44, dur: 0.14, gain: 0.16, lowpass: 280 });
  }

  /** A tile tapped: a little wooden knock. */
  tile(): void {
    this.noise({ dur: 0.025, gain: 0.06, freq: 1800, q: 4 });
    this.tone({ freq: 620, to: 480, dur: 0.05, gain: 0.05, type: 'triangle' });
  }

  /** A card swept off the table. */
  whoosh(dir = 1): void {
    this.noise({ dur: 0.22, gain: 0.06, type: 'bandpass', freq: 600, to: 2600, q: 0.7, pan: dir * 0.6 });
  }

  /** A stamp coming down on paper. */
  stamp(at = 0): void {
    this.tone({ at, freq: 120, to: 60, dur: 0.12, gain: 0.25, lowpass: 500 });
    this.noise({ at, dur: 0.06, gain: 0.1, type: 'lowpass', freq: 1200 });
  }

  /** A number counting up. */
  count(): void {
    this.tone({ freq: 1800, dur: 0.015, gain: 0.02 });
  }

  /** The clock: a soft tick, sharper in the last seconds. */
  tick(urgent = false): void {
    this.noise({ dur: 0.012, gain: urgent ? 0.07 : 0.035, freq: urgent ? 5200 : 3800, q: 2 });
    this.tone({ freq: urgent ? 1320 : 990, dur: 0.035, gain: urgent ? 0.06 : 0.03 });
  }

  correct(at = 0): void {
    this.pluck(N.E5, at, 0.14);
    this.pluck(N.A5, at + 0.08, 0.13);
    this.bell(N.E6, at + 0.16, 0.07, 0.8);
  }

  wrong(at = 0): void {
    this.tone({ at, freq: 196, to: 140, dur: 0.22, gain: 0.14, type: 'square', lowpass: 900 });
    this.noise({ at, dur: 0.08, gain: 0.05, type: 'lowpass', freq: 600 });
  }

  /** A card turning over to show the answer. */
  reveal(at = 0): void {
    this.noise({ at, dur: 0.35, gain: 0.05, type: 'bandpass', freq: 900, to: 3200, attack: 0.08 });
  }

  fanfare(at = 0): void {
    [N.D5, N.Fs5, N.A5].forEach((f, i) => this.bell(f, at + i * 0.09, 0.1, 1.2, (i - 1) * 0.3));
    this.bell(N.D6, at + 0.3, 0.12, 1.6);
    this.tone({ at, freq: N.D4, dur: 1.2, gain: 0.05, attack: 0.1, wet: 0.5, type: 'triangle' });
  }

  lose(at = 0): void {
    [N.A4, N.Fs4, N.D4].forEach((f, i) => this.tone({ at: at + i * 0.16, freq: f, dur: 0.5, gain: 0.08, type: 'triangle', wet: 0.4 }));
  }

  timeUp(): void {
    this.bell(N.A4, 0, 0.1, 0.9);
    this.bell(N.E4, 0.12, 0.08, 1.1);
  }

  splash(at = 0, gain = 0.12): void {
    this.noise({ at, dur: 0.45, gain, type: 'lowpass', freq: 1800, to: 300, attack: 0.01 });
    this.noise({ at: at + 0.02, dur: 0.25, gain: gain * 0.5, type: 'highpass', freq: 3000 });
  }

  wind(at = 0, gain = 0.07): void {
    this.noise({ at, dur: 1.6, gain, type: 'bandpass', freq: 400, to: 1600, q: 0.6, attack: 0.4 });
  }

  thunder(at = 0): void {
    this.noise({ at, dur: 1.8, gain: 0.16, type: 'lowpass', freq: 220, to: 60, attack: 0.02, wet: 0.6 });
  }

  pop(at = 0): void {
    this.tone({ at, freq: 520, to: 980, dur: 0.07, gain: 0.07 });
  }

  crumb(at = 0): void {
    this.noise({ at, dur: 0.03, gain: 0.05, freq: 5000, q: 3 });
    this.tone({ at, freq: N.B5, dur: 0.06, gain: 0.04, type: 'triangle' });
  }

  /** A challenge met: a bright run up and a shimmer. */
  challenge(at = 0): void {
    [N.D5, N.Fs5, N.A5, N.D6].forEach((f, i) => this.bell(f, at + i * 0.07, 0.09, 0.9, (i - 1.5) * 0.25));
    this.noise({ at: at + 0.25, dur: 0.6, gain: 0.04, type: 'highpass', freq: 6500, wet: 0.6, attack: 0.05 });
  }

  /** A verse kept in the Journal: a ribbon laid in the page. */
  keep(): void {
    this.noise({ dur: 0.05, gain: 0.04, freq: 3000, q: 1 });
    this.pluck(N.E5, 0.01, 0.12);
    this.pluck(N.B5, 0.09, 0.1);
  }

  /** A verse taken out of the Journal. */
  unkeep(): void {
    this.pluck(N.B4, 0, 0.09);
  }

  /** A heavy wooden door swinging open on old hinges. */
  creak(at = 0): void {
    this.tone({ at, freq: 92, to: 58, dur: 0.22, gain: 0.22, lowpass: 600 });
    this.noise({ at, dur: 0.05, gain: 0.12, type: 'lowpass', freq: 900 });
    [0.08, 0.2, 0.33, 0.5, 0.62].forEach((d, i) => this.noise({ at: at + d, dur: 0.09 + (i % 2) * 0.05, gain: 0.05, type: 'bandpass', freq: 700 + i * 140, to: 1100 + i * 90, q: 9 }));
    this.tone({ at: at + 0.1, freq: 240, to: 330, dur: 0.55, gain: 0.025, type: 'sawtooth', lowpass: 900, vibrato: { rate: 23, depth: 18 } });
  }

  /** Light pouring through: a soft rising rush. */
  swell(at = 0): void {
    this.noise({ at, dur: 1.2, gain: 0.07, type: 'highpass', freq: 900, to: 6500, attack: 0.5, wet: 0.6 });
    this.tone({ at, freq: N.D4, dur: 1.4, gain: 0.05, attack: 0.6, wet: 0.6, type: 'triangle' });
  }

  /** Home again. */
  home(at = 0): void {
    [N.D3, N.A3, N.D4, N.Fs4, N.A4].forEach((f) => this.tone({ at, freq: f, dur: 2.4, gain: 0.07, attack: 0.35, wet: 0.7, type: 'triangle', lowpass: 2600 }));
    [N.D5, N.Fs5, N.A5, N.D6, N.Fs6, N.A6].forEach((f, i) => this.bell(f, at + 0.25 + i * 0.12, 0.1, 1.9, (i - 2.5) * 0.2));
    this.noise({ at: at + 0.2, dur: 1.6, gain: 0.03, type: 'highpass', freq: 7000, wet: 0.7, attack: 0.4 });
  }

  loss(reason: LossReason): void {
    if (reason === 'rooster') return; // the rooster has already crowed
    if (reason === 'lamp') this.noise({ dur: 0.5, gain: 0.16, type: 'lowpass', freq: 3200, to: 180, attack: 0.02 });
    if (reason === 'door') {
      this.tone({ freq: 110, to: 42, dur: 0.5, gain: 0.4, wet: 0.5 });
      this.noise({ dur: 0.12, gain: 0.22, type: 'lowpass', freq: 500, wet: 0.5 });
    }
    if (reason === 'fish') {
      this.tone({ freq: 420, to: 120, dur: 0.3, gain: 0.18, wet: 0.3 });
      for (let i = 0; i < 4; i++) this.tone({ at: 0.3 + i * 0.09, freq: 300 + i * 90, to: 520 + i * 110, dur: 0.07, gain: 0.07 });
    }
    if (reason === 'wilderness') this.noise({ dur: 1.4, gain: 0.08, freq: 500, to: 900, q: 3, attack: 0.5, wet: 0.5 });
    if (reason === 'famine') this.tone({ freq: 180, to: 120, dur: 0.7, gain: 0.12, type: 'triangle', wet: 0.4 });
    this.tone({ at: 0.15, freq: N.A3, to: 175, dur: 1.5, gain: 0.1, attack: 0.1, type: 'triangle', lowpass: 900, wet: 0.6 });
    this.tone({ at: 0.15, freq: N.D3, to: 117, dur: 1.5, gain: 0.1, attack: 0.1, type: 'triangle', lowpass: 700, wet: 0.6 });
  }

  achievement(): void {
    [N.A5, N.D6, N.Fs6].forEach((f, i) => this.bell(f, i * 0.09, 0.09, 1.2));
  }
}

export const sound = new SoundEngine();
