import { beforeEach } from 'vitest';

/**
 * Browser stubs for the test environment.
 *
 * The game engine is plain TypeScript, but importing it pulls in the sound
 * module, which reaches for Web Audio, HTMLAudioElement and IndexedDB at
 * construction. Tests run under `node` rather than jsdom: the surface actually
 * needed is small, and stubbing it explicitly keeps the suite fast and makes
 * the dependency visible instead of hidden behind a DOM emulator.
 */

const noop = () => {};

/** Any AudioParam-shaped object. Every method is a no-op, every read is 0. */
const audioParam = () => new Proxy({ value: 0 }, { get: (t, k) => (k in t ? (t as never)[k] : noop) });

/** Any AudioNode-shaped object. */
const audioNode = (): unknown =>
  new Proxy({} as Record<string, unknown>, {
    get(target, key) {
      if (['frequency', 'gain', 'pan', 'Q', 'detune'].includes(key as string)) {
        target[key as string] ??= audioParam();
        return target[key as string];
      }
      return target[key as string] ?? noop;
    },
    set(target, key, value) {
      target[key as string] = value;
      return true;
    },
  });

class StubAudioContext {
  state = 'running';
  currentTime = 0;
  sampleRate = 44100;
  destination = audioNode();
  createGain = audioNode;
  createOscillator = audioNode;
  createBufferSource = audioNode;
  createBiquadFilter = audioNode;
  createStereoPanner = audioNode;
  createDynamicsCompressor = audioNode;
  createBuffer = () => ({ getChannelData: () => new Float32Array(1) });
  suspend = () => Promise.resolve();
  resume = () => Promise.resolve();
}

class StubAudio {
  paused = true;
  loop = false;
  volume = 1;
  currentTime = 0;
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

const listeners: Record<string, Array<() => void>> = {};

Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    AudioContext: StubAudioContext,
    addEventListener: (type: string, fn: () => void) => {
      (listeners[type] ??= []).push(fn);
    },
    removeEventListener: (type: string, fn: () => void) => {
      listeners[type] = (listeners[type] ?? []).filter((f) => f !== fn);
    },
    /** Test helper: fire a window event, used to exercise the audio unlock. */
    dispatchStub: (type: string) => (listeners[type] ?? []).slice().forEach((f) => f()),
    setInterval: () => 0,
    clearInterval: noop,
  },
});

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { hidden: false, visibilityState: 'visible', addEventListener: noop },
});

/**
 * The sprite renderer preloads portraits at module load, guarded only by
 * `typeof window !== 'undefined'` — and the stub window above satisfies that.
 * `complete: false` keeps the cut-in from trying to draw an image that has no
 * pixels behind it.
 */
class StubImage {
  src = '';
  complete = false;
  width = 0;
  height = 0;
}

Object.defineProperty(globalThis, 'Image', { configurable: true, value: StubImage });
Object.defineProperty(globalThis, 'Audio', { configurable: true, value: StubAudio });
Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: undefined });
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  value: () => Promise.reject(new Error('no network in tests')),
});

/**
 * gamepad.ts polls the connection count on a raw `requestAnimationFrame` (a
 * bare global reference, not `window.requestAnimationFrame`), as a fallback
 * for the unreliable `gamepaddisconnected` event. A timer-based stand-in is
 * enough to exercise that fallback under a fake timer without a real
 * animation loop.
 */
Object.defineProperty(globalThis, 'requestAnimationFrame', {
  configurable: true,
  writable: true,
  value: (cb: FrameRequestCallback) => setTimeout(() => cb(0), 16) as unknown as number,
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
  configurable: true,
  writable: true,
  value: (id: number) => clearTimeout(id),
});

/**
 * A deterministic Math.random, reset before every test.
 *
 * The engine draws from Math.random in sixteen places — enemy attack rolls,
 * boss cast chance, item drops, hit spark offsets. Math.random is one global
 * stream shared by the whole process, so a test's draws depend on how many
 * draws every test before it happened to consume. Change the order, add a
 * test, and a value that was 0.8 becomes 0.02.
 *
 * That is not theoretical here. engine.test.ts documents a case where the
 * enemy's own attack roll occasionally fired mid-measurement and broke an
 * assertion — failing only in full-suite runs, never in isolation, which is
 * the fingerprint of shared stream position rather than a real bug. The
 * workaround at the time was to pin the enemy's stunTimer every frame so its
 * AI could never run; that pinning is still there and still earns its place,
 * for the separate reason that the measurement should not depend on enemy AI
 * at all. (No assertion was ever widened for this — worth saying, so nobody
 * goes looking for a loose one to tighten.)
 *
 * Reseeding before each test makes every test start from the same point in
 * the same sequence, so what ran before it stops mattering. Draws still vary
 * *within* a test, which is what any test exercising a probability needs.
 *
 * Two things to know before touching this:
 *
 * Nothing restores the real Math.random afterwards — the override holds for
 * the whole test process. Harmless today, since no test reads Math.random
 * directly. A test that genuinely needs entropy has to restore it itself.
 *
 * The first draw of every test is always 0.242970881, and one threshold in
 * the engine sits close to it: `Math.random() < 0.25` at engine.ts:1205,
 * clearing by 0.007. Changing the seed can flip that branch. It is the right
 * branch to be fragile — all it does is spawn the "SHE'S NOT THE ENEMY"
 * text particle when the player strikes the hostage, altering no state and
 * decided by no test. The other four thresholds clear by 0.15 to 0.26. This
 * seed has also been checked against seven others with the suite green on
 * every one, so nothing here passes because of the sequence it happens to
 * get.
 *
 * Deliberately not the alternative: threading a random source through the
 * GameEngine constructor would be the tidier design, but it means touching
 * sixteen call sites in the most central file in the codebase to fix an
 * instability that has never been reproduced on demand. That door stays open —
 * if the engine ever needs controllable randomness in production, for replays
 * or for a seeded run, this can be replaced by it rather than fighting it.
 *
 * mulberry32: small, fast, and good enough for deciding whether a grunt swings.
 * Not for anything that needs real entropy, which nothing here does.
 */
const RANDOM_SEED = 0x5afe;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeEach(() => {
  const next = mulberry32(RANDOM_SEED);
  Object.defineProperty(Math, 'random', { configurable: true, writable: true, value: next });
});
