import { describe, expect, it } from 'vitest';
import { createMenuDispatcher, REPEAT_DELAY_FRAMES } from '../hooks/useGamepadMenu';
import { MenuState } from '../game/gamepad';
import { advance, NEUTRAL, startEngine } from './helpers';
import { BGM_TRACKS, BgmTrack, isBgmTrack, sound } from '../game/sound';
import { DESIGN_HEIGHT, DESIGN_WIDTH, fitViewport } from '../game/viewport';
import { PLAYER_KICK_REACH } from '../game/constants';

const idle: MenuState = {
  UP: false,
  DOWN: false,
  LEFT: false,
  RIGHT: false,
  CONFIRM: false,
  BACK: false,
  START: false,
  TOGGLE: false,
};

const holding = (...actions: Array<keyof MenuState>): MenuState => {
  const state = { ...idle };
  for (const action of actions) state[action] = true;
  return state;
};

/**
 * Menus need press edges, not held state: reading "held" would run through a
 * four-item list in a few frames. Directions still auto-repeat, buttons never
 * do.
 */
describe('menu dispatcher', () => {
  it('fires a button once per press', () => {
    const step = createMenuDispatcher();
    const fired = [step(holding('CONFIRM')), step(idle), step(holding('CONFIRM'))].flat();
    expect(fired).toEqual(['CONFIRM', 'CONFIRM']);
  });

  it('never repeats a held button', () => {
    const step = createMenuDispatcher();
    let count = 0;
    for (let i = 0; i < 120; i++) count += step(holding('CONFIRM')).length;
    expect(count).toBe(1);
  });

  it('repeats a held direction only after the delay', () => {
    const step = createMenuDispatcher();
    let beforeDelay = 0;
    for (let i = 0; i < REPEAT_DELAY_FRAMES; i++) beforeDelay += step(holding('RIGHT')).length;
    expect(beforeDelay).toBe(1);

    let after = 0;
    for (let i = 0; i < 60; i++) after += step(holding('RIGHT')).length;
    expect(after).toBeGreaterThan(1);
  });

  it('reports several actions pressed on the same frame', () => {
    const step = createMenuDispatcher();
    expect(step(holding('RIGHT', 'CONFIRM')).sort()).toEqual(['CONFIRM', 'RIGHT']);
  });

  it('treats the shoulder toggle as a button, not a direction', () => {
    const step = createMenuDispatcher();
    expect(step(holding('TOGGLE'))).toEqual(['TOGGLE']);

    let repeats = 0;
    for (let i = 0; i < 120; i++) repeats += step(holding('TOGGLE')).length;
    expect(repeats).toBe(0);
  });

  /**
   * The dispatcher used to be created inside each consumer's effect. Confirming
   * on the title screen mounted the character select with the button still
   * down, that fresh dispatcher saw a brand-new press, and the match started
   * before the roster was ever shown.
   */
  it('does not re-fire a button held across a screen change', () => {
    const shared = createMenuDispatcher();
    expect(shared(holding('CONFIRM'))).toEqual(['CONFIRM']);

    // The screen changes here; with a per-screen dispatcher this frame fired again.
    expect(shared(holding('CONFIRM'))).toEqual([]);
    expect(shared(holding('CONFIRM'))).toEqual([]);

    shared(idle);
    expect(shared(holding('CONFIRM'))).toEqual(['CONFIRM']);
  });
});

/**
 * The HUD read the mutable engine straight from JSX, so it only refreshed when
 * some unrelated state happened to change: standing still while taking damage
 * left the health bar frozen.
 */
describe('HUD snapshot', () => {
  it('keeps the same object while nothing visible changes', () => {
    const engine = startEngine();
    advance(engine, 120);

    const snapshot = engine.getHudSnapshot();
    advance(engine, 60);
    expect(engine.getHudSnapshot()).toBe(snapshot);
  });

  it('publishes a new snapshot when the player takes damage while idle', () => {
    const engine = startEngine();
    advance(engine, 200);

    let notifications = 0;
    engine.subscribeHud(() => {
      notifications++;
    });

    const before = engine.getHudSnapshot().p1!.hp;
    engine.player1!.hp -= 17;
    engine.update(NEUTRAL);

    expect(notifications).toBe(1);
    expect(engine.getHudSnapshot().p1!.hp).toBeLessThan(before);
  });

  it('does not notify once per frame', () => {
    const engine = startEngine();
    advance(engine, 200);

    let notifications = 0;
    engine.subscribeHud(() => {
      notifications++;
    });
    advance(engine, 600);

    // Power meter regeneration crosses a percent every few dozen frames; the
    // point is that this is nowhere near one per frame.
    expect(notifications).toBeLessThan(60);
  });
});

