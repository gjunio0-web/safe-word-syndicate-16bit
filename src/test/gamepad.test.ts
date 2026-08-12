import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  connectedGamepadCount,
  forgetPadDevices,
  mapGamepadToInput,
  mergeInputs,
  readMenuState,
  readPlayerMenuStates,
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

  it('stops contributing once it falls a second behind its twin', () => {
    // The copy stopped at 5000 while the live one has reached 7000.
    connect([twin(0, 5000, [1, 0]), twin(1, 7000)]);
    expect(readMenuState().RIGHT, 'a stopped copy holds nothing').toBe(false);
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
 * The same duplicate, on the path that decides who drives the fighter.
 *
 * Reported from play, twice. The first fix filtered the merged menu reader, so
 * the pause modal stopped holding a direction down — and the fighter went on
 * walking, because the match reads an assigned slot rather than the merged
 * state and nothing in that path could see the copy. `everChanged` cannot: the
 * copy worked for a whole stage before it froze.
 */
describe('a duplicate that froze after working drives no fighter', () => {
  const ID = 'DualSense Wireless Controller';
  const twin = (index: number, timestamp: number, axes: number[] = [0, 0]) =>
    ({ ...pad({ index, timestamp, axes }), id: ID }) as Gamepad;

  /** Runs match frames, connecting whatever the builder returns for each. */
  function run(frames: number, build: (frame: number) => Gamepad[]) {
    let last: ReturnType<typeof readPlayerPads> | undefined;
    for (let frame = 0; frame < frames; frame++) {
      connect(build(frame));
      last = readPlayerPads();
    }
    return last!;
  }

  /**
   * One controller listed twice. Both entries mirror each other while the
   * player pushes right, then the copy stops being refreshed still showing it.
   */
  const CLOCK = (frame: number) => 1000 + frame * 16;
  const MIRROR_FRAMES = 40;
  const frozenAt = CLOCK(MIRROR_FRAMES - 1);

  function upToTheFreeze() {
    run(MIRROR_FRAMES, (frame) => [
      twin(0, CLOCK(frame), [1, 0]),
      twin(1, CLOCK(frame), [1, 0]),
    ]);
  }

  it('stops driving the fighter, and does so within the staleness window', () => {
    upToTheFreeze();

    // The player let go. The live entry says so; the copy is a photograph of
    // the moment it stopped and says right forever.
    let stopped = -1;
    for (let frame = MIRROR_FRAMES; frame < MIRROR_FRAMES + 400; frame++) {
      connect([twin(0, frozenAt, [1, 0]), twin(1, CLOCK(frame))]);
      const pads = readPlayerPads();
      if (!pads.p1!.right) {
        stopped = frame - MIRROR_FRAMES;
        break;
      }
    }

    // An absolute count, not `STALE_AFTER_FRAMES`: an assertion written in
    // terms of the constant it guards cannot fail when the constant moves.
    //
    // 179 rather than 180 because the copy's last refresh is the final mirror
    // frame, which is the frame before the first frozen one — the window is
    // counted from the last change, not from the first frame it was missed on.
    // Measured, not derived: the first draft of this assertion said 180 and
    // was wrong by exactly that frame.
    expect(stopped, 'frames of walking on its own after the copy froze').toBe(179);
  });

  it('hands player one to the entry that is still reporting', () => {
    upToTheFreeze();
    run(200, (frame) => [twin(0, frozenAt, [1, 0]), twin(1, CLOCK(MIRROR_FRAMES + frame))]);

    connect([twin(0, frozenAt, [1, 0]), twin(1, CLOCK(999), [0, 0])]);
    const pads = readPlayerPads();
    expect(pads.p1, 'the live entry drives player one').not.toBeNull();
    expect(pads.p1!.right, 'and it is not walking').toBe(false);
  });

  it('drives neither fighter, not just the one it was holding', () => {
    // Moving the copy off player one is only half of it. Demoted, it lands on
    // player two — which co-op reads, so the second fighter would walk instead
    // of the first. Written after a mutation that removed the refusal to read
    // an outlived entry and left every other test in this block green.
    upToTheFreeze();
    run(200, (frame) => [twin(0, frozenAt, [1, 0]), twin(1, CLOCK(MIRROR_FRAMES + frame))]);

    connect([twin(0, frozenAt, [1, 0]), twin(1, CLOCK(999))]);
    const pads = readPlayerPads();
    expect(pads.p1!.right, 'player one is not walking').toBe(false);
    expect(pads.p2, 'and player two has nothing driving it either').toBeNull();
  });

  it('keeps the copy out of the character select cursors as well', () => {
    // That screen reads one slot per player instead of merging every pad, so
    // the merged-reader filter never reaches it. A copy frozen on a direction
    // would hold that player's cursor against a direction they cannot press.
    const frozenDown = (timestamp: number) =>
      ({ ...pad({ index: 0, timestamp, axes: [0, 1] }), id: ID }) as Gamepad;

    run(MIRROR_FRAMES, (frame) => [frozenDown(CLOCK(frame)), twin(1, CLOCK(frame), [0, 1])]);
    run(200, (frame) => [frozenDown(frozenAt), twin(1, CLOCK(MIRROR_FRAMES + frame))]);

    connect([frozenDown(frozenAt), twin(1, CLOCK(999))]);
    const states = readPlayerMenuStates();
    expect(states.p1?.DOWN, 'the live entry is not pushing down').toBe(false);
    expect(states.p2, 'and the copy holds no cursor at all').toBeNull();
  });

  it('reads the live entry on player one rather than merely silencing the copy', () => {
    upToTheFreeze();
    run(200, (frame) => [twin(0, frozenAt, [1, 0]), twin(1, CLOCK(MIRROR_FRAMES + frame))]);

    connect([
      twin(0, frozenAt, [1, 0]),
      { ...pad({ index: 1, timestamp: CLOCK(999), buttons: { 2: true } }), id: ID } as Gamepad,
    ]);
    expect(readPlayerPads().p1!.punch, 'the pad in the player\'s hands').toBe(true);
  });

  it('leaves a lone controller alone, however long its clock has been still', () => {
    // Nothing to be outlived by. On a browser that only refreshes a pad's
    // clock when its state changes, a direction held steady sits on one value
    // for as long as it is held, and must keep working.
    run(400, () => [twin(0, 5000, [1, 0])]);
    expect(readPlayerPads().p1!.right).toBe(true);
  });

  it('never treats entries the browser gives no identity as copies of each other', () => {
    // The same freeze, on pads the browser named nothing. `everChanged` must
    // not catch these either, so they mirror each other first — a born-dead
    // entry is a different rule and would hide this one.
    run(MIRROR_FRAMES, (frame) => [
      pad({ index: 0, timestamp: CLOCK(frame), axes: [1, 0] }),
      pad({ index: 1, timestamp: CLOCK(frame), axes: [1, 0] }),
    ]);
    run(400, (frame) => [
      pad({ index: 0, timestamp: frozenAt, axes: [1, 0] }),
      pad({ index: 1, timestamp: CLOCK(MIRROR_FRAMES + frame) }),
    ]);

    expect(readPlayerPads().p1!.right, 'no identity, no claim about copies').toBe(true);
  });
});

/**
 * The other half of the same rule, and the reason it needs evidence rather than
 * staleness alone.
 *
 * Two controllers of the same model report the same `id`. Read only as
 * "identity plus a stale clock", the rule above would take the second player's
 * controller away three seconds after they stopped moving it — which on a
 * browser that refreshes a pad's clock only when its state changes is what
 * standing still looks like. That is the defect class this file has already
 * fixed twice, so the rule waits for proof that the two entries are two
 * devices: they disagree, which a device listed twice never does.
 */
describe('two controllers of the same model are not copies', () => {
  const ID = 'DualSense Wireless Controller';
  const same = (index: number, timestamp: number, axes: number[] = [0, 0]) =>
    ({ ...pad({ index, timestamp, axes }), id: ID }) as Gamepad;

  const CLOCK = (frame: number) => 1000 + frame * 16;
  const PLAYING_FRAMES = 30;

  /** Both pads in use, doing different things — which is the proof. */
  function bothPlaying() {
    for (let frame = 0; frame < PLAYING_FRAMES; frame++) {
      connect([same(0, CLOCK(frame), [1, 0]), same(1, CLOCK(frame))]);
      readPlayerPads();
    }
  }

  it('keeps reading a pad that has gone quiet while the other plays on', () => {
    bothPlaying();

    // Player two now holds right and nothing else. Their clock stops.
    const still = CLOCK(PLAYING_FRAMES);
    for (let frame = PLAYING_FRAMES; frame < PLAYING_FRAMES + 400; frame++) {
      connect([same(0, CLOCK(frame), [1, 0]), same(1, still, [1, 0])]);
      readPlayerPads();
    }
    const pads = readPlayerPads();

    expect(pads.p2, 'the second player still has a controller').not.toBeNull();
    expect(pads.p2!.right, 'and it still reports what they are holding').toBe(true);
  });

  it('does not trade the two players their fighters', () => {
    bothPlaying();
    const still = CLOCK(PLAYING_FRAMES);
    for (let frame = PLAYING_FRAMES; frame < PLAYING_FRAMES + 400; frame++) {
      connect([same(0, CLOCK(frame), [1, 0]), same(1, still, [1, 0])]);
      readPlayerPads();
    }

    // Player one presses punch; it has to arrive on player one.
    connect([
      { ...pad({ index: 0, timestamp: CLOCK(999), buttons: { 2: true } }), id: ID } as Gamepad,
      same(1, still, [1, 0]),
    ]);
    const pads = readPlayerPads();
    expect(pads.p1!.punch, 'player one still holds the pad they have been using').toBe(true);
    expect(pads.p2!.punch, 'and it did not arrive on player two').toBe(false);
  });

  it('does not accept a single frame of skew as proof of two devices', () => {
    // A browser can refresh one entry a frame before the other, so a duplicate
    // disagrees with itself for one frame at every press and release. Counting
    // those up would eventually reach any total; only an unbroken run counts.
    // One device, both entries showing the same held direction, except that
    // every twentieth frame the second entry has not caught up yet.
    //
    // Long enough that the skewed frames outnumber the threshold several times
    // over: 400 frames give 20 of them against a threshold of 12. A shorter
    // stretch let a mutation that counted them cumulatively survive.
    for (let frame = 0; frame < 400; frame++) {
      const behind = frame % 20 === 0;
      connect([same(0, CLOCK(frame), [1, 0]), same(1, CLOCK(frame), behind ? [0, 0] : [1, 0])]);
      readPlayerPads();
    }

    const still = CLOCK(399);
    for (let frame = 400; frame < 800; frame++) {
      connect([same(0, still, [1, 0]), same(1, CLOCK(frame))]);
      readPlayerPads();
    }
    const pads = readPlayerPads();

    expect(pads.p1, 'the live entry still drives player one').not.toBeNull();
    expect(pads.p1!.right, 'a frame of skew is not a second device').toBe(false);
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
