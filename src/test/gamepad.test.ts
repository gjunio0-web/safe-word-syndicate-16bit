import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectedGamepadCount,
  forgetPadDevices,
  mapGamepadToInput,
  mergeInputs,
  readPlayerPads,
  resetPadAssignments,
  subscribeGamepadConnection,
} from '../game/gamepad';
import { NEUTRAL } from './helpers';

/** A standard-mapping pad with every control at rest. */
function pad(
  over: {
    index?: number;
    buttons?: Record<number, boolean | number>;
    axes?: number[];
    timestamp?: number;
  } = {}
) {
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
    timestamp: over.timestamp ?? 0,
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

// The game keeps what it knows about the devices across a match; a test has to
// start from a machine no controller has ever been plugged into, or one case's
// idea of which pad is a phantom leaks into the next.
afterEach(() => {
  forgetPadDevices();
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
  it('gives the first pad to player one, in co-op as anywhere else', () => {
    // Co-op used to invert this and hand the first pad to player two, so the
    // keyboard kept player one. That read well with one pad and badly with
    // two: whoever switched on first ended up on the fighter to the left.
    connect([pad({ index: 3 })]);
    const pads = readPlayerPads();
    expect(pads.p1).not.toBeNull();
    expect(pads.p2).toBeNull();
  });

  it('gives the second pad to player two, whatever the indices are', () => {
    connect([pad({ index: 3, buttons: { 0: true } }), pad({ index: 7, buttons: { 1: true } })]);
    const pads = readPlayerPads();
    // Lower index first: index 3 pressed jump, index 7 pressed kick.
    expect(pads.p1!.jump).toBe(true);
    expect(pads.p2!.kick).toBe(true);
  });

  it('keeps the slot when a pad drops out for a frame and returns', () => {
    connect([pad({ index: 0 })]);
    readPlayerPads();

    connect([]);
    readPlayerPads();

    connect([pad({ index: 0 })]);
    const pads = readPlayerPads();
    expect(pads.p1).not.toBeNull();
  });

  it('does not let a second device steal the slot already held', () => {
    connect([pad({ index: 0 })]);
    readPlayerPads();

    connect([pad({ index: 0 }), pad({ index: 1 })]);
    const pads = readPlayerPads();
    expect(pads.p1).not.toBeNull();
  });

  it('releases slots between matches', () => {
    connect([pad({ index: 0 })]);
    readPlayerPads();
    resetPadAssignments();

    const pads = readPlayerPads();
    expect(pads.p1).not.toBeNull();
  });

  /**
   * Reported from play: the menus were driven and the fighter picked with one
   * controller, and in the match the other controller moved the character.
   *
   * Both pads are listed the whole time; only one of them is ever touched. The
   * assignment used to be built in browser order, which says nothing about
   * which device is in somebody's hands, and the match's reset threw away the
   * one thing that did — the record of what had just been pressed.
   *
   * The two pads are deliberately given the *same* timestamp behaviour here:
   * the idle one is as alive as the used one by every measure except having
   * been touched. Distinguishing them by staleness or by `everChanged` is not
   * enough, and a version of this that leant on either would pass while the
   * player kept losing their controller.
   */
  it('hands player one to the pad that was being used, not to the lowest index', () => {
    const idle = (timestamp: number) => pad({ index: 0, timestamp });
    const used = (timestamp: number, pressing: boolean) =>
      pad({ index: 1, timestamp, buttons: pressing ? { 0: true } : {} });

    // Character select: index 1 walks the roster and confirms.
    for (let frame = 1; frame <= 40; frame++) {
      connect([idle(frame), used(frame, frame > 20)]);
      readPlayerPads();
    }

    // The match begins. Slots are released and the button is already back up.
    resetPadAssignments();
    connect([idle(41), used(41, false)]);

    const pads = readPlayerPads();
    expect(pads.p1, 'the pad that chose the fighter should drive it').not.toBeNull();

    // Named rather than inferred: only index 1 is pressing on this frame.
    connect([idle(42), used(42, true)]);
    expect(readPlayerPads().p1?.jump, 'player one reads the used pad').toBe(true);
    expect(readPlayerPads().p2?.jump ?? false, 'player two is not the used pad').toBe(false);
  });
});

/**
 * `gamepaddisconnected` does not reliably fire — a Bluetooth pad going out of
 * range in particular often updates `Gamepad.connected` without the browser
 * ever dispatching the event. The connection badge relied on that event
 * alone, so it kept reporting a pad as connected indefinitely after a silent
 * disconnect, while input handling elsewhere (which polls every frame) had
 * already stopped reading it. subscribeGamepadConnection now falls back to
 * polling the count itself.
 */
describe('connection change detection', () => {
  it('notifies on a silent disconnect that never fires the browser event', () => {
    vi.useFakeTimers();
    try {
      connect([pad({ index: 0 })]);
      expect(connectedGamepadCount()).toBe(1);

      let notifications = 0;
      const unsubscribe = subscribeGamepadConnection(() => {
        notifications++;
      });

      // Gamepad goes away with no 'gamepaddisconnected' event -- only the
      // polling fallback can catch this.
      connect([]);
      vi.advanceTimersByTime(100);

      expect(connectedGamepadCount()).toBe(0);
      expect(notifications).toBeGreaterThan(0);

      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling once the last listener unsubscribes', () => {
    vi.useFakeTimers();
    try {
      connect([pad({ index: 0 })]);
      const unsubscribe = subscribeGamepadConnection(() => {});
      unsubscribe();

      // No pending timers left running in the background after the last
      // unsubscribe -- a leaked poll loop would keep scheduling one.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * A wireless controller that is switched off — rather than unpaired — often
 * stays in `navigator.getGamepads()` with `connected` still true. The slot it
 * held was never released, so a replacement pad plugged in afterwards could
 * not reach the fighter that pad had been driving.
 */
describe('recovering a slot from a dead controller', () => {
  /** Advances enough frames for a pad with a frozen timestamp to go stale. */
  const idle = (frames: number) => {
    for (let i = 0; i < frames; i++) readPlayerPads();
  };

  it('hands the slot to a pad being used when the holder has gone quiet', () => {
    const dead = pad({ index: 0, timestamp: 100 });
    connect([dead]);
    readPlayerPads();

    // Switched off: still listed, still "connected", timestamp frozen.
    idle(200);

    // A replacement is plugged in and the player presses a button.
    connect([dead, pad({ index: 1, timestamp: 500, buttons: { 0: true } })]);
    const pads = readPlayerPads();

    expect(pads.p1).not.toBeNull();
    expect(pads.p1!.jump).toBe(true);
  });

  it('leaves a resting controller alone when nothing is competing for it', () => {
    // Firefox only advances `timestamp` on state change, so an untouched live
    // pad looks exactly like a dead one. It must not lose its slot for that.
    connect([pad({ index: 0, timestamp: 100 })]);
    readPlayerPads();
    idle(400);

    connect([pad({ index: 0, timestamp: 100, buttons: { 2: true } })]);
    const pads = readPlayerPads();
    expect(pads.p1).not.toBeNull();
    expect(pads.p1!.punch).toBe(true);
  });

  it('does not steal a slot from a holder that is still reporting', () => {
    let tick = 100;
    connect([pad({ index: 0, timestamp: tick })]);
    readPlayerPads();

    // Holder keeps refreshing; a second pad is pressed but must not take over.
    for (let i = 0; i < 200; i++) {
      tick++;
      connect([pad({ index: 0, timestamp: tick }), pad({ index: 1, timestamp: 1, buttons: { 0: true } })]);
      readPlayerPads();
    }

    const pads = readPlayerPads();
    expect(pads.p1).not.toBeNull();
    expect(pads.p1!.jump).toBe(false);
    // The live second pad takes the free slot instead of the occupied one.
    expect(pads.p2).not.toBeNull();
  });

  it('ignores a replacement that is present but untouched', () => {
    // The two pads are told apart by their input: the dead one is frozen
    // mid-punch, the replacement is at rest. Asserting on the resulting input
    // is what proves which of them the slot still points at.
    const dead = () => pad({ index: 0, timestamp: 100, buttons: { 2: true } });
    connect([dead()]);
    readPlayerPads();
    idle(200);

    connect([dead(), pad({ index: 1, timestamp: 900 })]);
    const pads = readPlayerPads();

    // Nothing was pressed on the replacement, so nothing claims: the game does
    // not guess which controller the player picked up.
    expect(pads.p1).not.toBeNull();
    expect(pads.p1!.punch).toBe(true);
  });
});

/**
 * Slot assignment when a pad leaves and returns.
 *
 * A returning pad and a replacement pad look alike from here and need opposite
 * outcomes: the first belongs back in its own slot, the second belongs in the
 * slot the dead controller is still holding. An earlier version filled free
 * slots before considering hand-over, and a one-frame Bluetooth dropout then
 * cost the *other* player their controller.
 */
describe('slot assignment under signal loss', () => {
  const held = (index: number, ts: number, punching = false) =>
    pad({ index, timestamp: ts, buttons: punching ? { 2: true } : {} });

  it('gives a returning pad its own slot back, not the other player\'s', () => {
    connect([held(0, 100), held(1, 100)]);
    readPlayerPads();

    // Player two rests; their pad's timestamp stops advancing.
    let tick = 100;
    for (let i = 0; i < 200; i++) {
      tick++;
      connect([held(0, tick, true), held(1, 100)]);
      readPlayerPads();
    }

    // Player one's pad drops for a frame, then returns mid-press.
    connect([held(1, 100)]);
    readPlayerPads();
    connect([held(0, ++tick, true), held(1, 100)]);
    const pads = readPlayerPads();

    expect(pads.p1, 'the returning pad should be back on player one').not.toBeNull();
    expect(pads.p1!.punch).toBe(true);
    expect(pads.p2, 'the resting player should keep their controller').not.toBeNull();
  });

  it('still lets a replacement take over from a pad that died', () => {
    connect([held(0, 100)]);
    readPlayerPads();
    for (let i = 0; i < 200; i++) readPlayerPads();

    connect([held(0, 100), held(1, 900, true)]);
    const pads = readPlayerPads();
    expect(pads.p1!.punch).toBe(true);
  });
});

/**
 * The staleness window is counted in calls to readPlayerPads, not in wall
 * time — STALE_AFTER_FRAMES = 180 in gamepad.ts is only "three seconds" if
 * the call site fires once per simulated step, roughly 60 times a second.
 *
 * This pins that fact from the outside, without importing the private
 * counter: call readPlayerPads a known number of times and check the slot
 * hand-over fires at exactly that count, not before or after. If a future
 * change moves the call site to fire at a different rate — once per video
 * frame instead of once per step, for instance — the call count needed to
 * reproduce three seconds of real time changes, and whoever made that change
 * needs to see this fail rather than silently shorten the window.
 */
describe('the staleness window is counted in calls', () => {
  it('hands over a slot at exactly call 181, not before and not later', () => {
    // Three controllers: pad 0 holds P1 and goes idle, pad 1 holds P2 and
    // stays out of this, pad 2 is free and pressing something the whole
    // time — the only kind of pad the hand-over logic will ever move into an
    // abandoned slot, since a pad already holding P2 never re-enters that
    // check.
    //
    // Pad 0 presses once, on the opening call, and is then left alone. That
    // press is what makes it the holder of P1: free slots go to whichever
    // unclaimed pad was touched most recently, so a pad that had never been
    // touched would not be holding a slot for this test to take away.
    connect([
      pad({ index: 0, timestamp: 0, buttons: { 2: true } }),
      pad({ index: 1, timestamp: 5, buttons: { 2: true } }),
      pad({ index: 2, timestamp: 7, buttons: { 2: true } }),
    ]);

    let calls = 0;
    let result = readPlayerPads();
    calls++;

    connect([
      pad({ index: 0, timestamp: 0 }),
      pad({ index: 1, timestamp: 5, buttons: { 2: true } }),
      pad({ index: 2, timestamp: 7, buttons: { 2: true } }),
    ]);

    do {
      result = readPlayerPads();
      calls++;
    } while (calls < 180);

    expect(result.p1, `still holding the slot at call ${calls}`).not.toBeNull();
    // Pad 0 presses nothing, pad 2 presses punch, so `punch` is what says
    // which of the two is answering for P1. The line above passes either way
    // — the slot stays non-null right through the hand-over — and pins
    // nothing on its own: a shortened window, the direction this whole test
    // exists to catch, would slip by unnoticed without this.
    expect(result.p1?.punch, `pad 0 still holds P1 at call ${calls}`).toBe(false);

    result = readPlayerPads();
    calls++;
    expect(calls).toBe(181);
    expect(result.p1, `handed over at call ${calls}`).not.toBeNull();
    // Confirms it is specifically the free, pressed pad that took over, not
    // merely that a slot is non-null for some other reason.
    expect(result.p1?.punch).toBe(true);
  });
});

/**
 * One controller listed twice.
 *
 * Reported from play: the pad worked on the title screen, worked well enough
 * to start a match, and then did nothing in the fight. The browser listed a
 * DualSense under two indices — paired over Bluetooth and also seen over its
 * cable — and the phantom entry, having the lower index, took player one on
 * the opening frame without ever reporting anything. The real pad landed on
 * player two and could never move: the only route into an occupied slot needs
 * the candidate to be unassigned, and it was not.
 *
 * The menus hid it, because `readMenuState` merges every listed pad and a dead
 * entry costs nothing there.
 */
describe('a phantom entry never keeps a slot from a real pad', () => {
  /** A frozen phantom at index 0 and a live pad at index 1, both listed. */
  const listBoth = (liveTimestamp: number, pressed: boolean) =>
    connect([
      pad({ index: 0, timestamp: 100 }),
      pad({ index: 1, timestamp: liveTimestamp, buttons: pressed ? { 0: true } : {} }),
    ]);

  it('gives player one to the pad that is actually reporting', () => {
    listBoth(500, false);
    readPlayerPads();

    // The player presses jump. Only the live entry's data moves.
    listBoth(516, true);
    const pads = readPlayerPads();

    expect(pads.p1).not.toBeNull();
    expect(pads.p1!.jump).toBe(true);
  });

  it('does not strand the real pad on the second slot', () => {
    listBoth(500, false);
    readPlayerPads();
    listBoth(516, true);
    listBoth(532, true);
    const pads = readPlayerPads();

    // Whatever else is true, the phantom must not be the one player one reads.
    expect(pads.p1).not.toEqual(NEUTRAL);
  });

  it('leaves two genuine pads where they are', () => {
    // Both entries report. Neither is a phantom, so nobody is evicted and the
    // lower index keeps player one — a resting player must never lose their
    // slot to the other person.
    connect([pad({ index: 0, timestamp: 100 }), pad({ index: 1, timestamp: 100 })]);
    readPlayerPads();
    connect([
      pad({ index: 0, timestamp: 116, buttons: { 1: true } }),
      pad({ index: 1, timestamp: 116, buttons: { 0: true } }),
    ]);
    const pads = readPlayerPads();

    expect(pads.p1!.kick).toBe(true);
    expect(pads.p1!.jump).toBe(false);
    expect(pads.p2!.jump).toBe(true);
  });
});
