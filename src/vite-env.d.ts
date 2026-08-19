/// <reference types="vite/client" />

/**
 * Netlify's deploy context, substituted into the bundle by `vite.config.ts`.
 *
 * Declared as possibly absent because it genuinely is: the test run compiles
 * this code without going through Vite's `define`, so every read has to be
 * guarded by `typeof`. See `SESSION_CHANNEL` in `src/game/telemetry.ts`.
 */
declare const __BUILD_CONTEXT__: string | undefined;

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  const src: string;
  export default src;
}
