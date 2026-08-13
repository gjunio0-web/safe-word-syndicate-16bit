import { describe, expect, it } from 'vitest';
import { advance, input, NEUTRAL, startEngine } from './helpers';
import { EntityState, PlayerInput } from '../types';
import { GameEngine } from '../game/engine';

/**
 * Fun Maker's flight, and what it costs.
 *
 * The meter used to climb while he hovered. Passive regeneration ran first and
 * unconditionally at +0.04 a frame, the flight drain took 0.02, and the net was
 * a gain: a full tank, an unlimited hover, and a comment in the engine claiming
 * fifty seconds of flight that nothing enforced.
 *
 * Fixing the arithmetic on its own would have been worse than leaving it. The
 * exit from flight sat inside a block gated on a positive meter, so an empty
 * meter skipped the exit along with everything else, and gravity is skipped for
 * a FLYING entity. He would have stopped falling forever. Both halves are held
 * here, because either one alone is a bug.
 */

/** Airborne and flying, which takes a jump and then a second jump press. */
function takeOff(engine: GameEngine, player: EntityState) {
  engine.update(input({ jump: true }));
  engine.update(NEUTRAL);
  engine.update(NEUTRAL);
  engine.update(input({ jump: true }));
  expect(player.action, 'flight should have started').toBe('FLYING');
}

/** Runs until he is back on the floor, or gives up and says how long it took. */
function framesUntilLanded(engine: GameEngine, player: EntityState, cap: number, hold: PlayerInput = NEUTRAL) {
  let frames = 0;
  while (player.z > 0 && frames < cap) {
    engine.update(hold);
    frames++;
  }
  return frames;
}

describe('Fun Maker flight is paid for', () => {
  it('spends the power meter instead of filling it', () => {
    const engine = startEngine(0, 'FUN_MAKER');
    const player = engine.player1!;
    player.powerMeter = 60;

    takeOff(engine, player);
    const atLiftoff = player.powerMeter;
    advance(engine, 300);

    expect(player.action, 'still airborne with meter to spare').toBe('FLYING');
    expect(player.powerMeter).toBeLessThan(atLiftoff);
    // 300 frames at 0.02 with no regeneration behind it.
    expect(atLiftoff - player.powerMeter).toBeCloseTo(6, 1);
  });

  it('runs out, and running out puts him back on the ground', () => {
    const engine = startEngine(0, 'FUN_MAKER');
    const player = engine.player1!;
    player.powerMeter = 6;

    takeOff(engine, player);
    const frames = framesUntilLanded(engine, player, 1200);

    expect(frames, 'six meter buys about 300 frames plus the fall').toBeLessThan(1200);
    expect(player.action).not.toBe('FLYING');
    expect(player.z).toBe(0);
  });

  it('holding the ascend input does not buy free altitude on an empty meter', () => {
    const engine = startEngine(0, 'FUN_MAKER');
    const player = engine.player1!;
    player.powerMeter = 2;

    takeOff(engine, player);
    const frames = framesUntilLanded(engine, player, 1200, input({ jump: true }));

    expect(frames).toBeLessThan(1200);
    expect(player.action).not.toBe('FLYING');
  });

  it('a suppression dart drops him out of the air', () => {
    const engine = startEngine(0, 'FUN_MAKER');
    const player = engine.player1!;
    player.powerMeter = 100;

    takeOff(engine, player);
    player.suppressedTimer = 180;
    engine.update(NEUTRAL);

    expect(player.action, 'suppressed means no flight').not.toBe('FLYING');
    expect(framesUntilLanded(engine, player, 600)).toBeLessThan(600);
  });

  it('a full meter buys a flight worth taking, not an afternoon', () => {
    const engine = startEngine(0, 'FUN_MAKER');
    const player = engine.player1!;
    player.powerMeter = 100;

    takeOff(engine, player);
    let frames = 0;
    while (player.action === 'FLYING' && frames < 12000) {
      engine.update(NEUTRAL);
      frames++;
    }

    expect(frames).toBeGreaterThan(3000);
    expect(frames).toBeLessThan(7000);
  });

  it('the meter still regenerates on the ground', () => {
    const engine = startEngine(0, 'FUN_MAKER');
    const player = engine.player1!;
    player.powerMeter = 10;

    advance(engine, 120);

    expect(player.powerMeter).toBeGreaterThan(10);
  });

  it('leaves the other three heroes regenerating as before', () => {
    for (const charId of ['FEET_MASTER', 'OMEGA_BIKER', 'ANGRY_CORSO'] as const) {
      const engine = startEngine(0, charId);
      const player = engine.player1!;
      player.powerMeter = 10;
      advance(engine, 120);
      expect(player.powerMeter, `${charId} should still charge`).toBeCloseTo(14.8, 0);
    }
  });
});
