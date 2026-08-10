import { describe, expect, it } from 'vitest';
import {
  menuReadersFor,
  modeEntry,
  secondFighterFor,
  secondPlayerInputFor,
  secondSlotIsHuman,
} from '../game/modes';
import { mergeInputs } from '../game/gamepad';
import { NEUTRAL } from './helpers';
import { GameMode } from '../types';

/**
 * Who fills the second slot.
 *
 * Reported from play: picking 1P after a match with the AI buddy started the
 * new game with the buddy anyway. The selection screen passes
 * `selectedP2 || undefined` and SINGLE makes that `undefined`, which is the
 * same value the caller used to read as "not overridden, keep what you had".
 * Two meanings, one value, and the previous match's companion won.
 */
describe('the second slot follows the mode, not the leftovers', () => {
  it('leaves it empty in a solo game, whatever was picked before', () => {
    expect(secondFighterFor('SINGLE', 'FUN_MAKER')).toBeUndefined();
    expect(secondFighterFor('SINGLE', undefined)).toBeUndefined();
  });

  it('keeps the companion in an AI game', () => {
    expect(secondFighterFor('AI_COMPANION', 'FUN_MAKER')).toBe('FUN_MAKER');
  });

  it('keeps the second player in co-op', () => {
    expect(secondFighterFor('COOP', 'ANGRY_CORSO')).toBe('ANGRY_CORSO');
  });

  /**
   * Found while verifying an unrelated fix: entering the buddy mode with the
   * controller started a solo match. The mode buttons filled the second slot
   * with a default and moved the cursor onto it; the pad's up and down did
   * neither, and the slot box draws a portrait even when nothing is chosen, so
   * the screen showed a companion that was never passed to the engine.
   */
  describe('changing mode settles the second slot the same way, however it is changed', () => {
    it('fills an empty second slot for the modes that have one', () => {
      // Named characters rather than "not undefined": an empty slot is exactly
      // what the defect produced, and `toBeDefined` would also accept a mode
      // that filled it with the wrong fighter.
      expect(modeEntry('AI_COMPANION', undefined).secondFighter).toBe('FUN_MAKER');
      expect(modeEntry('COOP', undefined).secondFighter).toBe('OMEGA_BIKER');
    });

    it('never overwrites a fighter the player already chose', () => {
      expect(modeEntry('AI_COMPANION', 'ANGRY_CORSO').secondFighter).toBe('ANGRY_CORSO');
      expect(modeEntry('COOP', 'ANGRY_CORSO').secondFighter).toBe('ANGRY_CORSO');
    });

    it('empties the slot and takes the cursor back for a solo game', () => {
      expect(modeEntry('SINGLE', 'ANGRY_CORSO')).toEqual({
        secondFighter: undefined,
        cursor: 'P1',
      });
    });

    it('puts the cursor on the slot the player has just been given', () => {
      expect(modeEntry('AI_COMPANION', undefined).cursor).toBe('P2');
      expect(modeEntry('COOP', undefined).cursor).toBe('P2');
    });

    it('agrees with the rule the engine reads, so the screen cannot promise a fighter it does not pass', () => {
      // The two used to disagree: the screen drew a companion while
      // `secondFighterFor` was handed `undefined` and returned nothing. Pinning
      // them against each other is what makes that state unreachable.
      for (const mode of ['SINGLE', 'AI_COMPANION', 'COOP'] as GameMode[]) {
        const entry = modeEntry(mode, undefined);
        expect(secondFighterFor(mode, entry.secondFighter), mode).toBe(entry.secondFighter);
      }
    });
  });

  it('marks the slot human only in co-op', () => {
    expect(secondSlotIsHuman('COOP')).toBe(true);
    expect(secondSlotIsHuman('AI_COMPANION')).toBe(false);
    expect(secondSlotIsHuman('SINGLE')).toBe(false);
  });
});

/**
 * Which menu reader the character select screen runs.
 *
 * Reported from play: the controller went dead the moment the roster appeared.
 * The screen ran two independent conditions — shared cursor below two pads,
 * per-player cursor at two pads in a two-player mode — and the pair left a
 * hole exactly where the screen opens. Two pads plus the default solo mode
 * matched neither, so nothing read the controller, and the only way out of
 * solo was a stick press nothing was reading.
 */
