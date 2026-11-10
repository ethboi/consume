// Sound for the site, made in the browser with Web Audio: no audio files.
//
// It is off until the visitor switches it on in the top bar, and the choice is
// remembered. On means two things: short sounds when something happens (a
// feeding swallowed, a Bond sealed, coins collected, a seal broken, $CONSUME
// burned) and a quiet tune in the Dorian mode over a drone, plucked like a lute.
//
// Nothing here runs on the server, and nothing makes a sound before a click:
// browsers only let a page start audio from one.

export type Effect = "swallow" | "bond" | "crack" | "burn" | "refuse";

const KEY = "consume:sound";

let on = false;
let restored = false;
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let effects: GainNode | null = null;
let music: GainNode | null = null;
let noise: AudioBuffer | null = null;
const listeners = new Set<() => void>();

// ---------------------------------------------------------------- the switch

function restore() {
  if (restored || typeof window === "undefined") return;
  restored = true;
  try {
    on = window.localStorage.getItem(KEY) === "on";
  } catch {
    on = false; // storage can be blocked; the switch still works for this visit
  }
  if (on) {
    // chosen on an earlier visit: audio may only start from a click or a key, so wait for one
    // (a finger only counts when it lifts, so listen for the end of a touch as well as a press)
    const gestures = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
    const done = () => gestures.forEach((g) => window.removeEventListener(g, wake));
    const wake = () => {
      if (!on || ctx?.state === "running") return done();
      if (!ctx) start(false);
      void ctx?.resume().then(done);
    };
    gestures.forEach((g) => window.addEventListener(g, wake));
  }
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else if (on) void ctx.resume();
  });
}

/** Whether the visitor has sound switched on. */
export function soundOn(): boolean {
  restore();
  return on;
}

