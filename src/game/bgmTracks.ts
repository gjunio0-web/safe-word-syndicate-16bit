/**
 * Every music slot in the game, declared once.
 *
 * This existed in four places that did not agree: the BgmTrack union in sound.ts,
 * an alias map that quietly tied two slots to one file, a keyword table that
 * matched filenames in public/audio, and a hardcoded list in the jukebox modal.
 * Four of the ten slots below were reachable at all, and the jukebox still
 * advertised slot four as the "Apex Syndicate Mech boss fight anthem" — a
 * template leftover for a boss this game does not have. Nobody caught it because
 * nothing read from anything else.
 *
 * Adding a track now means adding a line here. The type, the jukebox rows, the
 * manifest matching and the synth fallback all derive from this object.
 */

/** The built-in chiptune recipes in sound.ts. Several slots share one. */
export type SynthTheme =
  | 'INTRO'
  | 'CHAR_SELECT'
  | 'STAGE'
  | 'BOSS'
  | 'SUBURB';

export interface BgmTrackInfo {
  /** Shown as the row title in the jukebox. */
  label: string;
  /** Shown under the title. */
  subtitle: string;
  /**
   * Matched against filenames dropped into public/audio. First match wins, so
   * each slot lists its album title first and the generic terms after: the
   * soundtrack ships under names like "Liturgy of Iron", not "stage3".
   *
   * 'gray' and 'grey' used to sit here on the Suburbia slot, which swallowed
   * "The Gray Perimeter" — the game over theme — and played it as stage two
   * music. Keywords have to be specific enough not to catch another track's
   * title.
   */
  keywords: string[];
  /** Which built-in recipe plays when no file has been supplied. */
  synth: SynthTheme;
  /** Jukebox accent, applied inline: Tailwind cannot compile a class built from a variable. */
  accent: string;
}

export const BGM_TRACKS = {
  INTRO: {
    label: 'Title & Intro Screen',
    subtitle: 'Main arcade title theme',
    keywords: ['last_coin', 'lastcoin', 'intro', 'title', 'theme'],
    synth: 'INTRO',
    accent: '#00ffff',
  },
  CHAR_SELECT: {
    label: 'Player Selection',
    subtitle: 'Character roster screen',
    keywords: ['night_shift', 'nightshift', 'select', 'char', 'roster', 'menu'],
    synth: 'CHAR_SELECT',
    accent: '#ff86e4',
  },
  STAGE1: {
    label: 'Stage 1 — Neon Nightlife District',
    subtitle: 'Defend the sanctuary from the purity raid',
    keywords: ['concrete_insurrection', 'concrete', 'stage1', 'stage_1', 'neon', 'street'],
    synth: 'STAGE',
    accent: '#e8a83e',
  },
  STAGE1_BOSS: {
    label: 'Stage 1 Boss — Sayonara',
    subtitle: 'The old guard, on a censure leash',
    keywords: ['iron_verdict', 'stage1_boss', 'stage_1_boss', 'boss1', 'boss_1', 'sayonara'],
    synth: 'BOSS',
    accent: '#ff9a45',
  },
  SUBURBAN_GRAY: {
    label: 'Stage 2 — Monochromatic Suburbia',
    subtitle: 'Smash through the cookie-cutter cul-de-sac',
    keywords: ['cul_de_sac', 'culdesac', 'clockwork', 'stage2', 'stage_2', 'suburb'],
    synth: 'SUBURB',
    accent: '#b0b9c6',
  },
  STAGE2_BOSS: {
    label: 'Stage 2 Boss — Madam Mizydia (Hologram)',
    subtitle: 'A projection of authority, not a body in the room',
    keywords: ['sector_nine', 'sectornine', 'siege', 'boss2', 'boss_2', 'hologram'],
    synth: 'BOSS',
    accent: '#a29bfe',
  },
  SACRED_METAL: {
    label: 'Stage 3 — Mega-Church Corporate HQ',
    subtitle: 'Dismantle the global broadcasting signal',
    keywords: ['liturgy', 'stage3', 'stage_3', 'church'],
    synth: 'STAGE',
    accent: '#f1c40f',
  },
  FINAL_BOSS: {
    label: 'Final Boss — Mizydia & Sayonara',
    subtitle: 'Two at once, and no room to breathe',
    keywords: ['iron_sacrament', 'sacrament', 'finalboss', 'final_boss', 'finale'],
    synth: 'BOSS',
    accent: '#d63031',
  },
  GAME_OVER: {
    label: 'Game Over',
    subtitle: 'The grey closes back over the world',
    keywords: ['gray_perimeter', 'grey_perimeter', 'perimeter', 'gameover', 'game_over', 'defeat'],
    synth: 'SUBURB',
    accent: '#5c6b73',
  },
  VICTORY: {
    label: 'Ending',
    subtitle: 'Colour comes back',
    keywords: ['running_toward', 'toward_the_sun', 'victory', 'ending', 'triumph'],
    synth: 'INTRO',
    accent: '#56ff47',
  },
} as const satisfies Record<string, BgmTrackInfo>;

export type BgmTrack = keyof typeof BGM_TRACKS;

export const BGM_TRACK_IDS = Object.keys(BGM_TRACKS) as BgmTrack[];

/**
 * Picks the slot a file in public/audio belongs to. Returns null rather than
 * guessing: the previous version fell back to positional assignment, so an
 * unrelated file could silently become the title theme.
 */
export function matchTrackByFilename(filename: string): BgmTrack | null {
  const name = filename.toLowerCase();
  let best: { id: BgmTrack; length: number } | null = null;

  // Longest match wins rather than first match. Declaration order alone gave
  // stage1_boss.mp3 to STAGE1, because 'stage1' is a substring of it and STAGE1
  // is declared first — the boss slot was left on the synth while its file
  // played as stage music.
  for (const id of BGM_TRACK_IDS) {
    for (const keyword of BGM_TRACKS[id].keywords) {
      if (name.includes(keyword) && (!best || keyword.length > best.length)) {
        best = { id, length: keyword.length };
      }
    }
  }
  return best ? best.id : null;
}
