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
import {
  ARENA_MAX_Y,
  ARENA_MIN_Y,
  OUTRO_MAX_FRAMES,
  PLAYER_BODY_SEPARATION_X,
  PLAYER_BODY_SEPARATION_Y,
  SAYONARA_CHARGE_SPEED,
  SAYONARA_RECOVER_FRAMES,
  SAYONARA_TACKLE_DEPTH,
  STREET_TOP_Y,
  POWER_MOVE_FRAMES,
  POWER_MOVE_ACTIVE_FRAMES,
} from '../game/constants';
import { GameEngine } from '../game/engine';
import { ENEMIES } from '../game/characterData';
import { CharacterId, EnemyType, EntityState } from '../types';

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

/**
 * Sayonara is a hostage, not an enemy.
 *
 * She used to die like anything else, which made killing her the natural end of
 * the fight rather than a decision — and the victory text then claimed she had
 * walked away free. Zero health now drops her; striking her from the floor is
 * what kills her, and that is the only thing separating the two endings.
 */
describe('Sayonara', () => {
  const withSayonara = () => {
    const engine = startEngine();
    advance(engine, 60);
    stageEnemies(engine, [{ type: 'BOSS_SAYONARA', dx: 90 }]);
    advance(engine, 2);
    return engine;
  };

  const sayonara = (engine: ReturnType<typeof startEngine>) =>
    engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA');

  /** Beats on her until she drops, then keeps going for `extra` frames. */
  const beat = (engine: ReturnType<typeof startEngine>, extra: number) => {
    const punch = input({ punch: true });
    for (let i = 0; i < 900; i++) {
      const target = sayonara(engine);
      if (!target || target.downed) break;
      target.hp = 1;
      engine.update(i % 8 < 2 ? punch : NEUTRAL);
    }
    for (let i = 0; i < extra; i++) engine.update(i % 8 < 2 ? punch : NEUTRAL);
  };

  it('goes down instead of dying', () => {
    const engine = withSayonara();
    beat(engine, 0);

    expect(sayonara(engine), 'she should still be on the field').toBeDefined();
    expect(sayonara(engine)!.downed).toBe(true);
    expect(engine.sayonaraKilled).toBe(false);
  });

  it('stops holding the wave open once down, so sparing her cannot soft-lock', () => {
    const engine = withSayonara();
    // Put the engine in a real wave, which `stageEnemies` bypasses.
    (engine as unknown as { isWaveActive: boolean }).isWaveActive = true;
    beat(engine, 0);

    // Still on the field, and no longer counted among the enemies to clear.
    expect(sayonara(engine), 'she must not be removed').toBeDefined();
    expect(sayonara(engine)!.downed).toBe(true);
    expect(
      (engine as unknown as { isWaveActive: boolean }).isWaveActive,
      'the wave should have closed'
    ).toBe(false);
  });

  it('is only killed by being struck again on the floor', () => {
    const engine = withSayonara();
    beat(engine, 120);
    expect(engine.sayonaraKilled).toBe(true);
  });

  it('walks away when Mizydia falls, even from the floor', () => {
    const engine = startEngine(STAGES.findIndex((s) => s.isFinalStage));
    advance(engine, 60);
    stageEnemies(engine, [
      { type: 'BOSS_SAYONARA', dx: 90 },
      { type: 'BOSS_MADAM_MIZYDIA', dx: 200 },
    ]);
    advance(engine, 2);

    const dog = sayonara(engine)!;
    const punch = input({ punch: true });
    for (let i = 0; i < 400 && !dog.downed; i++) {
      dog.hp = 1;
      engine.update(i % 8 < 2 ? punch : NEUTRAL);
    }
    expect(dog.downed).toBe(true);

    // Now finish Mizydia.
    const boss = engine.entities.find((e) => e.enemyType === 'BOSS_MADAM_MIZYDIA')!;
    boss.shieldHp = 0;
    for (let i = 0; i < 1200 && boss.hp > 0; i++) {
      boss.hp = 1;
      const near = Math.abs(boss.x - engine.player1!.x) < 90;
      engine.update(input(near ? { punch: i % 8 < 2 } : boss.x > engine.player1!.x ? { right: true } : { left: true }));
    }

    // The campaign is not won on the frame Mizydia drops any more. She walks
    // out first, and the victory screen waits for her.
    expect(engine.bossDefeated, 'the ending holds while she leaves').toBe(false);
    expect(engine.sayonaraKilled, 'knocking her out is not killing her').toBe(false);
    expect(dog.downed, 'the collar breaks and she gets up').toBe(false);
    // Checked by action rather than velocity: physics keeps rewriting vx.
    expect(dog.action).toBe('WALK');
    expect(dog.facing).toBe('RIGHT');

    const outro = engine.activeDialogue!;
    expect(outro[0].speaker).toBe('Sayonara');
    expect(outro[0].portrait, 'she is not wearing the collar she just lost').toBe(
      'SAYONARA_FREED'
    );

    // Landing by the ceiling alone proves nothing: a Sayonara stuck bouncing
    // off the arena's own boundary clamp (which reverses vx on anything that
    // crosses cameraX + 830, with no exemption for a scripted exit) hits
    // bossDefeated at exactly this timeout too, having never actually left.
    // Advancing in a tight loop and checking after each frame is what tells
    // the two apart.
    let framesToClear = 0;
    while (!engine.bossDefeated && framesToClear < OUTRO_MAX_FRAMES) {
      engine.update(NEUTRAL);
      framesToClear++;
    }
    expect(engine.bossDefeated, 'and then it lands').toBe(true);
    expect(framesToClear, 'she leaves well before the timeout, not because of it').toBeLessThan(
      OUTRO_MAX_FRAMES / 2
    );
  });

  it('does not stall the ending when there is nobody left to free', () => {
    const engine = startEngine(STAGES.findIndex((s) => s.isFinalStage));
    advance(engine, 60);
    stageEnemies(engine, [{ type: 'BOSS_MADAM_MIZYDIA', dx: 200 }]);
    advance(engine, 2);

    const boss = engine.entities.find(
      (e: { enemyType?: string }) => e.enemyType === 'BOSS_MADAM_MIZYDIA'
    )!;
    boss.shieldHp = 0;
    for (let i = 0; i < 1200 && boss.hp > 0; i++) {
      boss.hp = 1;
      const near = Math.abs(boss.x - engine.player1!.x) < 90;
      engine.update(input(near ? { punch: i % 8 < 2 } : boss.x > engine.player1!.x ? { right: true } : { left: true }));
    }

    expect(engine.bossDefeated, 'no walk to wait for').toBe(true);
  });
});

/**
 * The Matriarch's casting window.
 *
 * She roots herself for the half second a censure wave takes to leave her
 * hands, but there was nothing in it for the player: reaching her costs a chase
 * past a faster dog, and arriving during the one moment she cannot move paid
 * the same as arriving at any other. Measured, killing her first took 2.9 times
 * as long as killing Sayonara first, and that gap is what made the choice not a
 * choice.
 */
