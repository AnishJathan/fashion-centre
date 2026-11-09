import {test,expect} from '@playwright/test';
const id='mock:gid://shopify/Product/1';
async function setup(page:any){
 await page.route('**/api/**', (r:any)=>r.fulfill({status:503,json:{error:'Unconfigured test service'}}));
 await page.route('**/api/integrations/shopify/status',(r:any)=>r.fulfill({json:{shops:[{key:'mock',name:'Mock Shop'}]}}));
 await page.route('**/api/integrations/shopify/catalogue/mock*',(r:any)=>r.fulfill({json:{shopKey:'mock',shopName:'Mock Shop',hasNextPage:false,products:[{key:id,title:'Integration shirt',category:'Shirts',image:'/images/campaign.png',moreVariants:false,variants:[{id:'gid://shopify/ProductVariant/1',key:'mock:gid://shopify/ProductVariant/1',title:'M',available:true,amount:'25',currency:'CAD',options:{Size:'M'}}]}]}}));
 await page.addInitScript(()=>localStorage.setItem('fc.stores.v1',JSON.stringify([{id:'mock',enabled:true,onboardedAt:'2026-01-01'}])));
}
for(const width of [390,1440])test(`merchant shopping preserves real account and saved-photo try-on ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 await page.route('**/api/users/me/photo',r=>r.fulfill({status:401,json:{}}));
 await page.goto('/#/product/'+encodeURIComponent(id));await page.getByRole('button',{name:'Try on with my saved photo'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByText('Sign in to try on outfits with your photo.')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Try on with my saved photo'}).click();await page.goto('/#/profile');await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('link',{name:'Sign in or manage account'}).click();await expect(page).toHaveURL(/#\/login/);
 await page.getByLabel('WhatsApp number').fill('400000000');await page.getByRole('button',{name:'Send code on WhatsApp'}).click();await expect(page.getByRole('alert')).toContainText('could not send');
 await page.route('**/api/auth/request-code',r=>r.fulfill({json:{expiresInSeconds:120,resendInSeconds:30}}));
 await page.route('**/api/auth/verify-code',r=>r.fulfill({json:{ok:true,hasPhoto:true}}));
 await page.getByRole('button',{name:'Send code on WhatsApp'}).click();await page.getByLabel('Enter 6-digit code').fill('123456');await page.getByRole('button',{name:'Verify code',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Welcome back.'})).toBeVisible();await page.getByRole('button',{name:'Start browsing'}).click();await expect(page).toHaveURL(/#\/profile/);
 await page.getByRole('link',{name:'Preview WhatsApp OTP login'}).click();await expect(page).toHaveURL(/#\/login-demo/);await expect(page.getByRole('button',{name:'Continue with demo OTP'})).toBeVisible();
});
test('saved-photo try-on submits once and polls a mocked result',async({page})=>{
 await setup(page);let submissions=0;
 await page.route('**/api/users/me/photo',async r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1QAAAAASUVORK5CYII=','base64')}));
 await page.route('**/api/try-on/me',r=>{submissions++;return r.fulfill({json:{id:'test-job'}})});
 await page.route('**/api/try-on/test-job',r=>r.fulfill({json:{status:'succeeded'}}));
 await page.route('**/api/try-on/test-job/result',r=>r.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1QAAAAASUVORK5CYII=','base64')}));
 await page.goto('/#/product/'+encodeURIComponent(id));await page.getByRole('button',{name:'Try on with my saved photo'}).click();await page.getByRole('button',{name:'Try on',exact:true}).click();
 await expect(page.getByAltText('You wearing Integration shirt')).toBeVisible();expect(submissions).toBe(1);
});
