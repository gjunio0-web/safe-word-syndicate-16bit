/**
 * Reads the collected sessions and prints the three answers.
 *
 *   node --experimental-strip-types scripts/read-telemetry.mts
 *
 * Credentials come from a service-account JSON, by path:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
 *
 * Nothing is written and nothing is cached. This is a read of a collection
 * that holds no personal data, so there is nothing here to protect beyond the
 * key itself — which is why the key is taken from a path rather than pasted
 * into a shell history.
 *
 * Every judgement about what the numbers mean lives in `telemetryReport.mts`,
 * which imports nothing and is covered by tests. What is here is fetching and
 * printing, which is not.
 */

import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildReport, formatReport, type SessionRow } from './telemetryReport.mts';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface FirestoreValue {
  stringValue?: string;
  integerValue?: string;
  booleanValue?: boolean;
  nullValue?: null;
  arrayValue?: { values?: FirestoreValue[] };
  mapValue?: { fields?: Record<string, FirestoreValue> };
}

function credentials(): ServiceAccount {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!path) {
    throw new Error(
      'Set GOOGLE_APPLICATION_CREDENTIALS to the path of the service-account JSON.'
    );
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<ServiceAccount>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error(`${path} is missing project_id, client_email or private_key.`);
  }
  return parsed as ServiceAccount;
}

/** Same exchange the write path performs, read-only scope. */
async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: account.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(account.private_key.replace(/\\n/g, '\n'))
    .toString('base64url');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** Unwraps Firestore's typed-value format back into a plain session. */
function toSession(fields: Record<string, FirestoreValue>): SessionRow {
  const str = (k: string) => fields[k]?.stringValue ?? '';
  const num = (k: string) => Number(fields[k]?.integerValue ?? 0);
  return {
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

/** Walks the collection, following the page token to the end. */
async function fetchSessions(projectId: string, token: string): Promise<SessionRow[]> {
  const base =
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/sessions`;
  const rows: SessionRow[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(base);
    url.searchParams.set('pageSize', '300');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`read failed: ${res.status} ${await res.text()}`);

    const page = (await res.json()) as {
      documents?: Array<{ fields?: Record<string, FirestoreValue> }>;
      nextPageToken?: string;
    };
    for (const doc of page.documents ?? []) rows.push(toSession(doc.fields ?? {}));
    pageToken = page.nextPageToken;
  } while (pageToken);

  return rows;
}

const account = credentials();
const rows = await fetchSessions(account.project_id, await accessToken(account));

if (rows.length === 0) {
  console.log('No sessions stored yet.');
} else {
  console.log(formatReport(buildReport(rows)));
}
