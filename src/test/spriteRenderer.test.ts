import { describe, expect, it } from 'vitest';
import { isPowerMovePose, renderEntitySprite } from '../game/spriteRenderer';
import { POWER_MOVE_FRAMES } from '../game/constants';
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
  renderEntitySprite(asContext(recorder), subject, 0, 0, 0);
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

describe('animation follows simulated time, not the wall clock', () => {
  it('draws identically for the same simTimeMs, regardless of real elapsed time', () => {
    const subject = spriteHero('FEET_MASTER', { action: 'IDLE', invulnerableTimer: 40 });
    const frameA = new RecordingContext();
    renderEntitySprite(asContext(frameA), subject, 0, 0, 1234);
    const frameB = new RecordingContext();
    renderEntitySprite(asContext(frameB), subject, 0, 0, 1234);
    expect(frameB.points).toEqual(frameA.points);
  });

  it('draws the walk cycle identically for the same simTimeMs', () => {
    // A separate check from the one above: the invulnerability flash and the
    // walk cycle are two different lines that each used to read Date.now()
    // independently, so fixing one does not prove the other was fixed.
    //
    // Worth being honest about what this does and does not catch: two calls
    // this close together would usually land in the same millisecond even if
    // this line still read Date.now(), so a regression back to it is caught
    // most of the time here, not every time — confirmed by mutating it back
    // and re-running this a few times, which failed on some runs and passed
    // on others. It pins the intended behaviour correctly; it just is not an
    // airtight guard against that one specific regression the way a
    // synchronous, non-time-based check would be.
    const subject = spriteHero('FEET_MASTER', { action: 'WALK' });
    const frameA = new RecordingContext();
    renderEntitySprite(asContext(frameA), subject, 0, 0, 777);
    const frameB = new RecordingContext();
    renderEntitySprite(asContext(frameB), subject, 0, 0, 777);
    expect(frameB.points).toEqual(frameA.points);
  });

  /**
   * One case per animated site in this file, because each reads simTimeMs on
   * its own line and fixing one proves nothing about the others.
   *
   * The shape is always the same: render the same entity at two simulated
   * times far enough apart to move the animation, and require the drawing to
   * differ. That is also what makes these a guard rather than a description —
   * a line reverted to Date.now() returns the same value for both calls, so
   * the two renders come out identical and the test fails. Measured: with the
   * walk cycle reverted, this style of check failed on 10 runs out of 10,
   * while comparing two renders at the *same* simTimeMs failed on 1 of 10.
   */
  it('animates the enemy walk cycle with simulated time', () => {
    const subject = spriteEnemy('PURITY_PATROL', { action: 'WALK' });
    const early = new RecordingContext();
    renderEntitySprite(asContext(early), subject, 0, 0, 0);
    const later = new RecordingContext();
    renderEntitySprite(asContext(later), subject, 0, 0, 5000);
    expect(later.points).not.toEqual(early.points);
  });

  it('animates the power move aura with simulated time', () => {
    const subject = spriteHero('FEET_MASTER', { action: 'POWER_MOVE' });
    const early = new RecordingContext();
    renderEntitySprite(asContext(early), subject, 0, 0, 0);
    const later = new RecordingContext();
    renderEntitySprite(asContext(later), subject, 0, 0, 5000);
    expect(later.points).not.toEqual(early.points);
  });

  /**
   * Fun Maker in flight animates from three separate lines at once — the two
   * jet glows, and the left and right thruster plumes — so "the drawing
   * changed" is too weak a claim here: revert any one of them and the other
   * two still move the picture, and a test asserting only inequality passes
   * while the regression ships. Counting the points that moved is what makes
   * each line individually accountable, since losing one drops the count.
   */
  const movedPoints = (a: RecordingContext, b: RecordingContext) => {
    let moved = 0;
    for (let i = 0; i < Math.max(a.points.length, b.points.length); i++) {
      const p = a.points[i];
      const q = b.points[i];
      if (!p || !q || p.x !== q.x || p.y !== q.y) moved++;
    }
    return moved;
  };

  const atTwoTimes = (subject: EntityState) => {
    const early = new RecordingContext();
    renderEntitySprite(asContext(early), subject, 0, 0, 0);
    const later = new RecordingContext();
    renderEntitySprite(asContext(later), subject, 0, 0, 5000);
    return movedPoints(early, later);
  };

  it("animates Fun Maker's jet glow, which a jump draws without the plumes", () => {
    // Two arcs, each recorded as a bounding-box pair: four points.
    expect(atTwoTimes(spriteHero('FUN_MAKER', { action: 'JUMP', z: 60 }))).toBe(4);
  });

  it("animates Fun Maker's thruster plumes on top of the jet glow in flight", () => {
    // The jump's four, plus one moving vertex per plume.
    expect(atTwoTimes(spriteHero('FUN_MAKER', { action: 'FLYING', z: 60 }))).toBe(6);
  });

  /**
   * The damage flash changes nothing but transparency, so it leaves no mark on
   * geometry or colour. `alphas` is what makes it observable at all.
   *
   * 0ms and 60ms sit on opposite sides of the flash's toggle, so the alpha in
   * force during the sprite's own draw calls has to differ between them.
   */
  it('animates the damage flash with simulated time', () => {
    const subject = spriteHero('FEET_MASTER', { action: 'IDLE', invulnerableTimer: 40 });
    const lit = new RecordingContext();
    renderEntitySprite(asContext(lit), subject, 0, 0, 0);
    const dark = new RecordingContext();
    renderEntitySprite(asContext(dark), subject, 0, 0, 60);
    expect(dark.alphas).not.toEqual(lit.alphas);
  });

  it('animates when simTimeMs advances, so it is not simply ignored', () => {
    // The recorder's `operations` log deliberately only tracks call type and
    // colour — resilient to visual tweaks by design — so it wouldn't show a
    // walk cycle shifting a few pixels. Geometry lives in `points`, the
    // recorded coordinates in the caller's own space.
    const subject = spriteHero('FEET_MASTER', { action: 'WALK' });
    const early = new RecordingContext();
    renderEntitySprite(asContext(early), subject, 0, 0, 0);
    const later = new RecordingContext();
    renderEntitySprite(asContext(later), subject, 0, 0, 5000);
    expect(later.points).not.toEqual(early.points);
  });
});