describe('punishing a cast', () => {
  const boss = (engine: ReturnType<typeof startEngine>) =>
    engine.entities.find((e) => e.enemyType === 'BOSS_MADAM_MIZYDIA')!;

  const damageDealt = (casting: boolean) => {
    const engine = startEngine(STAGES.findIndex((s) => s.isFinalStage));
    advance(engine, 60);
    stageEnemies(engine, [{ type: 'BOSS_MADAM_MIZYDIA', dx: 60 }]);

    const target = boss(engine);
    // Frozen from the moment she exists, including the settle-in advance
    // right below: left unpinned there, her own AI already has two free
    // frames to move her or roll her own cast before the measurement even
    // starts.
    target.stunTimer = 4;
    advance(engine, 2);

    target.shieldHp = 0;
    target.action = casting ? 'PUNCH1' : 'IDLE';
    target.actionTimer = casting ? 30 : 0;
    const before = target.hp;

    // One clean punch, with the pose held so the state cannot tick away.
    //
    // stunTimer is reset every frame so her own AI never runs: left alone,
    // the 'IDLE' branch lets her autonomous behaviour move her or roll her own
    // cast, which would consume draws and act on them. The player's forced
    // input is the only thing that should vary here. (The draws themselves are
    // deterministic now -- see setup.ts -- but a boss acting on her own would
    // still be a variable this measurement does not want.)
    for (let i = 0; i < 6; i++) {
      target.action = casting ? 'PUNCH1' : 'IDLE';
      target.stunTimer = 2;
      engine.update(input({ punch: i < 2 }));
    }
    return before - target.hp;
  };

  it('hurts more than hitting her at rest', () => {
    const normal = damageDealt(false);
    const punished = damageDealt(true);
    expect(normal).toBeGreaterThan(0);
    expect(punished).toBeGreaterThan(normal);
  });

  it('leaves other enemies unaffected, so it reads as her tell and not a global rule', () => {
    // A fresh engine per measurement: invulnerability frames from the first
    // punch would otherwise swallow the second.
    const hit = (casting: boolean) => {
      const engine = startEngine();
      advance(engine, 60);
      stageEnemies(engine, [{ type: 'PURITY_PATROL', dx: 60 }]);

      const grunt = engine.entities.find((e) => e.enemyType === 'PURITY_PATROL')!;
      // Frozen from the moment it exists, including the settle-in advance
      // right below: left unpinned there, the grunt's own AI already has two
      // free frames to roll its own attack before the measurement even
      // starts.
      grunt.stunTimer = 4;
      advance(engine, 2);

      const before = grunt.hp;
      for (let i = 0; i < 6; i++) {
        grunt.action = casting ? 'PUNCH1' : 'IDLE';
        // Reset every frame for the same reason: an 'IDLE' grunt runs its
        // own AI, which has its own small per-frame chance to throw a punch,
        // and a punch landing mid-measurement would be counted as damage this
        // test did not deal.
        //
        // This used to be load-bearing for a second reason that no longer
        // applies: Math.random was one unseeded stream shared by the whole
        // suite, so how many draws the tests before this one happened to make
        // decided whether the grunt swung -- failing intermittently in full
        // runs, never in isolation. setup.ts now reseeds before every test, so
        // ordering cannot move the result. The pinning stays because the
        // measurement should not depend on grunt AI at all, seeded or not.
        grunt.stunTimer = 2;
        engine.update(input({ punch: i < 2 }));
      }
      return before - grunt.hp;
    };

    expect(hit(false)).toBeGreaterThan(0);
    expect(hit(true)).toBe(hit(false));
  });
});

describe('the boss warning banner freezes the fight', () => {
  const withBossWave = () => {
    const stage = {
      ...STAGES[0],
      waves: [{ triggerX: 0, enemies: [{ type: 'BOSS_SAYONARA' as const, count: 1 }] }],
    };
    return new GameEngine(stage, 'FEET_MASTER');
  };

  it('holds simulated time and every position while the banner shows', () => {
    const engine = withBossWave();
    engine.update(NEUTRAL); // the triggering frame: spawns the boss, raises the banner
    expect(engine.getHudSnapshot().showBossWarning).toBe(true);

    const timeAtBannerStart = engine.simTimeMs;
    const xAtBannerStart = engine.player1!.x;
    const enemyXAtBannerStart = engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA')!.x;

    // Movement input held throughout — if anything moves while the banner is
    // up, this is what would catch it.
    for (let i = 0; i < 100; i++) engine.update(input({ right: true }));

    expect(engine.simTimeMs, 'the animation clock must not advance').toBe(timeAtBannerStart);
    expect(engine.player1!.x, 'the player must not move').toBe(xAtBannerStart);
    expect(
      engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA')!.x,
      'the enemy must not move either'
    ).toBe(enemyXAtBannerStart);
  });

  /**
   * Pins the length, because the ordering that produces it is easy to lose.
   *
   * The flag is read before bossWarningTimer is decremented rather than after,
   * and that one line is the whole difference between 180 frozen frames and
   * 179 — reading it after lets the banner's final frame run the simulation
   * underneath itself. Neither ordering affects the frame that raises the
   * banner: bossWarningTimer is set inside updateWaveTriggers, which runs later
   * in update(), so at the top of that frame the timer is still zero either way
   * and the wave spawns regardless. Without this test the two orderings are
   * indistinguishable to the suite.
   */
  it('freezes for the banner\'s full 180 frames, not one fewer', () => {
    const engine = withBossWave();
    engine.update(NEUTRAL);

    let frozen = 0;
    for (let i = 0; i < 400; i++) {
      const before = engine.simTimeMs;
      engine.update(input({ right: true }));
      if (engine.simTimeMs !== before) break;
      frozen++;
    }
    expect(frozen, 'three seconds at sixty steps a second').toBe(180);
  });

  it('resumes normally once the banner clears', () => {
    const engine = withBossWave();
    engine.update(NEUTRAL);
    for (let i = 0; i < 179; i++) engine.update(input({ right: true }));

    const stillFrozen = engine.getHudSnapshot().showBossWarning;
    engine.update(input({ right: true })); // the 180th frame since the trigger
    const clockAfter = engine.simTimeMs;

    engine.update(input({ right: true }));
    expect(stillFrozen, 'sanity: the banner was actually up before this').toBe(true);
    expect(engine.getHudSnapshot().showBossWarning, 'the banner is gone').toBe(false);
    expect(engine.simTimeMs, 'and time is moving again').toBeGreaterThan(clockAfter);
  });
});

/**
 * Attack slots go to fighters who actually use them.
 *
 * The slot is permission to close on the player and swing. Handing one to an
 * enemy who never does that spends the difficulty budget on nothing, and on
 * EASY — one slot — it spends all of it.
 *
 * Neither boss queues any more. The Matriarch casts from behind her standoff
 * and her branch never consults the queue at all; Sayonara paces herself off
 * her own tackle cooldown. What is left in the queue is the crowd the queue
 * was written for.
 */
