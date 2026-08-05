/**
 * Who made the noise.
 *
 * One table, four screens. The studio credit shows up on the title screen, in
 * the codex, on the victory screen and sprayed on a wall in stage 1, and every
 * one of those used to be a place where a name could be typo'd independently.
 * Reading them all from here means the year, the slogan and the roster can
 * only ever be wrong in one place at a time.
 *
 * The slogan is deliberately about the game's enemy, not about copying this
 * game. An earlier draft read "UNAUTHORIZED COPYING ENCOURAGED", which is a
 * good joke sitting in exactly the wrong slot: the one line on screen where a
 * storefront, a publisher or a lawyer reads for a rights claim and not for a
 * punchline. This one keeps the shape of the joke, points it at the Censure
 * Protocol, and says nothing at all about rights.
 */

export const STUDIO_NAME = 'ARGOS OUTIS';
export const STUDIO_SUFFIX = 'DIGITAL BUNKER';
export const STUDIO_FULL = `${STUDIO_NAME} ${STUDIO_SUFFIX}`;

export const COPYRIGHT_YEAR = 2026;

/** The half that carries the rights claim. Boring on purpose. */
export const COPYRIGHT_NOTICE = `© ${COPYRIGHT_YEAR} ${STUDIO_FULL}`;

/** The half that carries the attitude. Says nothing about rights. */
export const CREDIT_SLOGAN = 'UNAUTHORIZED SILENCE PROHIBITED';

/**
 * Both halves on one line, for the places wide enough to take it.
 *
 * Narrow layouts render the two constants above as separate lines instead —
 * a stack that reads as a decision rather than as a container overflowing.
 */
export const CREDIT_LINE = `${COPYRIGHT_NOTICE} · ${CREDIT_SLOGAN}`;

export interface CreditRole {
  readonly role: string;
  readonly name: string;
}

/** The roster, longest-form. Read by the codex panel and the victory screen. */
export const CREDIT_ROLES: readonly CreditRole[] = [
  { role: 'CODE & ENGINE', name: STUDIO_NAME },
  { role: 'PIXELS & PORTRAITS', name: STUDIO_NAME },
  { role: 'NOISE', name: STUDIO_NAME },
  { role: 'BUILT WITH', name: 'REACT · VITE · CANVAS' },
  { role: 'SAFE WORD', name: 'NEVER USED' },
];

/** The tag sprayed on the club wall in stage 1. Short enough to fit the brick. */
export const GRAFFITI_TAG = STUDIO_NAME;
export const GRAFFITI_SUBTAG = `${STUDIO_SUFFIX} // WAS HERE`;
