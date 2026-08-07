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
 * Pad count alone is the wrong question, and so is "not solo" — the first
 * spelling of this fix used the latter and was still wrong for the buddy mode,
 * where one person picks both fighters. A second cursor is wanted when a
 * second *person* is choosing, which co-op means and nothing else does.
 * Everywhere else there is one player, one cursor, and the shoulder buttons to
 * move it between the two roster slots — a browser listing one controller
 * twice must not cost that player their slot switch.
 *
 * Stated as one function returning both flags rather than two expressions in
 * the component, so "exactly one reader is always live" is a property that can
 * be tested instead of a coincidence of two booleans staying in step.
 */
export function menuReadersFor(padCount: number, mode: GameMode): MenuReaderPlan {
  const perPlayer = padCount >= 2 && mode === 'COOP';
  return { shared: !perPlayer, perPlayer };
}
