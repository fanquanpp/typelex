/**
 * Synthesised keyboard audio.
 *
 * All sounds are generated with the Web Audio API rather than shipped as files:
 * the bundle stays tiny, there is no decode latency on the first keystroke, and
 * each switch type can get a distinct voice by changing a handful of numbers.
 *
 * Profiles approximate real switch families:
 *   linear  — Cherry MX Red style: low, soft, no click
 *   tactile — MX Brown style: soft bump, slightly brighter
 *   clicky  — MX Blue style: sharp high click plus a low body
 *   laptop  — scissor switch: very short, thin, quiet
 */
export type SoundProfile = 'linear' | 'tactile' | 'clicky' | 'laptop' | 'off';

interface Voice {
  /** noise burst centre frequency, Hz */
  noiseHz: number;
  /** noise burst Q */
  noiseQ: number;
  /** noise decay, seconds */
  noiseDecay: number;
  /** body sine frequency, Hz */
  bodyHz: number;
  /** body decay, seconds */
  bodyDecay: number;
  /** overall gain */
  gain: number;
}

const VOICES: Record<Exclude<SoundProfile, 'off'>, Voice> = {
  linear: { noiseHz: 900, noiseQ: 0.7, noiseDecay: 0.035, bodyHz: 140, bodyDecay: 0.05, gain: 0.3 },
  tactile: { noiseHz: 1500, noiseQ: 0.9, noiseDecay: 0.03, bodyHz: 175, bodyDecay: 0.045, gain: 0.32 },
  clicky: { noiseHz: 2600, noiseQ: 1.4, noiseDecay: 0.022, bodyHz: 210, bodyDecay: 0.04, gain: 0.36 },
  laptop: { noiseHz: 2100, noiseQ: 1.1, noiseDecay: 0.012, bodyHz: 120, bodyDecay: 0.02, gain: 0.2 }
};

let context: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

const ensureContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  if (context) return context;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = 0.7;
  master.connect(context.destination);

  const length = Math.floor(context.sampleRate * 0.12);
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

  return context;
};

/** Browsers require a user gesture before audio may start. */
export const unlockAudio = () => {
  const ctx = ensureContext();
  if (ctx?.state === 'suspended') void ctx.resume();
};

export const setVolume = (value: number) => {
  const ctx = ensureContext();
  const out = master;
  if (!ctx || !out) return;
  out.gain.setTargetAtTime(Math.max(0, Math.min(1, value)) * 0.7, ctx.currentTime, 0.01);
};

const playVoice = (voice: Voice, pitchJitter: boolean) => {
  const ctx = ensureContext();
  const out = master;
  if (!ctx || !out || !noiseBuffer) return;
  const now = ctx.currentTime;
  const jitter = pitchJitter ? 0.92 + Math.random() * 0.16 : 1;

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = voice.noiseHz * jitter;
  noiseFilter.Q.value = voice.noiseQ;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(voice.gain, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + voice.noiseDecay);
  noise.connect(noiseFilter).connect(noiseGain).connect(out);
  noise.start(now);
  noise.stop(now + voice.noiseDecay + 0.01);

  const body = ctx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(voice.bodyHz * jitter, now);
  body.frequency.exponentialRampToValueAtTime(voice.bodyHz * 0.55 * jitter, now + voice.bodyDecay);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(voice.gain * 0.55, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, now + voice.bodyDecay);
  body.connect(bodyGain).connect(out);
  body.start(now);
  body.stop(now + voice.bodyDecay + 0.01);
};

export const playKey = (profile: SoundProfile, enabled: boolean) => {
  if (!enabled || profile === 'off') return;
  const voice = VOICES[profile] ?? VOICES.tactile;
  playVoice(voice, true);
};

export const playKeyUp = (profile: SoundProfile, enabled: boolean) => {
  if (!enabled || profile === 'off') return;
  const voice = VOICES[profile] ?? VOICES.tactile;
  playVoice({ ...voice, gain: voice.gain * 0.32, noiseHz: voice.noiseHz * 0.82, bodyDecay: voice.bodyDecay * 0.7 }, true);
};

/** A short, soft error tone — deliberately not harsh. */
export const playError = (enabled: boolean) => {
  if (!enabled) return;
  const ctx = ensureContext();
  const out = master;
  if (!ctx || !out) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(190, now);
  osc.frequency.exponentialRampToValueAtTime(120, now + 0.14);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.16, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(gain).connect(out);
  osc.start(now);
  osc.stop(now + 0.18);
};

/** Two-note rising chime for completing an item / milestone. */
export const playSuccess = (enabled: boolean, base = 660) => {
  if (!enabled) return;
  const ctx = ensureContext();
  const out = master;
  if (!ctx || !out) return;
  const now = ctx.currentTime;
  [base, base * 1.5].forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    const start = now + index * 0.075;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.14, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + 0.34);
  });
};

export const playLevelUp = (enabled: boolean) => {
  if (!enabled) return;
  const ctx = ensureContext();
  const out = master;
  if (!ctx || !out) return;
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    const start = now + index * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.15, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + 0.46);
  });
};
