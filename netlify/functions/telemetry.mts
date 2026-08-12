import crypto from 'node:crypto';

/**
 * Receives a finished play session and files it.
 *
 * The single rule this file exists to enforce, stated before anything else:
 * it reads the request body and nothing else. Not the network address, not
 * the user agent, not the referrer, not any header the browser attaches on
 * its own. The collector on the other side was built so that nothing
 * identifying anyone ever leaves the machine, and that guarantee is only
 * worth as much as this file's willingness to throw away what arrives here
 * anyway. An address logged here would turn an anonymous dataset into
 * personal data, with every obligation that follows, and nobody would notice
 * until it mattered.
 *
 * There is no Firebase SDK here and that is deliberate. Firestore has a REST
 * interface, a service account can be exchanged for a token with nothing but
 * Node's own crypto, and skipping the dependency keeps a cold start fast and
 * keeps one more package out of a project that has three.
 */

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  nullValue?: null;
  arrayValue?: { values: FirestoreValue[] };
  mapValue?: { fields: Record<string, FirestoreValue> };
}

/** The shape we accept. Anything else is discarded without ceremony. */
interface IncomingSession {
  sessionId: string;
  build: string;
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

/**
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

/** Wraps a session in Firestore's typed-value document format. */
function toDocument(s: IncomingSession, receivedAt: string): Record<string, FirestoreValue> {
  const int = (n: number): FirestoreValue => ({ integerValue: String(Math.round(n)) });
  return {
    sessionId: { stringValue: s.sessionId },
    build: { stringValue: s.build },
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
  };
}

/** Signs a service-account JWT and trades it for an access token. */
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64(header)}.${b64(claim)}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(privateKey)
    .toString('base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

export default async (request: Request): Promise<Response> => {
  // Everything below reads `request` for its body and its method only. If a
  // future edit reaches for request.headers to read an address, an origin, or
  // a user agent, that edit is the bug this comment exists to flag.
  if (request.method !== 'POST') {
    return new Response('POST only', { status: 405 });
  }

  let body: unknown;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return new Response('bad json', { status: 400 });
  }

  if (!isSession(body)) {
    return new Response('not a session', { status: 400 });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    // Unconfigured is not an error the player should ever feel. Accepting and
    // dropping keeps a missing environment variable from turning into a
    // console full of failed requests on every finished game.
    console.warn('[telemetry] Firestore credentials absent; session discarded');
    return new Response(null, { status: 204 });
  }

  try {
    const token = await getAccessToken(clientEmail, privateKey);
    const day = new Date().toISOString().slice(0, 10);
    const url =
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/` +
      `sessions?documentId=${encodeURIComponent(`${day}_${body.sessionId}`)}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: toDocument(body, new Date().toISOString()) }),
    });

    if (!res.ok) {
      console.warn(`[telemetry] Firestore rejected the write: ${res.status}`);
    }
  } catch (err) {
    console.warn('[telemetry] write failed', err);
  }

  // 204 regardless. The beacon is fire-and-forget, nothing on the other side
  // is listening for a status, and a failure here is a lost row rather than
  // anything the player should be told about.
  return new Response(null, { status: 204 });
};
