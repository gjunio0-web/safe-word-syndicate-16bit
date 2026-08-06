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
