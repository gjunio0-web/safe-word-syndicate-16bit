import { CharacterId, GameMode } from '../types';

/**
 * What one play session looked like, assembled in memory.
 *
 * Collection only. Nothing here sends, stores, or touches the network — the
 * transport is a separate concern and lives elsewhere, so this half can be
 * tested without a browser and swapped destinations without being reopened.
 *
 * The questions this exists to answer are specific and there are only three:
 * where people stop, how long the stage actually takes, and who they pick.
 * Anything that does not serve one of those has no business being collected,
 * which is why the record below is short and why it will stay short.
 *
 * What is deliberately absent: any identifier that survives a reload, any
 * network address, anything typed by a person. The session id is random, is
 * generated at the start of the session, and is never written to disk — two
 * visits from the same browser are two strangers, by construction. That is a
 * real analytical loss (returning players are invisible) accepted on purpose,
 * because the alternative is tracking people to learn something a promotional
 * demo does not need to know.
 */

/** How a session ended. */
export type SessionOutcome =
  /** Cleared the last stage of the active cut. */
  | 'COMPLETED'
  /** Ran out of lives. */
  | 'GAME_OVER'
  /** Walked back to the title screen mid-match. */
  | 'ABANDONED'
  /** Closed the tab or navigated away. The one that matters most and the one
   * most easily lost, since the page is dying while it is being reported. */
  | 'LEFT';

export interface SessionSnapshot {
  sessionId: string;
  /** Which cut of the game this was, so demo and full builds stay separable. */
  build: 'DEMO' | 'FULL';
  hero: CharacterId;
  partner: CharacterId | null;
  mode: GameMode;
  difficulty: string;
  /** Touch controls were mounted. Not a device fingerprint — one boolean. */
  touch: boolean;
  /** Highest wave reached, as stage index and wave index within it. */
  furthestStage: number;
  furthestWave: number;
  /** Wave index of each death, in order. Length is the death count. */
  deaths: Array<{ stage: number; wave: number }>;
  /** Seconds of simulated play, taken from the engine's own clock rather than
   * the wall clock, so a backgrounded tab does not inflate the number. */
  seconds: number;
  score: number;
  enemiesDefeated: number;
  outcome: SessionOutcome | null;
}

export interface SessionStart {
  build: 'DEMO' | 'FULL';
  hero: CharacterId;
  partner?: CharacterId | null;
  mode: GameMode;
  difficulty: string;
  touch: boolean;
}

/**
 * A random id for this session.
 *
 * `crypto.randomUUID` where it exists, which is everywhere current, and a
 * plain random fallback where it does not — an id that collides is a merged
 * pair of sessions, which is a rounding error, while a crash is a lost one.
 */
function newSessionId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `s-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function startSession(start: SessionStart): SessionSnapshot {
  return {
    sessionId: newSessionId(),
    build: start.build,
    hero: start.hero,
    partner: start.partner ?? null,
    mode: start.mode,
    difficulty: start.difficulty,
    touch: start.touch,
    furthestStage: 0,
    furthestWave: 0,
    deaths: [],
    seconds: 0,
    score: 0,
    enemiesDefeated: 0,
    outcome: null,
  };
}

/**
 * Records progress.
 *
 * Monotonic on purpose: the furthest point reached, never the current one. A
 * player who dies and restarts a wave has still reached it, and the question
 * being asked is where people got to, not where they happened to be standing
 * when the session ended.
 */
export function recordProgress(
  session: SessionSnapshot,
  stage: number,
  wave: number
): SessionSnapshot {
  const ahead =
    stage > session.furthestStage ||
    (stage === session.furthestStage && wave > session.furthestWave);
  if (!ahead) return session;
  return { ...session, furthestStage: stage, furthestWave: wave };
}

/** Records a death and where it happened. */
export function recordDeath(
  session: SessionSnapshot,
  stage: number,
  wave: number
): SessionSnapshot {
  return { ...session, deaths: [...session.deaths, { stage, wave }] };
}

/** Folds in the engine's running counters. */
export function recordStats(
  session: SessionSnapshot,
  stats: { score: number; enemiesDefeated: number; timeSeconds: number }
): SessionSnapshot {
  return {
    ...session,
    // Accumulated across stages rather than replaced, because the engine's
    // counters reset when a new stage builds a new engine, and a session is
    // the whole run.
    score: Math.max(session.score, stats.score),
    enemiesDefeated: Math.max(session.enemiesDefeated, stats.enemiesDefeated),
    seconds: Math.max(session.seconds, stats.timeSeconds),
  };
}

/**
 * Seals the session with how it ended.
 *
 * Once sealed it stays sealed. The tab-closing report and a real outcome can
 * both fire — a player who wins and then closes the tab would otherwise have
 * their victory overwritten by 'LEFT', turning the most interesting session in
 * the set into the least.
 */
export function finishSession(
  session: SessionSnapshot,
  outcome: SessionOutcome
): SessionSnapshot {
  if (session.outcome) return session;
  return { ...session, outcome };
}

/**
 * What a moment in the run means for the session being held.
 *
 * The hook that owns the session cannot be exercised by this suite — it needs
 * a DOM this project does not run — so the decisions it makes live here
 * instead, where a test can reach them. That is not tidiness: the rule below
 * was changed to fix a real defect, and a mutation putting the defect back
 * left the whole suite green, because the tests modelled the rule locally
 * rather than calling it.
 */
export interface SessionTransition {
  /** The sealed copy to report, or null when there is nothing to say. */
  send: SessionSnapshot | null;
  /** The session to go on holding. Null once the run is over for good. */
  keep: SessionSnapshot | null;
}

/**
 * A real ending: a win, a loss, or walking back to the title.
 *
 * Reports and closes. Nothing more should be said about this run afterwards,
 * which is what `keep: null` enforces — the outcome seal alone would not, since
 * nothing stops a second beacon going out, and two rows for one play is a worse
 * lie than a missing one.
 */
export function onRunEnded(
  session: SessionSnapshot | null,
  outcome: SessionOutcome
): SessionTransition {
  if (!session) return { send: null, keep: null };
  return { send: finishSession(session, outcome), keep: null };
}

/**
 * The page went away, and may or may not come back.
 *
 * Reports where the run stands and *keeps it open*. A tab that died and a
 * player who answered a message look identical from the page's side, so both
 * are reported and neither is treated as an ending.
 *
 * The earlier version closed the session here and it was wrong in a way that
 * mattered: switching apps mid-fight is ordinary on a phone, and phones are
 * most of this audience, so a large share of players who went on to win were
 * filed forever as having walked away at whichever wave they happened to be
 * on. Not a lost row — a wrong one, in the exact column the exercise exists to
 * read.
 *
 * `finishSession` returns a sealed copy and leaves the original alone, which is
 * what makes this possible: the live session stays unsealed and can still reach
 * a real ending later, under the same session id, and the far end overwrites
 * the earlier row.
 */
export function onPageHidden(session: SessionSnapshot | null): SessionTransition {
  if (!session) return { send: null, keep: null };
  return { send: finishSession(session, 'LEFT'), keep: session };
}

/**
 * The whole visibility rule, so the hook's handler has no judgement left in it.
 *
 * Becoming visible again says nothing worth reporting — the run never stopped
 * from this side, and a beacon per app switch back would be noise.
 */
export function onVisibilityChange(
  state: 'hidden' | 'visible',
  session: SessionSnapshot | null
): SessionTransition {
  if (state !== 'hidden') return { send: null, keep: session };
  return onPageHidden(session);
}
