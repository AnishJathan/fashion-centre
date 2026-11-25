import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`brand owner dashboard ${width}`,async({page}, testInfo)=>{
 await page.setViewportSize({width,height:900});await page.goto('/');await page.getByRole('link',{name:'For brands',exact:true}).click();await expect(page).toHaveURL(/#\/owner$/);await expect(page.getByText('Installation is blocked until')).toBeVisible();await expect(page.getByRole('button',{name:'Connect Shopify — setup required'})).toBeDisabled();
 await page.getByLabel('Shopify store domain').fill('https://bad.example');await page.getByRole('button',{name:'Check domain'}).click();await expect(
  page.getByRole('alert').filter({ hasText: 'Enter only' })
).toContainText('Enter only');await page.getByLabel('Shopify store domain').fill(' My-Brand.myshopify.com ');await page.getByRole('button',{name:'Check domain'}).click();await expect(page.getByRole('status')).toContainText('Ownership has not been verified');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:testInfo.outputPath(`merchant-${width}.png`),fullPage:true});await page.getByRole('link',{name:'Explore demo stores'}).click();await expect(page).toHaveURL(/#\/merchant$/);await expect(page.getByRole('heading',{name:'Choose your demo stores.'})).toBeVisible();
});
test('readiness network failure fails closed',async({page})=>{await page.route('**/api/merchant/shopify/readiness',r=>r.abort());await page.goto('/#/owner');await expect(page.getByRole('alert')).toContainText('Installation remains blocked');await expect(page.getByRole('button',{name:'Connect Shopify — setup required'})).toBeDisabled()});
