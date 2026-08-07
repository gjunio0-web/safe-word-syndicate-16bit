import { CharacterId, GameMode } from '../types';

/**
 * Who takes the second slot, given the mode.
 *
 * The mode is the question. Asking instead whether a second fighter was picked
 * cannot express "nobody", because the value for nobody is `undefined` — which
 * is also the value for "not overridden, use what you already had". Character
 * select passes `selectedP2 || undefined` when the player chooses SINGLE, so
 * the two meanings collided and the previous match's companion was reused: the
 * AI buddy turned up in a solo game nobody had asked for one in.
 *
 * Reading it off the mode has no such ambiguity, and it holds for a restart
 * too — retrying a stage keeps whatever mode the match is being played in.
 */
export function secondFighterFor(
  mode: GameMode,
  chosen: CharacterId | undefined
): CharacterId | undefined {
  return mode === 'SINGLE' ? undefined : chosen;
}

/** Whether the second slot is a person rather than the companion policy. */
export const secondSlotIsHuman = (mode: GameMode) => mode === 'COOP';

/** Which menu reader the character select screen runs. */
export interface MenuReaderPlan {
  /** One cursor, driven by every controller at once. */
  shared: boolean;
  /** A cursor per controller, so two people choose at the same time. */
  perPlayer: boolean;
}

/**
 * Picks the menu reader for the character select screen.
 *
 * The screen used to decide this inline with two independent conditions —
 * shared while `padCount < 2`, per-player while `padCount >= 2 && mode !==
 * 'SINGLE'` — and the pair left a hole. The screen opens on SINGLE, so a
 * player with two pads listed got neither reader: nothing was listening to
 * the controller at all, and the only way out of SINGLE is a stick press,
 * which nothing was listening to. The controller was dead until the player
 * reached for the keyboard.
 *
 * Two pads is not the question on its own. The per-player reader only earns
 * its keep when there are two people to give a cursor each, which is what the
 * mode says. Everything else is one cursor, however many pads are plugged in.
 *
 * Stated as one function returning both flags rather than two expressions in
 * the component, so "exactly one reader is always live" is a property that can
 * be tested instead of a coincidence of two booleans staying in step.
 */
export function menuReadersFor(padCount: number, mode: GameMode): MenuReaderPlan {
  const perPlayer = padCount >= 2 && mode !== 'SINGLE';
  return { shared: !perPlayer, perPlayer };
}
