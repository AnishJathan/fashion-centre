import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';

test('a known full-body frame passes the locally bundled live and still pose models', async ({ page }) => {
  const fixture = fileURLToPath(new URL('../docs/history/prototype-images/campaign.png', import.meta.url));
  await page.route('**/test-full-body', route => route.fulfill({ path: fixture, contentType: 'image/jpeg' }));
  await page.goto('/');
  const requested: string[] = [];
  page.on('request', request => { if (request.url().includes('/vision/')) requested.push(request.url()); });
  const result = await page.evaluate(async () => {
    const { checkPhoto, analyseLiveFrame } = await import('/src/photoChecks.ts');
    const file = await (await fetch('/test-full-body')).blob();
    const still = await checkPhoto(file);
    const image = await createImageBitmap(file);
    const source = document.createElement('canvas');
    source.width = 1600; source.height = 1080;
    const ctx = source.getContext('2d')!;
    ctx.fillStyle = '#bbb'; ctx.fillRect(0, 0, source.width, source.height);
    ctx.drawImage(image, (source.width - 810) / 2, 0, 810, 1080);
    image.close();
    const stream = source.captureStream();
    const video = document.createElement('video');
    video.muted = true;
    video.srcObject = stream;
    try {
      const playing = video.play();
      ctx.fillRect(0, 0, 1, 1);
      await playing;
      const crop = document.createElement('canvas');
      const live = await analyseLiveFrame(video, crop, performance.now());
      return { still, live, ratio: crop.width / crop.height };
    } finally {
      video.pause();
      stream.getTracks().forEach(track => track.stop());
    }
  });
  expect(result.still).toEqual({ ok: true });
  expect(result.live.ready, result.live.message).toBe(true);
  expect(result.ratio).toBe(.75);
  expect(requested.some(url => url.endsWith('.wasm'))).toBe(true);
  expect(requested.some(url => url.endsWith('.task'))).toBe(true);
  expect(requested.every(url => url.startsWith(new URL(page.url()).origin + '/vision/'))).toBe(true);
});
