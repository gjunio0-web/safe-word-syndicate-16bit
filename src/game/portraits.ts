import { PortraitId } from '../types';
import { CHARACTERS } from './characterData';
import purityPatrolImg from '../assets/images/purity_patrol_portrait.webp';
import tradWifeImg from '../assets/images/trad_wife_striker_portrait.webp';
import sayonaraImg from '../assets/images/sayonara_portrait.webp';
import mizydiaImg from '../assets/images/madam_mizydia_portrait.webp';

/**
 * Face for a speaker.
 *
 * Still partial rather than total: SAYONARA_FREED has art but no portrait id
 * yet, and a speaker without a face falls back to the name tag the box has
 * always drawn. Nothing here assumes the map is complete.
 */
export const PORTRAITS: Partial<Record<PortraitId, string>> = {
  FEET_MASTER: CHARACTERS.FEET_MASTER.portraitUrl,
  FUN_MAKER: CHARACTERS.FUN_MAKER.portraitUrl,
  OMEGA_BIKER: CHARACTERS.OMEGA_BIKER.portraitUrl,
  ANGRY_CORSO: CHARACTERS.ANGRY_CORSO.portraitUrl,
  PURITY_PATROL: purityPatrolImg,
  TRAD_WIFE_STRIKER: tradWifeImg,
  SAYONARA: sayonaraImg,
  MADAM_MIZYDIA: mizydiaImg,
};

export function portraitFor(id: PortraitId): string | undefined {
  return PORTRAITS[id];
}
