import { test, expect } from '@playwright/test';

for (const width of [320, 390, 430, 1440]) {
  test(`navigation shape, clearance and routes at ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/integrations/shopify/status', r => r.fulfill({ json: { shops: [{ key: 'mock', name: 'Mock Shop' }] } }));
    await page.route('**/api/integrations/shopify/catalogue/*', r => r.fulfill({ json: {
      shopKey: 'mock', shopName: 'Demo collection', hasNextPage: false,
      products: [{ key: 'mock:gid://shopify/Product/1', title: 'Violet edit shirt', category: 'Shirts', image: '/images/demo-bag.png', moreVariants: false,
        variants: [{ id: 'gid://shopify/ProductVariant/1', key: 'mock:gid://shopify/ProductVariant/1', title: 'M', available: true, amount: '25.50', currency: 'CAD', options: { Size: 'M' } }] }]
    } }));
    await page.addInitScript(() => localStorage.setItem('fc.stores.v1', JSON.stringify([{ id: 'mock', enabled: true, onboardedAt: '2026-10-18' }])));
    await page.goto('/');
    await expect(page.locator('.product')).toHaveCount(1);
    await page.locator('.page-content').evaluate(el => Promise.all(el.getAnimations().map(a => a.finished)));
    const filters = (await page.getByRole('textbox', { name: 'Search catalogue' }).boundingBox())!;
    const cover = (await page.locator('.editorial-cover').boundingBox())!;
    if (width >= 1024) {
      expect(filters.x + filters.width).toBeLessThan(cover.x);
    } else {
      expect(filters.y + filters.height).toBeLessThan(cover.y);
    }
    for (const selector of ['.product-photo', '.home-storefronts .brand-grid a']) {
      const frame = page.locator(selector).first();
      const image = frame.locator('img');
      await expect(image).toHaveCSS('object-fit', 'cover');
      const outer = (await frame.boundingBox())!;
      const inner = (await image.boundingBox())!;
      expect(Math.abs(inner.x - outer.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(inner.y - outer.y)).toBeLessThanOrEqual(1);
      if (selector === '.product-photo' || width <= 700) expect(Math.abs(inner.width - outer.width)).toBeLessThanOrEqual(2);
      if (selector === '.product-photo' || width > 700) expect(Math.abs(inner.height - outer.height)).toBeLessThanOrEqual(2);
    }
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const links = nav.getByRole('link');
    await expect(links).toHaveText(['Discover', 'Try on', 'Bag', 'Profile']);
    expect(await links.evaluateAll(elements => elements.map(e => e.getAttribute('href'))))
      .toEqual(['#/', '#/try', '#/cart', '#/profile']);
    await expect(nav.locator('svg')).toHaveCount(4);
    await expect(links.first()).toHaveAttribute('aria-current', 'page');
    const metrics = await nav.evaluate(e => {
      const box = e.getBoundingClientRect(), css = getComputedStyle(e);
      return { x: box.x, width: box.width, height: box.height, bottom: innerHeight - box.bottom,
        radius: parseFloat(css.borderRadius), display: css.display, scrollBottom: document.getElementById('app-scroll')!.getBoundingClientRect().bottom };
    });
    if (width <= 700) {
      expect(metrics.x).toBeCloseTo(16, 0);
      expect(metrics.width).toBeCloseTo(width - 32, 0);
      expect(metrics.bottom).toBeCloseTo(3, 0);
      expect(metrics.height).toBe(64);
      expect(metrics.radius).toBeGreaterThanOrEqual(metrics.height / 2);
      expect(metrics.scrollBottom).toBe(900);
      for (const link of await links.all()) {
        const box = (await link.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
      }
      expect(await links.first().locator('.nav-symbol').evaluate(e => getComputedStyle(e).color)).toBe('rgb(245, 215, 182)');
    } else {
      expect(metrics.width).toBe(432);
      expect(metrics.bottom).toBe(3);
      expect(metrics.radius).toBeGreaterThanOrEqual(metrics.height / 2);
      expect(metrics.display).toBe('grid');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.catalogue-hero img, .product-photo img').evaluateAll(images => Promise.all(images.map(img => (img as HTMLImageElement).decode().catch(() => {}))));
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.screenshot({ path: testInfo.outputPath(`nav-${width}.png`) });
    const mountedDock = await nav.elementHandle();
    await links.nth(2).click();
    await expect(page).toHaveURL(/#\/cart$/);
    await expect(links.nth(2)).toHaveAttribute('aria-current', 'page');
    expect(await nav.evaluate((current, before) => current === before, mountedDock)).toBe(true);
    await expect.poll(() => nav.evaluate(e => new DOMMatrix(getComputedStyle(e, '::before').transform).m41)).toBeCloseTo((metrics.width - 16) / 2, 0);
    await links.nth(2).focus();
    await page.keyboard.press('Tab');
    await expect(links.nth(3)).toBeFocused();
    if (width <= 700) {
      expect(await links.nth(3).evaluate(e => getComputedStyle(e).outlineWidth)).toBe('3px');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/profile$/);
      await expect(page.getByRole('heading',{name:'Your profile'})).toBeVisible();
      await expect.poll(async () => {
        await page.evaluate(() => document.getElementById('app-scroll')!.scrollTo(0, document.getElementById('app-scroll')!.scrollHeight));
        const footer = (await page.locator('main footer').boundingBox())!;
        return footer.y + footer.height - (await nav.boundingBox())!.y;
      }).toBeLessThan(0);
      await page.evaluate(() => document.documentElement.style.setProperty('--mobile-nav-safe-bottom', '34px'));
      expect(await nav.evaluate(e => innerHeight - e.getBoundingClientRect().bottom)).toBe(31);
      await expect.poll(() => page.locator('#app-scroll').evaluate(e => parseFloat(getComputedStyle(e, '::after').height))).toBeGreaterThanOrEqual(103);
      await expect.poll(async () => {
        await page.evaluate(() => document.getElementById('app-scroll')!.scrollTo(0, document.getElementById('app-scroll')!.scrollHeight));
        const footer = (await page.locator('main footer').boundingBox())!;
        return footer.y + footer.height - (await nav.boundingBox())!.y;
      }).toBeLessThan(0);
      await links.nth(2).focus();
      await page.keyboard.press('Tab');
      await expect(links.nth(3)).toBeFocused();
      if (width === 390) await page.screenshot({ path: testInfo.outputPath('nav-390-safe-area-focus.png') });
    }
  });
}

test('reduced motion opens the app without animating the seal or the selected tab', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('#launch-reveal')).toBeHidden();
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('link', { name: 'Profile' }).click();
  await expect(nav.locator('[aria-current] .nav-symbol')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('#launch-reveal')).toBeHidden();
});
