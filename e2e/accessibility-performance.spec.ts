import {test,expect} from '@playwright/test';
const products=Array.from({length:40},(_,i)=>({key:`mock:gid://shopify/Product/${i+1}`,title:`Garment ${i+1}`,category:'Shirts',image:`https://cdn.shopify.com/test-photo-${i+1}.png`,moreVariants:false,variants:[{key:`mock:gid://shopify/ProductVariant/${i+1}`,id:`gid://shopify/ProductVariant/${i+1}`,title:'M',available:true,amount:'20.00',currency:'CAD',options:{Size:'M'}}]}));
test('photo viewer bounds image requests and keeps selected photo through resize',async({page,context})=>{
 const photos:string[]=[];
 await context.route('https://cdn.shopify.com/**',r=>{photos.push(r.request().url());return r.fulfill({path:'public/images/campaign.png',contentType:'image/png'});});
 await context.route('**/api/integrations/shopify/status',r=>r.fulfill({json:{shops:[{key:'mock',name:'Mock Shop'}]}}));
 await context.route('**/api/integrations/shopify/catalogue/*',r=>r.fulfill({json:{shopKey:'mock',shopName:'Test Store',hasNextPage:false,products}}));
 await page.addInitScript(()=>localStorage.setItem('fc.stores.v1',JSON.stringify([{id:'mock',enabled:true,onboardedAt:'2026-10-18'}])));
 await page.setViewportSize({width:390,height:950});
 await page.goto('/#/photos/'+encodeURIComponent(products[20].key));
 await expect(page.getByText('21 / 40',{exact:true})).toBeVisible();
 await expect(page.locator('.viewer-slide img')).toHaveCount(3);
 expect(new Set(photos).size).toBeLessThanOrEqual(3);
 await page.setViewportSize({width:950,height:390});
 await expect.poll(()=>page.locator('.viewer-feed').evaluate(e=>Math.round(e.scrollTop/e.clientHeight))).toBe(20);
 await expect(page.getByText('21 / 40',{exact:true})).toBeVisible();
 const dialog=page.getByRole('dialog');
 for(let n=0;n<8;n++){await page.keyboard.press('Tab');expect(await dialog.evaluate(e=>e.contains(document.activeElement))).toBe(true);}
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.getByRole('button',{name:'Next photo'}).click();
 await expect(page.getByText('22 / 40',{exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
});
