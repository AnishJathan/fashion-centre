import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { monogramPath } from '../mobile/src/brandIcon.ts';
import { palettes } from '../mobile/src/design.ts';

const icons = new URL('../mobile/assets/identity/', import.meta.url);
const web = new URL('../public/', import.meta.url);
await mkdir(icons, { recursive: true });
const { light, dark } = palettes;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  async function render(target, size, background, ink, scale = 1) {
    const image = await page.evaluate(({ size, background, ink, scale, path }) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d', { alpha: !background });
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, size, size);
      }
      ctx.translate(size / 2, size / 2);
      ctx.scale(size * scale / 100, size * scale / 100);
      ctx.translate(-50, -50);
      ctx.fillStyle = ink;
      ctx.fill(new Path2D(path));
      return canvas.toDataURL('image/png').split(',')[1];
    }, { size, background, ink, scale, path: monogramPath });
    await writeFile(target, Buffer.from(image, 'base64'));
  }
  await render(new URL('app-icon.png', icons), 1024, light.accent, light.onAccent);
  await render(new URL('app-icon-dark.png', icons), 1024, dark.background, dark.accent);
  await render(new URL('app-icon-tinted.png', icons), 1024, '#171717', '#FFFFFF');
  // Android masks the 108-unit foreground into a smaller launcher viewport.
  await render(new URL('adaptive-foreground.png', icons), 1024, null, light.onAccent, 0.77);
  await render(new URL('apple-touch-icon.png', web), 180, light.accent, light.onAccent);
} finally {
  await browser.close();
}
await writeFile(new URL('favicon.svg', web),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n' +
  '<style>circle{fill:' + light.accent + '}path{fill:' + light.onAccent + '}@media(prefers-color-scheme:dark){circle{fill:' + dark.accent + '}path{fill:' + dark.onAccent + '}}</style>\n' +
  '<circle cx="50" cy="50" r="50"/><path d="' + monogramPath + '"/>\n</svg>\n');
