import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { startEngine, advance, NEUTRAL } from './helpers';
import {
  finishSession,
  recordDeath,
  recordProgress,
  recordStats,
  startSession,
} from '../game/telemetry';
import { isWorthSending } from '../game/telemetryTransport';

/*
 * The hook itself needs a DOM this project does not run, so what is covered
 * here is the wiring logic it performs, exercised against a real engine. That
 * is the part with judgement in it — where a death is spotted, what a sample
 * reads, whether a finished run would be sent. The React plumbing around it is
 * a handful of refs and is verified by the type checker and by reading.
 */

describe('sampling a real engine', () => {
  it('reads a wave and stats a session can be built from', () => {
    const engine = startEngine(0);
    engine.setActiveDialogue(null);
    advance(engine, 120, NEUTRAL);

    let session = startSession({
      build: 'FULL',
      hero: 'FEET_MASTER',
      mode: 'SINGLE',
      difficulty: 'NORMAL',
      touch: false,
    });
    session = recordProgress(session, 0, engine.currentWaveIndex);
    session = recordStats(session, engine.stats);

    expect(session.furthestWave).toBe(engine.currentWaveIndex);
    expect(session.seconds).toBe(engine.stats.timeSeconds);
  });

  it('spots a death on the falling edge, not on every frame after it', () => {
    const engine = startEngine(0);
    engine.setActiveDialogue(null);
    advance(engine, 30, NEUTRAL);

    let session = startSession({
      build: 'FULL',
      hero: 'ANGRY_CORSO',
      mode: 'SINGLE',
      difficulty: 'NORMAL',
      touch: true,
    });
    let wasAlive = true;

    // The sampling rule, applied frame by frame the way the hook applies it.
    const sample = () => {
      const alive = (engine.player1?.hp ?? 0) > 0;
      if (wasAlive && !alive) session = recordDeath(session, 0, engine.currentWaveIndex);
      wasAlive = alive;
    };

    sample();
    expect(session.deaths).toHaveLength(0);

    engine.player1!.hp = 0;
    sample();
    sample();
    sample();
    // Three samples with the player at zero, one death.
    expect(session.deaths).toHaveLength(1);

    engine.player1!.hp = engine.player1!.maxHp;
    sample();
    engine.player1!.hp = 0;
    sample();
    expect(session.deaths).toHaveLength(2);
  });
});

describe('what a finished run reports', () => {
  it('is worth sending once the player has reached a wave', () => {
    const engine = startEngine(0);
    engine.setActiveDialogue(null);
    advance(engine, 240, NEUTRAL);

    let session = startSession({
      build: 'FULL',
      hero: 'OMEGA_BIKER',
      mode: 'SINGLE',
      difficulty: 'NORMAL',
      touch: true,
    });
    session = recordProgress(session, 0, engine.currentWaveIndex);
    session = finishSession(session, 'ABANDONED');

    expect(isWorthSending(session)).toBe(true);
  });
});

describe('closing the session once', () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('does not report the same run twice when the tab closes after a win', async () => {
    const { sendSession } = await import('../game/telemetryTransport');

    // The hook's rule: seal, send, then drop the reference. Modelled here
    // because a second beacon is a second row, and two rows for one play is a
    // worse lie than a missing one.
    let held: ReturnType<typeof startSession> | null = recordProgress(
      startSession({
        build: 'FULL',
        hero: 'FUN_MAKER',
        mode: 'SINGLE',
        difficulty: 'NORMAL',
        touch: true,
      }),
      0,
      3
    );

    const end = (outcome: 'COMPLETED' | 'LEFT') => {
      if (!held) return;
      const sealed = finishSession(held, outcome);
      held = null;
      sendSession(sealed);
    };

    end('COMPLETED');
    end('LEFT');

    expect(beacon).toHaveBeenCalledOnce();
  });
});