/**
 * Sayonara's build.
 *
 * She was drawn at roughly half the height of the box she stood in and less
 * mass than a grunt, so the boss the whole first stage builds toward arrived
 * looking like set dressing. These pin the three things that were wrong: the
 * size, the fact that being down looked identical to being up, and the collar
 * still burning after the spell that lit it was broken.
 */
describe('Sayonara reads as the animal her data describes', () => {
  const shape = (recorder: RecordingContext) =>
    recorder.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('|');

  /**
   * The animal, without the furniture above it.
   *
   * The name plate and health bar hang off `height`, a long way over her head,
   * and bounds() cannot tell them apart from the body. Anything drawn more
   * than 140px up is one of them: the build itself lives inside 110.
   */
  const bodyBounds = (recorder: RecordingContext) => {
    const body = recorder.points.filter((p) => p.y > -140);
    return {
      minX: Math.min(...body.map((p) => p.x)),
      maxX: Math.max(...body.map((p) => p.x)),
      minY: Math.min(...body.map((p) => p.y)),
      maxY: Math.max(...body.map((p) => p.y)),
    };
  };

  const dog = (over: Partial<EntityState> = {}) =>
    spriteEnemy('BOSS_SAYONARA', {
      width: ENEMIES.BOSS_SAYONARA.hitbox.width,
      height: ENEMIES.BOSS_SAYONARA.hitbox.height,
      ...over,
    });

  it('fills the box it declares instead of rattling around inside it', () => {
    const box = bodyBounds(render(dog()));
    const declared = ENEMIES.BOSS_SAYONARA.hitbox;

    // Body only: the health bar and name plate hang far above the animal and
    // are not part of the silhouette being measured.
    const drawnHeight = -box.minY;
    const overhang = Math.max(Math.abs(box.minX), Math.abs(box.maxX));

    // 0.95 rather than 0.9. At 0.9 the floor sits at 94.5px, and the drawing
    // at its previous scale is 99px tall — so shrinking the build back while
    // leaving the box at its new size passed, which is exactly the half of
    // "box and drawing are one decision" that nothing else here guards. The
    // real drawing clears 0.95 by more than 10px.
    expect(drawnHeight, `drew ${drawnHeight.toFixed(0)}px tall`).toBeGreaterThan(
      declared.height * 0.95
    );
    expect(drawnHeight).toBeLessThan(declared.height * 1.25);
    expect(overhang, `reached ${overhang.toFixed(0)}px from centre`).toBeLessThan(
      declared.width * 0.65
    );
  });

  it('is built longer than she is tall, like something on four legs', () => {
    const box = bodyBounds(render(dog()));
    expect(box.maxX - box.minX).toBeGreaterThan(-box.minY);
  });

  it('carries more mass than the grunt she used to be outdrawn by', () => {
    const hers = bodyBounds(render(dog()));
    const grunt = bodyBounds(render(spriteEnemy('PURITY_PATROL')));
    expect(hers.maxX - hers.minX).toBeGreaterThan(grunt.maxX - grunt.minX);
  });

  it('lies down when she is down, instead of standing there looking dangerous', () => {
    const standing = render(dog({ action: 'IDLE' }));
    const floored = render(dog({ action: 'IDLE', downed: true, hp: 1 }));

    expect(shape(floored)).not.toBe(shape(standing));
    expect(
      -bodyBounds(floored).minY,
      'a body on the floor is not as tall as one on its feet'
    ).toBeLessThan(-bodyBounds(standing).minY);
  });

  it('keeps her paws on the floor in every pose', () => {
    // She lifted off during the wind-up and the recovery — 6px and 8px of
    // daylight underneath — because the sink was applied to the legs as well
    // as the body. With the heights snapping between phases on top of it, the
    // thing it read as in play was a dog that hops rather than one that
    // crouches.
    const poses: Array<[string, Partial<EntityState>]> = [
      ['idle', {}],
      ['walking', { vx: 2, action: 'WALK' }],
      ['winding up', { chargeState: 'TELEGRAPH' }],
      ['charging', { chargeState: 'CHARGE', vx: 8.5, action: 'WALK' }],
      ['recovering', { chargeState: 'RECOVER' }],
      ['biting', { action: 'PUNCH1', actionTimer: 12 }],
      ['down', { downed: true, hp: 1 }],
    ];

    for (const [name, over] of poses) {
      const floor = bodyBounds(render(dog(over))).maxY;
      expect(floor, `${name} left her ${(-floor).toFixed(1)}px above the ground`).toBeCloseTo(0, 1);
    }
  });

  it('puts the collar out once the spell holding it is broken', () => {
    const leashed = render(dog({ downed: true, hp: 1 }));
    const freed = render(dog({ downed: true, hp: 1, freed: true }));

    // Same pose either way — the difference has to be the light, not the body.
    expect(bodyBounds(freed)).toEqual(bodyBounds(leashed));
    expect(freed.operations.join('|')).not.toBe(leashed.operations.join('|'));
  });
});

