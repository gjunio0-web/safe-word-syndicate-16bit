import { describe, expect, it } from 'vitest';
import {
  advance,
  corpses,
  countAttackFrames,
  input,
  livingEnemies,
  NEUTRAL,
  stageEnemies,
  startEngine,
} from './helpers';
import { STAGES } from '../game/stageData';
import { ARENA_MAX_Y, ARENA_MIN_Y, STREET_TOP_Y } from '../game/constants';
import { GameEngine } from '../game/engine';
import { ENEMIES } from '../game/characterData';

describe('combat', () => {
  /**
   * Body separation was applied to every entity pair with the same spacing, and
   * that spacing is about the melee attack range. Only one enemy fitted inside
   * the attack band and the rest shoved it out, so waves of two or more — that
   * is, every wave — never landed a hit.
   */
  it('lets a crowd of melee enemies actually attack', () => {
    const engine = startEngine();
    advance(engine, 60);
    stageEnemies(engine, [
      { type: 'PURITY_PATROL', dx: 180, dy: -50 },
      { type: 'PURITY_PATROL', dx: 180, dy: 0 },
      { type: 'PURITY_PATROL', dx: 180, dy: 50 },
    ]);

    expect(countAttackFrames(engine, 1200)).toBeGreaterThan(100);
  });

  it('lets a boss wave damage a stationary player', () => {
    const engine = startEngine();
    advance(engine, 60);
    stageEnemies(engine, [
      { type: 'BOSS_SAYONARA', dx: 180 },
      { type: 'PURITY_PATROL', dx: 180, dy: -50 },
      { type: 'PURITY_PATROL', dx: 180, dy: 50 },
    ]);
    const before = engine.player1!.hp;

    advance(engine, 1200);
    expect(engine.player1!.hp).toBeLessThan(before);
  });

  /**
   * `invulnerableTimer` was decremented in updatePlayer and again in
   * updateEntityPhysics, which runs for every entity including players. Every
   * invulnerability window lasted half as long as written.
   */
  it('runs invulnerability for its full duration', () => {
    const engine = startEngine();
    advance(engine, 60);
    engine.player1!.invulnerableTimer = 40;

    let frames = 0;
    while (engine.player1!.invulnerableTimer > 0 && frames < 300) {
      engine.update(NEUTRAL);
      frames++;
    }
    expect(frames).toBe(40);
  });

  /**
   * The corpse filter read `actionTimer < 60`, which is always true for a body
   * whose death timer counts down from 18 to 0: it preserved exactly what it
   * was meant to discard.
   */
  it('removes bodies once the death animation ends', () => {
    const engine = startEngine();
    advance(engine, 60);
    stageEnemies(engine, [
      { type: 'PURITY_PATROL', dx: 120 },
      { type: 'PURITY_PATROL', dx: 160 },
    ]);
    advance(engine, 2);

    for (const enemy of livingEnemies(engine)) {
      enemy.hp = 0;
      enemy.action = 'HURT';
      enemy.actionTimer = 18;
    }
    advance(engine, 60);

    expect(corpses(engine)).toHaveLength(0);
  });

  /**
   * Victory fired wherever Madam Mizydia died, and she is the boss of stage 2
   * as well — beating her there skipped the final stage entirely.
   */
  describe('final boss', () => {
    // Killed through the public path — a real punch — because bossDefeated is
    // set inside damage resolution, not by writing hp to zero.
    const killMizydia = (stageIndex: number) => {
      const engine = startEngine(stageIndex);
      advance(engine, 60);
      stageEnemies(engine, [{ type: 'BOSS_MADAM_MIZYDIA', dx: 70 }]);
      advance(engine, 2);
      livingEnemies(engine).forEach((boss) => {
        // The Censure Barrier absorbs 150 before health is touched; this test
        // is about what happens when she dies, not about breaking the shield.
        boss.shieldHp = 0;
        boss.hp = 1;
      });

      // She is a caster now and backs away, so the player has to close the
      // distance the way a person would rather than standing and swinging.
      for (let i = 0; i < 1200 && livingEnemies(engine).length > 0; i++) {
        const boss = livingEnemies(engine)[0];
        const towards = boss.x > engine.player1!.x ? { right: true } : { left: true };
        const near = Math.abs(boss.x - engine.player1!.x) < 90;
        engine.update(input(near ? { punch: i % 8 < 2 } : towards));
      }
      return engine;
    };

    it('does not end the campaign on a mid-campaign stage', () => {
      const stageIndex = STAGES.findIndex((s) => !s.isFinalStage && s.id === 2);
      expect(killMizydia(stageIndex).bossDefeated).toBe(false);
    });

    it('ends the campaign on the final stage', () => {
      const stageIndex = STAGES.findIndex((s) => s.isFinalStage);
      expect(killMizydia(stageIndex).bossDefeated).toBe(true);
    });
  });
});

