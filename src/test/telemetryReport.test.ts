import { describe, expect, it } from 'vitest';
import {
  buildReport,
  formatReport,
  playerSessions,
  toSession,
  type SessionRow,
} from '../../scripts/telemetryReport.mts';

/**
 * The half of telemetry that answers a question.
 *
 * Everything before this collects, ships and stores. Nothing read any of it,
 * so the three questions the whole exercise exists for — where people stop,
 * how long a stage takes, who they pick — still had no route to an answer.
 *
 * What is pinned here is the judgement, not the arithmetic: which sessions a
 * figure is allowed to count, and which it must leave out. Those exclusions
 * are the difference between an answer and a number that looks like one.
 */

const session = (over: Partial<SessionRow> = {}): SessionRow => ({
  // PRODUCTION by default so every test below reads as "these are players".
  // The rows that are not are the subject of one describe block, and they say
  // so explicitly.
  channel: 'PRODUCTION',
  hero: 'FEET_MASTER',
  partner: null,
  mode: 'SINGLE',
  difficulty: 'NORMAL',
  touch: true,
  build: 'FULL',
  furthestStage: 0,
  furthestWave: 0,
  deaths: [],
  seconds: 0,
  score: 0,
  enemiesDefeated: 0,
  outcome: 'LEFT',
  ...over,
});

describe('unwrapping a stored document', () => {
  // This used to live in the runner, which imports node:fs and the network and
  // is therefore unreachable from here. Both defects this project has shipped
  // in the telemetry path lived in exactly that kind of file.
  it('reads the fields back out of Firestore’s typed format', () => {
    const row = toSession({
      channel: { stringValue: 'PRODUCTION' },
      hero: { stringValue: 'ANGRY_CORSO' },
      partner: { nullValue: null },
      touch: { booleanValue: true },
      seconds: { integerValue: '120' },
      deaths: {
        arrayValue: {
          values: [
            { mapValue: { fields: { stage: { integerValue: '1' }, wave: { integerValue: '4' } } } },
          ],
        },
      },
    });

    expect(row.channel).toBe('PRODUCTION');
    expect(row.hero).toBe('ANGRY_CORSO');
    expect(row.partner).toBeNull();
    expect(row.touch).toBe(true);
    expect(row.seconds).toBe(120);
    expect(row.deaths).toEqual([{ stage: 1, wave: 4 }]);
  });

  it('calls a document with no channel UNKNOWN, never PRODUCTION', () => {
    // Every document stored before the field existed lands here. Defaulting to
    // PRODUCTION would quietly move them all into the numbers, which is the
    // one outcome the field was added to prevent.
    expect(toSession({ hero: { stringValue: 'FUN_MAKER' } }).channel).toBe('UNKNOWN');
  });

  it('survives a document that is missing everything', () => {
    // A half-written document is a lost row, not a crashed report.
    const row = toSession({});
    expect(row.hero).toBe('');
    expect(row.seconds).toBe(0);
    expect(row.deaths).toEqual([]);
    expect(row.touch).toBe(false);
  });
});

describe('which sessions count as players', () => {
  it('counts the production deploy and nothing else', () => {
    // Every deploy writes into the same collection. A run played on a branch
    // deploy was played by whoever was testing it, who already knew where the
    // difficult wave was, and is not evidence about anybody.
    const { players, excluded } = playerSessions([
      session({ channel: 'PRODUCTION', hero: 'FUN_MAKER' }),
      session({ channel: 'BRANCH', hero: 'ANGRY_CORSO' }),
      session({ channel: 'PREVIEW', hero: 'ANGRY_CORSO' }),
      session({ channel: 'DEV', hero: 'ANGRY_CORSO' }),
    ]);

    expect(players.map((p) => p.hero)).toEqual(['FUN_MAKER']);
    expect(excluded).toBe(3);
  });

  it('leaves out a row that never said which deploy it came from', () => {
    // UNKNOWN is a row stored before the field existed, or one posted by a tab
    // that had not reloaded since the release. Counting it means guessing
    // PRODUCTION for a row that might be a developer's: a hidden row costs one
    // observation, a wrong row costs the number its meaning.
    const { players, excluded } = playerSessions([session({ channel: 'UNKNOWN' })]);
    expect(players).toHaveLength(0);
    expect(excluded).toBe(1);
  });

  it('does not treat an unrecognised channel as production', () => {
    // The list of channels can grow. Whatever is added is not a player until
    // someone says it is — the default has to fail closed.
    expect(playerSessions([session({ channel: 'production' })]).players).toHaveLength(0);
    expect(playerSessions([session({ channel: '' })]).players).toHaveLength(0);
  });

  it('reports the numbers of the surviving rows, not of the pile', () => {
    // The filter has to happen before the arithmetic. A report that counted 4
    // sessions and then described 1 would be worse than either.
    const { players } = playerSessions([
      session({ channel: 'PRODUCTION', seconds: 100, furthestStage: 1, outcome: 'GAME_OVER' }),
      session({ channel: 'BRANCH', seconds: 9000, furthestStage: 1, outcome: 'GAME_OVER' }),
    ]);
    const report = buildReport(players);
    expect(report.sessions).toBe(1);
    expect(report.stageOneSeconds.median).toBe(100);
  });
});

