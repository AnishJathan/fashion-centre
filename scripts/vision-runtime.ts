import { createReadStream, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

// MediaPipe resolves its loader and binary by exact filenames at runtime.
// Serve the pair shipped with the installed JS package in development and production.
export function visionRuntime(): Plugin {
  const directory = dirname(fileURLToPath(import.meta.resolve('@mediapipe/tasks-vision/vision_wasm_internal.wasm')));
  const { version } = JSON.parse(readFileSync(join(directory, '..', 'package.json'), 'utf8'));
  const root = '/vision/' + version;
  const names = readdirSync(directory).filter(name => /^vision_wasm_\w+\.(js|wasm)$/.test(name));
  return {
    name: 'mediapipe-runtime',
    config: () => ({ define: { __VISION_WASM_ROOT__: JSON.stringify(root) } }),
    configureServer(server) {
      server.middlewares.use(root, (request, response, next) => {
        const name = request.url?.split('?')[0].slice(1) ?? '';
        if (!names.includes(name)) return next();
        response.setHeader('Content-Type', name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        createReadStream(join(directory, name)).on('error', next).pipe(response);
      });
    },
    generateBundle() {
      for (const name of names) {
        this.emitFile({ type: 'asset', fileName: root.slice(1) + '/' + name, source: readFileSync(join(directory, name)) });
      }
    },
  };
}
