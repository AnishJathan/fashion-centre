import { defineConfig } from 'vite';
import { metrics, motion, palettes } from './mobile/src/design';
import { phoneCoverAspect } from './mobile/src/editorial';
import { visionRuntime } from './scripts/vision-runtime';

const variables = (values: Record<string, string | number>, unit = '') =>
  Object.entries(values).map(([key, value]) => '--' + key + ':' + value + unit).join(';');
const theme = ':root{' + variables(palettes.light) + ';' + variables(metrics, 'px') + ';' + variables(motion, 'ms') + ';--phoneCoverAspect:' + phoneCoverAspect +
  '}html[data-theme="dark"]{' + variables(palettes.dark) + '}';

export default defineConfig({
  optimizeDeps: { entries: ['index.html'] },
  plugins: [
    { name: 'shared-design', transformIndexHtml: () => [{ tag: 'style', children: theme, injectTo: 'head-prepend' }] },
    visionRuntime(),
  ],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    watch: { ignored: ['**/mobile/android/**', '**/mobile/ios/**', '**/mobile/dist/**', '**/backend/target/**', '**/test-results/**'] },
    proxy: { '/api': process.env.API_PROXY_TARGET || 'http://localhost:8081' },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
});
