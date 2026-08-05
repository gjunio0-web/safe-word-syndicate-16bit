import { describe, expect, it } from 'vitest';
import { CHARACTERS, ENEMIES } from '../game/characterData';
import { CharacterId } from '../types';
import { spriteEnemy } from './helpers';
import { edgeContrast, edgeContrastOf, MIN_EDGE_CONTRAST, STAGE_TYPES } from './legibility';

/**
 * Silhouette legibility.
 *
 * Omega Biker disappeared into the dark stages: near-black armour, a near-black
 * outline, and a near-black background. Feet Master was worse on Suburbia, and
 * on the Mega-Church every hero was illegible — nobody had noticed because that
 * stage was unreachable until the softlock was fixed.
 *
 * The measurement itself now lives in `legibility.ts`, so a throwaway probe can
 * import the same reading these assertions are built on instead of writing a
 * fourth version of it.
 */

const HEROES = Object.keys(CHARACTERS) as CharacterId[];

describe('hero legibility against stage backgrounds', () => {
  for (const stageType of STAGE_TYPES) {
    for (const charId of HEROES) {
      it(`${charId} reads against ${stageType}`, () => {
        const contrast = edgeContrast(charId, stageType);
        expect(
          contrast,
          `${charId} on ${stageType} measured ${contrast.toFixed(1)}`
        ).toBeGreaterThan(MIN_EDGE_CONTRAST);
      });
    }
  }

  it('draws something in every case, so a zero reading means invisible not absent', () => {
    for (const stageType of STAGE_TYPES) {
      for (const charId of HEROES) {
        expect(edgeContrast(charId, stageType)).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * Sayonara, measured the same way the heroes are.
 *
 * A black dog in black armour, outlined in the near-black every other enemy is
 * outlined in, on a nave rendered in black. Run through the arrangement above,
 * she measured 19.3 on the Neon district and 11.1 on the Mega-Church — two of
 * the three stages under the threshold the heroes are held to. Nobody had
 * checked, because the harness only ever looked at the four playable fighters.
 *
 * Making her bigger without fixing that would have produced a larger rumour,
 * so the lighter rim in her sprite is load-bearing and this is what holds it
 * in place. She now reads 26.8 / 21.8 / 29.5 across the three.
 *
 * One fighter still does not pass and is deliberately not asserted on here:
 * the Trad-Wife Striker reads 11.7 on the Mega-Church. It is real, it predates
 * this work, and it is somebody's own patch — folding it in would mean
 * recolouring a sprite in a change about a different one. The Matriarch reads
 * 32.4 / 43.1 / 26.4 and passes everywhere; an earlier draft of this comment
 * claimed she failed, which came from measuring her at a stand-in size rather
 * than her own.
 */
describe('Sayonara reads against the stages she fights on', () => {
  const dog = spriteEnemy('BOSS_SAYONARA', {
    width: ENEMIES.BOSS_SAYONARA.hitbox.width,
    height: ENEMIES.BOSS_SAYONARA.hitbox.height,
  });

  for (const stageType of STAGE_TYPES) {
    it(`separates from ${stageType}`, () => {
      const contrast = edgeContrastOf(dog, stageType);
      expect(contrast, `measured ${contrast.toFixed(1)}`).toBeGreaterThan(MIN_EDGE_CONTRAST);
    });
  }
});
