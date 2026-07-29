import { PortraitId } from '../types';
import feetMasterBust from '../assets/images/feet_master_bust.webp';
import funMakerBust from '../assets/images/fun_maker_bust.webp';
import omegaBikerBust from '../assets/images/omega_biker_bust.webp';
import angryCorsoBust from '../assets/images/angry_corso_bust.webp';
import purityPatrolImg from '../assets/images/purity_patrol_portrait.webp';
import tradWifeImg from '../assets/images/trad_wife_striker_portrait.webp';
import sayonaraImg from '../assets/images/sayonara_portrait.webp';
import sayonaraFreedImg from '../assets/images/sayonara_freed_portrait.webp';
import mizydiaImg from '../assets/images/madam_mizydia_portrait.webp';

/**
 * Face for a speaker.
 *
 * The heroes point at dedicated bust art, not at their character-select
 * poster. The poster is a full figure with a scene behind it; shrunk into the
 * 96px the dialogue box gives it, the head came out around twelve pixels and
 * the player could not tell who was talking.
 *
 * Kept partial rather than total on purpose: a speaker without a face falls
 * back to the name tag the box has always drawn, so a new one can be written
 * before its art exists. Nothing here assumes the map is complete.
 */
export const PORTRAITS: Partial<Record<PortraitId, string>> = {
  FEET_MASTER: feetMasterBust,
  FUN_MAKER: funMakerBust,
  OMEGA_BIKER: omegaBikerBust,
  ANGRY_CORSO: angryCorsoBust,
  PURITY_PATROL: purityPatrolImg,
  TRAD_WIFE_STRIKER: tradWifeImg,
  SAYONARA: sayonaraImg,
  SAYONARA_FREED: sayonaraFreedImg,
  MADAM_MIZYDIA: mizydiaImg,
};

export function portraitFor(id: PortraitId): string | undefined {
  return PORTRAITS[id];
}
