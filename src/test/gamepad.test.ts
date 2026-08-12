import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectedGamepadCount,
  forgetPadDevices,
  mapGamepadToInput,
  mergeInputs,
  readMenuState,
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
   * Two people in co-op keep the fighter they started with, across the whole
   * campaign.
   *
   * `startStage` used to release every slot on each stage and rebuild them,
   * and the rebuild preferred whichever pad had been touched most recently —
   * so the player who happened to be swinging at the moment the stage ended
   * took player one on the next one, and two people swapped characters.
   *
   * Held here without any reset at all, which is the point: the assignment is
   * meant to survive a stage now, so the only thing that may move a slot is a
   * pad genuinely leaving or dying.
   */
  it('does not swap two players when one of them stops moving', () => {
    let tick = 100;
    const both = (pressing: 0 | 1 | null) =>
      connect([
        pad({ index: 0, timestamp: ++tick, buttons: pressing === 0 ? { 2: true } : {} }),
        pad({ index: 1, timestamp: tick, buttons: pressing === 1 ? { 1: true } : {} }),
      ]);

    // Both people press something on the opening frame: index 0 is player one.
    connect([
      pad({ index: 0, timestamp: tick, buttons: { 2: true } }),
      pad({ index: 1, timestamp: tick, buttons: { 1: true } }),
    ]);
    readPlayerPads();

    // Then one of them fights for a long stretch while the other stands still.
    for (let i = 0; i < 300; i++) {
      both(1);
      readPlayerPads();
    }

    both(0);
    const pads = readPlayerPads();
    expect(pads.p1!.punch, 'player one is still the pad that started there').toBe(true);
    expect(pads.p2!.punch, 'and player two is still the other one').toBe(false);
  });

  /**
   * The same defect the per-stage reset used to paper over, now settled where
   * it happens: one person, two pads listed, only one of them ever touched.
   * No reset anywhere in this test.
   */
  it('takes player one off a pad nobody has ever touched', () => {
    const idle = (timestamp: number) => pad({ index: 0, timestamp });
    const used = (timestamp: number, pressing: boolean) =>
      pad({ index: 1, timestamp, buttons: pressing ? { 0: true } : {} });

    // Both listed from the start; the untouched one has the lower index and
    // claims player one on the opening frame.
    connect([idle(1), used(1, false)]);
    readPlayerPads();

    for (let frame = 2; frame <= 40; frame++) {
      connect([idle(frame), used(frame, frame > 20)]);
      readPlayerPads();
    }

    connect([idle(41), used(41, true)]);
    const pads = readPlayerPads();
    expect(pads.p1?.jump, 'the pad in someone\'s hands holds player one').toBe(true);
    expect(pads.p2?.jump ?? false, 'the untouched one does not').toBe(false);
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
    // Pressed once, then left alone. That opening press is what makes this a
    // resting player rather than a controller nobody has ever touched, and the
    // two are not the same case: a slot is only defended for a pad somebody
    // has actually used. Without it the test passed for an unrelated reason —
    // the challenger's frozen timestamp made it look like a phantom — and
    // would have gone on passing whatever the defence did.
    connect([pad({ index: 0, timestamp: tick, buttons: { 2: true } })]);
    readPlayerPads();

    // Holder keeps refreshing; a second pad is pressed but must not take over.
    let challengerTick = 500;
    for (let i = 0; i < 200; i++) {
      tick++;
      connect([
        pad({ index: 0, timestamp: tick }),
        pad({ index: 1, timestamp: ++challengerTick, buttons: { 0: true } }),
      ]);
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
 * DualSense under two indices carrying the same identity — one controller,
 * wireless only — and the phantom entry, having the lower index, took player
 * one on the opening frame without ever reporting anything. Why a browser
 * duplicates an entry is not something this project has established; an
 * earlier version of this comment asserted a cause (the pad also seen over its
 * cable) that was a guess and was wrong for the setup that reported the
 * defect. The real pad landed on
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

/**
 * A phantom frozen mid-direction.
 *
 * Reported from play: with one controller connected, the fighter would now and
 * then start walking one way on its own and stop answering the pad. The
 * browser lists that controller twice, and the phantom entry is a snapshot —
 * one taken while a direction was held stays held forever. Judged on contents
 * alone it looks like the most recently used pad on every single frame, so it
 * took player one, and the real controller could not answer: a pad resting in
 * someone's hands has nothing pushed over, so by that same test it read as
 * untouched.
 */
describe('a phantom frozen holding a direction', () => {
  const frozenLeft = () => pad({ index: 0, timestamp: 100, axes: [-1, 0] });

  it('does not take player one from the controller in someone\'s hands', () => {
    connect([frozenLeft(), pad({ index: 1, timestamp: 200 })]);
    readPlayerPads();
    connect([frozenLeft(), pad({ index: 1, timestamp: 216 })]);
    const pads = readPlayerPads();

    expect(pads.p1!.left, 'player one should not be walking on its own').toBe(false);
  });

  it('does not keep player one after the real pad blinks out and returns', () => {
    connect([frozenLeft(), pad({ index: 1, timestamp: 200 })]);
    readPlayerPads();

    // Bluetooth blinks: the live entry leaves the list for a frame.
    connect([frozenLeft()]);
    readPlayerPads();

    // It returns, and the player is holding nothing.
    for (const t of [216, 232, 248]) {
      connect([frozenLeft(), pad({ index: 1, timestamp: t })]);
      readPlayerPads();
    }
    const pads = readPlayerPads();

    expect(pads.p1!.left, 'the walk should stop once the pad is back').toBe(false);
  });

  it('still answers the real pad', () => {
    connect([frozenLeft(), pad({ index: 1, timestamp: 200 })]);
    readPlayerPads();
    connect([frozenLeft(), pad({ index: 1, timestamp: 216, axes: [1, 0] })]);
    const pads = readPlayerPads();

    expect(pads.p1!.right, 'player one reads the pad being pushed').toBe(true);
  });
});

/**
 * Reported from play: in the pause modal the d-pad went inert while confirm
 * still worked.
 *
 * That shape names the cause. The menus merge every listed pad rather than
 * reading an assigned slot, so the slot-level defence against a phantom does
 * not reach them; a phantom frozen mid-direction holds that direction true on
 * every frame; and the dispatcher fires on the false-to-true edge, so a
 * direction with no edge left cannot be pressed. A button is not a direction —
 * which is why confirm kept working, and why the fix has to be about the state
 * the menus read rather than about edges.
 */
describe('a frozen phantom does not hold a direction down in the menus', () => {
  const frozenHoldingDown = () => pad({ index: 0, timestamp: 100, axes: [0, 1] });
  const live = (timestamp: number) => pad({ index: 1, timestamp });

  const learnTheDevices = () => {
    // The record comes from readPlayerPads, which runs during a match; the
    // pause modal reads it rather than writing its own.
    for (const t of [200, 216, 232]) {
      connect([frozenHoldingDown(), live(t)]);
      readPlayerPads();
    }
  };

  it('leaves the direction free for the player to press', () => {
    learnTheDevices();
    // Nobody is touching anything. Without the filter the merged state reports
    // DOWN, and DOWN then has no edge left to give.
    expect(readMenuState().DOWN, 'nothing is held').toBe(false);
  });

  it('still reads the live pad', () => {
    learnTheDevices();
    connect([frozenHoldingDown(), pad({ index: 1, timestamp: 248, buttons: { 13: true } })]);
    expect(readMenuState().DOWN, 'the real pad presses down').toBe(true);
  });

  it('still reads a button on the live pad, which never broke', () => {
    learnTheDevices();
    connect([frozenHoldingDown(), pad({ index: 1, timestamp: 248, buttons: { 0: true } })]);
    expect(readMenuState().CONFIRM).toBe(true);
  });

  it('trusts every pad while nothing is known about them yet', () => {
    // Before any match has run there is no record, and a session that has only
    // ever seen the title screen has to stay drivable. Stated rather than left
    // implicit, because it is the limit of this defence.
    forgetPadDevices();
    connect([frozenHoldingDown(), live(200)]);
    expect(readMenuState().DOWN).toBe(true);
  });
});

/**
 * A duplicate that worked and then stopped.
 *
 * Reported from play, and the reason the first attempt at this did not hold:
 * the earlier filter asked whether an entry had *ever* changed, which catches a
 * copy that was born dead and misses one that ran for twenty minutes and then
 * froze. Measured before this rule existed — with the copy frozen from the
 * first frame the merged state read nothing, and with the copy frozen after a
 * while it read RIGHT with nobody touching anything.
 */
describe('a duplicate that froze after working', () => {
  // Same identity, which is what makes them a device and its copy rather than
  // two controllers. The synthetic pads carry an explicit id for that reason.
  const twin = (index: number, timestamp: number, axes = [0, 0]) => ({
    ...pad({ index, timestamp, axes }),
    id: 'DualSense Wireless Controller',
  }) as Gamepad;

  it('is trusted by the merged reader until a match has judged it', () => {
    // The merged reader has no record of its own — it reads the verdict the
    // match path writes. Before a session's first match there is none, so on
    // the title screen a stopped copy is still merged in. In a pause modal,
    // which is where this was reported, the match has been running and the
    // verdict is there.
    connect([twin(0, 5000, [1, 0]), twin(1, 7000)]);
    expect(readMenuState().RIGHT, 'no match has run, so nothing is known').toBe(true);
  });

  it('still counts while the two are keeping pace', () => {
    // Two controllers of the same model report the same id and are read a
    // fraction of a frame apart. Neither may be dropped.
    connect([twin(0, 6990, [1, 0]), twin(1, 7000)]);
    expect(readMenuState().RIGHT, 'a live pad pushing right').toBe(true);
  });

  it('leaves a lone controller alone, however old its clock', () => {
    // Nothing to fall behind. On a browser that only refreshes the clock on a
    // state change, a held direction sits on one value for as long as it is
    // held — and must keep working.
    connect([twin(0, 100, [1, 0])]);
    expect(readMenuState().RIGHT).toBe(true);
  });

  it('does not confuse two different controllers', () => {
    const other = { ...pad({ index: 1, timestamp: 9000 }), id: 'Xbox Wireless Controller' } as Gamepad;
    connect([twin(0, 100, [1, 0]), other]);
    expect(readMenuState().RIGHT, 'a different device is not a copy').toBe(true);
  });
});

/**
 * The duplicate that froze after working, on the path that decides who drives
 * the fighter.
 *
 * Reported from play. A browser lists one controller under two indices, one
 * copy stops being refreshed while the other goes on working, and frozen
 * mid-direction it reports that direction forever. What it cost the player is
 * everything, not merely a fighter that wanders: the copy holds player one, the
 * loop ORs the keyboard into that slot so the keyboard cannot cancel it either,
 * and the real pad sits on player two, which a solo game never reads.
 *
 * The rule that catches it asks which entry moved while the other stood still,
 * and never looks at `Gamepad.timestamp` — an earlier rule did, and since a
 * browser may refresh the two entries at different rates it could point at the
 * real pad instead. That shipped and cost the player their controller.
 */
describe('a duplicate that froze after working drives no fighter', () => {
  const ID = 'DualSense Wireless Controller';
  const twin = (index: number, timestamp: number, axes: number[] = [0, 0]) =>
    ({ ...pad({ index, timestamp, axes }), id: ID }) as Gamepad;
  const pressing = (index: number, timestamp: number) =>
    ({ ...pad({ index, timestamp, buttons: { 2: true } }), id: ID }) as Gamepad;

  const clock = (frame: number) => 1000 + frame * 16;

  /** Both entries mirror while the player pushes right; then one freezes. */
  function upToTheFreeze() {
    for (let frame = 0; frame < 40; frame++) {
      connect([twin(0, clock(frame), [1, 0]), twin(1, clock(frame), [1, 0])]);
      readPlayerPads();
    }
  }

  it('stops driving the fighter once the player has gone on playing', () => {
    upToTheFreeze();
    for (let frame = 40; frame < 400; frame++) {
      connect([
        twin(0, clock(39), [1, 0]),
        frame % 40 < 5 ? pressing(1, clock(frame)) : twin(1, clock(frame)),
      ]);
      readPlayerPads();
    }

    connect([twin(0, clock(39), [1, 0]), pressing(1, clock(999))]);
    const pads = readPlayerPads();
    expect(pads.p1!.right, 'the fighter is no longer walking on its own').toBe(false);
    expect(pads.p1!.punch, 'and the pad in the player\'s hands drives it').toBe(true);
  });

  it('frees the direction in a pause modal, which is where it was reported', () => {
    // The merged menu reader has no record of its own; it reads the verdict the
    // match path writes. By the time a pause modal is open a match has been
    // running, so the verdict is there — and without this the d-pad is inert in
    // the modal while confirm still works, because the dispatcher fires on the
    // false-to-true edge and a direction stuck true has no edge left to give.
    upToTheFreeze();
    for (let frame = 40; frame < 400; frame++) {
      connect([
        twin(0, clock(39), [1, 0]),
        frame % 40 < 5 ? pressing(1, clock(frame)) : twin(1, clock(frame)),
      ]);
      readPlayerPads();
    }

    connect([twin(0, clock(39), [1, 0]), twin(1, clock(999))]);
    expect(readMenuState().RIGHT, 'nobody is holding right').toBe(false);
  });

  it('is not talked out of it by a browser refreshing one entry a beat late', () => {
    // The two entries are exempted for the session once they have been seen
    // disagreeing while both had just moved — which is how two controllers of
    // the same model are told apart. A duplicate can fake a disagreeing frame
    // whenever the browser updates one entry before the other, so one such
    // frame must not be enough to buy the exemption.
    for (let frame = 0; frame < 200; frame++) {
      const behind = frame % 10 === 0;
      const shown: number[] = frame % 30 < 15 ? [1, 0] : [0, 0];
      const late: number[] = frame % 30 === 0 || frame % 30 === 15 ? [0, 0] : shown;
      connect([twin(0, clock(frame), shown), twin(1, clock(frame), behind ? late : shown)]);
      readPlayerPads();
    }

    for (let frame = 200; frame < 600; frame++) {
      connect([
        twin(0, clock(199), [1, 0]),
        frame % 40 < 5 ? pressing(1, clock(frame)) : twin(1, clock(frame)),
      ]);
      readPlayerPads();
    }

    connect([twin(0, clock(199), [1, 0]), pressing(1, clock(999))]);
    const pads = readPlayerPads();
    expect(pads.p1!.right, 'the copy is still caught').toBe(false);
    expect(pads.p1!.punch, 'and the real pad drives the fighter').toBe(true);
  });
});

/**
 * The guard the attempt above was missing, and the reason it was reverted.
 *
 * One controller, listed twice, and the two entries refreshed at different
 * rates — which is all it takes, since a browser may refresh one entry every
 * poll and another only when its state changes. Standing still for three
 * seconds then makes the *real* entry look like the outlived one. The reverted
 * rule demoted it to player two, which solo and buddy modes never read, and
 * the promotion pass had no route back once both entries were live again: the
 * controller was dead for the rest of the match.
 *
 * Nothing in the suite covered this. Every test written for that rule drove
 * the copy and the real pad at the same rate.
 */
describe('a controller listed twice never costs the player their controller', () => {
  const ID = 'DualSense Wireless Controller';
  const entry = (index: number, timestamp: number, punching = false) =>
    ({ ...pad({ index, timestamp, buttons: punching ? { 2: true } : {} }), id: ID }) as Gamepad;

  it('still answers a press after the player has stood still for four seconds', () => {
    let real = 1000;
    let other = 1000;

    for (let frame = 0; frame < 30; frame++) {
      real += 16;
      other += 16;
      connect([entry(0, real, true), entry(1, other, true)]);
      readPlayerPads();
    }

    // The player stops. The real entry's clock stops with them; the other
    // entry's keeps ticking.
    for (let frame = 0; frame < 240; frame++) {
      other += 16;
      connect([entry(0, real), entry(1, other)]);
      readPlayerPads();
    }

    real += 16;
    other += 16;
    connect([entry(0, real, true), entry(1, other)]);

    expect(readPlayerPads().p1?.punch, 'player one answers the press').toBe(true);
  });
  it('never mistakes the pad being held for the photograph', () => {
    // The case the reverted rule got backwards, and the reason the accusation
    // is "it moved while I stood still" rather than "its clock is newer".
    //
    // The player holds right and nothing else, so the real entry's controls sit
    // on one value — on a browser that refreshes a pad only when its state
    // changes, its clock sits still too. The other entry's clock ticks on. The
    // old rule read that and took the real pad for the dead one; this one
    // cannot, because the other entry's *controls* never moved, so it has
    // nothing to accuse anybody with.
    let real = 1000;
    let other = 1000;
    for (let frame = 0; frame < 60; frame++) {
      real += 16;
      other += 16;
      connect([entry(0, real, frame % 10 < 3), entry(1, other)]);
      readPlayerPads();
    }

    const holding = () =>
      ({ ...pad({ index: 0, timestamp: real, axes: [1, 0] }), id: ID }) as Gamepad;
    for (let frame = 0; frame < 300; frame++) {
      other += 16;
      connect([holding(), entry(1, other)]);
      readPlayerPads();
    }

    connect([holding(), entry(1, other)]);
    const pads = readPlayerPads();
    expect(pads.p1, 'the player still has a controller').not.toBeNull();
    expect(pads.p1!.right, 'and it still reports the direction they are holding').toBe(true);
  });

  it('leaves a second person holding a direction alone once both have played', () => {
    // Two controllers of the same model report the same identity, so one of
    // them standing still while the other plays looks from here exactly like a
    // copy. What separates them is that both have been seen moving at once,
    // showing different things — which one device listed twice never does.
    const busy = (timestamp: number, punching: boolean) =>
      ({ ...pad({ index: 0, timestamp, buttons: punching ? { 2: true } : {} }), id: ID }) as Gamepad;
    const walking = (timestamp: number, right: boolean) =>
      ({ ...pad({ index: 1, timestamp, axes: right ? [1, 0] : [0, 0] }), id: ID }) as Gamepad;

    const clock = (frame: number) => 1000 + frame * 16;
    for (let frame = 0; frame < 120; frame++) {
      connect([busy(clock(frame), frame % 6 < 3), walking(clock(frame), frame % 8 < 4)]);
      readPlayerPads();
    }

    // Then the second player holds right, dead steady, for four seconds.
    for (let frame = 120; frame < 400; frame++) {
      connect([busy(clock(frame), frame % 6 < 3), walking(clock(120), true)]);
      readPlayerPads();
    }
    const pads = readPlayerPads();

    expect(pads.p2, 'the second player still has a controller').not.toBeNull();
    expect(pads.p2!.right, 'and it still reports what they are holding').toBe(true);
  });

});

/**
 * The two readers running together.
 *
 * `readPlayerPads` counts the staleness window in its own calls, and
 * `readMenuState` polls on a separate animation frame. Every screen with a
 * modal over it runs both. The rule the match uses to spot a stopped copy now
 * leans on that window, so the window has to mean the same thing whether or
 * not the other reader is running — which is only true while `readMenuState`
 * stays read-only over the activity record.
 *
 * CLAUDE.md names this test as the thing to have before anyone gives the menu
 * reader a pen. The three tests that already guard the window exercise the
 * match path alone and would not see the interference.
 */
describe('the menu reader does not move the staleness window', () => {
  /**
   * The call at which the quiet holder loses player one to a pad being used.
   *
   * Same shape as the test above that pins call 181: pad 0 presses once and is
   * then left alone, pad 1 stays out of it, pad 2 is free and pressing. Punch
   * on player one is what says which of them is answering.
   */
  function callOfHandover(betweenCalls: () => void) {
    connect([
      pad({ index: 0, timestamp: 0, buttons: { 2: true } }),
      pad({ index: 1, timestamp: 5, buttons: { 2: true } }),
      pad({ index: 2, timestamp: 7, buttons: { 2: true } }),
    ]);
    readPlayerPads();

    for (let call = 2; call <= 400; call++) {
      connect([
        pad({ index: 0, timestamp: 0 }),
        pad({ index: 1, timestamp: 5, buttons: { 2: true } }),
        pad({ index: 2, timestamp: 7, buttons: { 2: true } }),
      ]);
      betweenCalls();
      const pads = readPlayerPads();
      if (pads.p1?.punch) return call;
    }
    return -1;
  }

  it('hands over on the same call with the menus polling in between', () => {
    const alone = callOfHandover(() => {});
    forgetPadDevices();
    const interleaved = callOfHandover(() => {
      readMenuState();
      readMenuState();
    });

    // Absolute, so neither number can be dragged along by the constant.
    expect(alone, 'the match path on its own').toBe(181);
    expect(interleaved, 'with the menu reader polling twice per frame').toBe(181);
  });
});
