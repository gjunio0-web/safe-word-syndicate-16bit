/**
 * Turning a pile of sessions into the three answers the collection exists for.
 *
 * Where people stop, how long a stage actually takes, and who they pick. The
 * patches that came before this collect, ship and store; nothing read any of
 * it, which meant the questions still had no route to an answer.
 *
 * Pure and importing nothing, for the same reason `firestoreWrite.mts` is: the
 * runner beside this file reaches for `node:crypto` and the network, and the
 * tsconfig the tests run under carries no Node types. Every judgement lives
 * here, where a test can call it; the runner only fetches and prints.
 */

export interface SessionRow {
  /** PRODUCTION, BRANCH, PREVIEW, DEV, or UNKNOWN for a row stored before the
   * field existed. See `SessionChannel` in `src/game/telemetry.ts`. */
  channel: string;
  hero: string;
  partner: string | null;
  mode: string;
  difficulty: string;
  touch: boolean;
  build: string;
  furthestStage: number;
  furthestWave: number;
  deaths: Array<{ stage: number; wave: number }>;
  seconds: number;
  score: number;
  enemiesDefeated: number;
  outcome: string;
}

export interface Tally {
  key: string;
  sessions: number;
  /** Rounded to a tenth of a percent. */
  share: number;
}

export interface Spread {
  /** How many sessions the figures below were taken from. */
  n: number;
  median: number;
  p25: number;
  p75: number;
}

export interface Report {
  sessions: number;
  /** COMPLETED, GAME_OVER, ABANDONED, LEFT. */
  outcomes: Tally[];
  /** Where runs that did not finish got to, furthest first. */
  stoppedAt: Tally[];
  /** Seconds of play among runs that proved they cleared stage one. */
  stageOneSeconds: Spread;
  heroes: Tally[];
  modes: Tally[];
  difficulties: Tally[];
  touchShare: number;
  /** Waves that killed people, worst first. */
  deadliestWaves: Tally[];
}

/** Firestore's typed-value format, as much of it as a session uses. */
export interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

/**
 * A stored document, unwrapped back into a session.
 *
 * Here rather than in the runner that fetches it, because every `??` below is
 * a decision about what a missing field means, and the channel default is one
 * the report then acts on. This project has now twice shipped a defect that
 * lived in a file the suite could not import — the expiry written as a string,
 * and the write issued as POST — and both times the whole suite stayed green.
 */
export function toSession(fields: Record<string, FirestoreValue>): SessionRow {
  const str = (k: string) => fields[k]?.stringValue ?? '';
  const num = (k: string) => Number(fields[k]?.integerValue ?? 0);
  return {
    // UNKNOWN, not '', for a document written before the field existed: the
    // rule below reads this value, and an empty string would be a third
    // meaning nobody declared.
    channel: fields.channel?.stringValue ?? 'UNKNOWN',
    hero: str('hero'),
    partner: fields.partner?.stringValue ?? null,
    mode: str('mode'),
    difficulty: str('difficulty'),
    touch: fields.touch?.booleanValue ?? false,
    build: str('build'),
    furthestStage: num('furthestStage'),
    furthestWave: num('furthestWave'),
    seconds: num('seconds'),
    score: num('score'),
    enemiesDefeated: num('enemiesDefeated'),
    outcome: str('outcome'),
    deaths: (fields.deaths?.arrayValue?.values ?? []).map((d) => ({
      stage: Number(d.mapValue?.fields?.stage?.integerValue ?? 0),
      wave: Number(d.mapValue?.fields?.wave?.integerValue ?? 0),
    })),
  };
}

/** The rows and the rows left out, counted. */
export interface Selection {
  players: SessionRow[];
  /** How many rows were set aside, so the report can say so out loud. */
  excluded: number;
}

