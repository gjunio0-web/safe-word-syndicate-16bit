import { describe, expect, it } from 'vitest';
import {
  channelFor,
  finishSession,
  recordDeath,
  recordProgress,
  recordStats,
  startSession,
  SESSION_CHANNEL,
  SessionSnapshot,
} from '../game/telemetry';

const start = () =>
  startSession({
    build: 'DEMO',
    hero: 'FEET_MASTER',
    mode: 'SINGLE',
    difficulty: 'NORMAL',
    touch: true,
  });

describe('which deploy a session came from', () => {
  it('calls only the production deploy PRODUCTION', () => {
    // The one value that must never be handed out by accident: it is the value
    // the report counts, and a wrong one puts a developer's run in the numbers.
    expect(channelFor('production')).toBe('PRODUCTION');
  });

  it('names the other Netlify contexts apart from each other', () => {
    // Named after the deploy rather than after what we hope it is for. BRANCH
    // is every branch deploy — today only quality_env, and a name like QUALITY
    // becomes a lie the first time a second branch is deployed.
    expect(channelFor('branch-deploy')).toBe('BRANCH');
    expect(channelFor('deploy-preview')).toBe('PREVIEW');
  });

  it('calls anything it does not recognise DEV, never PRODUCTION', () => {
    // A local build, a context Netlify adds later, a typo in the config. Any
    // of them landing on PRODUCTION would contaminate the numbers, which is
    // worse than hiding a row, so the default has to fail closed.
    for (const unknown of [undefined, '', 'dev', 'Production', 'staging', 'branch_deploy']) {
      expect(channelFor(unknown), String(unknown)).toBe('DEV');
    }
  });

  it('stamps the session with the channel rather than accepting one', () => {
    // startSession takes no channel argument on purpose: the channel is a
    // property of the bundle, and a caller that could pass it could pass the
    // wrong one. Under the test run nothing substitutes the build constant,
    // so this is DEV — which is also the proof it is not hard-coded to
    // PRODUCTION somewhere.
    expect(start().channel).toBe(SESSION_CHANNEL);
    expect(start().channel).toBe('DEV');
  });
});

describe('a telemetry session', () => {
  it('carries nothing that would identify the person', () => {
    const keys = Object.keys(start());
    // The guard is on the shape, not on a reviewer remembering. A field added
    // later that names a person, an address, or a returning visitor fails
    // here before it reaches a build.
    for (const forbidden of ['name', 'email', 'ip', 'address', 'user', 'userId', 'device']) {
      expect(keys.some((k) => k.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
    }
  });

  it('gives two sessions different ids', () => {
    expect(start().sessionId).not.toBe(start().sessionId);
  });

  it('keeps the furthest point reached, not the last one seen', () => {
    let s = start();
    s = recordProgress(s, 0, 3);
    s = recordProgress(s, 0, 1);
    expect(s.furthestWave).toBe(3);
  });

  it('counts a later stage as further even at an earlier wave', () => {
    let s = recordProgress(start(), 0, 3);
    s = recordProgress(s, 1, 0);
    expect(s.furthestStage).toBe(1);
    expect(s.furthestWave).toBe(0);
  });

  it('records every death with where it happened', () => {
    let s = recordDeath(start(), 0, 2);
    s = recordDeath(s, 0, 2);
    s = recordDeath(s, 0, 3);
    expect(s.deaths).toEqual([
      { stage: 0, wave: 2 },
      { stage: 0, wave: 2 },
      { stage: 0, wave: 3 },
    ]);
  });

  it('does not lose totals when a new stage resets the engine counters', () => {
    let s = recordStats(start(), { score: 5000, enemiesDefeated: 20, timeSeconds: 300 });
    // A fresh engine reports from zero again.
    s = recordStats(s, { score: 40, enemiesDefeated: 1, timeSeconds: 4 });
    expect(s.score).toBe(5000);
    expect(s.enemiesDefeated).toBe(20);
    expect(s.seconds).toBe(300);
  });

  it('keeps the first outcome when the tab closes after a win', () => {
    const won = finishSession(start(), 'COMPLETED');
    expect(finishSession(won, 'LEFT').outcome).toBe('COMPLETED');
  });

  it('leaves the outcome empty until the session actually ends', () => {
    expect(start().outcome).toBeNull();
    expect(finishSession(start(), 'GAME_OVER').outcome).toBe('GAME_OVER');
  });

  it('never mutates the session it was handed', () => {
    const before = start();
    const copy: SessionSnapshot = JSON.parse(JSON.stringify(before));
    recordProgress(before, 2, 2);
    recordDeath(before, 1, 1);
    recordStats(before, { score: 9, enemiesDefeated: 9, timeSeconds: 9 });
    finishSession(before, 'LEFT');
    expect(before).toEqual(copy);
  });
});
