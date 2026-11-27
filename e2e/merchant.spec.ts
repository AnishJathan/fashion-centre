import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`brand owner dashboard ${width}`,async({page}, testInfo)=>{
 await page.setViewportSize({width,height:900});await page.goto('/');await page.getByRole('link',{name:'For brands',exact:true}).click();await expect(page).toHaveURL(/#\/owner$/);await expect(page.getByText('Installation is blocked until')).toBeVisible();await expect(page.getByRole('button',{name:'Connect Shopify — setup required'})).toBeDisabled();
 await page.getByLabel('Shopify store domain').fill('https://bad.example');await page.getByRole('button',{name:'Check domain'}).click();await expect(
  page.getByRole('alert').filter({ hasText: 'Enter only' })
).toContainText('Enter only');await page.getByLabel('Shopify store domain').fill(' My-Brand.myshopify.com ');await page.getByRole('button',{name:'Check domain'}).click();await expect(page.getByRole('status')).toContainText('Ownership has not been verified');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:testInfo.outputPath(`merchant-${width}.png`),fullPage:true});await page.getByRole('link',{name:'Explore demo stores'}).click();await expect(page).toHaveURL(/#\/merchant$/);await expect(page.getByRole('heading',{name:'Choose your demo stores.'})).toBeVisible();
});
test('readiness network failure fails closed',async({page})=>{await page.route('**/api/merchant/shopify/readiness',r=>r.abort());await page.goto('/#/owner');await expect(page.getByRole('alert')).toContainText('Installation remains blocked');await expect(page.getByRole('button',{name:'Connect Shopify — setup required'})).toBeDisabled()});

test('Cloudflare merchant previews and publishes without Java-only routes', async ({ page }) => {
  let published = false;
  const javaRequests: string[] = [];
  await page.route('**/api/merchant/shopify/stores', route => {
    javaRequests.push(route.request().url());
    return route.fulfill({ status: 404 });
  });
  await page.route('**/api/auth/csrf', route => {
    javaRequests.push(route.request().url());
    return route.fulfill({ status: 404 });
  });
  await page.route('**/api/auth/sign-in/shopify/me', route => route.fulfill({
    json: { shop: 'fixture.myshopify.com' },
  }));
  await page.route('**/api/merchant/shopify/readiness', route => route.fulfill({
    json: { ready: true, connected: true, marketplace: true, published, blockers: [] },
  }));
  await page.route('**/api/merchant/shopify/products?*', route => route.fulfill({
    json: { shopKey: 'shop-fixture', shopName: 'Fixture', hasNextPage: false, products: [] },
  }));
  await page.route('**/api/merchant/shopify/publish', route => {
    const input = route.request().postDataJSON();
    published = input.published;
    return route.fulfill({ json: { published, key: 'shop-fixture' } });
  });
  await page.goto('/#/owner');
  await expect(page.getByRole('heading', { name: 'Products from fixture.myshopify.com' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publish to Brands' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Publish store', exact: true }).click();
  await expect(page.getByText('Your collection is visible to shoppers.')).toBeVisible();
  await page.getByRole('button', { name: 'Unpublish store', exact: true }).click();
  await expect(page.getByText('Your collection is not currently published.')).toBeVisible();
  expect(javaRequests).toEqual([]);
});