describe('movement', () => {
  /**
   * Body collisions split the correction evenly, so every adjacent enemy shoved
   * the player once per frame. Two neighbours halved the player's walking
   * speed, precisely when a fight got busy.
   */
  it('keeps most of the player speed when walking through a crowd', () => {
    const walk = input({ right: true });

    const distanceWith = (enemies: number) => {
      const engine = startEngine();
      advance(engine, 60);
      stageEnemies(
        engine,
        Array.from({ length: enemies }, (_, i) => ({
          type: 'PURITY_PATROL' as const,
          dx: 60 + i * 20,
          dy: i % 2 ? 12 : -12,
        }))
      );
      for (const enemy of livingEnemies(engine)) {
        enemy.hp = 9999;
        // This test is about the body-collision push, which is deterministic.
        // At arm's length the melee AI also rolls a ~4%/frame punch chance
        // that shoves the player with an unrelated, unseeded vx kick — left
        // alone, that occasionally lands enough hits in 300 frames to swing
        // the measured distance across the assertion's threshold. Keeping
        // actionTimer permanently nonzero blocks the punch branch without
        // touching the movement AI the test actually exercises.
        enemy.actionTimer = 999999;
      }

      const from = engine.player1!.x;
      advance(engine, 300, walk);
      return engine.player1!.x - from;
    };

    const free = distanceWith(0);
    expect(distanceWith(2) / free).toBeGreaterThan(0.8);
    expect(distanceWith(4) / free).toBeGreaterThan(0.7);
  });
});

describe('wave spawning', () => {
  /**
   * `spawnSide: 'BOTH'` fell through to the RIGHT branch, so four waves meant
   * to surround the player arrived single file from one side.
   */
  it('splits BOTH waves across both sides', () => {
    const waveIndex = STAGES[0].waves.findIndex((w) =>
      w.enemies.some((group) => group.spawnSide === 'BOTH')
    );
    expect(waveIndex).toBeGreaterThan(-1);

    // Driven through the real trigger rather than a direct spawn call: walk
    // forward, clearing each wave, until the BOTH wave fires on its own.
    const engine = startEngine();
    const walk = input({ right: true });
    for (let i = 0; i < 4000 && engine.currentWaveIndex < waveIndex; i++) {
      livingEnemies(engine).forEach((e) => {
        e.hp = 0;
      });
      engine.update(walk);
    }
    for (let i = 0; i < 2000 && livingEnemies(engine).length === 0; i++) {
      engine.update(walk);
    }

    const enemies = livingEnemies(engine);
    expect(enemies.length).toBeGreaterThan(1);

    const player = engine.player1!;
    const left = enemies.filter((e) => e.x < player.x).length;
    expect(left).toBeGreaterThan(0);
    expect(enemies.length - left).toBeGreaterThan(0);
  });
});

/**
 * Ranged attacks were half-implemented: the boss dealt damage from a quarter of
 * a screen away with nothing drawn, projectiles only ever hit player one, and
 * the Conversion Therapist's declared 300px range was contradicted by a
 * hardcoded 220 in the AI.
 */
