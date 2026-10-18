import { test, expect } from '@playwright/test';

for (const width of [320, 390, 430, 1440]) {
  test(`navigation shape, clearance and routes at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/integrations/shopify/status', r => r.fulfill({ json: { shops: [{ key: 'mock', name: 'Mock Shop' }] } }));
    await page.route('**/api/integrations/shopify/catalogue/*', r => r.fulfill({ json: {
      shopKey: 'mock', shopName: 'Demo collection', hasNextPage: false,
      products: [{ key: 'mock:gid://shopify/Product/1', title: 'Violet edit shirt', category: 'Shirts', image: '/images/campaign.png', moreVariants: false,
        variants: [{ id: 'gid://shopify/ProductVariant/1', key: 'mock:gid://shopify/ProductVariant/1', title: 'M', available: true, amount: '25.50', currency: 'CAD', options: { Size: 'M' } }] }]
    } }));
    await page.addInitScript(() => localStorage.setItem('fc.stores.v1', JSON.stringify([{ id: 'mock', enabled: true, onboardedAt: '2026-10-18' }])));
    await page.goto('/');
    await expect(page.locator('.product')).toHaveCount(1);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    const links = nav.getByRole('link');
    await expect(links).toHaveText(['Discover', 'Brands', 'Try on', 'Saved', 'Profile']);
    expect(await links.evaluateAll(elements => elements.map(e => e.getAttribute('href'))))
      .toEqual(['#/', '#/brands', '#/try', '#/saved', '#/profile']);
    await expect(nav.locator('img')).toHaveCount(5);
    await expect(links.first()).toHaveAttribute('aria-current', 'page');
    const metrics = await nav.evaluate(e => {
      const box = e.getBoundingClientRect(), css = getComputedStyle(e);
      return { x: box.x, width: box.width, height: box.height, bottom: innerHeight - box.bottom,
        radius: parseFloat(css.borderRadius), display: css.display, mainPadding: parseFloat(getComputedStyle(document.querySelector('main')!).paddingBottom) };
    });
    if (width <= 700) {
      expect(metrics.x).toBeCloseTo(12, 0);
      expect(metrics.width).toBeCloseTo(width - 24, 0);
      expect(metrics.bottom).toBeCloseTo(12, 0);
      expect(metrics.height).toBe(60);
      expect(metrics.radius).toBeGreaterThanOrEqual(metrics.height / 2);
      expect(metrics.mainPadding).toBeGreaterThanOrEqual(metrics.height + metrics.bottom + 20);
      for (const link of await links.all()) {
        const box = (await link.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      expect(await links.first().evaluate(e => getComputedStyle(e).backgroundColor)).toBe('rgb(238, 230, 252)');
    } else {
      expect(metrics.width).toBe(460);
      expect(metrics.bottom).toBe(16);
      expect(metrics.radius).toBe(20);
      expect(metrics.display).toBe('flex');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator('.catalogue-hero img, .product-photo img').evaluateAll(images => Promise.all(images.map(img => (img as HTMLImageElement).decode().catch(() => {}))));
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.screenshot({ path: `screenshots/navigation/nav-${width}.png` });
    await links.nth(3).click();
    await expect(page).toHaveURL(/#\/saved$/);
    await expect(links.nth(3)).toHaveAttribute('aria-current', 'page');
    await links.nth(3).focus();
    await page.keyboard.press('Tab');
    await expect(links.nth(4)).toBeFocused();
    if (width <= 700) {
      expect(await links.nth(4).evaluate(e => getComputedStyle(e).outlineWidth)).toBe('3px');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#\/profile$/);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const footer = (await page.locator('main footer').boundingBox())!;
      expect(footer.y + footer.height).toBeLessThan((await nav.boundingBox())!.y);
      await page.evaluate(() => document.documentElement.style.setProperty('--mobile-nav-safe-bottom', '34px'));
      expect(await nav.evaluate(e => innerHeight - e.getBoundingClientRect().bottom)).toBe(46);
      expect(await page.locator('main').evaluate(e => parseFloat(getComputedStyle(e).paddingBottom))).toBe(130);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const safeFooter = (await page.locator('main footer').boundingBox())!;
      expect(safeFooter.y + safeFooter.height).toBeLessThan((await nav.boundingBox())!.y);
      await links.nth(3).focus();
      await page.keyboard.press('Tab');
      await expect(links.nth(4)).toBeFocused();
      if (width === 390) await page.screenshot({ path: 'screenshots/navigation/nav-390-safe-area-focus.png' });
    }
  });
}
