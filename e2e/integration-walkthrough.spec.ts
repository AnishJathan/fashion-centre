import { test, expect } from '@playwright/test';

for (const width of [390, 1440]) test(`complete shopper and merchant handover through visible navigation ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const writes: string[] = [], errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url()); });
    await page.route('**/api/integrations/shopify/status', r => r.fulfill({ json: { shops: [{ key: 'mock', name: 'Mock Shop' }] } }));
    await page.route('**/api/integrations/shopify/catalogue/*', r => r.fulfill({ json: {
        shopKey: 'mock', shopName: 'Walkthrough fixture store', hasNextPage: false,
        products: [{ key: 'mock:gid://shopify/Product/1', title: 'Walkthrough fixture shirt', category: 'Shirts', image: '/images/campaign.png', moreVariants: false,
            variants: [{ id: 'gid://shopify/ProductVariant/1', key: 'mock:gid://shopify/ProductVariant/1', title: 'M / Violet', available: true, amount: '25.50', currency: 'CAD', options: { Size: 'M', Color: 'Violet' } }] }]
    } }));
    await page.route('**/api/merchant/shopify/readiness', r => r.fulfill({ json: { ready: false, connected: false, blockers: ['Live merchant authentication and Shopify authorization are not configured.'] } }));

    await page.goto('/');
    await page.getByRole('link', { name: 'For brands', exact: true }).click();
    await expect(page.getByRole('button', { name: /Connect Shopify.*setup required/ })).toBeDisabled();
    await page.getByRole('link', { name: 'Explore demo stores' }).click();
    await page.getByRole('button', { name: 'Onboard Mock Shop', exact: true }).click();
    await page.getByRole('link', { name: 'Browse onboarded stores' }).click();
    await expect(page.locator('.product')).toHaveCount(1);
    await page.locator('.bottom-nav').getByRole('link', { name: 'Brands', exact: true }).click();
    await page.locator('.brand-grid a').click();
    await page.getByRole('button', { name: 'Follow store', exact: true }).click();
    await page.locator('.product-title').click();
    await page.getByRole('button', { name: 'Save piece', exact: true }).click();
    await page.getByRole('button', { name: 'Add to demo cart' }).click();
    await page.getByRole('button', { name: 'Dismiss notification' }).click();
    await page.getByRole('link', { name: /View your cart/ }).click();
    await page.getByRole('link', { name: /Demo checkout/ }).click();
    await page.getByRole('link', { name: 'Cancel and keep shopping' }).click();
    await expect(page.getByLabel('Quantity', { exact: true })).toHaveText('1');
    await page.reload();
    await expect(page.getByLabel('Quantity', { exact: true })).toHaveText('1');
    await page.getByRole('link', { name: /Demo checkout/ }).click();
    await page.getByRole('button', { name: 'Place demo order' }).click();
    await expect(page.getByRole('heading', { name: 'Demo order placed', exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Demo order placed', exact: true })).toBeVisible();
    await expect(page.getByText('CAD 25.50').last()).toBeVisible();
    await page.locator('.bottom-nav').getByRole('link', { name: 'Profile', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Walkthrough fixture store', exact: true })).toBeVisible();
    await page.getByRole('link', { name: /Your demo orders/ }).click();
    await expect(page.locator('.order-card')).toHaveCount(1);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Your local space.', exact: true })).toBeVisible();
    await page.locator('.bottom-nav').getByRole('link', { name: 'Saved', exact: true }).click();
    await expect(page.locator('.product')).toHaveCount(1);
    await page.locator('.product-title').click();
    await page.getByRole('link', { name: 'Prepare a try-on photo' }).click();
    await expect(page.getByRole('button', { name: /Generate try-on.*not connected/ })).toBeDisabled();
    await page.getByRole('button', { name: 'Cancel preparation' }).click();
    await expect(page.getByRole('heading', { name: 'No try-on results yet.' })).toBeVisible();
    await page.getByRole('link', { name: 'For brands', exact: true }).click();
    await page.getByLabel('Shopify store domain').focus();
    await page.keyboard.type('walkthrough.myshopify.com');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Check domain' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('Ownership has not been verified');
    await page.getByRole('button', { name: 'Refresh readiness' }).click();
    await expect(page.getByText('Installation is blocked until these prerequisites are completed:')).toBeVisible();
    await expect(page.getByRole('button', { name: /Connect Shopify.*setup required/ })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fc.commerce.v2')!).orders.length)).toBe(1);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
});
