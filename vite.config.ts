import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

function audioScannerPlugin(): Plugin {
  return {
    name: 'audio-scanner-plugin',
    configureServer(server) {
      server.middlewares.use('/api/audio-files', (_req, res) => {
        const audioDir = path.resolve(__dirname, 'public/audio');
        let files: string[] = [];
        if (fs.existsSync(audioDir)) {
          try {
            files = fs.readdirSync(audioDir).filter((f) => {
              const ext = path.extname(f).toLowerCase();
              return ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.webm'].includes(ext);
            });
          } catch {
            files = [];
          }
        }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ files }));
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), audioScannerPlugin()],
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