/** For useSyncExternalStore. */
export function subscribeSound(listener: () => void): () => void {
  restore();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Switch sound on or off. Call it from a click, or the browser will not let audio start. */
export function setSound(next: boolean) {
  restore();
  on = next;
  try {
    window.localStorage.setItem(KEY, next ? "on" : "off");
  } catch {
    // not remembered, then
  }
  if (next) start(true);
  else stop();
  listeners.forEach((l) => l());
}

function start(greet: boolean) {
  if (typeof window === "undefined" || typeof window.AudioContext === "undefined") return;
  if (!ctx) {
    ctx = new AudioContext();
    const squash = ctx.createDynamicsCompressor();
    squash.connect(ctx.destination);
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(squash);
    effects = ctx.createGain();
    effects.gain.value = 0.9;
    effects.connect(master);
    music = ctx.createGain();
    music.gain.value = 0.42;
    music.connect(master);
    // one second of white noise, shared by every hiss, thud and crackle
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  void ctx.resume();
  if (greet && effects) {
    const t = ctx.currentTime + 0.02;
    [293.66, 440, 587.33].forEach((f, i) => pluck(effects!, f, t + i * 0.09, 0.9, 0.22));
  }
  startMusic();
}

function stop() {
  stopMusic();
  const c = ctx;
  // let the tune fade before the clock stops
  if (!c) return;
  window.setTimeout(() => {
    if (!on) void c.suspend();
  }, 900);
}

// ---------------------------------------------------------------- instruments

/** A plucked string: bright at the start, dark and gone soon after. */
function pluck(to: AudioNode, freq: number, t: number, dur: number, vol: number) {
  if (!ctx) return;
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = freq;
  const edge = ctx.createOscillator();
  edge.type = "sawtooth";
  edge.frequency.value = freq;
  const edgeVol = ctx.createGain();
  edgeVol.gain.value = 0.28;
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.setValueAtTime(Math.min(7000, freq * 7), t);
  tone.frequency.exponentialRampToValueAtTime(Math.max(260, freq * 1.4), t + dur * 0.55);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(vol, t + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  body.connect(tone);
  edge.connect(edgeVol).connect(tone);
  tone.connect(amp).connect(to);
  body.start(t);
  edge.start(t);
  body.stop(t + dur + 0.05);
  edge.stop(t + dur + 0.05);
}

/** A breathy pipe that joins the tune every other time through. */
function pipe(to: AudioNode, freq: number, t: number, dur: number, vol: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.value = freq;
  const wobble = ctx.createOscillator();
  wobble.frequency.value = 5.2;
  const depth = ctx.createGain();
  depth.gain.value = freq * 0.006;
  wobble.connect(depth).connect(o.frequency);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.linearRampToValueAtTime(vol, t + 0.05);
  amp.gain.setValueAtTime(vol, t + Math.max(0.06, dur - 0.08));
  amp.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(amp).connect(to);
  o.start(t);
  wobble.start(t);
  o.stop(t + dur + 0.02);
  wobble.stop(t + dur + 0.02);
}

/** A burst of filtered noise. */
function hiss(to: AudioNode, t: number, dur: number, vol: number, kind: BiquadFilterType, from: number, toFreq = from, q = 0.7) {
  if (!ctx || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = kind;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  if (toFreq !== from) f.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 4));
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(amp).connect(to);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

/** A sine that slides from one pitch to another: thuds, gulps and bells. */
function slide(to: AudioNode, t: number, from: number, toFreq: number, dur: number, vol: number, attack = 0.005) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(from, t);
  if (toFreq !== from) o.frequency.exponentialRampToValueAtTime(toFreq, t + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(vol, t + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(amp).connect(to);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function clink(to: AudioNode, t: number, vol: number) {
  const f = 2500 + Math.random() * 1500;
  slide(to, t, f, f, 0.1 + Math.random() * 0.06, vol, 0.002);
  slide(to, t, f * 1.47, f * 1.47, 0.07, vol * 0.6, 0.002);
  hiss(to, t, 0.015, vol * 0.5, "highpass", 6000);
}

// ---------------------------------------------------------------- what happens

function ready(): AudioNode | null {
  // a sound for something that happened while the tab was away would arrive late and alone
  if (!on || !ctx || !effects || ctx.state !== "running" || document.hidden) return null;
  return effects;
}

/** Play the sound for something that just happened. Silent unless sound is on. */
export function play(effect: Effect) {
  const to = ready();
  if (!to || !ctx) return;
  const t = ctx.currentTime + 0.02;
  if (effect === "swallow") {
    // two gulps going down, and the belly's answer
    for (const [at, scale, vol] of [
      [0, 1, 0.6],
      [0.46, 0.8, 0.4],
    ]) {
      slide(to, t + at, 150 * scale, 390 * scale, 0.07, vol, 0.02);
      slide(to, t + at + 0.06, 390 * scale, 52 * scale, 0.36, vol, 0.01);
    }
    hiss(to, t + 0.1, 0.9, 0.16, "lowpass", 220, 90);
  } else if (effect === "bond") {
    // the seal pressed into the wax, then a bell
    slide(to, t, 150, 44, 0.18, 0.8);
    hiss(to, t, 0.06, 0.3, "lowpass", 1400);
    const bell = 587.33;
    (
      [
        [1, 0.3, 1.8],
        [2, 0.14, 1.3],
        [2.76, 0.1, 0.9],
        [5.4, 0.05, 0.5],
      ] as const
    ).forEach(([ratio, vol, dur]) => slide(to, t + 0.14, bell * ratio, bell * ratio, dur, vol, 0.004));
  } else if (effect === "crack") {
    // wax snapping, twice
    hiss(to, t, 0.06, 0.55, "highpass", 1800);
    slide(to, t, 240, 80, 0.09, 0.5);
    hiss(to, t + 0.08, 0.04, 0.3, "highpass", 2600);
    hiss(to, t + 0.1, 0.35, 0.12, "bandpass", 900, 300, 1.2);
  } else if (effect === "burn") {
    // $CONSUME going up, with a few sparks, then the memecoins set down
    hiss(to, t, 1.2, 0.34, "bandpass", 380, 3200, 0.8);
    hiss(to, t, 1.3, 0.12, "lowpass", 300, 120);
    for (let i = 0; i < 9; i++) hiss(to, t + 0.1 + Math.random() * 1.0, 0.02, 0.2 + Math.random() * 0.2, "highpass", 3000 + Math.random() * 3000);
    coins(5, 0.13, 1.15);
  } else if (effect === "refuse") {
    // a low door, shut
    slide(to, t, 123.47, 110, 0.2, 0.5);
    slide(to, t + 0.2, 87.31, 73.42, 0.4, 0.55);
    hiss(to, t + 0.2, 0.08, 0.2, "lowpass", 500);
  }
}

/** `count` coins landing one after another, `gap` seconds apart, the first after `delay` seconds. */
export function coins(count: number, gap: number, delay = 0) {
  const to = ready();
  if (!to || !ctx) return;
  const t = ctx.currentTime + 0.02 + delay;
  for (let i = 0; i < count; i++) clink(to, t + i * gap, 0.13);
}

// ---------------------------------------------------------------- the tune

// D Dorian, six quavers to the bar. Each bar is a list of [note, length in quavers].
const NOTE: Record<string, number> = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
};
const TUNE: [string, number][][] = [
  [["D4", 2], ["A4", 1], ["A4", 2], ["G4", 1]],
  [["F4", 2], ["E4", 1], ["D4", 3]],
  [["F4", 2], ["G4", 1], ["A4", 2], ["C5", 1]],
  [["B4", 2], ["G4", 1], ["A4", 3]],
  [["D5", 2], ["C5", 1], ["A4", 2], ["G4", 1]],
  [["F4", 2], ["G4", 1], ["A4", 3]],
  [["G4", 2], ["F4", 1], ["E4", 2], ["C4", 1]],
  [["D4", 6]],
  [["A4", 2], ["D5", 1], ["D5", 2], ["E5", 1]],
  [["F5", 2], ["E5", 1], ["D5", 3]],
  [["C5", 2], ["D5", 1], ["C5", 2], ["A4", 1]],
  [["B4", 2], ["A4", 1], ["G4", 3]],
  [["A4", 2], ["C5", 1], ["B4", 2], ["G4", 1]],
  [["A4", 2], ["F4", 1], ["D4", 3]],
  [["E4", 2], ["F4", 1], ["G4", 2], ["E4", 1]],
  [["D4", 6]],
];
const QUAVER = 0.27; // seconds
const BAR = 6;
/** What starts on each quaver of the loop: a frequency and how long it is held, or nothing. */
const STEPS: ([number, number] | null)[] = TUNE.flatMap((bar) => {
  const steps: ([number, number] | null)[] = Array.from({ length: BAR }, () => null);
  let at = 0;
  for (const [name, length] of bar) {
    steps[at] = [NOTE[name], length];
    at += length;
  }
  return steps;
});

let drone: { stop: (t: number) => void } | null = null;
let ticker: number | null = null;
let step = 0;
let pass = 0;
let due = 0;

function startMusic() {
  if (!ctx || !music || ticker !== null) return;
  const c = ctx;
  const to = music;

  // the drone: a fifth held under everything, like a hurdy-gurdy's open strings
  const dark = c.createBiquadFilter();
  dark.type = "lowpass";
  dark.frequency.value = 520;
  const swell = c.createGain();
  swell.gain.setValueAtTime(0.0001, c.currentTime);
  swell.gain.exponentialRampToValueAtTime(0.11, c.currentTime + 2.5);
  dark.connect(swell).connect(to);
  const strings = [73.42, 110.0, 146.83].map((f, i) => {
    const o = c.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = f;
    o.detune.value = i === 1 ? 4 : -3;
    const g = c.createGain();
    g.gain.value = i === 2 ? 0.35 : 0.8;
    o.connect(g).connect(dark);
    o.start();
    return o;
  });
  drone = {
    stop: (t) => {
      swell.gain.cancelScheduledValues(t);
      swell.gain.setValueAtTime(Math.max(0.0001, swell.gain.value), t);
      swell.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
      strings.forEach((o) => o.stop(t + 0.75));
    },
  };

  step = 0;
  pass = 0;
  due = c.currentTime + 1.2;
  ticker = window.setInterval(() => {
    if (c.state !== "running") return;
    // after a stall, pick the tune up from now instead of playing the missed notes at once
    if (due < c.currentTime) due = c.currentTime + 0.05;
    while (due < c.currentTime + 0.4) {
      const inBar = step % BAR;
      const note = STEPS[step];
      if (note) {
        const [freq, length] = note;
        pluck(to, freq, due, Math.max(0.5, length * QUAVER * 1.6), 0.24);
        if (pass % 2 === 1) pipe(to, freq * 2, due, length * QUAVER * 0.95, 0.045);
      }
      // the lower strings and a small drum mark the two beats of the bar
      if (inBar === 0) {
        pluck(to, 146.83, due, 1.2, 0.2);
        slide(to, due, 110, 62, 0.16, 0.3);
      } else if (inBar === 3) {
        pluck(to, 220.0, due, 0.9, 0.11);
        slide(to, due, 96, 60, 0.1, 0.13);
      }
      step += 1;
      if (step === STEPS.length) {
        step = 0;
        pass += 1;
      }
      due += QUAVER;
    }
  }, 110);
}

function stopMusic() {
  if (ticker !== null) {
    window.clearInterval(ticker);
    ticker = null;
  }
  if (ctx && drone) drone.stop(ctx.currentTime);
  drone = null;
}
