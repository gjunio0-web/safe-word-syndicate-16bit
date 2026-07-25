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
        boss.hp = 1;
      });

      const punch = input({ punch: true });
      for (let i = 0; i < 600 && livingEnemies(engine).length > 0; i++) {
        engine.update(i % 8 < 2 ? punch : NEUTRAL);
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
      for (const enemy of livingEnemies(engine)) enemy.hp = 9999;

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
