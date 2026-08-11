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