describe('attack slots', () => {
  const slotsOf = (engine: GameEngine) =>
    (engine as unknown as { attackSlots: Set<string> }).attackSlots;

  const onEasy = (engine: GameEngine) => {
    (engine as unknown as { settings: { difficulty: string } }).settings.difficulty = 'EASY';
    return engine;
  };

  const idsIn = (engine: GameEngine, type: string) =>
    engine.entities.filter((e) => e.enemyType === type).map((e) => e.id);

  it('seats neither boss, however close to the player they stand', () => {
    const engine = onEasy(startEngine(STAGES.findIndex((s) => s.isFinalStage)));
    advance(engine, 60);
    // Deliberately closer than the grunt: the queue sorts by distance, so this
    // is the arrangement that used to hand a boss the only slot there is.
    stageEnemies(engine, [
      { type: 'BOSS_MADAM_MIZYDIA', dx: 120 },
      { type: 'BOSS_SAYONARA', dx: 150 },
      { type: 'PURITY_PATROL', dx: 400 },
    ]);

    const [mizydia] = idsIn(engine, 'BOSS_MADAM_MIZYDIA');
    const [sayonara] = idsIn(engine, 'BOSS_SAYONARA');
    const [grunt] = idsIn(engine, 'PURITY_PATROL');

    // Tenure is the point: a single sampled frame cannot tell "never took one"
    // apart from "has not taken one yet".
    for (let i = 0; i < 600; i++) {
      engine.update(NEUTRAL);
      expect(slotsOf(engine).has(mizydia), `the Matriarch queued on frame ${i}`).toBe(false);
      expect(slotsOf(engine).has(sayonara), `the dog queued on frame ${i}`).toBe(false);
    }
    expect(slotsOf(engine).has(grunt), 'the slot goes to the crowd it was written for').toBe(true);
  });

  it('returns a slot when its holder goes down, instead of burying it', () => {
    const engine = onEasy(startEngine());
    advance(engine, 60);
    stageEnemies(engine, [
      { type: 'TRAD_WIFE_STRIKER', dx: 90 },
      { type: 'PURITY_PATROL', dx: 260 },
    ]);
    advance(engine, 5);

    const [striker] = idsIn(engine, 'TRAD_WIFE_STRIKER');
    expect(slotsOf(engine).has(striker), 'sanity: the nearer fighter held it first').toBe(true);

    const floored = engine.entities.find((e) => e.id === striker)!;
    floored.downed = true;
    floored.hp = 1;
    advance(engine, 2);

    const [grunt] = idsIn(engine, 'PURITY_PATROL');
    expect(slotsOf(engine).has(striker), 'a fighter on the floor is not engaging').toBe(false);
    expect(slotsOf(engine).has(grunt), 'the grunt inherits it').toBe(true);
  });
});

/**
 * Body size is data, and for a boss it is felt on the floor.
 *
 * Dimensions used to come from one question asked at spawn — boss or not —
 * and `width` only ever drew a shadow. Both halves of that are what these
 * tests pin: the numbers come from the fighter's own entry, and a boss's
 * number decides how much room it keeps.
 */
describe('body size', () => {
  /** Frames with every enemy's AI held down, so only separation moves bodies. */
  const settle = (engine: GameEngine, frames = 120) => {
    for (let i = 0; i < frames; i++) {
      engine.entities.forEach((e) => {
        if (!e.isPlayer) e.stunTimer = 10;
      });
      engine.update(NEUTRAL);
    }
  };

  const restingGap = (type: EnemyType) => {
    const engine = startEngine();
    advance(engine, 30);
    stageEnemies(engine, [{ type, dx: 10 }]);
    settle(engine);
    const enemy = engine.entities.find((e) => e.enemyType === type)!;
    return Math.abs(enemy.x - engine.player1!.x);
  };

  it('spawns every fighter at the size its own entry declares', () => {
    const engine = startEngine();
    advance(engine, 30);
    for (const info of Object.values(ENEMIES)) {
      const spawned = engine.spawnEnemy(info.type, 1000, 300);
      expect(spawned.width, `${info.name} width`).toBe(info.hitbox.width);
      expect(spawned.height, `${info.name} height`).toBe(info.hitbox.height);
    }
  });

  it('builds Sayonara long and low instead of tall like the Matriarch', () => {
    const dog = ENEMIES.BOSS_SAYONARA.hitbox;
    const matriarch = ENEMIES.BOSS_MADAM_MIZYDIA.hitbox;
    const grunt = ENEMIES.PURITY_PATROL.hitbox;
    expect(dog.width, 'wider than the woman behind the altar').toBeGreaterThan(matriarch.width);
    expect(dog.height, 'and shorter than anyone who stands up').toBeLessThan(grunt.height);
  });

  it('leaves spacing between ordinary fighters exactly where it was', () => {
    expect(restingGap('PURITY_PATROL')).toBeCloseTo(PLAYER_BODY_SEPARATION_X, 1);
    expect(restingGap('TRAD_WIFE_STRIKER')).toBeCloseTo(PLAYER_BODY_SEPARATION_X, 1);
  });

  it('keeps the player further out from a boss, by half of each body', () => {
    const dog = restingGap('BOSS_SAYONARA');
    const expected = (ENEMIES.BOSS_SAYONARA.hitbox.width + 60) / 2; // 60 is the hero build
    expect(dog).toBeCloseTo(expected, 1);
    expect(dog, 'and further out than a grunt keeps you').toBeGreaterThan(
      restingGap('PURITY_PATROL')
    );
  });

  it('lets every fighter reach the player from where the bodies rest', () => {
    // The mirror of the check below. A fighter whose own build holds it
    // further away than it can swing approaches forever and never attacks,
    // and it fails silently: no throw, no log, a green suite. That is exactly
    // how Sayonara arrived here, 100px away with 90px of reach.
    //
    // Written as behaviour rather than arithmetic on purpose. An earlier
    // version of this recomputed the engine's own reach formula and compared
    // it against a term of itself, so it held for a fighter given a 400px
    // build with the fix removed. It asserted nothing.
    for (const type of Object.keys(ENEMIES) as EnemyType[]) {
      const engine = startEngine();
      advance(engine, 30);
      stageEnemies(engine, [{ type, dx: 260 }]);

      // Kept upright: once the player falls the engine stops and the
      // measurement stops with it, which reads the same as never being hit.
      const full = engine.player1!.hp;
      let taken = 0;
      for (let i = 0; i < 900; i++) {
        engine.update(NEUTRAL);
        if (engine.player1!.hp < full) taken += full - engine.player1!.hp;
        engine.player1!.hp = full;
        engine.player1!.invulnerableTimer = 0;
      }
      expect(taken, `${ENEMIES[type].name} never landed anything`).toBeGreaterThan(0);
    }
  });

  it('lands hits on a stationary player instead of circling out of range', () => {
    const engine = startEngine();
    advance(engine, 30);
    stageEnemies(engine, [{ type: 'BOSS_SAYONARA', dx: 300 }]);

    // Kept upright: once the player falls the engine stops and the measurement
    // stops with it, which reads as "she never attacked" either way.
    const before = engine.player1!.hp;
    let taken = 0;
    for (let i = 0; i < 600; i++) {
      engine.update(NEUTRAL);
      if (engine.player1!.hp < before) taken += before - engine.player1!.hp;
      engine.player1!.hp = before;
    }
    expect(taken, 'the boss of the stage has to be able to hurt someone').toBeGreaterThan(0);
  });

  it('still lets the player land a punch on her from where she rests', () => {
    // 110 is the punch reach in performPunch — the shorter of the two melee
    // attacks. A boss you cannot hit without kicking would be a bug, not a
    // bigger boss.
    expect(restingGap('BOSS_SAYONARA')).toBeLessThan(110);
  });

  it('makes the two bosses share the altar instead of standing inside each other', () => {
    const engine = startEngine(STAGES.findIndex((s) => s.isFinalStage));
    advance(engine, 30);
    stageEnemies(engine, [
      { type: 'BOSS_MADAM_MIZYDIA', dx: 300 },
      { type: 'BOSS_SAYONARA', dx: 310 },
    ]);
    settle(engine);
    const mizydia = engine.entities.find((e) => e.enemyType === 'BOSS_MADAM_MIZYDIA')!;
    const dog = engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA')!;
    const expected = (mizydia.width + dog.width) / 2;
    expect(Math.abs(mizydia.x - dog.x)).toBeCloseTo(expected, 1);
  });
});