describe('the character select screen always has a live reader', () => {
  const MODES: GameMode[] = ['SINGLE', 'AI_COMPANION', 'COOP'];

  it('never leaves a combination unread, and never runs both at once', () => {
    for (const mode of MODES) {
      for (let padCount = 0; padCount <= 4; padCount++) {
        const plan = menuReadersFor(padCount, mode);
        expect(
          [plan.shared, plan.perPlayer].filter(Boolean),
          `padCount ${padCount}, mode ${mode}`
        ).toHaveLength(1);
      }
    }
  });

  it('keeps one cursor whenever one person is choosing, however many pads are listed', () => {
    // The reported failure, stated directly: a DualSense listed twice by the
    // browser puts padCount at 2 with one person holding one controller. The
    // buddy mode is the same situation — one person picking both fighters —
    // and an earlier version of this rule asked "not solo" and split their
    // cursor in two, costing them the shoulder-button slot switch.
    for (const padCount of [0, 1, 2, 4]) {
      expect(menuReadersFor(padCount, 'SINGLE').shared, `solo, ${padCount}`).toBe(true);
      expect(menuReadersFor(padCount, 'AI_COMPANION').shared, `buddy, ${padCount}`).toBe(true);
    }
  });

  it('splits the cursors only for two people with two pads', () => {
    expect(menuReadersFor(2, 'COOP')).toEqual({ shared: false, perPlayer: true });
    expect(menuReadersFor(1, 'COOP')).toEqual({ shared: true, perPlayer: false });
  });

  it('keeps the shared cursor below two pads, whatever the mode', () => {
    for (const mode of MODES) {
      expect(menuReadersFor(1, mode).shared, mode).toBe(true);
      expect(menuReadersFor(0, mode).shared, mode).toBe(true);
    }
  });
});

/**
 * Reported from play: choosing 1P + AI BUDDY started what looked like a co-op
 * match — a second fighter standing there with nobody driving it.
 *
 * The loop decided who drove player two from `pads.p2 ?? undefined`, so any
 * second entry in the browser's gamepad list counted as a second person. A
 * spare controller left plugged in does it; so does the duplicate a DualSense
 * produces when it is listed over Bluetooth and over its cable, which is one
 * physical controller and one player.
 *
 * The rule moved out of App.tsx to be testable at all: that file has no DOM
 * environment here, which is why a defect this plain survived in it.
 */
describe('who drives the second fighter', () => {
  const padPressingRight = { ...NEUTRAL, right: true };

  it('hands the buddy back to its own policy, however many pads are listed', () => {
    // `undefined` is the signal the engine reads as "nobody is driving this
    // one". Asserted by identity rather than by falsiness, because an empty
    // input object is also falsy-looking and is exactly the wrong answer.
    expect(secondPlayerInputFor('AI_COMPANION', NEUTRAL, null, mergeInputs)).toBeUndefined();
    expect(
      secondPlayerInputFor('AI_COMPANION', NEUTRAL, padPressingRight, mergeInputs),
      'a listed pad is not a second person'
    ).toBeUndefined();
  });

  it('gives a solo game nothing to drive either', () => {
    expect(secondPlayerInputFor('SINGLE', NEUTRAL, padPressingRight, mergeInputs)).toBeUndefined();
  });

  it('gives co-op a person, with or without a controller in the slot', () => {
    expect(secondPlayerInputFor('COOP', NEUTRAL, null, mergeInputs)).toEqual(NEUTRAL);
    expect(secondPlayerInputFor('COOP', NEUTRAL, padPressingRight, mergeInputs)?.right).toBe(true);
  });

  it('merges the keyboard half with the pad rather than choosing between them', () => {
    const keyboard = { ...NEUTRAL, punch: true };
    const merged = secondPlayerInputFor('COOP', keyboard, padPressingRight, mergeInputs);
    expect(merged?.punch, 'the keyboard half still counts').toBe(true);
    expect(merged?.right, 'and so does the pad').toBe(true);
  });

  it('answers the same question secondSlotIsHuman does', () => {
    // The two used to disagree, and that disagreement was the defect: the
    // engine was told player two is not a person while the loop fed it one.
    for (const mode of ['SINGLE', 'AI_COMPANION', 'COOP'] as GameMode[]) {
      const driven = secondPlayerInputFor(mode, NEUTRAL, padPressingRight, mergeInputs) !== undefined;
      expect(driven, mode).toBe(secondSlotIsHuman(mode));
    }
  });
});
