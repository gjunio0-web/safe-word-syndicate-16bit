import { CharacterId, DialogueLine, HeroLine, ScriptEntry } from '../types';

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
