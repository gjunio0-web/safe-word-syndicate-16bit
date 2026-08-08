import { describe, expect, it } from 'vitest';
import { CHARACTERS, ENEMIES } from '../game/characterData';
import { CharacterId, EnemyType } from '../types';
import { spriteEnemy, spriteHero } from './helpers';
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
 * The Trad-Wife Striker's 11.7 on the Mega-Church, left open here as somebody
 * else's patch, is now that patch: she carries her own outline and the block
 * below holds every grunt to the same reading the heroes get. The Matriarch reads
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

/**
 * The infantry, held to the same reading.
 *
 * The harness only ever looked at the four heroes, then at the dog. Nobody had
 * pointed it at the crowd, which is how a fighter who appears in six of the
 * eleven waves spent the whole campaign dissolving into the nave floor.
 *
 * The floor is the threshold the heroes are held to. The ceiling is asserted
 * separately, below, because leaving it to the eye is how an outline gets
 * brightened one shade at a time until the crowd reads louder than the fighter
 * the player is steering.
 */
describe('the grunts read against the stages they fight on', () => {
  const GRUNTS: EnemyType[] = [
    'PURITY_PATROL',
    'CONVERSION_THERAPIST',
    'TRAD_WIFE_STRIKER',
  ];

  for (const type of GRUNTS) {
    const info = ENEMIES[type];
    const body = spriteEnemy(type, {
      width: info.hitbox.width,
      height: info.hitbox.height,
    });

    for (const stageType of STAGE_TYPES) {
      it(`${type} separates from ${stageType}`, () => {
        const contrast = edgeContrastOf(body, stageType);
        expect(contrast, `measured ${contrast.toFixed(1)}`).toBeGreaterThan(MIN_EDGE_CONTRAST);
      });
    }
  }
});

/**
 * Nobody in the crowd outshines the hero on the stage they share.
 *
 * The dark enemy outline was always policy, and the policy was always stated
 * in prose. Prose does not fail a build. Once one enemy earned an outline of
 * its own there was nothing left to stop the next one, and the argument for
 * each brightening is always locally reasonable.
 *
 * Fun Maker is the dimmest hero on all three stages, so he is the bar. The
 * comparison is per stage rather than against his global minimum: the two are
 * only ever on screen together on the same stage, and comparing an enemy's
 * best reading against a hero's worst on some other stage manufactures a
 * tightness that nothing on screen has.
 *
 * Measured headroom today is 6.9 on the Neon stage, 2.4 on Suburbia and 12.7
 * on the Mega-Church. The tight one is the Matriarch, not the Striker, and it
 * predates her outline — worth knowing before anyone reads a failure here as
 * this patch's fault.
 */
describe('no enemy outshines the dimmest hero it shares a stage with', () => {
  const enemies = Object.keys(ENEMIES) as EnemyType[];

  for (const stageType of STAGE_TYPES) {
    const dimmestHero = Math.min(
      ...(Object.keys(CHARACTERS) as CharacterId[]).map((id) =>
        edgeContrastOf(spriteHero(id), stageType)
      )
    );

    for (const type of enemies) {
      const info = ENEMIES[type];
      it(`${type} stays under the hero floor on ${stageType}`, () => {
        const body = spriteEnemy(type, {
          width: info.hitbox.width,
          height: info.hitbox.height,
        });
        const contrast = edgeContrastOf(body, stageType);
        expect(
          contrast,
          `enemy ${contrast.toFixed(1)} vs dimmest hero ${dimmestHero.toFixed(1)}`
        ).toBeLessThan(dimmestHero);
      });
    }
  }
});