/**
 * Power move poses.
 *
 * The supers were the only actions in the game that drew the standing body: a
 * whirlwind, a corkscrew, an armoured kick and a pounce all rendered as the
 * idle stance with a coloured circle behind it. These pin the poses as poses —
 * that the body leaves its stance at all, and that it keeps moving through the
 * animation rather than snapping to one frame and holding it.
 */
describe('power move poses', () => {
  const shape = (recorder: RecordingContext) =>
    recorder.points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('|');

  const poseOf = (charId: CharacterId, actionTimer: number) =>
    shape(
      render(
        spriteHero(charId, {
          action: charId === 'ANGRY_CORSO' ? 'BITING' : 'POWER_MOVE',
          actionTimer,
        })
      )
    );

  for (const charId of HEROES) {
    it(`${charId} leaves its standing pose to throw its super`, () => {
      const idle = shape(render(spriteHero(charId, { action: 'IDLE' })));
      expect(poseOf(charId, POWER_MOVE_FRAMES)).not.toBe(idle);
    });

    it(`${charId} keeps moving through the super`, () => {
      // Sampled at the commit and near the end: a pose driven by actionTimer
      // differs across the move, a pose that ignores it does not.
      expect(poseOf(charId, POWER_MOVE_FRAMES)).not.toBe(poseOf(charId, 6));
    });
  }

  it('stays inside the containment box on every frame of every super', () => {
    // The geometry suite above samples one frame per pose, at actionTimer 0 --
    // which for a super is the frame it ends on, with the leap already landed
    // and the swing already unwound. That is the cheapest frame in the whole
    // animation, so it proves nothing about the expensive ones. Measured
    // worst case across the full sweep: 238px, at the peak of Corso's pounce.
    const LIMIT = 260;
    for (const charId of HEROES) {
      for (let actionTimer = 0; actionTimer <= POWER_MOVE_FRAMES; actionTimer++) {
        const box = render(
          spriteHero(charId, {
            action: charId === 'ANGRY_CORSO' ? 'BITING' : 'POWER_MOVE',
            actionTimer,
          })
        ).bounds()!;
        const worst = Math.max(
          Math.abs(box.minX),
          Math.abs(box.maxX),
          Math.abs(box.minY),
          Math.abs(box.maxY)
        );
        expect(
          worst,
          `${charId} reached ${worst.toFixed(0)}px at actionTimer ${actionTimer}`
        ).toBeLessThan(LIMIT);
      }
    }
  });

  it('takes Angry Corso off the ground and lands him before the move ends', () => {
    // The leap exists only in the drawing -- the engine keeps him planted --
    // so the guard has to be the drawing: the body sits higher at the peak
    // than at rest, and is back down by the final frame.
    const top = (actionTimer: number) =>
      render(spriteHero('ANGRY_CORSO', { action: 'BITING', actionTimer })).bounds()!.minY;

    const grounded = render(spriteHero('ANGRY_CORSO', { action: 'IDLE' })).bounds()!.minY;
    expect(top(30), 'he leaves the ground a third of the way in').toBeLessThan(grounded);
    expect(top(0), 'and is standing again when it ends').toBeGreaterThan(top(30));
  });

  it('keeps Angry Corso\'s tattoos on him while he bites', () => {
    // The bite drew a single unstroked rectangle where two arms belong, so it
    // was the one action in the game where the flame marks disappeared. The
    // helper that draws them uses quadratic curves and nothing else in this
    // sprite does, which is what makes it countable from outside.
    const curvesIn = (action: 'IDLE' | 'BITING') => {
      const recorder = new RecordingContext();
      renderEntitySprite(
        asContext(recorder),
        spriteHero('ANGRY_CORSO', { action, actionTimer: action === 'BITING' ? 30 : 0 }),
        0,
        0,
        0
      );
      return recorder.curveCount;
    };

    expect(curvesIn('BITING'), 'the bite lost its flames').toBeGreaterThan(0);
    expect(curvesIn('BITING')).toBeGreaterThanOrEqual(curvesIn('IDLE'));
  });

  it("counts Angry Corso's bite as a super, so it gets the banner and the trail", () => {
    expect(isPowerMovePose('BITING')).toBe(true);
    expect(isPowerMovePose('POWER_MOVE')).toBe(true);
    expect(isPowerMovePose('KICK')).toBe(false);

    // The trail draws the body a second time, so the bite should cost roughly
    // twice the geometry of a pose that has no trail behind it.
    const bite = render(spriteHero('ANGRY_CORSO', { action: 'BITING' })).points.length;
    const idle = render(spriteHero('ANGRY_CORSO', { action: 'IDLE' })).points.length;
    expect(bite).toBeGreaterThan(idle * 1.5);
  });
});
