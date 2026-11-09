import { test, expect, type BrowserContext } from '@playwright/test';

const productId = 'mock:gid://shopify/Product/1';
async function setup(context: BrowserContext) {
    await context.route('**/api/integrations/shopify/status', r => r.fulfill({ json: { shops: [{ key: 'mock', name: 'Mock Shop' }] } }));
    await context.route('**/api/integrations/shopify/catalogue/*', r => r.fulfill({ json: {
        shopKey: 'mock', shopName: 'Adversarial fixture store', hasNextPage: false,
        products: [{ key: productId, title: 'Synthetic test shirt', category: 'Shirts', image: '', moreVariants: false,
            variants: [{ key: 'mock:gid://shopify/ProductVariant/1', id: 'gid://shopify/ProductVariant/1', title: 'M', available: true, amount: '19.95', currency: 'CAD', options: { Size: 'M' } }] }]
    } }));
    await context.addInitScript(() => {
        if (!localStorage.getItem('fc.stores.v1')) localStorage.setItem('fc.stores.v1', JSON.stringify([{ id: 'mock', enabled: true, onboardedAt: '2026-10-18' }]));
    });
}

test('another tab disabling a store blocks stale checkout and preserves its cart', async ({ page, context }) => {
    await setup(context);
    await page.goto('/#/product/' + encodeURIComponent(productId));
    await page.getByRole('button', { name: 'Add to demo cart' }).click();
    await page.getByRole('link', { name: /View your cart/ }).click();
    await page.getByRole('link', { name: /Demo checkout/ }).click();
    const other = await context.newPage();
    await other.goto('/#/merchant');
    await other.getByRole('button', { name: 'Disable Mock Shop' }).click();
    await expect(other.getByRole('button', { name: 'Enable Mock Shop' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('another tab');
    await page.getByRole('button', { name: 'Place demo order' }).click();
    await expect(page).toHaveURL(/#\/checkout\/mock$/, { timeout: 3000 });
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.commerce.v2')!));
    expect(state.orders).toHaveLength(0);
    expect(state.cart).toHaveLength(1);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Place demo order' })).toBeDisabled();
});

test('queued store disable and checkout share a lock and validate dependencies after acquisition', async ({ page, context }) => {
    await setup(context);
    await page.goto('/#/product/' + encodeURIComponent(productId));
    await page.getByRole('button', { name: 'Add to demo cart' }).click();
    await page.getByRole('link', { name: /View your cart/ }).click();
    await page.getByRole('link', { name: /Demo checkout/ }).click();
    const other = await context.newPage();
    await other.goto('/#/merchant');
    await other.evaluate(() => {
        const w = window as any;
        void navigator.locks.request('fashion-centre:app-state', async () => {
            w.testLockHeld = true;
            await new Promise<void>(resolve => { w.releaseTestLock = resolve; });
        });
    });
    await expect.poll(() => other.evaluate(() => (window as any).testLockHeld)).toBe(true);
    await other.getByRole('button', { name: 'Disable Mock Shop' }).evaluate((button: HTMLButtonElement) => button.click());
    await page.getByRole('button', { name: 'Place demo order' }).evaluate((button: HTMLButtonElement) => button.click());
    await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending?.filter(l => l.name === 'fashion-centre:app-state').length)).toBe(2);
    await other.evaluate(() => (window as any).releaseTestLock());
    await expect(other.getByRole('button', { name: 'Enable Mock Shop' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Place demo order' })).toBeEnabled();
    await expect(page).toHaveURL(/#\/checkout\/mock$/);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem('fc.commerce.v2')!));
    expect(state.orders).toHaveLength(0);
    expect(state.cart).toHaveLength(1);
});