describe('ranged attacks', () => {
  const withBoss = () => {
    const engine = startEngine();
    advance(engine, 60);
    stageEnemies(engine, [{ type: 'BOSS_MADAM_MIZYDIA', dx: 200 }]);
    advance(engine, 2);
    return engine;
  };

  it('makes the boss launch a visible projectile instead of an invisible punch', () => {
    const engine = withBoss();
    let sawHazard = false;
    for (let i = 0; i < 1200 && !sawHazard; i++) {
      engine.update(NEUTRAL);
      sawHazard = engine.hazards.some((h) => h.type === 'LASER_CROSS');
    }
    expect(sawHazard).toBe(true);
  });

  it('drives bossPhase from the state of the fight', () => {
    const engine = withBoss();
    advance(engine, 120);
    const boss = livingEnemies(engine)[0];
    expect(boss.bossPhase).toBe(1);

    boss.shieldHp = 0;
    boss.hp = boss.maxHp * 0.2;
    advance(engine, 5);
    expect(boss.bossPhase).toBe(2);
  });

  it('damages player two, who used to be immune to every projectile', () => {
    const engine = startEngine(0, 'FEET_MASTER', 'FUN_MAKER');
    engine.setActiveDialogue(null);
    advance(engine, 60);
    // P1 and P2 spawn 44px apart, inside the 48px blast radius, so a hazard
    // dropped on P2 would hit P1 first and prove nothing.
    const p2 = engine.player2!;
    p2.x = engine.player1!.x + 220;
    const before = p2.hp;

    engine.hazards.push({
      id: 'test_vial',
      type: 'OFFERING_DRONE',
      x: p2.x,
      y: p2.y,
      z: 0,
      vx: 0,
      vy: 0,
      timer: 60,
      active: true,
    });
    engine.update(NEUTRAL);

    expect(p2.hp).toBeLessThan(before);
  });

  it('honours the declared attack range instead of a hardcoded one', () => {
    const engine = startEngine();
    advance(engine, 60);
    // 260 sits between the old hardcoded 220 and the declared 300.
    stageEnemies(engine, [{ type: 'CONVERSION_THERAPIST', dx: 260 }]);
    advance(engine, 2);

    const therapist = livingEnemies(engine)[0];
    const holdAt = therapist.x;

    let threw = false;
    for (let i = 0; i < 1500 && !threw; i++) {
      // Pinned in place each frame. Left free it simply walks to 220 and
      // throws from there, which would pass whatever the range check says.
      therapist.x = holdAt;
      engine.update(NEUTRAL);
      threw = engine.hazards.length > 0;
    }
    expect(threw).toBe(true);
  });

  /**
   * The cast check only required `dist < attackRange`, ignoring the holding
   * band the rest of her AI uses to keep distance. That let her fire an
   * Excommunication wave from point-blank range, where the ~48px hit radius
   * meant a handful of frames of travel — far under human reaction time and
   * effectively an instant, unavoidable hit against a player pressing the
   * attack, the natural way to play a brawler.
   */
  it('never casts the excommunication wave from point-blank range', () => {
    const engine = withBoss();
    const player = engine.player1!;
    const minCastDist = ENEMIES.BOSS_MADAM_MIZYDIA.attackRange * 0.8 - 60;
    const castDistances: number[] = [];

    for (let i = 0; i < 3600; i++) {
      const boss = livingEnemies(engine)[0];
      const hazardsBefore = engine.hazards.length;
      if (!boss) break;

      // Sweep the player through a wide, continuously changing range of
      // distances, including point-blank, so casts get sampled everywhere a
      // real fight could put the player relative to her.
      const t = i % 240;
      const target = 20 + (t < 120 ? t : 240 - t) * 3;
      const dist = Math.abs(boss.x - player.x);
      engine.update(input(dist < target ? { left: true } : { right: true }));

      if (engine.hazards.length > hazardsBefore) {
        castDistances.push(Math.hypot(boss.x - player.x, boss.y - player.y));
      }
    }

    expect(castDistances.length).toBeGreaterThan(0);
    for (const d of castDistances) {
      expect(d).toBeGreaterThanOrEqual(minCastDist);
    }
  });
});