/**
 * The rush half of the Collared Rush & Bite.
 *
 * History: her data named a Heavy Knockback Tackle for a long time and the
 * move was never built. She shared the melee branch with the Purity Patrol, so
 * the fastest fighter in the game closed to punching distance and threw a
 * grunt's punch with a grunt's push of nine.
 *
 * These pin the contract that makes a charge fair rather than punishing: it is
 * announced, it cannot be steered once committed, it connects once, and
 * missing costs her.
 */
describe('Sayonara charges', () => {
  const dogAt = (dx: number) => {
    const engine = startEngine();
    advance(engine, 30);
    stageEnemies(engine, [{ type: 'BOSS_SAYONARA', dx }]);
    const dog = engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA')!;
    return { engine, dog };
  };

  /** Runs until she reaches a phase, or gives up and says which one she is in. */
  const runTo = (
    engine: GameEngine,
    dog: EntityState,
    phase: EntityState['chargeState'],
    limit = 400
  ) => {
    for (let i = 0; i < limit; i++) {
      engine.update(NEUTRAL);
      if (dog.chargeState === phase) return i;
    }
    throw new Error(`never reached ${phase}; stuck in ${dog.chargeState ?? 'READY'}`);
  };

  it('winds up before it runs, and stands still while it does', () => {
    const { engine, dog } = dogAt(240);
    runTo(engine, dog, 'TELEGRAPH');

    let moved = 0;
    const startX = dog.x;
    while (dog.chargeState === 'TELEGRAPH') {
      engine.update(NEUTRAL);
      moved = Math.max(moved, Math.abs(dog.x - startX));
    }
    expect(moved, 'the wind-up is a plant, not an approach').toBeLessThan(2);
  });

  it('gives the player long enough to get out of the way', () => {
    const { engine, dog } = dogAt(300);
    runTo(engine, dog, 'TELEGRAPH');

    // A wind-up is only a warning if the warning is actionable. Counting its
    // frames against the constant that sets them asserts nothing, so this
    // walks the player out of the lane from the moment she plants and
    // requires that walking was enough.
    while (dog.chargeState === 'TELEGRAPH') engine.update(input({ up: true }));
    const escaped = Math.abs(engine.player1!.y - dog.y);
    expect(escaped, `only made ${escaped.toFixed(0)}px of ground`).toBeGreaterThan(
      SAYONARA_TACKLE_DEPTH
    );

    for (let i = 0; i < 200 && dog.chargeState === 'CHARGE'; i++) engine.update(NEUTRAL);
    expect(dog.chargeHasHit, 'a player who moved should not be hit').toBeFalsy();
  });

  it('runs far faster than she walks', () => {
    const { engine, dog } = dogAt(300);
    runTo(engine, dog, 'CHARGE');
    engine.update(NEUTRAL);
    expect(Math.abs(dog.vx)).toBeCloseTo(SAYONARA_CHARGE_SPEED, 1);
    expect(Math.abs(dog.vx)).toBeGreaterThan(ENEMIES.BOSS_SAYONARA.speed * 2);
  });

  it('cannot be steered once committed', () => {
    const { engine, dog } = dogAt(300);
    runTo(engine, dog, 'CHARGE');
    const committed = dog.chargeDir;

    // Teleport the player behind her mid-run: a homing charge would turn.
    engine.player1!.x = dog.x + (committed === 1 ? 400 : -400) * -1;
    for (let i = 0; i < 10 && dog.chargeState === 'CHARGE'; i++) engine.update(NEUTRAL);

    expect(dog.chargeDir).toBe(committed);
    expect(Math.sign(dog.vx)).toBe(committed);
  });

  it('knocks the player down and throws them, where a punch only nudged', () => {
    const { engine, dog } = dogAt(240);
    const player = engine.player1!;
    const hpBefore = player.hp;

    for (let i = 0; i < 400 && !dog.chargeHasHit; i++) engine.update(NEUTRAL);

    expect(dog.chargeHasHit, 'she reached him').toBe(true);
    expect(player.action).toBe('KNOCKDOWN');
    expect(Math.abs(player.vx), 'a grunt pushes nine').toBeGreaterThan(15);
    expect(hpBefore - player.hp).toBeGreaterThan(ENEMIES.BOSS_SAYONARA.power);
  });

  it('connects once per run, however long the bodies stay touching', () => {
    const { engine, dog } = dogAt(300);
    const player = engine.player1!;
    for (let i = 0; i < 400 && !dog.chargeHasHit; i++) engine.update(NEUTRAL);
    expect(dog.chargeHasHit, 'she reached him').toBe(true);

    // She does not stop on impact, and body separation needs a few frames to
    // push her back out to the ring — one to ten, measured. The bodies stay
    // inside contact range for that long, and without the flag that single
    // commitment lands two or three times.
    const afterFirst = player.hp;
    let contactFrames = 0;
    while (dog.chargeState === 'CHARGE') {
      engine.update(NEUTRAL);
      player.invulnerableTimer = 0;
      if (Math.abs(dog.x - player.x) < (dog.width + player.width) / 2 + 10) contactFrames++;
    }

    expect(contactFrames, 'the bodies stayed overlapped afterwards').toBeGreaterThan(0);
    expect(player.hp, 'one tackle, one hit').toBe(afterFirst);
  });

  it('pays for missing with a recovery she cannot act out of', () => {
    const { engine, dog } = dogAt(300);
    runTo(engine, dog, 'CHARGE');

    // Out of the lane entirely, so the run goes past him.
    engine.player1!.y = ARENA_MIN_Y;
    dog.y = ARENA_MAX_Y;

    runTo(engine, dog, 'RECOVER');
    let frames = 0;
    while (dog.chargeState === 'RECOVER') {
      engine.update(NEUTRAL);
      frames++;
      expect(dog.chargeState, 'no winding up out of a recovery').not.toBe('TELEGRAPH');
    }
    expect(frames).toBeGreaterThanOrEqual(SAYONARA_RECOVER_FRAMES - 1);
  });

  /**
   * Pinned against the arena edge with the player on top of her.
   *
   * The player is placed once and left alone: dragging him every frame moves
   * the camera, and the arena bounds move with it, so she is never actually
   * cornered and the setup quietly tests nothing. Waves are swept for the same
   * reason — grunts spawning behind the player deal damage that looks like
   * hers.
   */
  const cornered = (frames = 900) => {
    const engine = startEngine();
    advance(engine, 30);
    stageEnemies(engine, [{ type: 'BOSS_SAYONARA', dx: 150 }]);
    const dog = engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA')!;
    const player = engine.player1!;
    const wall = (engine as unknown as { cameraX: number }).cameraX + 760;
    // Close enough to the edge that a step back is already outside it — at
    // thirty she still has room, retreats into the wall and is only cornered
    // a second later, which makes the first thing she throws hard to predict.
    dog.x = wall - 10;
    player.x = dog.x - 110;

    const full = player.hp;
    let taken = 0;
    let bites = 0;
    let previous = dog.action;
    for (let i = 0; i < frames; i++) {
      engine.entities = engine.entities.filter((e) => e.isPlayer || e === dog);
      engine.update(NEUTRAL);
      if (dog.action === 'PUNCH1' && previous !== 'PUNCH1') bites++;
      previous = dog.action;
      if (player.hp < full) taken += full - player.hp;
      player.hp = full;
      player.invulnerableTimer = 0;
    }
    return { engine, dog, player, taken, bites };
  };

  it('cannot be switched off by cornering her against the arena edge', () => {
    // Reproduced from play: pinned to the edge with the player standing on
    // her, she spent nine hundred frames in the approach state and dealt
    // nothing at all, because retreating was the only thing she knew how to
    // do at that range and there was nowhere left to retreat to.
    const { taken, bites } = cornered();
    expect(bites, 'she fights with what she has').toBeGreaterThan(0);
    expect(taken, 'a boss with an off switch is not a trade').toBeGreaterThan(0);
  });

  it('still goes and fetches the run-up when there is room for it', () => {
    // The regression this guards against is the mirror of the one above and
    // was invisible to every other test here: with the bite available at close
    // range and no reason to back off, she stopped charging altogether —
    // twenty-four bites and one charge over thirty seconds. The telegraphed
    // move is the one the fight is built around, so a version of her that
    // never throws it is not the boss that was designed.
    const { engine, dog } = dogAt(110);
    let charges = 0;
    let bites = 0;
    let previousState = dog.chargeState;
    let previousAction = dog.action;
    for (let i = 0; i < 900; i++) {
      engine.update(NEUTRAL);
      engine.player1!.hp = 100;
      engine.player1!.invulnerableTimer = 0;
      if (dog.chargeState === 'TELEGRAPH' && previousState !== 'TELEGRAPH') charges++;
      if (dog.action === 'PUNCH1' && previousAction !== 'PUNCH1') bites++;
      previousState = dog.chargeState;
      previousAction = dog.action;
    }

    expect(charges, 'started point-blank and never went to get the ground back').toBeGreaterThan(1);

    // Both halves, counted in the same run. Dropping the cooldown term from
    // the retreat condition sends her back to fetching ground every time she
    // is crowded — eleven charges and no bites at all, which is the design
    // this branch was rewritten to stop being. The charge count alone cannot
    // tell those apart, so it has to be the mix.
    expect(bites, 'and still bites between the charges').toBeGreaterThan(0);
  });

  it('keeps the bite the lesser half of her, measured on the player', () => {
    // Read off what actually lands, not off the constants. Comparing the two
    // constants to each other says nothing about whether the engine uses
    // either of them.
    const bite = (() => {
      // Zero frames: the helper otherwise lands the first bite inside its own
      // loop and resets the health it took, so the first drop seen here would
      // be whatever came next.
      const { engine, player } = cornered(0);
      const full = player.hp;
      for (let i = 0; i < 600; i++) {
        engine.entities = engine.entities.filter((e) => e.isPlayer || e.enemyType === 'BOSS_SAYONARA');
        engine.update(NEUTRAL);
        if (player.hp < full) return { damage: full - player.hp, down: player.actionTimer, action: player.action };
      }
      throw new Error('the bite never landed');
    })();

    const tackle = (() => {
      const { engine } = dogAt(300);
      const player = engine.player1!;
      const full = player.hp;
      for (let i = 0; i < 600; i++) {
        engine.update(NEUTRAL);
        if (player.hp < full) return { damage: full - player.hp, down: player.actionTimer, action: player.action };
      }
      throw new Error('the tackle never landed');
    })();

    expect(bite.action, 'the bite puts him down too').toBe('KNOCKDOWN');
    expect(tackle.action).toBe('KNOCKDOWN');
    expect(bite.damage, 'and hits for less than the charge').toBeLessThan(tackle.damage);
    expect(bite.down, 'and holds him there for less time').toBeLessThan(tackle.down);
  });

  it('leaves no dead band between the jaws and the run-up', () => {
    // Between bite range and charge range she neither bites nor commits. If
    // she also stands still there, the off switch has only moved.
    const { engine } = dogAt(180);
    const player = engine.player1!;
    const full = player.hp;
    let taken = 0;
    for (let i = 0; i < 400; i++) {
      engine.update(NEUTRAL);
      if (player.hp < full) taken += full - player.hp;
      player.hp = full;
      player.invulnerableTimer = 0;
    }
    expect(taken, 'she closes the gap rather than waiting in it').toBeGreaterThan(0);
  });

  it('keeps a fighter wider than its own reach able to land a hit', () => {
    // The guard in `idealRange` lost its only subject when Sayonara stopped
    // using the melee branch: nothing left in the game is both wide enough to
    // trip it and dependent on it. So the case is built rather than waited
    // for — a grunt given an absurd build, whose 80px reach is far shorter
    // than the 130px its own body would hold it at.
    const original = ENEMIES.PURITY_PATROL.hitbox;
    (ENEMIES.PURITY_PATROL as { hitbox: typeof original }).hitbox = { width: 200, height: 120 };

    try {
      const engine = startEngine();
      advance(engine, 30);
      stageEnemies(engine, [{ type: 'PURITY_PATROL', dx: 260 }]);

      const full = engine.player1!.hp;
      let taken = 0;
      for (let i = 0; i < 900; i++) {
        engine.update(NEUTRAL);
        if (engine.player1!.hp < full) taken += full - engine.player1!.hp;
        engine.player1!.hp = full;
        engine.player1!.invulnerableTimer = 0;
      }
      expect(taken, 'a body wider than its arm still has to be able to swing').toBeGreaterThan(0);
    } finally {
      (ENEMIES.PURITY_PATROL as { hitbox: typeof original }).hitbox = original;
    }
  });
});

