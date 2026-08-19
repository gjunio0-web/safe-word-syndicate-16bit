/**
 * Where a session is written, and how.
 *
 * Split out of the handler for one reason: the handler cannot be exercised by
 * this project's test suite — it reaches for `node:crypto`, and the tsconfig
 * the tests run under carries no Node types — while the decision below is the
 * part with a defect in it. Nothing here imports anything, from Node or
 * elsewhere, so a test can read it directly.
 *
 * That mattered. `PATCH` and the document path were changed to fix a real
 * defect, and a mutation putting `POST` back left the whole suite green: the
 * function had type checking and no behavioural cover at all.
 */

export interface FirestoreWrite {
  method: 'PATCH';
  url: string;
}

/**
 * The write for one session.
 *
 * PATCH to a named document, not POST to the collection, and the name is the
 * session id.
 *
 * One run can report more than once. A player who switches apps mid-fight —
 * ordinary on a phone — is reported as having left, because from the page's
 * side a backgrounded tab and a closed one are the same event. If they come
 * back and win, that win arrives later under the same session id and has to
 * replace the earlier row rather than sit beside it. POST to the collection
 * refuses the second write and leaves the wrong row standing; PATCH writes or
 * overwrites, so the last report wins — and the last report is always the one
 * that saw more of the run.
 *
 * The day is prefixed so a collection can be read by date without an index,
 * and it is passed in rather than read from the clock here: a function that
 * decides what it returns from the current time cannot be pinned by a test.
 */
export function firestoreWrite(
  projectId: string,
  sessionId: string,
  day: string
): FirestoreWrite {
  const documentId = encodeURIComponent(`${day}_${sessionId}`);
  return {
    method: 'PATCH',
    url:
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/` +
      `sessions/${documentId}`,
  };
}

/**
 * How long a session is kept.
 *
 * Six months, counted as 183 days rather than as "six months", because month
 * arithmetic has no answer for the 31st: adding six months to 31 August lands
 * on a date that does not exist, and every language resolves that differently.
 * A fixed count of days is unambiguous and is what a reader of this file can
 * verify without knowing which rounding rule was in fashion.
 */
export const RETENTION_DAYS = 183;

/**
 * When a session written now should disappear.
 *
 * This is the field a Firestore TTL policy deletes on. The deletion is the
 * database's job rather than a script somebody has to remember to run —
 * retention that depends on a person remembering is not retention.
 *
 * `receivedAt` is passed in rather than read from the clock here, for the same
 * reason the day is: a function that decides from the current time cannot be
 * pinned by a test.
 */
export function expiresAt(receivedAt: string): string {
  const received = new Date(receivedAt);
  if (Number.isNaN(received.getTime())) {
    throw new Error(`expiresAt: not a date: ${receivedAt}`);
  }
  return new Date(received.getTime() + RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}
