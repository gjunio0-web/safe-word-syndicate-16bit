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
import {
  buildReport,
  formatReport,
  playerSessions,
  toSession,
  type FirestoreValue,
  type SessionRow,
} from './telemetryReport.mts';

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
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
} else if (process.env.TELEMETRY_ALL) {
  // Every channel, for looking at the collection itself rather than at
  // players — checking that a branch deploy is writing, most of the time.
  console.log(`all ${rows.length} sessions, every channel\n`);
  console.log(formatReport(buildReport(rows)));
} else {
  const { players, excluded } = playerSessions(rows);
  // Said out loud rather than dropped quietly. A reader who does not know a
  // filter ran cannot tell a quiet collection from a filtered one.
  if (excluded > 0) {
    console.log(`${excluded} session(s) not from the production deploy, excluded.`);
    console.log('Set TELEMETRY_ALL=1 to include them.\n');
  }
  if (players.length === 0) {
    console.log('No sessions from the production deploy yet.');
  } else {
    console.log(formatReport(buildReport(players)));
  }
}