/**
 * Losing, with a companion on the field.
 *
 * Reported from play as "the character stopped answering the keyboard in stage
 * two". It had not: the player was dead. The match refused to end because the
 * AI buddy still had health, and a dead fighter is never handed its input, so
 * the keyboard drove nothing and no game over ever arrived. Stage two is
 * simply where a player first dies.
 */
describe('the buddy is help, not a spare life', () => {
  const engineWith = (p2: CharacterId | undefined, p2IsHuman: boolean) => {
    const engine = new GameEngine(STAGES[1], 'FEET_MASTER', p2, undefined, p2IsHuman);
    engine.setActiveDialogue(null);
    return engine;
  };

  it('ends the match when the solo player falls beside a living companion', () => {
    const engine = engineWith('FUN_MAKER', false);
    engine.player1!.hp = 0;
    advance(engine, 5);

    expect(engine.player2!.hp, 'the buddy is still standing').toBeGreaterThan(0);
    expect(engine.gameOver, 'and the match is over anyway').toBe(true);
  });

  it('keeps a co-op match running while either person is standing', () => {
    const engine = engineWith('FUN_MAKER', true);
    engine.player1!.hp = 0;
    advance(engine, 5);
    expect(engine.gameOver, 'the second player still has a fight to finish').toBe(false);

    engine.player2!.hp = 0;
    advance(engine, 5);
    expect(engine.gameOver, 'and it ends once both are down').toBe(true);
  });

  it('still ends a solo match with nobody in the second slot', () => {
    const engine = engineWith(undefined, false);
    engine.player1!.hp = 0;
    advance(engine, 5);
    expect(engine.gameOver).toBe(true);
  });

  /**
   * The camera used to be led by `Math.max(player1.x, player2.x)` with no
   * regard for whether either was alive, so a body pinned the view where it
   * fell. Nothing downstream could recover: waves trigger off camera position,
   * so none ever spawned.
   */
  it('follows whoever is still standing, not where the other one fell', () => {
    const engine = engineWith('FUN_MAKER', true);
    advance(engine, 30);
    const fallen = engine.player1!;
    const survivor = engine.player2!;

    // The body is put well ahead of the survivor, which is the arrangement the
    // old maximum got wrong: it took the furthest fighter without asking
    // whether that fighter was alive, and the view left the living one behind.
    fallen.hp = 0;
    fallen.x = survivor.x + 900;
    const before = engine.cameraX;
    advance(engine, 60);

    expect(engine.cameraX, 'the corpse dragged the view forward').toBe(before);
  });
});

