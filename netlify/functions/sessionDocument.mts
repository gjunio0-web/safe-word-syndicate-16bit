/**
 * What the endpoint accepts, and the shape it stores.
 *
 * Split out of the handler so a test can reach it. The handler imports
 * `node:crypto`, and the tsconfig the tests run under carries no Node types, so
 * anything left in that file is verified by the type checker and by reading —
 * which was not enough: a mutation writing the expiry as a string instead of a
 * timestamp, quietly disabling the six-month deletion, survived the whole
 * suite. Nothing here imports anything.
 */

import { expiresAt } from './firestoreWrite.mts';

export interface FirestoreValue {
  stringValue?: string;
  /** Required by the TTL policy: it deletes on a timestamp, not on a string. */
  timestampValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  nullValue?: null;
  arrayValue?: { values: FirestoreValue[] };
  mapValue?: { fields: Record<string, FirestoreValue> };
}


export /** The shape we accept. Anything else is discarded without ceremony. */
interface IncomingSession {
  sessionId: string;
  build: string;
  /**
   * Which deploy sent this. Optional on the way in, and deliberately so: the
   * page and the function deploy together but browser caches do not, so for a
   * while after any release a tab opened before it can still post a body from
   * the previous shape. Rejecting those would throw away real sessions to
   * enforce a label. They are stored as UNKNOWN instead, which the report
   * excludes — a hidden row rather than a lost one.
   */
  channel?: string;
  hero: string;
  partner: string | null;
  mode: string;
  difficulty: string;
  touch: boolean;
  furthestStage: number;
  furthestWave: number;
  deaths: Array<{ stage: number; wave: number }>;
  seconds: number;
  score: number;
  enemiesDefeated: number;
  outcome: string;
}


export /**
 * Whether the body is a session and not something else.
 *
 * A public endpoint accepts whatever the internet sends it. This is not
 * security — anyone can post a well-formed lie and there is no way to tell —
 * but it does keep malformed and oversized junk out of the collection, which
 * is the realistic failure mode for an endpoint nobody knows about.
 */
function isSession(body: unknown): body is IncomingSession {
  if (typeof body !== 'object' || body === null) return false;
  const b = body as Record<string, unknown>;

  const str = (k: string) => typeof b[k] === 'string' && (b[k] as string).length < 64;
  const num = (k: string) =>
    typeof b[k] === 'number' && Number.isFinite(b[k]) && (b[k] as number) >= 0;

  if (!str('sessionId') || !str('build') || !str('hero') || !str('mode')) return false;
  if (!str('difficulty') || !str('outcome')) return false;
  // Absent is allowed; present and not a short string is not. A body carrying
  // a megabyte under this key is junk whether or not the key is optional.
  if (b.channel !== undefined && !str('channel')) return false;
  if (b.partner !== null && !str('partner')) return false;
  if (typeof b.touch !== 'boolean') return false;
  if (!num('furthestStage') || !num('furthestWave')) return false;
  if (!num('seconds') || !num('score') || !num('enemiesDefeated')) return false;

  // A run of eleven waves cannot produce hundreds of deaths. The cap is a
  // sanity bound on payload size, not a judgement about anyone's skill.
  if (!Array.isArray(b.deaths) || b.deaths.length > 200) return false;
  return b.deaths.every(
    (d) =>
      typeof d === 'object' &&
      d !== null &&
      typeof (d as { stage: unknown }).stage === 'number' &&
      typeof (d as { wave: unknown }).wave === 'number'
  );
}


export /** Wraps a session in Firestore's typed-value document format. */
function toDocument(s: IncomingSession, receivedAt: string): Record<string, FirestoreValue> {
  const int = (n: number): FirestoreValue => ({ integerValue: String(Math.round(n)) });
  return {
    sessionId: { stringValue: s.sessionId },
    build: { stringValue: s.build },
    // Always written, never left off the document: a field that is sometimes
    // absent forces every reader to decide what absence means, and they will
    // not all decide the same way. UNKNOWN says the same thing once, here.
    channel: { stringValue: s.channel ?? 'UNKNOWN' },
    hero: { stringValue: s.hero },
    partner: s.partner === null ? { nullValue: null } : { stringValue: s.partner },
    mode: { stringValue: s.mode },
    difficulty: { stringValue: s.difficulty },
    touch: { booleanValue: s.touch },
    furthestStage: int(s.furthestStage),
    furthestWave: int(s.furthestWave),
    seconds: int(s.seconds),
    score: int(s.score),
    enemiesDefeated: int(s.enemiesDefeated),
    outcome: { stringValue: s.outcome },
    deaths: {
      arrayValue: {
        values: s.deaths.map((d) => ({
          mapValue: { fields: { stage: int(d.stage), wave: int(d.wave) } },
        })),
      },
    },
    // Server-side, because the browser clock is whatever the player set it to
    // and a session dated 2019 would be indistinguishable from a real one.
    receivedAt: { stringValue: receivedAt },
    // The field a Firestore TTL policy deletes on. Six months, enforced by the
    // database rather than by anyone remembering to run something. A timestamp
    // rather than a string because TTL will not accept anything else.
    expiresAt: { timestampValue: expiresAt(receivedAt) },
  };
}
