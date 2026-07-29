import { PortraitId } from '../types';
import { CHARACTERS } from './characterData';

/**
 * Face for a speaker, when there is one.
 *
 * The four heroes already had portrait art loaded for the select screen, the
 * HUD and the codex, so putting them in the dialogue box costs nothing but the
 * lookup. The villains have no art yet, and this map is deliberately partial
 * rather than pretending otherwise: a missing face falls back to the name tag
 * the box has always drawn, so Mizydia and the patrol can be filled in one at
 * a time without touching the component again.
 */
export const PORTRAITS: Partial<Record<PortraitId, string>> = {
  FEET_MASTER: CHARACTERS.FEET_MASTER.portraitUrl,
  FUN_MAKER: CHARACTERS.FUN_MAKER.portraitUrl,
  OMEGA_BIKER: CHARACTERS.OMEGA_BIKER.portraitUrl,
  ANGRY_CORSO: CHARACTERS.ANGRY_CORSO.portraitUrl,
};

export function portraitFor(id: PortraitId): string | undefined {
  return PORTRAITS[id];
}