/**
 * Walking in is a one-time job.
 *
 * The arena-entry branch was written to march a freshly spawned enemy onto the
 * screen, and it kept doing it for the rest of the fight: anyone outside the
 * band the AI reads had its own logic skipped entirely, whether it had just
 * spawned or had been fighting for twenty seconds and stepped back.
 */
describe('arena entry', () => {
  it('marks a fighter as arrived the first frame it stands inside', () => {
    const engine = startEngine();
    advance(engine, 30);
    engine.entities = engine.entities.filter((e) => e.isPlayer);
    const dog = engine.spawnEnemy('BOSS_SAYONARA', engine.cameraX + 900, 300);
    expect(dog.hasEnteredArena, 'not yet').toBeFalsy();

    for (let i = 0; i < 240; i++) engine.update(NEUTRAL);
    expect(dog.x).toBeLessThan(engine.cameraX + 760);
    expect(dog.hasEnteredArena).toBe(true);
  });

  it('still walks in a fighter that has never arrived, which is its one job', () => {
    // Narrowing the branch left its original purpose unguarded: marking every
    // enemy as arrived on sight kills the escort outright and the rest of this
    // suite stays green, so the next reader has no way to tell a live branch
    // from a vestige.
    //
    // The two ranged fighters are what it is for. Spawned off-screen left at
    // the offsets waves actually use, they hold their firing distance and have
    // no reason to close, so without the escort they never enter at all —
    // measured at six hundred frames for both, against 55 and 114 with it.
    for (const type of ['CONVERSION_THERAPIST', 'BOSS_MADAM_MIZYDIA'] as EnemyType[]) {
      const engine = startEngine();
      advance(engine, 30);
      engine.entities = engine.entities.filter((e) => e.isPlayer);
      const enemy = engine.spawnEnemy(type, engine.cameraX - 40, 300);

      let arrived = -1;
      for (let i = 0; i < 300 && arrived < 0; i++) {
        engine.update(NEUTRAL);
        const rel = enemy.x - engine.cameraX;
        if (rel >= 40 && rel <= 760) arrived = i;
      }
      expect(arrived, `${ENEMIES[type].name} never made it onto the field`).toBeGreaterThan(-1);
    }
  });

  it('stops taking the wheel once the fighter has arrived', () => {
    const engine = startEngine();
    advance(engine, 30);
    engine.entities = engine.entities.filter((e) => e.isPlayer);
    const dog = engine.spawnEnemy('BOSS_SAYONARA', engine.cameraX + 600, 300);
    for (let i = 0; i < 60; i++) engine.update(NEUTRAL);
    expect(dog.hasEnteredArena, 'sanity: she got here').toBe(true);

    // Both of them held in the strip between the arena the AI reads and the
    // clamp the engine enforces, close enough that she has an obvious thing to
    // do. Before this, that strip had no decisions in it: the escort returned
    // ahead of her branch and she was walked back and forth instead, which
    // measured as 120 frames of WALK and not one attack.
    const player = engine.player1!;
    dog.biteCooldown = 0;

    let bites = 0;
    let previous = dog.action;
    for (let i = 0; i < 120; i++) {
      dog.x = engine.cameraX + 800;
      player.x = engine.cameraX + 700;
      engine.update(NEUTRAL);
      if (dog.action === 'PUNCH1' && previous !== 'PUNCH1') bites++;
      previous = dog.action;
      player.hp = player.maxHp;
      player.invulnerableTimer = 0;
    }
    expect(bites, 'she fights from the strip instead of being escorted out of it').toBeGreaterThan(
      0
    );
  });

  it('leaves the position clamp as the thing that keeps her on the field', () => {
    const engine = startEngine();
    advance(engine, 30);
    engine.entities = engine.entities.filter((e) => e.isPlayer);
    const dog = engine.spawnEnemy('BOSS_SAYONARA', engine.cameraX + 600, 300);
    for (let i = 0; i < 60; i++) engine.update(NEUTRAL);

    dog.x = engine.cameraX + 2000;
    for (let i = 0; i < 60; i++) engine.update(NEUTRAL);
    expect(dog.x, 'hysteresis is not permission to leave').toBeLessThan(engine.cameraX + 830);
  });
});

/**
 * She fights the player who is actually playing.
 *
 * Every earlier probe in this file used a stationary player, and against one
 * she looked healthy: eight charges and eight bites over thirty seconds. In a
 * real wave, against someone walking in and swinging, she managed one charge
 * and two bites — the retreat rule read the gap against the previous frame
 * alone, and a player stepping in and drifting back reset it constantly.
 */
describe('Sayonara under pressure', () => {
  const dogAt = (dx: number) => {
    const engine = startEngine();
    advance(engine, 30);
    stageEnemies(engine, [{ type: 'BOSS_SAYONARA', dx }]);
    const dog = engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA')!;
    return { engine, dog };
  };

  /** Walks in, swings in bursts, and never stops moving. */
  const pressure = (engine: GameEngine, frames: number) => {
    const player = engine.player1!;
    const full = player.hp;
    let taken = 0;
    let bites = 0;
    let previous = '';
    for (let i = 0; i < frames; i++) {
      const dog = engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA');
      const gap = dog ? Math.abs(dog.x - player.x) : 9999;
      engine.update(input({ right: gap > 120, punch: i % 12 < 4 && gap < 160 }));
      if (player.hp < full) taken += full - player.hp;
      player.hp = full;
      player.invulnerableTimer = 0;
      if (dog) {
        if (dog.action === 'PUNCH1' && previous !== 'PUNCH1') bites++;
        previous = dog.action;
      }
    }
    return { taken, bites };
  };

  it('lands hits on a player who keeps walking into her', () => {
    const { engine } = dogAt(200);
    const { taken, bites } = pressure(engine, 1200);
    expect(bites, 'she managed two in thirty seconds before').toBeGreaterThan(4);
    expect(taken).toBeGreaterThan(60);
  });

  it('backs off from a player who follows her, and stands to one who hits her', () => {
    // Two things that used to end the same way and should not. Ground bought
    // from someone chasing gets her the run-up; ground bought from someone
    // swinging is just taking the hits while facing away.
    const retreatOver = (hit: boolean) => {
      const { engine, dog } = dogAt(150);
      const player = engine.player1!;
      for (let i = 0; i < 20; i++) engine.update(NEUTRAL);

      const away = Math.sign(dog.x - player.x);
      const startX = dog.x;
      for (let i = 0; i < 40; i++) {
        if (hit) dog.pressureTimer = 30;
        engine.update(NEUTRAL);
      }
      return (dog.x - startX) * away;
    };

    expect(retreatOver(false), 'unhurt, she goes to fetch her run-up').toBeGreaterThan(20);
    expect(retreatOver(true), 'hurt, she holds her ground').toBeLessThan(5);
  });

  it('learns it is under attack from being punched, not from being told', () => {
    // The half of the rule the test above cannot reach: it sets the flag by
    // hand, so it passes whether or not anything in the engine ever sets it.
    const { engine, dog } = dogAt(150);
    const player = engine.player1!;
    expect(dog.pressureTimer ?? 0, 'nothing has touched her yet').toBe(0);

    for (let i = 0; i < 120 && (dog.pressureTimer ?? 0) === 0; i++) {
      const gap = Math.abs(dog.x - player.x);
      engine.update(input({ right: gap > 100, punch: gap < 110 }));
    }

    expect(dog.pressureTimer ?? 0, 'a landed punch is what tells her').toBeGreaterThan(0);
  });

  it('does not have her next move pushed back by being hit', () => {
    const { engine, dog } = dogAt(200);
    for (let i = 0; i < 30; i++) engine.update(NEUTRAL);

    dog.biteCooldown = 40;
    dog.chargeCooldown = 40;
    for (let i = 0; i < 20; i++) {
      // Held in flinch: this is what a player standing on her produces, and it
      // used to freeze the countdown to her reply along with everything else.
      dog.action = 'HURT';
      dog.actionTimer = 10;
      engine.update(NEUTRAL);
    }

    expect(dog.biteCooldown, 'the wait ran while she was being hit').toBeLessThan(40);
    expect(dog.chargeCooldown).toBeLessThan(40);
  });
});

