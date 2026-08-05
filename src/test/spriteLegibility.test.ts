import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { renderEntitySprite } from '../game/spriteRenderer';
import { renderStageBackground } from '../game/stageData';
import { CHARACTERS, ENEMIES } from '../game/characterData';
import { CharacterId, EntityState, StageConfig } from '../types';
import { spriteEnemy, spriteHero } from './helpers';

/**
 * Silhouette legibility.
 *
 * Omega Biker disappeared into the dark stages: near-black armour, a near-black
 * outline, and a near-black background. Feet Master was worse on Suburbia, and
 * on the Mega-Church every hero was illegible — nobody had noticed because that
 * stage was unreachable until the softlock was fixed.
 *
 * What the eye uses is the step in brightness at the edge of the shape, not the
 * average brightness of the body: a bright character on a bright background is
 * as unreadable as a dark one on dark. So the measurement samples only the
 * pixels where the sprite meets what is behind it.
 *
 * The threshold guards against regression, not against a particular palette.
 * Recolouring a character freely is fine; making one vanish is not.
 */

const STAGE_TYPES: StageConfig['bgType'][] = [
  'STAGE_1_NEON',
  'STAGE_2_SUBURB',
  'STAGE_3_CHURCH',
];

const HEROES = Object.keys(CHARACTERS) as CharacterId[];

/** Below this, tested by eye, the outline stops separating the figure. */
const MIN_EDGE_CONTRAST = 20;

const WIDTH = 300;
const HEIGHT = 300;
const GROUND_Y = 250;

const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * Mean brightness step along the silhouette edge.
 *
 * A pixel belongs to the sprite when the two renders differ there. For each
 * such pixel touching a non-sprite neighbour, the difference between the
 * sprite's brightness and the background's is one sample of the edge.
 */
function edgeContrastOf(subject: EntityState, stageType: StageConfig['bgType']): number {
  const background = createCanvas(WIDTH, HEIGHT);
  const backgroundCtx = background.getContext('2d');
  renderStageBackground(
    backgroundCtx as unknown as CanvasRenderingContext2D,
    stageType,
    400,
    WIDTH,
    HEIGHT
  );

  const composed = createCanvas(WIDTH, HEIGHT);
  const composedCtx = composed.getContext('2d');
  composedCtx.drawImage(background, 0, 0);
  composedCtx.save();
  composedCtx.translate(WIDTH / 2, GROUND_Y);
  renderEntitySprite(
    composedCtx as unknown as CanvasRenderingContext2D,
    subject,
    0,
    0,
    0
  );
  composedCtx.restore();

  const before = backgroundCtx.getImageData(0, 0, WIDTH, HEIGHT).data;
  const after = composedCtx.getImageData(0, 0, WIDTH, HEIGHT).data;

  const painted = (i: number) =>
    Math.abs(after[i] - before[i]) > 3 ||
    Math.abs(after[i + 1] - before[i + 1]) > 3 ||
    Math.abs(after[i + 2] - before[i + 2]) > 3;

  let total = 0;
  let samples = 0;

  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      const i = (y * WIDTH + x) * 4;
      if (!painted(i)) continue;

      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const j = ((y + dy) * WIDTH + (x + dx)) * 4;
        if (painted(j)) continue;

        total += Math.abs(
          luminance(after[i], after[i + 1], after[i + 2]) -
            luminance(before[j], before[j + 1], before[j + 2])
        );
        samples++;
      }
    }
  }

  return samples === 0 ? 0 : total / samples;
}

const edgeContrast = (charId: CharacterId, stageType: StageConfig['bgType']) =>
  edgeContrastOf(spriteHero(charId), stageType);

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
