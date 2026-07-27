import { describe, expect, it } from 'vitest';
import { renderEntitySprite } from '../game/spriteRenderer';
import { CHARACTERS, ENEMIES } from '../game/characterData';
import { CharacterId, EnemyType, EntityState } from '../types';

/** The action union is declared inline on EntityState, so it is read back out. */
type EntityAction = EntityState['action'];
import { asContext, RecordingContext } from './recordingContext';
import { spriteEnemy, spriteHero } from './helpers';

const HEROES = Object.keys(CHARACTERS) as CharacterId[];
const ENEMY_TYPES = Object.keys(ENEMIES) as EnemyType[];

/** Poses a fighter can be caught in. */
const ACTIONS: EntityAction[] = [
  'IDLE',
  'WALK',
  'PUNCH1',
  'PUNCH2',
  'KICK',
  'JUMP',
  'HURT',
  'KNOCKDOWN',
  'POWER_MOVE',
  'JUMP_ATTACK',
  'RECOVERY',
  'FLYING',
  'BITING',
];

function render(subject: EntityState) {
  const recorder = new RecordingContext();
  renderEntitySprite(asContext(recorder), subject, 0, 0);
  return recorder;
}

/**
 * Transform balance.
 *
 * An extra save() leaks the transform into everything drawn afterwards, so the
 * damage lands on unrelated sprites and the real culprit is invisible. An extra
 * restore() pops state belonging to the caller. Neither throws, neither shows
 * up in a screenshot of the character in isolation.
 */
describe('sprite transform balance', () => {
  for (const charId of HEROES) {
    it(`${charId} balances save/restore across every pose`, () => {
      for (const action of ACTIONS) {
        const recorder = render(spriteHero(charId, { action, z: action === 'JUMP' ? 40 : 0 }));
        expect(recorder.underflowed, `${charId} ${action} restored past the caller`).toBe(false);
        expect(recorder.depth, `${charId} ${action} left ${recorder.depth} transform(s) open`).toBe(
          0
        );
      }
    });
  }

  for (const enemyType of ENEMY_TYPES) {
    it(`${enemyType} balances save/restore across every pose`, () => {
      for (const action of ACTIONS) {
        const recorder = render(spriteEnemy(enemyType, { action }));
        expect(recorder.underflowed, `${enemyType} ${action} restored past the caller`).toBe(false);
        expect(recorder.depth, `${enemyType} ${action} left ${recorder.depth} open`).toBe(0);
      }
    });
  }

  it('leaves the caller state untouched when facing left', () => {
    const recorder = render(spriteHero('FEET_MASTER', { facing: 'LEFT' }));
    expect(recorder.depth).toBe(0);
    expect(recorder.saveCount).toBe(recorder.restoreCount);
  });
});

/**
 * Geometry containment.
 *
 * Sprites are assembled from parts positioned by hand, and a pose that nobody
 * inspected can send a limb far from the body. The box is deliberately loose —
 * weapons, auras and the picket sign legitimately overhang — so this catches
 * detachment, not tight framing.
 */
describe('sprite geometry stays near the body', () => {
  const LIMIT = 260;

  for (const charId of HEROES) {
    it(`${charId} keeps every pose within reach of its origin`, () => {
      for (const action of ACTIONS) {
        const box = render(spriteHero(charId, { action })).bounds();
        expect(box, `${charId} ${action} drew nothing`).not.toBeNull();
        const worst = Math.max(
          Math.abs(box!.minX),
          Math.abs(box!.maxX),
          Math.abs(box!.minY),
          Math.abs(box!.maxY)
        );
        expect(worst, `${charId} ${action} reached ${worst.toFixed(0)}px from origin`).toBeLessThan(
          LIMIT
        );
      }
    });
  }

  for (const enemyType of ENEMY_TYPES) {
    it(`${enemyType} keeps every pose within reach of its origin`, () => {
      for (const action of ACTIONS) {
        const box = render(spriteEnemy(enemyType, { action })).bounds();
        expect(box, `${enemyType} ${action} drew nothing`).not.toBeNull();
        const worst = Math.max(
          Math.abs(box!.minX),
          Math.abs(box!.maxX),
          Math.abs(box!.minY),
          Math.abs(box!.maxY)
        );
        expect(
          worst,
          `${enemyType} ${action} reached ${worst.toFixed(0)}px from origin`
        ).toBeLessThan(LIMIT);
      }
    });
  }

  it('mirrors the body when facing left rather than shifting it', () => {
    const right = render(spriteHero('ANGRY_CORSO', { facing: 'RIGHT' })).bounds()!;
    const left = render(spriteHero('ANGRY_CORSO', { facing: 'LEFT' })).bounds()!;

    // The muzzle projects forward, so the silhouette is asymmetric: mirroring
    // should swap which side overhangs, not move the whole body sideways.
    expect(left.maxX).toBeCloseTo(-right.minX, 0);
    expect(left.minX).toBeCloseTo(-right.maxX, 0);
  });
});

/**
 * Attack poses.
 *
 * Every enemy walked and dealt damage with nothing on screen: renderEntitySprite
 * never branched on `action` for them at all. A pose that draws exactly what
 * idle draws is what that failure looks like from outside the renderer.
 */
describe('attack poses differ from idle', () => {
  const drawnShape = (recorder: RecordingContext) =>
    recorder.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('|');

  for (const enemyType of ENEMY_TYPES) {
    it(`${enemyType} visibly changes at the peak of its attack`, () => {
      const attackFrames = enemyType === 'CONVERSION_THERAPIST' ? 30 : 25;
      const idle = render(spriteEnemy(enemyType, { action: 'IDLE' }));
      const peak = render(
        spriteEnemy(enemyType, { action: 'PUNCH1', actionTimer: Math.round(attackFrames / 2) })
      );

      expect(drawnShape(peak)).not.toBe(drawnShape(idle));
    });
  }

  for (const charId of HEROES) {
    it(`${charId} visibly changes when punching`, () => {
      const idle = render(spriteHero(charId, { action: 'IDLE' }));
      const punch = render(spriteHero(charId, { action: 'PUNCH1', actionTimer: 8 }));
      expect(drawnShape(punch)).not.toBe(drawnShape(idle));
    });
  }

  it('winds up and recovers rather than snapping to the pose', () => {
    // Sampled across the action: the shape at the start should differ from the
    // shape at the peak, or the swing is a jump-cut with no anticipation.
    const start = render(spriteEnemy('TRAD_WIFE_STRIKER', { action: 'PUNCH1', actionTimer: 24 }));
    const peak = render(spriteEnemy('TRAD_WIFE_STRIKER', { action: 'PUNCH1', actionTimer: 12 }));
    expect(drawnShape(start)).not.toBe(drawnShape(peak));
  });
});

/**
 * Dead entities.
 *
 * Corpses linger for the duration of the death animation, and the health bar
 * already refuses to draw for them. The body itself should still render, or
 * defeated enemies would vanish mid-animation.
 */
describe('defeated entities', () => {
  it('still draws the body while the death animation plays', () => {
    const recorder = render(spriteEnemy('PURITY_PATROL', { hp: 0, action: 'HURT', actionTimer: 10 }));
    expect(recorder.points.length).toBeGreaterThan(0);
    expect(recorder.depth).toBe(0);
  });
});