/**
 * `difficulty` was stored on the engine and never read: every setting played
 * identically. The attack-slot cap gave it a real meaning.
 */
describe('difficulty', () => {
  const engagedAt = (difficulty: 'EASY' | 'NORMAL' | 'PUNK_HARD') => {
    const engine = new GameEngine(STAGES[0], 'FEET_MASTER', undefined, {
      soundEnabled: false,
      musicEnabled: false,
      difficulty,
      showHitboxes: false,
      crtFilter: false,
      volume: 0,
    });
    engine.setActiveDialogue(null);
    advance(engine, 60);
    stageEnemies(engine, [
      { type: 'PURITY_PATROL', dx: 150, dy: -40 },
      { type: 'PURITY_PATROL', dx: 170, dy: 0 },
      { type: 'PURITY_PATROL', dx: 150, dy: 40 },
      { type: 'PURITY_PATROL', dx: 190, dy: 20 },
    ]);

    // Peak number of enemies inside striking distance at any one moment.
    let peak = 0;
    for (let i = 0; i < 900; i++) {
      engine.update(NEUTRAL);
      const close = livingEnemies(engine).filter(
        (e) => Math.abs(e.x - engine.player1!.x) < 110
      ).length;
      peak = Math.max(peak, close);
    }
    return peak;
  };

  it('sends fewer attackers on EASY than on PUNK_HARD', () => {
    expect(engagedAt('EASY')).toBeLessThan(engagedAt('PUNK_HARD'));
  });

  it('leaves NORMAL between the two', () => {
    const normal = engagedAt('NORMAL');
    expect(normal).toBeGreaterThanOrEqual(engagedAt('EASY'));
    expect(normal).toBeLessThanOrEqual(engagedAt('PUNK_HARD'));
  });
});

/**
 * Depth band.
 *
 * Fighters were clamped to y >= 220 while the road starts at y = 240, so
 * walking all the way back put them on the twenty-pixel strip above the kerb —
 * standing on nothing. Scaled onto a real display that reads as a 46-pixel gap
 * between the soles and the street.
 */
describe('walkable depth band', () => {
  it('keeps the near and far edges inside the drawn road', () => {
    expect(ARENA_MIN_Y).toBeGreaterThanOrEqual(STREET_TOP_Y);
    expect(ARENA_MAX_Y).toBeLessThanOrEqual(450);
  });

  it('does not let a player walk above the road', () => {
    const engine = startEngine();
    advance(engine, 60);

    // Checked every frame, not only at the end: clamping before movement
    // instead of after leaves the fighter a frame's velocity out of bounds
    // whenever the frame ends, which is the position that actually gets drawn.
    const up = input({ up: true });
    for (let i = 0; i < 400; i++) {
      engine.update(up);
      expect(engine.player1!.y).toBeGreaterThanOrEqual(STREET_TOP_Y);
    }
  });

  it('does not let an enemy walk above the road either', () => {
    const engine = startEngine();
    advance(engine, 60);
    stageEnemies(engine, [{ type: 'PURITY_PATROL', dx: 100, dy: -200 }]);
    advance(engine, 300);

    for (const enemy of livingEnemies(engine)) {
      expect(enemy.y).toBeGreaterThanOrEqual(STREET_TOP_Y);
    }
  });

  it('spawns waves inside the band', () => {
    const engine = startEngine();
    advance(engine, 400, input({ right: true }));

    for (const enemy of livingEnemies(engine)) {
      expect(enemy.y).toBeGreaterThanOrEqual(ARENA_MIN_Y);
      expect(enemy.y).toBeLessThanOrEqual(ARENA_MAX_Y);
    }
  });
});
