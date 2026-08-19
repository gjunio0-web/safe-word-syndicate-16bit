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