/**
 * The sessions a report about players is allowed to count.
 *
 * Only the production deploy. Everything else in the collection was played by
 * whoever was testing something: a branch deploy, a deploy preview, a local
 * build. Those runs are real play in the sense that a person pressed the
 * buttons, and they are worthless as evidence about players, because the
 * person already knew where the difficult wave was.
 *
 * UNKNOWN is excluded with the rest, and that is the deliberate half. It marks
 * a row stored before this field existed, or one posted by a tab that had not
 * reloaded since the release. Counting them would mean guessing PRODUCTION for
 * a row that might be a developer's, which is the error that has no floor: a
 * hidden row costs one observation, a wrong row costs the number's meaning.
 *
 * This lives here, and not in the runner that prints it, for the reason the
 * whole file is here: a rule the tests cannot reach is a rule a mutation can
 * delete in silence.
 */
export function playerSessions(rows: SessionRow[]): Selection {
  const players = rows.filter((r) => r.channel === 'PRODUCTION');
  return { players, excluded: rows.length - players.length };
}

const pct = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10;

function tally(values: string[]): Tally[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, sessions]) => ({ key, sessions, share: pct(sessions, values.length) }))
    .sort((a, b) => b.sessions - a.sessions || a.key.localeCompare(b.key));
}

/**
 * A quantile by the nearest-rank method, which needs no interpolation and
 * therefore always returns a value some session actually had. With a few
 * hundred rows the difference from a fancier estimator is noise, and a real
 * observation is easier to argue about than an average of two.
 */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil(q * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

function spread(values: number[]): Spread {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
  };
}

/**
 * Builds the report.
 *
 * Two exclusions, both deliberate and both worth knowing when reading the
 * output:
 *
 * `stoppedAt` counts only runs that did not finish. A completed run did not
 * stop anywhere — it ended — and folding it in would put the last wave of the
 * campaign at the top of a list meant to show where people give up.
 *
 * `stageOneSeconds` counts only runs that reached stage two or finished the
 * campaign, because those are the only ones that prove stage one was cleared.
 * Timing everybody would answer "how long do people play" — a different
 * question, and one whose answer is dragged down by every run that stopped
 * early.
 */
export function buildReport(rows: SessionRow[]): Report {
  const unfinished = rows.filter((r) => r.outcome !== 'COMPLETED');
  const clearedStageOne = rows.filter((r) => r.furthestStage >= 1 || r.outcome === 'COMPLETED');

  return {
    sessions: rows.length,
    outcomes: tally(rows.map((r) => r.outcome)),
    stoppedAt: tally(unfinished.map((r) => `stage ${r.furthestStage} wave ${r.furthestWave}`)),
    stageOneSeconds: spread(clearedStageOne.map((r) => r.seconds)),
    heroes: tally(rows.map((r) => r.hero)),
    modes: tally(rows.map((r) => r.mode)),
    difficulties: tally(rows.map((r) => r.difficulty)),
    touchShare: pct(rows.filter((r) => r.touch).length, rows.length),
    deadliestWaves: tally(
      rows.flatMap((r) => r.deaths.map((d) => `stage ${d.stage} wave ${d.wave}`))
    ),
  };
}

/** The report as lines of text, for a terminal. */
export function formatReport(report: Report): string {
  const lines: string[] = [];
  const rows = (title: string, items: Tally[], limit = 12) => {
    lines.push('', title);
    if (items.length === 0) {
      lines.push('  (nothing)');
      return;
    }
    for (const t of items.slice(0, limit)) {
      lines.push(`  ${t.key.padEnd(28)} ${String(t.sessions).padStart(5)}  ${t.share}%`);
    }
    if (items.length > limit) lines.push(`  ... and ${items.length - limit} more`);
  };

  lines.push(`sessions: ${report.sessions}`);
  rows('outcome', report.outcomes);
  rows('where unfinished runs stopped', report.stoppedAt);

  const s = report.stageOneSeconds;
  lines.push(
    '',
    'seconds of play, among runs that cleared stage one',
    `  n=${s.n}   p25 ${s.p25}s   median ${s.median}s   p75 ${s.p75}s`
  );

  rows('hero', report.heroes);
  rows('mode', report.modes);
  rows('difficulty', report.difficulties);
  lines.push('', `played on touch controls: ${report.touchShare}%`);
  rows('waves that killed someone', report.deadliestWaves);

  return lines.join('\n');
}
