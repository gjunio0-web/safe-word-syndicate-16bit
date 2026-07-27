import { describe, expect, it } from 'vitest';
import { resolveKeyBinding } from '../game/keyboard';

/** Shorthand: most keys need only the character, a few need the physical code. */
const bind = (key: string, coop = false, code = '') =>
  resolveKeyBinding(code || key, key, coop);

describe('keyboard bindings', () => {
  describe('player one', () => {
    it('moves on WASD in every mode', () => {
      for (const coop of [false, true]) {
        expect(bind('w', coop)).toEqual({ player: 1, field: 'up' });
        expect(bind('a', coop)).toEqual({ player: 1, field: 'left' });
        expect(bind('s', coop)).toEqual({ player: 1, field: 'down' });
        expect(bind('d', coop)).toEqual({ player: 1, field: 'right' });
      }
    });

    it('attacks on both the J K row and the Z X pair', () => {
      expect(bind('j')).toEqual({ player: 1, field: 'punch' });
      expect(bind('z')).toEqual({ player: 1, field: 'punch' });
      expect(bind('k')).toEqual({ player: 1, field: 'kick' });
      expect(bind('x')).toEqual({ player: 1, field: 'kick' });
    });

    it('accepts every special-move alias', () => {
      for (const key of ['l', 'e', 'f', 'u']) {
        expect(bind(key)).toEqual({ player: 1, field: 'special' });
      }
    });

    it('jumps on space in every mode', () => {
      for (const coop of [false, true]) {
        expect(resolveKeyBinding('Space', ' ', coop)).toEqual({ player: 1, field: 'jump' });
      }
    });

    it('is case insensitive, so caps lock does not disable the game', () => {
      expect(bind('W')).toEqual({ player: 1, field: 'up' });
      expect(bind('J')).toEqual({ player: 1, field: 'punch' });
    });
  });

  describe('the arrow keys', () => {
    it('drive player one while nobody else needs them', () => {
      expect(bind('ArrowUp')).toEqual({ player: 1, field: 'up' });
      expect(bind('ArrowRight')).toEqual({ player: 1, field: 'right' });
    });

    it('transfer to player two in co-op', () => {
      expect(bind('ArrowUp', true)).toEqual({ player: 2, field: 'up' });
      expect(bind('ArrowRight', true)).toEqual({ player: 2, field: 'right' });
    });
  });

  describe('player two', () => {
    it('has action buttons on the punctuation row', () => {
      expect(bind(',', true, 'Comma')).toEqual({ player: 2, field: 'punch' });
      expect(bind('.', true, 'Period')).toEqual({ player: 2, field: 'kick' });
      expect(bind('/', true, 'Slash')).toEqual({ player: 2, field: 'special' });
      expect(bind('Shift', true, 'ShiftRight')).toEqual({ player: 2, field: 'jump' });
    });

    it('has the same buttons on the keypad', () => {
      expect(bind('1', true, 'Numpad1')).toEqual({ player: 2, field: 'punch' });
      expect(bind('2', true, 'Numpad2')).toEqual({ player: 2, field: 'kick' });
      expect(bind('3', true, 'Numpad3')).toEqual({ player: 2, field: 'special' });
      expect(bind('0', true, 'Numpad0')).toEqual({ player: 2, field: 'jump' });
    });

    it('has no bindings at all outside co-op', () => {
      expect(bind(',', false, 'Comma')).toBeNull();
      expect(bind('1', false, 'Numpad1')).toBeNull();
      expect(bind('Shift', false, 'ShiftRight')).toBeNull();
    });

    it('never takes a key that belongs to player one', () => {
      // The two halves must not overlap, or one press would move both fighters.
      const p1Keys = ['w', 'a', 's', 'd', 'j', 'z', 'k', 'x', 'l', 'e', 'f', 'u'];
      for (const key of p1Keys) {
        expect(bind(key, true)?.player).toBe(1);
      }
    });

    it('leaves the left shift alone, which player one may be resting on', () => {
      expect(bind('Shift', true, 'ShiftLeft')).toBeNull();
    });
  });

  it('ignores keys with no binding', () => {
    for (const key of ['q', 'm', 'Tab', 'Enter', 'Backspace']) {
      expect(bind(key, true)).toBeNull();
    }
  });
});