describe('where people stop', () => {
  it('counts only the runs that did not finish', () => {
    // A completed run did not stop anywhere, it ended. Folding it in would put
    // the last wave of the campaign at the top of a list whose whole purpose is
    // to show where people give up.
    const report = buildReport([
      session({ furthestStage: 0, furthestWave: 2, outcome: 'GAME_OVER' }),
      session({ furthestStage: 0, furthestWave: 2, outcome: 'LEFT' }),
      session({ furthestStage: 2, furthestWave: 9, outcome: 'COMPLETED' }),
    ]);

    expect(report.stoppedAt).toEqual([{ key: 'stage 0 wave 2', sessions: 2, share: 100 }]);
    expect(report.sessions, 'the finished run still counts as a session').toBe(3);
  });

  it('puts the most common stopping point first', () => {
    const report = buildReport([
      session({ furthestWave: 1 }),
      session({ furthestWave: 4 }),
      session({ furthestWave: 4 }),
    ]);
    expect(report.stoppedAt[0].key).toBe('stage 0 wave 4');
  });
});

describe('how long a stage takes', () => {
  it('times only the runs that proved they cleared stage one', () => {
    // Timing everybody answers "how long do people play", which is a different
    // question and is dragged down by every run that stopped on wave one.
    const report = buildReport([
      session({ furthestStage: 0, seconds: 30, outcome: 'LEFT' }),
      session({ furthestStage: 1, seconds: 300, outcome: 'GAME_OVER' }),
      session({ furthestStage: 2, seconds: 400, outcome: 'COMPLETED' }),
    ]);

    expect(report.stageOneSeconds.n, 'the 30-second run is not evidence about stage length').toBe(2);
    // 300, not 350: the quantile is nearest-rank, so it returns a figure some
    // session actually recorded rather than the midpoint between two of them.
    // With an even count that means the lower of the pair.
    expect(report.stageOneSeconds.median).toBe(300);
  });

  it('counts a completed run even if the stage index never advanced', () => {
    // A one-stage cut ends on stage 0. Requiring stage >= 1 alone would throw
    // away every finisher of a demo build.
    const report = buildReport([session({ furthestStage: 0, seconds: 250, outcome: 'COMPLETED' })]);
    expect(report.stageOneSeconds.n).toBe(1);
  });

  it('reports a spread rather than an average', () => {
    // One player who left the tab open through a phone call would drag a mean
    // anywhere. Quantiles return values a session actually had.
    const rows = [10, 20, 30, 40, 5000].map((seconds) =>
      session({ furthestStage: 1, seconds, outcome: 'GAME_OVER' })
    );
    const { p25, median, p75 } = buildReport(rows).stageOneSeconds;
    expect([p25, median, p75]).toEqual([20, 30, 40]);
  });

  it('says nothing rather than zero when nobody cleared it', () => {
    expect(buildReport([session({ seconds: 40 })]).stageOneSeconds.n).toBe(0);
  });
});

describe('who they pick, and on what', () => {
  it('ranks heroes by how often they were chosen', () => {
    const report = buildReport([
      session({ hero: 'FUN_MAKER' }),
      session({ hero: 'FUN_MAKER' }),
      session({ hero: 'ANGRY_CORSO' }),
      session({ hero: 'OMEGA_BIKER' }),
    ]);
    expect(report.heroes[0]).toEqual({ key: 'FUN_MAKER', sessions: 2, share: 50 });
    expect(report.heroes).toHaveLength(3);
  });

  it('reports the touch share, which decides where the controls work matters', () => {
    const report = buildReport([
      session({ touch: true }),
      session({ touch: true }),
      session({ touch: false }),
    ]);
    expect(report.touchShare).toBe(66.7);
  });

  it('counts every death, not every run that had one', () => {
    const report = buildReport([
      session({ deaths: [{ stage: 0, wave: 3 }, { stage: 0, wave: 3 }] }),
      session({ deaths: [{ stage: 0, wave: 1 }] }),
    ]);
    expect(report.deadliestWaves[0]).toEqual({ key: 'stage 0 wave 3', sessions: 2, share: 66.7 });
  });
});

describe('an empty collection', () => {
  it('produces a report rather than a division by zero', () => {
    const report = buildReport([]);
    expect(report.sessions).toBe(0);
    expect(report.touchShare).toBe(0);
    expect(report.outcomes).toEqual([]);
    expect(() => formatReport(report)).not.toThrow();
  });
});

describe('the printed form', () => {
  it('carries the counts a reader would look for', () => {
    const text = formatReport(
      buildReport([
        session({ hero: 'OMEGA_BIKER', furthestStage: 1, seconds: 200, outcome: 'GAME_OVER' }),
      ])
    );
    expect(text).toContain('sessions: 1');
    expect(text).toContain('OMEGA_BIKER');
    expect(text).toContain('median 200s');
  });
});