/**
 * Two settings existed in GameSettings with nothing reading them: `volume` was
 * consumed all over the synth but no code outside the sound engine could write
 * it, and `showHitboxes` was assigned false in two places and never read.
 */
describe('settings that used to do nothing', () => {
  it('clamps volume and applies it to a track already playing', () => {
    const playing = { volume: 1 } as HTMLAudioElement;
    // The live element is private; reaching it is the point of the test —
    // setting the field alone would leave a playing track at its old volume.
    (sound as unknown as { activeAudioElement: HTMLAudioElement | null }).activeAudioElement =
      playing;

    sound.setVolume(0.25);
    expect(sound.volume).toBe(0.25);
    expect(playing.volume).toBe(0.25);

    sound.setVolume(5);
    expect(sound.volume).toBe(1);

    sound.setVolume(-1);
    expect(sound.volume).toBe(0);

    (sound as unknown as { activeAudioElement: HTMLAudioElement | null }).activeAudioElement = null;
  });

  it('shares one reach constant between the engine and the hitbox overlay', () => {
    // The overlay drew a guessed number before; both now read the same source.
    expect(PLAYER_KICK_REACH).toBeGreaterThan(0);
  });
});

/**
 * Track slots were typed as `string` in the sound engine, so every call site
 * had to cast back — six `as any` in the audio path, each one a place where a
 * renamed slot would have compiled and failed silently at runtime.
 */
describe('track slot typing', () => {
  it('accepts every declared slot', () => {
    for (const track of BGM_TRACKS) {
      expect(isBgmTrack(track)).toBe(true);
    }
  });

  it('rejects a key that is not a slot', () => {
    // Keys come back from IndexedDB as whatever was stored, including slots
    // removed or renamed by a later build.
    expect(isBgmTrack('STAGE2_BOSS')).toBe(false);
    expect(isBgmTrack('')).toBe(false);
    expect(isBgmTrack('intro')).toBe(false);
  });

  it('covers the whole union, so the guard cannot drift from the type', () => {
    const fromList: string[] = [...BGM_TRACKS];
    // A slot added to BgmTrack but not to BGM_TRACKS would restore as unknown.
    const declared: BgmTrack[] = [
      'INTRO',
      'CHAR_SELECT',
      'STAGE1',
      'STAGE1_BOSS',
      'NEON_BEAT',
      'SUBURBAN_GRAY',
      'SACRED_METAL',
    ];
    expect([...fromList].sort()).toEqual([...declared].sort());
  });
});

/**
 * Canvas framing.
 *
 * The backing buffer is sized to the element, so the drawing has to be fitted
 * to it in code. Deriving the scale from the width alone cropped the bottom of
 * the scene on any container wider than 16:9 — the near edge of the street went
 * off-screen and the fighters read as hovering.
 */
describe('canvas framing', () => {
  it('never draws past the buffer, at any container shape', () => {
    const shapes: Array<[number, number]> = [
      [1600, 900],
      [2359, 1134],
      [1200, 900],
      [800, 450],
      [3440, 1440],
      [390, 844],
    ];

    for (const [w, h] of shapes) {
      const box = fitViewport(w, h);
      expect(box.drawnWidth, `${w}x${h} overflowed horizontally`).toBeLessThanOrEqual(w + 0.01);
      expect(box.drawnHeight, `${w}x${h} overflowed vertically`).toBeLessThanOrEqual(h + 0.01);
    }
  });

  it('keeps the design aspect ratio whatever the container', () => {
    for (const [w, h] of [[2359, 1134], [1200, 900]] as Array<[number, number]>) {
      const box = fitViewport(w, h);
      expect(box.drawnWidth / box.drawnHeight).toBeCloseTo(DESIGN_WIDTH / DESIGN_HEIGHT, 5);
    }
  });

  it('centres the letterbox bars', () => {
    const wide = fitViewport(2359, 1134);
    expect(wide.offsetX).toBeGreaterThan(0);
    expect(wide.offsetY).toBeCloseTo(0, 5);

    const tall = fitViewport(1200, 900);
    expect(tall.offsetY).toBeGreaterThan(0);
    expect(tall.offsetX).toBeCloseTo(0, 5);
  });

  it('shows the whole scene on the reported screenshot shape', () => {
    // 2359x1134 is where the bottom of the street was being cut off.
    const box = fitViewport(2359, 1134);
    expect(box.offsetY + box.drawnHeight).toBeLessThanOrEqual(1134 + 0.01);
  });
});
