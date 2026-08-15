import { afterEach, describe, expect, it, vi } from 'vitest';
import { sound } from '../game/sound';

/**
 * The opening screen must not play the chiptune while the file list is still
 * in flight.
 *
 * Reported from play: the music over the attract screen was not from the
 * soundtrack. It was the built-in synth, which is the fallback for "no file was
 * supplied for this slot" — and it was also, wrongly, the answer to "the list
 * of files has not arrived yet". The attract screen is the only place that
 * shows: it is the first screen to ask for music, 1400ms after the page loads,
 * while the manifest is still on the wire. Every later screen asks long after
 * the list has landed.
 *
 * The engine is a singleton built at import, so its catalogue state is driven
 * here through the same private-field casts the rest of the suite uses.
 */

interface EngineInnards {
  catalogueReady: Promise<void>;
  customTrackUrls: Record<string, string>;
  activeAudioElement: HTMLAudioElement | null;
  bgmInterval: ReturnType<typeof setInterval> | null;
  hasUserGesture: boolean;
  playbackToken: number;
}

const innards = () => sound as unknown as EngineInnards;

/** Puts the engine back where a fresh page would: list not yet arrived. */
function catalogueInFlight() {
  const engine = innards();
  sound.stopBgm();
  engine.customTrackUrls = {};
  engine.activeAudioElement = null;
  engine.bgmInterval = null;
  // The synth refuses to start without one, and this test is about what the
  // engine chooses to play, not about the browser's audio lock.
  engine.hasUserGesture = true;

  let settle: () => void = () => {};
  engine.catalogueReady = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return {
    /** The manifest lands, carrying a file for the slot or not. */
    arrive: async (file?: string) => {
      if (file) engine.customTrackUrls.INTRO = file;
      settle();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

const playingFile = () => {
  const el = innards().activeAudioElement;
  return el ? el.src : null;
};
const playingSynth = () => innards().bgmInterval !== null;

afterEach(() => {
  vi.useRealTimers();
  sound.stopBgm();
  innards().catalogueReady = Promise.resolve();
});

describe('a track request waits for the file list before falling back', () => {
  it('stays silent while the list is in flight, rather than starting the synth', async () => {
    catalogueInFlight();

    sound.playBgm('INTRO');
    await Promise.resolve();

    expect(playingSynth(), 'the chiptune is not the answer to "not yet"').toBe(false);
    expect(playingFile(), 'and there is nothing to play yet either').toBeNull();
  });

  it('plays the file the moment the list brings one', async () => {
    const manifest = catalogueInFlight();
    sound.playBgm('INTRO');

    await manifest.arrive('/audio/Last_Coin_Standing.ogg');

    expect(playingFile()).toContain('Last_Coin_Standing.ogg');
    expect(playingSynth(), 'and the chiptune never played at all').toBe(false);
  });

  it('falls back to the synth once the list has arrived without one', async () => {
    const manifest = catalogueInFlight();
    sound.playBgm('INTRO');

    await manifest.arrive();

    expect(playingSynth(), 'no file for this slot is what the synth is for').toBe(true);
  });

  it('gives up waiting after three seconds and plays something', async () => {
    vi.useFakeTimers();
    catalogueInFlight();
    sound.playBgm('INTRO');

    await vi.advanceTimersByTimeAsync(2900);
    expect(playingSynth(), 'still waiting at 2.9s').toBe(false);

    await vi.advanceTimersByTimeAsync(200);
    // An absolute figure, not the constant it guards: the manifest's own retry
    // ladder spans six seconds, and holding the opening screen silent for all
    // of it is the failure this bound exists to prevent.
    expect(playingSynth(), 'and playing by 3.1s').toBe(true);
  });

  it('does not call the catalogue settled before the manifest has answered', async () => {
    // The wait above is only worth anything if "settled" means the list really
    // answered. Fired and forgotten instead of awaited, the flag flips on the
    // first tick and every request goes straight to the synth again — which is
    // the defect, wearing the fix's clothes.
    const original = globalThis.fetch;
    let answer: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      answer = resolve;
    });
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      value: () =>
        held.then(() => ({ ok: true, json: () => Promise.resolve({ files: [] }) })),
    });

    let settled = false;
    const restoring = (
      sound as unknown as { restorePersistedTracks(): Promise<void> }
    ).restorePersistedTracks().then(() => {
      settled = true;
    });

    for (let tick = 0; tick < 8; tick++) await Promise.resolve();
    expect(settled, 'the manifest has not answered yet').toBe(false);

    answer();
    await restoring;
    expect(settled, 'and it has now').toBe(true);

    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: original });
  });

  it('stays quiet if the cutscene took over while it was waiting', async () => {
    // Entering the intro cutscene calls stopBgm, which bumps the playback
    // token. A list that lands after that must not start the title theme on
    // top of the cutscene's own music — a real, audible overlap of two songs.
    const manifest = catalogueInFlight();
    sound.playBgm('INTRO');

    sound.stopBgm();
    await manifest.arrive('/audio/Last_Coin_Standing.ogg');

    expect(playingFile()).toBeNull();
    expect(playingSynth()).toBe(false);
  });
});
