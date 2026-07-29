import { CharacterId, DialogueLine, HeroLine, HeroVariant, ScriptEntry } from '../types';
import { CHARACTERS } from './characterData';

/**
 * Builds a hero line from one text per hero.
 *
 * Speaker name and portrait are derived from the hero id, because writing them
 * out four times per line turns a page of script into a page of scaffolding and
 * invites the kind of copy-paste error where the Fun Maker speaks with the
 * Omega Biker's face.
 *
 * `prefer` is whose wave this is. If they are not in the fight, the line falls
 * to whoever is.
 */
export function heroLine(prefer: CharacterId, texts: Record<CharacterId, string>): HeroLine {
  const variants = {} as Record<CharacterId, HeroVariant>;
  (Object.keys(texts) as CharacterId[]).forEach((id) => {
    variants[id] = { speaker: CHARACTERS[id].name, portrait: id, text: texts[id] };
  });
  return { prefer, variants };
}

/**
 * Hero lines carry one text per hero; fixed lines carry their own speaker.
 * `variants` is the only field a fixed line can never have, so it discriminates.
 */
export function isHeroLine(entry: ScriptEntry): entry is HeroLine {
  return 'variants' in entry;
}

/**
 * Collapses a wave's script into the flat lines the overlay renders.
 *
 * `roster` is who is allowed to speak, in priority order, Player 1 first. An AI
 * companion is left out of it on purpose: the buddy swinging at grunts beside
 * you is not a second person in the room, and lines coming out of its mouth
 * read as the game holding a conversation with itself.
 */
export function resolveDialogue(script: ScriptEntry[], roster: CharacterId[]): DialogueLine[] {
  return script.map((entry) => (isHeroLine(entry) ? resolveHeroLine(entry, roster) : entry));
}

function resolveHeroLine(line: HeroLine, roster: CharacterId[]): DialogueLine {
  const variant = line.variants[pickSpeaker(line, roster)];
  return {
    speaker: variant.speaker,
    portrait: variant.portrait,
    text: variant.text,
    // Heroes always answer from stage left. The enemy owns the right.
    side: 'LEFT',
  };
}

/** The preferred hero if they turned up, otherwise whoever did. */
function pickSpeaker(line: HeroLine, roster: CharacterId[]): CharacterId {
  if (line.prefer && roster.includes(line.prefer)) return line.prefer;
  if (roster.length > 0) return roster[0];
  // No roster at all should not happen in play, but a script is data and data
  // gets called from tests and tools. Fall back rather than throw.
  return line.prefer ?? (Object.keys(line.variants)[0] as CharacterId);
}
