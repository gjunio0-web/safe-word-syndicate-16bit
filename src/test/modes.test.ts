import { describe, expect, it } from 'vitest';
import { menuReadersFor, secondFighterFor, secondSlotIsHuman } from '../game/modes';
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

  it('keeps the shared cursor in a solo game however many pads are listed', () => {
    // The reported failure, stated directly: a DualSense listed twice by the
    // browser puts padCount at 2 with one person holding one controller.
    expect(menuReadersFor(2, 'SINGLE')).toEqual({ shared: true, perPlayer: false });
    expect(menuReadersFor(4, 'SINGLE')).toEqual({ shared: true, perPlayer: false });
  });

  it('gives each pad its own cursor only when two people are choosing', () => {
    expect(menuReadersFor(2, 'COOP')).toEqual({ shared: false, perPlayer: true });
    expect(menuReadersFor(2, 'AI_COMPANION')).toEqual({ shared: false, perPlayer: true });
  });

  it('keeps the shared cursor below two pads, whatever the mode', () => {
    for (const mode of MODES) {
      expect(menuReadersFor(1, mode).shared, mode).toBe(true);
      expect(menuReadersFor(0, mode).shared, mode).toBe(true);
    }
  });
});
