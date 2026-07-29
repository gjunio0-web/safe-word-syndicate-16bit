import React from 'react';
import { GameMode } from '../types';
import { KEYBOARD_LAYOUT } from '../game/keyboard';

interface KeyboardHintsProps {
  mode: GameMode;
}

/**
 * The keyboard reference strip shown during a match.
 *
 * It used to live inside OnScreenControls, which is where it was lost: that
 * component was restricted to touch devices, and the hints went with it — the
 * exact opposite of what they are for, since they exist to tell a keyboard
 * player which keys do what.
 *
 * Text comes from KEYBOARD_LAYOUT rather than being written out again here, so
 * a rebinding cannot leave the screen advertising keys that no longer work.
 */

/**
 * First key of a binding, for the reminder strip.
 *
 * The layout lists every alternative — "L, E, F or U" — which the codex should
 * show in full but a heads-up strip should not: spelled out for both players it
 * ran to 126 characters, well past the width of the bar it sits in. A reminder
 * needs one key per action; the codex is where the rest belongs.
 *
 * Splitting on "or" alone, never on the comma: player two's punch *is* the
 * comma key, and a comma-aware split ate it and rendered an empty label.
 */
export function primaryKey(binding: string): string {
  const [first] = binding.split(/\s+or\s+/);
  // "L, E, F" lists alternatives; ", " on its own is the comma key itself.
  const trimmed = first.trim();
  return (trimmed.includes(',') && trimmed !== ',' ? trimmed.split(',')[0] : trimmed)
    .trim()
    .toUpperCase();
}

export const KeyboardHints: React.FC<KeyboardHintsProps> = ({ mode }) => {
  const coop = mode === 'COOP';
  const one = KEYBOARD_LAYOUT.playerOne;
  const two = KEYBOARD_LAYOUT.playerTwo;

  // The arrows belong to player one until a second person needs them, so the
  // line has to say something different in co-op than it does alone.
  const p1Move = coop ? primaryKey(one.move) : `${primaryKey(one.move)} / ARROWS`;

  const Key: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <span className="text-amber-400 font-bold">{children}</span>
  );

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-none select-none z-30 flex flex-col items-center gap-1">
      <div className="text-xs font-mono text-zinc-400 bg-black/60 backdrop-blur-sm py-1 px-3 rounded-full border border-zinc-800 whitespace-nowrap">
        {coop && <span className="text-[#ff00ff] font-bold mr-1.5">P1</span>}
        <Key>{p1Move}</Key> = MOVE | <Key>{primaryKey(one.punch)}</Key> = PUNCH |{' '}
        <Key>{primaryKey(one.kick)}</Key> = KICK | <Key>{primaryKey(one.special)}</Key> = POWER MOVE
        | <Key>{primaryKey(one.jump)}</Key> = JUMP
      </div>

      {coop && (
        <div className="text-xs font-mono text-zinc-400 bg-black/60 backdrop-blur-sm py-1 px-3 rounded-full border border-zinc-800 whitespace-nowrap">
          <span className="text-[#00ffff] font-bold mr-1.5">P2</span>
          <Key>{primaryKey(two.move)}</Key> = MOVE | <Key>{primaryKey(two.punch)}</Key> = PUNCH |{' '}
          <Key>{primaryKey(two.kick)}</Key> = KICK | <Key>{primaryKey(two.special)}</Key> = POWER
          MOVE | <Key>{primaryKey(two.jump)}</Key> = JUMP
        </div>
      )}
    </div>
  );
};
