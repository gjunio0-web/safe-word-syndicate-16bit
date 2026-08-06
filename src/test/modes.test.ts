import { describe, expect, it } from 'vitest';
import { secondFighterFor, secondSlotIsHuman } from '../game/modes';

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
