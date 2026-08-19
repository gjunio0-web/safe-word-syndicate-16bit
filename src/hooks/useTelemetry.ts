import { useCallback, useEffect, useMemo, useRef } from 'react';
import { CharacterId, GameMode } from '../types';
import { GameEngine } from '../game/engine';
import { IS_DEMO } from '../game/campaign';
import {
  SessionOutcome,
  SessionSnapshot,
  SessionTransition,
  onRunEnded,
  onVisibilityChange,
  recordDeath,
  recordProgress,
  recordStats,
  startSession,
} from '../game/telemetry';
import { sendSession } from '../game/telemetryTransport';

/**
 * Ties the collector to the game without letting it into the game.
 *
 * Everything here is a ref rather than state, on purpose. A session updates on
 * roughly every frame that matters and none of it is drawn, so putting it in
 * state would re-render the whole app to record a number nobody sees. It would
 * also make the collector part of React's timing — and the one moment this has
 * to work is the moment the tab closes, when React is not going to render
 * anything ever again.
 *
 * The engine is not touched. It does not know telemetry exists, stays
 * importable without React, and its tests stay a simulation rather than a
 * simulation plus a network.
 */

interface SessionMeta {
  hero: CharacterId;
  partner: CharacterId | null;
  mode: GameMode;
  difficulty: string;
  touch: boolean;
}

export function useTelemetry() {
  const session = useRef<SessionSnapshot | null>(null);
  /**
   * Player HP on the previous sample, so a death can be spotted by the edge.
   *
   * The engine has no death event to subscribe to and adding one would be a
   * change to the simulation for the benefit of a bystander. Watching HP fall
   * to zero costs nothing and keeps the dependency pointing one way.
   */
  const wasAlive = useRef(true);

  /** Opens a session. Called when a fighter is chosen, not when a stage loads,
   * so restarting a stage does not look like a new player arriving. */
  const begin = useCallback(
    (meta: SessionMeta) => {
      session.current = startSession({
        build: IS_DEMO ? 'DEMO' : 'FULL',
        hero: meta.hero,
        partner: meta.partner,
        mode: meta.mode,
        difficulty: meta.difficulty,
        touch: meta.touch,
      });
      wasAlive.current = true;
    },
    []
  );

  /** Samples the engine. Cheap enough to call every frame. */
  const sample = useCallback((engine: GameEngine, stageIndex: number) => {
    const s = session.current;
    if (!s) return;

    let next = recordProgress(s, stageIndex, engine.currentWaveIndex);
    next = recordStats(next, engine.stats);

    const alive = (engine.player1?.hp ?? 0) > 0;
    if (wasAlive.current && !alive) {
      next = recordDeath(next, stageIndex, engine.currentWaveIndex);
    }
    wasAlive.current = alive;

    session.current = next;
  }, []);

  /**
   * Carries out a decision made in `telemetry.ts`.
   *
   * Every judgement about what to send and what to keep lives there, in plain
   * functions a test can call. What is left here is the part that cannot be
   * tested without a DOM: holding the reference and subscribing to an event.
   */
  const apply = useCallback((transition: SessionTransition) => {
    session.current = transition.keep;
    if (transition.send) sendSession(transition.send);
  }, []);

  /** Seals, sends, and closes the run: a win, a loss, walking back to title. */
  const end = useCallback(
    (outcome: SessionOutcome) => apply(onRunEnded(session.current, outcome)),
    [apply]
  );

  /**
   * The session nobody finishes on purpose.
   *
   * `visibilitychange` to hidden rather than `unload` or `beforeunload`: mobile
   * browsers frequently kill a backgrounded tab without ever firing an unload,
   * and on phones — which is most of this audience — hidden is the last
   * reliable moment there is.
   */
  useEffect(() => {
    const onHidden = () =>
      apply(onVisibilityChange(document.visibilityState, session.current));
    document.addEventListener('visibilitychange', onHidden);
    return () => document.removeEventListener('visibilitychange', onHidden);
  }, [apply]);

  /*
   * Stable across renders, because the gameplay loop lists this object in its
   * dependencies. Returning a fresh object every render would tear that loop
   * down and rebuild it on every state change the app makes — which is most
   * frames — and the fixed-step clock would restart along with it.
   */
  return useMemo(() => ({ begin, sample, end }), [begin, sample, end]);
}
