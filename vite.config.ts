import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

const AUDIO_DIR = path.resolve(__dirname, 'public/audio');
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm'];

/** Public path of the manifest. Identical in dev and in production. */
const AUDIO_MANIFEST_PATH = 'audio/manifest.json';

function scanAudioFiles(): string[] {
  if (!fs.existsSync(AUDIO_DIR)) return [];
  try {
    return fs
      .readdirSync(AUDIO_DIR)
      .filter((f) => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .sort();
  } catch {
    return [];
  }
}

/**
 * Exposes the tracks in `public/audio/` to the client.
 *
 * The previous version served this list from an endpoint (`/api/audio-files`)
 * created in `configureServer` — a dev-server middleware, which does not exist
 * in a static build. In production the fetch returned 404, the game fell back
 * to the synth, and the MP3s shipped to `dist` without ever playing.
 *
 * Now the same URL answers in both environments: served dynamically in dev (so
 * files dropped into the folder are picked up without a restart) and emitted as
 * a static asset at build time.
 */
function audioManifestPlugin(): Plugin {
  return {
    name: 'audio-manifest',
    configureServer(server) {
      server.middlewares.use(`/${AUDIO_MANIFEST_PATH}`, (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ files: scanAudioFiles() }));
      });
    },
    generateBundle() {
      const files = scanAudioFiles();
      this.emitFile({
        type: 'asset',
        fileName: AUDIO_MANIFEST_PATH,
        source: JSON.stringify({ files }),
      });
      this.info(`manifesto de áudio gerado com ${files.length} faixa(s)`);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), audioManifestPlugin()],
    define: {
      /**
       * Which deploy this bundle is. Netlify sets `CONTEXT` on every build —
       * `production`, `branch-deploy`, `deploy-preview` — and nothing sets it
       * anywhere else, which is exactly the distinction the telemetry needs to
       * keep a test run from counting as a player. Read once, at build time,
       * because the alternative is the function reading a request header, and
       * `netlify/functions/telemetry.mts` exists to not do that.
       */
      __BUILD_CONTEXT__: JSON.stringify(process.env.CONTEXT ?? ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/public/audio/**', '**/public/audio/*'],
      },
    },
  };
});
