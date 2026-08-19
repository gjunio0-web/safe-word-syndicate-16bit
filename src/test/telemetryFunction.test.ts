import { describe, expect, it } from 'vitest';
import {
  RETENTION_DAYS,
  expiresAt,
  firestoreWrite,
} from '../../netlify/functions/firestoreWrite.mts';

/**
 * The write the collector performs on the far end.
 *
 * This exists because the function had type checking and no behavioural cover:
 * changing `PATCH` back to `POST` — undoing a real fix — left all 533 tests
 * green. The handler itself cannot be reached from here, since it imports
 * `node:crypto` and the tests run under a tsconfig without Node types, so the
 * decision was moved into a file that imports nothing.
 */

describe('writing a session to Firestore', () => {
  const write = () => firestoreWrite('my-project', 'abc-123', '2026-08-19');

  it('overwrites the run rather than filing a second copy of it', () => {
    // The whole point. One run can report twice — once when the player
    // switched apps, once when they came back and won — and the second report
    // has to replace the first. POST to the collection refuses it and leaves
    // the wrong row standing.
    expect(write().method).toBe('PATCH');
  });

  it('names the document after the session, so the second report finds the first', () => {
    // Addressed by name, not appended to the collection: no `?documentId=`
    // query, and the id is the last path segment.
    expect(write().url).toMatch(/\/documents\/sessions\/2026-08-19_abc-123$/);
    expect(write().url).not.toContain('documentId=');
  });

  it('puts the session under the project it was told to', () => {
    expect(write().url).toContain('/projects/my-project/databases/(default)/');
  });

  it('escapes a session id that would otherwise break the path', () => {
    // Nothing generates ids like this, but the id arrives from the network and
    // a slash in it would address a different collection entirely.
    const odd = firestoreWrite('p', 'a/b?c', '2026-01-02');
    expect(odd.url).toMatch(/\/sessions\/2026-01-02_a%2Fb%3Fc$/);
  });

  it('takes the day it is given rather than reading a clock', () => {
    // A function that decides from the current time cannot be pinned, and the
    // day is part of the document name — so the same run reported twice across
    // midnight would write two rows. Passing it in is what makes that visible
    // rather than a surprise in the data.
    expect(firestoreWrite('p', 's', '1999-12-31').url).toContain('1999-12-31_s');
  });
});

describe('how long a session is kept', () => {
  it('marks it for deletion six months on', () => {
    // The database deletes it, on a TTL policy watching this field. Retention
    // that depends on someone remembering to run a script is not retention.
    expect(expiresAt('2026-08-19T12:00:00.000Z')).toBe('2027-02-18T12:00:00.000Z');
  });

  it('counts the six months in days, so the 31st has an answer', () => {
    // Adding six calendar months to 31 August lands on a date that does not
    // exist, and every language resolves that differently. 183 days does not
    // have the problem.
    expect(RETENTION_DAYS).toBe(183);
    expect(expiresAt('2026-08-31T00:00:00.000Z')).toBe('2027-03-02T00:00:00.000Z');
  });

  it('refuses a date it cannot read rather than inventing one', () => {
    // A silent NaN here would write a document with no expiry, which would sit
    // in the collection for ever without anyone noticing.
    expect(() => expiresAt('not a date')).toThrow(/not a date/);
  });
});
