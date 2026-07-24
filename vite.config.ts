import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

const AUDIO_DIR = path.resolve(__dirname, 'public/audio');
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm'];

/** Caminho público do manifesto. Idêntico em dev e em produção. */
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
 * Expõe as trilhas de `public/audio/` para o cliente.
 *
 * A versão anterior servia essa lista por um endpoint (`/api/audio-files`)
 * criado em `configureServer` — ou seja, um middleware do dev server, que não
 * existe num build estático. Em produção o fetch dava 404, o jogo caía no
 * synth e os MP3 iam para o `dist` sem nunca tocar.
 *
 * Agora a mesma URL responde nos dois ambientes: dinamicamente em dev (para
 * pegar arquivos recém-colocados na pasta sem reiniciar) e como asset estático
 * gerado no build.
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
