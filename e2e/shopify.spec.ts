import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`Shopify preview boundaries ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const mutations:string[]=[];page.on('request',r=>{if(['POST','PUT','DELETE','PATCH'].includes(r.method()))mutations.push(r.url())});
 await page.goto('/#/merchant');await expect(page.getByText('Not connected',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Connect Shopify'})).toBeDisabled();await expect(page.getByRole('heading',{name:'Fixture cotton shirt'})).toBeVisible();await expect(page.getByText('CAD 79.95',{exact:false}).first()).toBeVisible();
 await page.getByLabel('Sample shop').selectOption('apparel');await expect(page.getByRole('heading',{name:'Fixture cotton shirt'})).toBeVisible();
 await page.route('**/api/integrations/shopify/catalogue/*?source=public',r=>r.fulfill({status:502,body:'{}'}));await page.getByLabel('Catalogue source').selectOption('public');await expect(page.getByRole('alert')).toContainText('Catalogue unavailable');await expect(page.getByRole('heading',{name:'Fixture cotton shirt'})).toHaveCount(0);
 await page.getByLabel('Catalogue source').selectOption('fixture');await expect(page.getByRole('heading',{name:'Fixture cotton shirt'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`screenshots/shopify-preview-${width}.png`,fullPage:true});expect(mutations).toEqual([]);
});
