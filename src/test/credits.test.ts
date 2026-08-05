import { describe, expect, it } from 'vitest';
import {
  COPYRIGHT_NOTICE,
  CREDIT_LINE,
  CREDIT_ROLES,
  CREDIT_SLOGAN,
  GRAFFITI_SUBTAG,
  GRAFFITI_TAG,
  STUDIO_FULL,
  STUDIO_NAME,
} from '../game/credits';

/**
 * The credit is a rights claim wearing a punk jacket. These tests hold the two
 * apart: the notice half has to stay a notice, and the slogan half has to stay
 * out of the rights conversation entirely.
 */
describe('studio credit', () => {
  it('keeps the studio name whole in every long form', () => {
    expect(STUDIO_FULL.startsWith(STUDIO_NAME)).toBe(true);
    expect(COPYRIGHT_NOTICE).toContain(STUDIO_FULL);
    expect(CREDIT_LINE).toContain(COPYRIGHT_NOTICE);
    expect(CREDIT_LINE).toContain(CREDIT_SLOGAN);
    expect(GRAFFITI_SUBTAG).toContain('WAS HERE');
    expect(GRAFFITI_TAG).toBe(STUDIO_NAME);
  });

  it('never lets the slogan say anything about copying this game', () => {
    // The retired draft read "UNAUTHORIZED COPYING ENCOURAGED". Anything in
    // this family belongs in a LICENSE file that was chosen on purpose, not
    // in the one line a storefront reads as a rights claim.
    expect(CREDIT_SLOGAN).not.toMatch(/COPY|COPIES|COPYING|PIRAT|FREELY|PUBLIC DOMAIN/i);
    expect(CREDIT_LINE).not.toMatch(/COPY|COPIES|COPYING|PIRAT|FREELY|PUBLIC DOMAIN/i);
  });

  it('carries a roster with no empty cells', () => {
    expect(CREDIT_ROLES.length).toBeGreaterThan(0);
    for (const entry of CREDIT_ROLES) {
      expect(entry.role.trim()).not.toBe('');
      expect(entry.name.trim()).not.toBe('');
    }
  });
});
