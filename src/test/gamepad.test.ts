import { afterEach, describe, expect, it } from 'vitest';
import {
  mapGamepadToInput,
  mergeInputs,
  readPlayerPads,
  resetPadAssignments,
} from '../game/gamepad';
import { NEUTRAL } from './helpers';

/** A standard-mapping pad with every control at rest. */
function pad(over: { index?: number; buttons?: Record<number, boolean | number>; axes?: number[] } = {}) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
  for (const [index, state] of Object.entries(over.buttons ?? {})) {
    buttons[Number(index)] =
      typeof state === 'number'
        ? { pressed: false, value: state, touched: false }
        : { pressed: true, value: 1, touched: true };
  }
  return {
    index: over.index ?? 0,
    connected: true,
    mapping: 'standard',
    buttons,
    axes: over.axes ?? [0, 0],
  } as unknown as Gamepad;
}

/** Names of the inputs currently held, for readable assertions. */
const held = (g: Gamepad) =>
  Object.entries(mapGamepadToInput(g))
    .filter(([, on]) => on)
    .map(([name]) => name)
    .sort();

function connect(pads: Gamepad[]) {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { getGamepads: () => pads },
  });
}

afterEach(() => {
  resetPadAssignments();
  connect([]);
});

describe('gamepad mapping', () => {
  it('reads the d-pad', () => {
    expect(held(pad({ buttons: { 14: true } }))).toEqual(['left']);
    expect(held(pad({ buttons: { 15: true, 12: true } }))).toEqual(['right', 'up']);
  });

  it('reads the left stick past the dead zone', () => {
    expect(held(pad({ axes: [-0.9, 0] }))).toEqual(['left']);
    expect(held(pad({ axes: [0.7, -0.7] }))).toEqual(['right', 'up']);
  });

  it('ignores stick drift inside the dead zone', () => {
    expect(held(pad({ axes: [0.3, 0.3] }))).toEqual([]);
    expect(held(pad({ axes: [0.5, 0] }))).toEqual(['right']);
  });

  it('maps face buttons to beat em up conventions', () => {
    expect(held(pad({ buttons: { 0: true } }))).toEqual(['jump']);
    expect(held(pad({ buttons: { 2: true } }))).toEqual(['punch']);
    expect(held(pad({ buttons: { 1: true } }))).toEqual(['kick']);
    expect(held(pad({ buttons: { 3: true } }))).toEqual(['special']);
  });

  it('treats an analog trigger as pressed past its threshold', () => {
    expect(held(pad({ buttons: { 5: 0.8 } }))).toEqual(['special']);
    expect(held(pad({ buttons: { 5: 0.2 } }))).toEqual([]);
  });

  it('never reports grab, which has no implementation', () => {
    expect(held(pad({ buttons: { 4: true, 6: true } }))).toEqual([]);
  });

  it('merges keyboard and pad without either cancelling the other', () => {
    const keyboard = { ...NEUTRAL, right: true };
    const controller = mapGamepadToInput(pad({ buttons: { 2: true }, axes: [-1, 0] }));
    const merged = mergeInputs(keyboard, controller);

    expect(merged.right).toBe(true);
    expect(merged.left).toBe(true);
    expect(merged.punch).toBe(true);
    expect(mergeInputs(keyboard, null)).toEqual(keyboard);
  });
});

/**
 * Assignment used to be recomputed each frame from the length of
 * `navigator.getGamepads()`. That list is volatile — a pad is announced only
 * after its first button press, idle devices are dropped, and some controllers
 * register twice — so every flip silently swapped which fighter each person
 * was driving.
 */
describe('player assignment', () => {
  it('gives the first pad to player two in co-op, leaving the keyboard on P1', () => {
    connect([pad({ index: 0 })]);
    const pads = readPlayerPads(true);
    expect(pads.p1).toBeNull();
    expect(pads.p2).not.toBeNull();
  });

  it('gives the first pad to player one outside co-op', () => {
    connect([pad({ index: 3 })]);
    const pads = readPlayerPads(false);
    expect(pads.p1).not.toBeNull();
    expect(pads.p2).toBeNull();
  });

  it('keeps the slot when a pad drops out for a frame and returns', () => {
    connect([pad({ index: 0 })]);
    readPlayerPads(true);

    connect([]);
    readPlayerPads(true);

    connect([pad({ index: 0 })]);
    const pads = readPlayerPads(true);
    expect(pads.p1).toBeNull();
    expect(pads.p2).not.toBeNull();
  });

  it('does not let a second device steal the slot already held', () => {
    connect([pad({ index: 0 })]);
    readPlayerPads(true);

    connect([pad({ index: 0 }), pad({ index: 1 })]);
    const pads = readPlayerPads(true);
    expect(pads.p2).not.toBeNull();
  });

  it('releases slots between matches', () => {
    connect([pad({ index: 0 })]);
    readPlayerPads(true);
    resetPadAssignments();

    const pads = readPlayerPads(false);
    expect(pads.p1).not.toBeNull();
  });
});
