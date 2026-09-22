/**
 * Every sound is synthesized with WebAudio — zero audio files. The context is
 * created lazily on the first user gesture (autoplay policy).
 */
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

export function setMuted(m: boolean): void {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02);
}

export function isMuted(): boolean {
  return muted;
}

/** Call from a user gesture handler. */
export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  const comp = ctx.createDynamicsCompressor();
  master.connect(comp).connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

function ready(): AudioContext | null {
  return ctx && master && !muted ? ctx : null;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function noise(
  c: AudioContext,
  t: number,
  dur: number,
  freq: number,
  q: number,
  peak: number,
  type: BiquadFilterType = 'bandpass',
): void {
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, peak, 0.003, dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t, Math.random() * 0.5, dur + 0.05);
}

function tone(
  c: AudioContext,
  t: number,
  freq: number,
  dur: number,
  peak: number,
  type: OscillatorType = 'sine',
  slideTo?: number,
): void {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = c.createGain();
  env(g, t, peak, 0.005, dur);
  o.connect(g).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export const sfx = {
  /** Reel tick while spinning; pitch tracks velocity (0–1). */
  tick(velocity = 1): void {
    const c = ready();
    if (!c) return;
    noise(c, c.currentTime, 0.025, 1800 + velocity * 2600, 6, 0.18);
  },
  /** Reel lands: a thunk + click; steps up in pitch per reel. */
  lock(reelIndex: number): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const base = 196 * 2 ** (([0, 2, 4, 5, 7, 9, 11, 12][reelIndex] ?? 12) / 12);
    tone(c, t, base * 2, 0.16, 0.35, 'triangle', base);
    noise(c, t, 0.04, 3200, 2, 0.25, 'highpass');
  },
  /** Lever pull: a filtered whoosh. */
  lever(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + 0.28);
    const g = c.createGain();
    env(g, t, 0.35, 0.05, 0.3);
    src.connect(f).connect(g).connect(master!);
    src.start(t, 0, 0.4);
    tone(c, t, 90, 0.2, 0.25, 'sine', 55);
  },
  /** Sauce pour: band-passed noise wobbling on an LFO. */
  pour(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 3;
    const lfo = c.createOscillator();
    lfo.frequency.value = 9;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain).connect(f.frequency);
    const g = c.createGain();
    env(g, t, 0.16, 0.05, 0.5);
    src.connect(f).connect(g).connect(master!);
    src.start(t, 0, 0.6);
    lfo.start(t);
    lfo.stop(t + 0.6);
  },
  /** Lid closing: soft bready thump. */
  thump(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 120, 0.22, 0.45, 'sine', 60);
    noise(c, t, 0.08, 500, 1, 0.2, 'lowpass');
  },
  /** Toasting: a crackly sizzle. */
  sizzle(ms = 1000): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    for (let i = 0; i < 26; i++)
      noise(
        c,
        t + Math.random() * (ms / 1000),
        0.02 + Math.random() * 0.04,
        4000 + Math.random() * 4000,
        4,
        0.05 + Math.random() * 0.06,
      );
    noise(c, t, ms / 1000, 6000, 0.7, 0.05, 'highpass');
  },
  /** Chef's kiss: bright major arpeggio. */
  jackpot(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
      tone(c, t + i * 0.075, f, 0.35, 0.22, 'triangle');
    });
  },
  /** Solid: a pleasant two-note ding. */
  ding(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 880, 0.3, 0.2, 'sine');
    tone(c, t + 0.09, 1318.5, 0.4, 0.16, 'sine');
  },
  /** Cursed: a detuned minor second, sliding down. */
  cursed(): void {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    tone(c, t, 233, 0.7, 0.2, 'sawtooth', 180);
    tone(c, t, 247, 0.7, 0.18, 'sawtooth', 186);
    noise(c, t, 0.3, 200, 1, 0.15, 'lowpass');
  },
  /** Small UI click. */
  click(): void {
    const c = ready();
    if (!c) return;
    noise(c, c.currentTime, 0.015, 5000, 3, 0.12);
  },
};
