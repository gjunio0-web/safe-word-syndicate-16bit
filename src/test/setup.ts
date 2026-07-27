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
