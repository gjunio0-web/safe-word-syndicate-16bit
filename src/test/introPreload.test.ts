import { describe, it, expect } from 'vitest';
import { introPreloadPlan, warmIntroAssets } from '../game/introPreload';
import type { IntroAssets } from '../components/IntroSequence';

const ASSETS: IntroAssets = {
  scene1: '/a/scene1.webp',
  scene2: '/a/scene2.webp',
  scene3: '/a/scene3.webp',
  scene3Neon: '/a/scene3neon.webp',
  scene4Plate: '/a/plate.webp',
  scene4Heroes: '/a/heroes.webp',
  closeups: ['/a/cu1.webp', '/a/cu2.webp', '/a/cu3.webp', '/a/cu4.webp'],
  music: '/a/theme.ogg',
};

describe('introPreloadPlan', () => {
  it('covers every image the sequence paints, and nothing else', () => {
    const urls = introPreloadPlan(ASSETS).map((i) => i.url);
    expect(urls).toHaveLength(10);
    expect(new Set(urls).size).toBe(10);
    for (const url of [
      ASSETS.scene1, ASSETS.scene2, ASSETS.scene3, ASSETS.scene3Neon,
      ASSETS.scene4Plate, ASSETS.scene4Heroes, ...ASSETS.closeups,
    ]) {
      expect(urls).toContain(url);
    }
  });

  it('leaves the music out', () => {
    // The audio path fetches and decodes it itself, and has a silent-clock
    // fallback for when it is late. Queueing it here would put a 1.2MB
    // download in front of the first image and buy nothing.
    expect(introPreloadPlan(ASSETS).map((i) => i.url)).not.toContain(ASSETS.music);
  });

  it('is ordered by deadline', () => {
    const plan = introPreloadPlan(ASSETS);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].dueAt).toBeGreaterThanOrEqual(plan[i - 1].dueAt);
    }
  });

  it('fetches the opening frame first', () => {
    const plan = introPreloadPlan(ASSETS);
    expect(plan[0].url).toBe(ASSETS.scene1);
    expect(plan[0].dueAt).toBe(0);
  });

  it('puts the small close-ups ahead of the heavy glow layer they share a deadline with', () => {
    // Same instant, wildly different sizes: 0.75MB of faces against a 3.8MB
    // plate. Small-first means the scene still reads when the big one is late.
    const urls = introPreloadPlan(ASSETS).map((i) => i.url);
    for (const cu of ASSETS.closeups) {
      expect(urls.indexOf(cu)).toBeLessThan(urls.indexOf(ASSETS.scene3Neon));
    }
  });

  it('keeps the drop overlay last, since it has the most runway', () => {
    const plan = introPreloadPlan(ASSETS);
    expect(plan[plan.length - 1].url).toBe(ASSETS.scene4Heroes);
  });

  it('gives every asset real runway, which is the whole point', () => {
    // Before this existed, each image was discovered by the browser at the
    // moment its scene mounted — zero seconds of notice for all of them,
    // including a 3.8MB file. Any positive deadline is runway that now exists.
    const plan = introPreloadPlan(ASSETS);
    expect(plan.filter((i) => i.dueAt > 0)).toHaveLength(9);
    expect(plan[plan.length - 1].dueAt).toBeGreaterThan(40);
  });
});

describe('warmIntroAssets', () => {
  it('starts every fetch in plan order', async () => {
    const seen: string[] = [];
    await warmIntroAssets(ASSETS, (url) => {
      seen.push(url);
      return Promise.resolve();
    });
    expect(seen).toEqual(introPreloadPlan(ASSETS).map((i) => i.url));
  });

  it('a missing file costs one scene its picture, not the sequence', async () => {
    // Rejecting here would surface as an unhandled rejection during an
    // animation nobody can pause. One broken URL should be survivable.
    await expect(
      warmIntroAssets(ASSETS, (url) =>
        url === ASSETS.scene3Neon ? Promise.reject(new Error('404')) : Promise.resolve()
      )
    ).resolves.toBeUndefined();
  });

  it('does not serialise: everything is in flight before anything settles', async () => {
    let inFlight = 0;
    let peak = 0;
    await warmIntroAssets(ASSETS, () => {
      peak = Math.max(peak, ++inFlight);
      return Promise.resolve().then(() => { inFlight--; });
    });
    expect(peak).toBe(10);
  });
});
