import { PlayerInput } from '../types';

/**
 * Keyboard layout for one and two players.
 *
 * The two halves of the keyboard are split between the players so two people
 * can sit at one machine without reaching across each other: player one keeps
 * the left half, player two takes the arrow cluster on the right.
 *
 * Player one keeps WASD and the JKL row rather than the arrows because that
 * pairing works on every keyboard, laptops included. Putting the solo player on
 * arrows would push their action buttons to the numeric keypad or the
 * punctuation row, and half the machines this runs on have no keypad at all.
 *
 * The arrows therefore belong to player one while nobody else needs them, and
 * transfer to player two in co-op. Nothing else moves.
 *
 * Resolved in one place instead of inline in the key handlers: keydown and
 * keyup previously repeated the same list, and a binding added to one and
 * forgotten in the other leaves a button stuck down.
 */

export type InputField = keyof PlayerInput;

export interface KeyBinding {
  player: 1 | 2;
  field: InputField;
}

/** Player one. Arrows are listed separately since they depend on the mode. */
const PLAYER_ONE_KEYS: Record<string, InputField> = {
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  j: 'punch',
  z: 'punch',
  k: 'kick',
  x: 'kick',
  l: 'special',
  e: 'special',
  f: 'special',
  u: 'special',
};

const ARROW_KEYS: Record<string, InputField> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
};

/**
 * Player two's action buttons, by `KeyboardEvent.code`.
 *
 * Both a punctuation row and a keypad set: the keypad is more comfortable when
 * it exists, and the punctuation keys sit under the right hand on a laptop.
 * Space and Enter are deliberately absent — they are shared, central, and carry
 * browser behaviour of their own.
 */
const PLAYER_TWO_CODES: Record<string, InputField> = {
  Comma: 'punch',
  Numpad1: 'punch',
  Period: 'kick',
  Numpad2: 'kick',
  Slash: 'special',
  Numpad3: 'special',
  ShiftRight: 'jump',
  Numpad0: 'jump',
};

/**
 * Which player and which control a key event drives, if any.
 *
 * `code` is used where the physical key matters — the keypad, the right shift,
 * the space bar — and `key` where the letter matters, so a non-QWERTY layout
 * still gets the letters printed on its own keycaps.
 */
export function resolveKeyBinding(code: string, key: string, coop: boolean): KeyBinding | null {
  if (code === 'Space') return { player: 1, field: 'jump' };

  const lower = key.toLowerCase();

  const arrow = ARROW_KEYS[lower];
  if (arrow) return { player: coop ? 2 : 1, field: arrow };

  const first = PLAYER_ONE_KEYS[lower];
  if (first) return { player: 1, field: first };

  if (coop) {
    const second = PLAYER_TWO_CODES[code];
    if (second) return { player: 2, field: second };
  }

  return null;
}

/** Human-readable layout, for the codex and anywhere else it is shown. */
export const KEYBOARD_LAYOUT = {
  playerOne: {
    move: 'W A S D',
    moveAlternate: 'Arrow keys (solo only)',
    punch: 'J or Z',
    kick: 'K or X',
    special: 'L, E, F or U',
    jump: 'Space',
  },
  playerTwo: {
    move: 'Arrow keys',
    punch: ', or Numpad 1',
    kick: '. or Numpad 2',
    special: '/ or Numpad 3',
    jump: 'Right Shift or Numpad 0',
  },
} as const;