/**
 * Power moves.
 *
 * This whole area had no coverage at all: `performPowerMove` was reachable
 * from `engine.test.ts` only by accident, and nothing pinned what it did. The
 * cases below are written against what the roster promises on the character
 * select screen, since that is the contract the player is shown.
 */
describe('power moves', () => {
  const charged = (charId: CharacterId) => {
    const engine = startEngine(0, charId);
    advance(engine, 5);
    const player = engine.player1!;
    player.powerMeter = 100;
    return { engine, player };
  };

  const HEROES: CharacterId[] = ['FEET_MASTER', 'FUN_MAKER', 'OMEGA_BIKER', 'ANGRY_CORSO'];

  for (const charId of HEROES) {
    it(`${charId} plants itself instead of sliding through the move`, () => {
      const { engine, player } = charged(charId);
      advance(engine, 10, input({ right: true }));
      const startX = player.x;
      engine.update(input({ right: true, special: true }));

      // The move owns the fighter: horizontal travel for the whole animation
      // should be nothing, against the two to four hundred pixels a retained
      // walking velocity used to carry it.
      advance(engine, POWER_MOVE_FRAMES - 1, input({ right: true }));
      expect(Math.abs(player.x - startX), `${charId} drifted mid-super`).toBeLessThan(1);
    });

    it(`${charId} cannot be steered mid-super`, () => {
      const { engine, player } = charged(charId);
      player.facing = 'RIGHT';
      engine.update(input({ special: true }));
      advance(engine, 5, input({ left: true }));
      expect(player.facing, `${charId} turned around mid-swing`).toBe('RIGHT');
    });
  }

  it('keeps connecting while the window is open', () => {
    const { engine, player } = charged('FEET_MASTER');
    stageEnemies(engine, []);
    engine.update(input({ special: true }));

    // Nobody was in reach when the swing started.
    expect(livingEnemies(engine)).toHaveLength(0);

    const latecomer = engine.spawnEnemy('PURITY_PATROL', player.x + 120, player.y);
    engine.update(NEUTRAL);
    expect(latecomer.hp, 'walking into an open swing should hurt').toBeLessThan(latecomer.maxHp);
  });

  it('hits each body once per activation, however long the window is', () => {
    const { engine } = charged('FEET_MASTER');
    stageEnemies(engine, [{ type: 'BOSS_MADAM_MIZYDIA', dx: 120 }]);
    const boss = livingEnemies(engine)[0];
    boss.shieldHp = 0;
    const before = boss.hp;

    engine.update(input({ special: true }));
    const afterFirstFrame = boss.hp;
    advance(engine, POWER_MOVE_FRAMES);

    expect(afterFirstFrame, 'the swing should land immediately').toBeLessThan(before);
    expect(boss.hp, 'and never twice on the same body').toBe(afterFirstFrame);
  });

  it('stops connecting once the active window closes', () => {
    const { engine, player } = charged('FEET_MASTER');
    stageEnemies(engine, []);
    engine.update(input({ special: true }));
    advance(engine, POWER_MOVE_ACTIVE_FRAMES + 2);

    const latecomer = engine.spawnEnemy('PURITY_PATROL', player.x + 120, player.y);
    engine.update(NEUTRAL);
    expect(latecomer.hp, 'recovery frames are not a hitbox').toBe(latecomer.maxHp);
  });

  it('lets Omega Biker break a censure shield outright', () => {
    const { engine, player } = charged('OMEGA_BIKER');
    player.facing = 'RIGHT';
    stageEnemies(engine, [{ type: 'BOSS_MADAM_MIZYDIA', dx: 120 }]);
    const boss = livingEnemies(engine)[0];
    expect(boss.shieldHp).toBeGreaterThan(0);

    engine.update(input({ special: true }));
    expect(boss.shieldHp, 'the guard breaker is his whole reason to exist').toBe(0);
  });

  it('spares a downed Sayonara while anyone else is still standing', () => {
    const { engine } = charged('FEET_MASTER');
    stageEnemies(engine, [
      { type: 'BOSS_SAYONARA', dx: 100 },
      { type: 'PURITY_PATROL', dx: 140 },
    ]);
    const dog = engine.entities.find((e) => e.enemyType === 'BOSS_SAYONARA')!;
    dog.downed = true;
    const before = dog.hp;

    engine.update(input({ special: true }));
    advance(engine, POWER_MOVE_FRAMES);
    expect(dog.hp, 'a wide swing must not finish her off by accident').toBe(before);
  });

  it('gives Angry Corso his health back once per body, not once per frame', () => {
    const { engine, player } = charged('ANGRY_CORSO');
    stageEnemies(engine, [{ type: 'PURITY_PATROL', dx: 90 }]);
    player.hp = 50;

    engine.update(input({ special: true }));
    const afterBite = player.hp;
    advance(engine, POWER_MOVE_FRAMES);

    expect(afterBite, 'the bite leeches').toBeGreaterThan(50);
    expect(player.hp, 'and leeches once').toBe(afterBite);
  });

  it('sends Fun Maker skyward and brings him back down', () => {
    const { engine, player } = charged('FUN_MAKER');
    engine.update(input({ special: true }));
    let peak = 0;
    for (let i = 0; i < POWER_MOVE_FRAMES; i++) {
      engine.update(NEUTRAL);
      peak = Math.max(peak, player.z);
    }
    expect(peak, 'the cyclone rises').toBeGreaterThan(50);
    expect(player.z, 'and lands before the animation is over').toBe(0);
  });
});

/**
 * What happens to a fighter who runs out of health.
 *
 * Reported from play: a fallen player did not leave the screen the way a
 * defeated enemy does. Measured before the fix, in a co-op match with the
 * second player killed: still in `entities` at frame 900, pose `IDLE` —
 * standing, because the fatal hit only set `HURT` for eighteen frames and
 * nothing followed it — and screen x pinned at PLAYER_CLAMP_MARGIN_X, because
 * the viewport clamp had no health check and shoved the body along the street
 * behind the survivor. An enemy killed in the same run left after 18 frames.
 */
