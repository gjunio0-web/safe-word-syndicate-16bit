import { describe, expect, it } from 'vitest';
import { createMenuDispatcher, REPEAT_DELAY_FRAMES } from '../hooks/useGamepadMenu';
import { MenuState } from '../game/gamepad';
import { advance, NEUTRAL, startEngine } from './helpers';

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
