import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { startEngine, advance, NEUTRAL } from './helpers';
import {
  finishSession,
  onPageHidden,
  onRunEnded,
  onVisibilityChange,
  recordDeath,
  recordProgress,
  recordStats,
  startSession,
} from '../game/telemetry';
import { isWorthSending, sendSession } from '../game/telemetryTransport';

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

describe('a player who switches apps and comes back', () => {
  /*
   * These call the rules the hook calls. An earlier version of this block
   * redefined them locally and checked the copy, so putting the defect back
   * into the hook — hiding the tab ending the run — left every test green.
   */
  const midRun = () =>
    recordProgress(
      startSession({
        build: 'FULL',
        hero: 'ANGRY_CORSO',
        mode: 'SINGLE',
        difficulty: 'NORMAL',
        touch: true,
      }),
      0,
      2
    );

  it('reports where the run stands', () => {
    const live = midRun();
    const { send } = onPageHidden(live);
    expect(send?.outcome).toBe('LEFT');
    expect(send?.furthestWave).toBe(2);
  });

  it('leaves the run open, so the win that follows is not lost', () => {
    // The defect this replaced: the run was sealed here, and a player who
    // came back and won was filed forever as having walked away at wave two.
    const live = midRun();
    const { keep } = onPageHidden(live);
    expect(keep).toBe(live);
    expect(keep?.outcome).toBeNull();
  });

  it('sends the later ending under the same session id', () => {
    const live = midRun();
    const hidden = onPageHidden(live);
    const won = onRunEnded(recordProgress(hidden.keep!, 2, 2), 'COMPLETED');

    expect(won.send?.sessionId).toBe(hidden.send?.sessionId);
    expect(won.send?.outcome).toBe('COMPLETED');
    // Which is what lets the far end overwrite the first row rather than
    // count two runs. See the firestoreWrite test for that half.
    expect(won.send?.furthestStage).toBe(2);
  });

  it('closes the run for good once it really ends', () => {
    expect(onRunEnded(midRun(), 'COMPLETED').keep).toBeNull();
  });

  it('says nothing when the page comes back', () => {
    const live = midRun();
    const back = onVisibilityChange('visible', live);
    expect(back.send).toBeNull();
    expect(back.keep).toBe(live);
  });

  it('routes hiding to the rule that keeps the run', () => {
    // Pins the wiring inside the pure function, which is the part a mutation
    // would otherwise flip back to the ending path unnoticed.
    const live = midRun();
    expect(onVisibilityChange('hidden', live)).toEqual(onPageHidden(live));
  });

  it('has nothing to say when no run is open', () => {
    expect(onPageHidden(null)).toEqual({ send: null, keep: null });
    expect(onRunEnded(null, 'COMPLETED')).toEqual({ send: null, keep: null });
  });
});

describe('what actually goes out', () => {
  let beacon: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    beacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reports twice for one run that was interrupted and then finished', () => {
    const live = recordProgress(
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

    // What the hook does with a transition: keep what it says to keep, send
    // what it says to send.
    let held: ReturnType<typeof startSession> | null = live;
    const apply = (t: { send: typeof live | null; keep: typeof live | null }) => {
      held = t.keep;
      if (t.send) sendSession(t.send);
    };

    apply(onVisibilityChange('hidden', held));
    expect(held, 'the run survives the app switch').not.toBeNull();
    apply(onRunEnded(held, 'COMPLETED'));

    expect(beacon).toHaveBeenCalledTimes(2);
    expect(held, 'and is closed afterwards').toBeNull();
  });

  it('says nothing more after the run has ended', () => {
    let held: ReturnType<typeof startSession> | null = recordProgress(
      startSession({
        build: 'FULL',
        hero: 'FEET_MASTER',
        mode: 'SINGLE',
        difficulty: 'NORMAL',
        touch: true,
      }),
      0,
      1
    );
    const apply = (t: { send: typeof held; keep: typeof held }) => {
      held = t.keep;
      if (t.send) sendSession(t.send);
    };

    apply(onRunEnded(held, 'COMPLETED'));
    apply(onVisibilityChange('hidden', held));

    expect(beacon).toHaveBeenCalledOnce();
  });
});
