import crypto from 'node:crypto';
import { firestoreWrite } from './firestoreWrite.mts';
import { isSession, toDocument } from './sessionDocument.mts';

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

    // Method and address come from `firestoreWrite`, which is a separate file
    // so that a test can read the decision. See the comment there: PATCH to a
    // named document rather than POST to the collection is what lets a run
    // report twice without being counted twice.
    const { method, url } = firestoreWrite(projectId, body.sessionId, day);

    const res = await fetch(url, {
      method,
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