describe('a fallen fighter goes down and is taken off the field', () => {
  const coopEngine = () => {
    const engine = new GameEngine(STAGES[1], 'FEET_MASTER', 'FUN_MAKER', undefined, true);
    engine.setActiveDialogue(null);
    return engine;
  };

  it('lays the body down instead of leaving it on its feet', () => {
    const engine = coopEngine();
    const fallen = engine.player2!;
    fallen.hp = 0;
    advance(engine, 1);

    expect(fallen.action, 'the pose says defeated').toBe('KO');
  });

  it('keeps the body around long enough to be read, then clears it', () => {
    // Absolute frame counts on both sides, not PLAYER_KO_FRAMES: a test written
    // against the constant passes whatever the constant is, including zero,
    // which is the failure this is here to catch. 30 frames is half a second
    // and 150 is two and a half.
    const engine = coopEngine();
    const fallen = engine.player2!;
    fallen.hp = 0;

    advance(engine, 80);
    expect(engine.entities.includes(fallen), 'still there more than a second later').toBe(true);

    advance(engine, 70);
    expect(engine.entities.includes(fallen), 'and gone well before the next wave').toBe(false);

    // 80 rather than something safely small, because the timer was being
    // decremented twice a frame — once by the generic entity tick and once by
    // the death pass — and the body left in half the time it was given. A
    // loose lower bound passed that happily; this does not.
  });

  it('leaves it lying there longer than an enemy corpse', () => {
    // The two rules share one filter now, so this pins the difference that
    // makes them distinguishable at all: the body has an animation the enemy's
    // eighteen frames do not cover.
    const engine = coopEngine();
    stageEnemies(engine, [{ type: 'PURITY_PATROL', dx: 90 }]);
    const enemy = engine.entities.find((e) => !e.isPlayer)!;
    const fallen = engine.player2!;
    enemy.hp = 0;
    fallen.hp = 0;

    advance(engine, 30);
    expect(engine.entities.includes(enemy), 'the enemy is cleared quickly').toBe(false);
    expect(engine.entities.includes(fallen), 'the fighter is not').toBe(true);
  });

  it('leaves the body where it fell instead of dragging it along', () => {
    const engine = coopEngine();
    const fallen = engine.player2!;
    // Well behind the viewport's left edge, which is exactly where the clamp
    // used to snap a body forward to.
    fallen.x = engine.cameraX - 200;
    fallen.hp = 0;
    const fellAt = fallen.x;

    advance(engine, 40, input({ right: true }));
    expect(fallen.x, 'the ground it fell on does not move').toBe(fellAt);
  });

  it('stops the body sliding on whatever knockback killed it', () => {
    // Nothing integrates a dead player's movement, so a leftover velocity would
    // never decay — and the walk cycle keys off vx, which would leave the
    // corpse running on the ground.
    const engine = coopEngine();
    const fallen = engine.player2!;
    fallen.vx = 12;
    fallen.vy = 5;
    fallen.hp = 0;
    advance(engine, 1);

    expect(fallen.vx, 'no horizontal drift').toBe(0);
    expect(fallen.vy, 'no vertical drift').toBe(0);
  });

  it('has the last word over an attack that poses the body after killing it', () => {
    // This is why death is decided in a pass of its own rather than inside
    // damageEntity: the Sayonara tackle and bite both set KNOCKDOWN *after*
    // dealing their damage, so a pose written at the moment of the fatal hit
    // would be overwritten by the very attack that caused it.
    const engine = coopEngine();
    const fallen = engine.player2!;
    fallen.hp = 0;
    fallen.action = 'KNOCKDOWN';
    fallen.actionTimer = 40;
    advance(engine, 1);

    expect(fallen.action, 'death wins the frame').toBe('KO');
  });

  it('does not touch a fighter who is still standing', () => {
    const engine = coopEngine();
    const standing = engine.player2!;
    advance(engine, 20, input({ right: true }));

    expect(standing.action).not.toBe('KO');
    expect(engine.entities.includes(standing), 'and stays on the field').toBe(true);
  });
});

/**
 * A melee enemy has to be able to swing at the player it is touching.
 *
 * The window to attack is a depth: how far off the player's line the enemy may
 * stand. The collision push is also a depth, and it drives a fighter in contact
 * with the player *away* until they are `PLAYER_BODY_SEPARATION_Y` apart. When
 * the window was the narrower of the two, contact and attacking were mutually
 * exclusive: walking into a grunt and holding the button forward made it mute,
 * so the most aggressive position in the game was also the safest one.
 *
 * These pin the relationship rather than the number. The window is read from
 * the same rule the collision uses, so raising the spacing raises the window
 * with it and neither of these has to be edited.
 */
describe('melee depth window', () => {
  /** Holds a grunt at a fixed offset from the player, frame by frame. */
  const pinAt = (engine: GameEngine, grunt: EntityState, offsetX: number, offsetY: number) => {
    const player = engine.player1!;
    grunt.x = player.x + offsetX;
    grunt.y = player.y + offsetY;
  };

  const gruntFacing = (engine: GameEngine) =>
    engine.entities.find((e) => e.enemyType === 'PURITY_PATROL')!;

  it('lets a grunt hit the player who is walking into it', () => {
    const engine = startEngine();
    advance(engine, 30);
    stageEnemies(engine, [{ type: 'PURITY_PATROL', dx: 120 }]);
    const player = engine.player1!;
    const grunt = gruntFacing(engine);

    // Walk into it first. The approach is not what this test is about — an
    // enemy closing on a player who has not reached it yet is aligned and
    // swings freely, and measuring from here would pass on that alone.
    let closing = 0;
    while (Math.abs(grunt.x - player.x) > PLAYER_BODY_SEPARATION_X + 2 && closing < 600) {
      engine.update(input({ right: true }));
      closing++;
    }
    expect(closing, 'sanity: the two of them are actually in contact').toBeLessThan(600);

    // From contact onward: still pushing, which is exactly what fires the
    // collision push that used to hold the grunt off the player's line.
    const pressed = player.hp;
    for (let i = 0; i < 600 && player.hp === pressed; i++) {
      engine.update(input({ right: true }));
    }

    expect(player.hp, 'ten seconds of shoving and never a punch thrown').toBeLessThan(pressed);
  });

  it('opens the window at the distance bodies actually rest at', () => {
    const engine = startEngine();
    advance(engine, 30);
    stageEnemies(engine, [{ type: 'PURITY_PATROL', dx: 60 }]);
    const player = engine.player1!;
    const grunt = gruntFacing(engine);
    const opening = player.hp;

    // The far edge of the window the enemy is allowed to swing from — the
    // resting spacing plus the same slack the window itself is built with —
    // and not the resting spacing alone. Pinned at the resting distance this
    // test passed with the hit check narrowed to 31, which is inside the
    // window: a grunt authorised to swing from 31 would have punched air and
    // nothing would have failed. Measured, not reasoned: at 27 the mutation
    // survives, at 27 + 4 it dies.
    for (let i = 0; i < 400 && player.hp === opening; i++) {
      pinAt(engine, grunt, PLAYER_BODY_SEPARATION_X, PLAYER_BODY_SEPARATION_Y + 4);
      engine.update(NEUTRAL);
    }

    // Not just thrown: landed. The check that decides whether a punch connects
    // has to cover the whole window the enemy is allowed to swing from.
    expect(player.hp, 'a punch thrown from the resting distance connects').toBeLessThan(opening);
  });

  it('keeps the window shut on an enemy standing off the player\'s line', () => {
    const engine = startEngine();
    advance(engine, 30);
    stageEnemies(engine, [{ type: 'PURITY_PATROL', dx: 60 }]);
    const player = engine.player1!;
    const grunt = gruntFacing(engine);
    const opening = player.hp;

    // Twice the resting spacing: a clear miss in depth, and the enemy is
    // supposed to walk it off rather than punch across it. Without this, the
    // window could be widened until depth stopped meaning anything.
    //
    // The swing itself is what is asserted, not the damage. A window widened
    // past the reach of the hit check produces a grunt punching thin air,
    // which leaves the player's health alone and would read as a pass.
    let swings = 0;
    for (let i = 0; i < 400; i++) {
      pinAt(engine, grunt, PLAYER_BODY_SEPARATION_X, PLAYER_BODY_SEPARATION_Y * 2);
      engine.update(NEUTRAL);
      if (grunt.action === 'PUNCH1') swings++;
    }

    expect(swings, 'nobody swings from that far off the line').toBe(0);
    expect(player.hp, 'and nothing lands from there either').toBe(opening);
  });
});
