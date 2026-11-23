import {test,expect,type Page} from '@playwright/test';
const previewPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1QAAAAASUVORK5CYII=','base64');
const id='mock:gid://shopify/Product/1';
async function setup(page: Page){
 await page.route('**/api/**', r=>r.fulfill({status:503,json:{error:'Unconfigured test service'}}));
 await page.route('**/api/integrations/shopify/status',r=>r.fulfill({json:{shops:[{key:'mock',name:'Mock Shop'}]}}));
 await page.route('**/api/integrations/shopify/catalogue/mock*',r=>r.fulfill({json:{shopKey:'mock',shopName:'Mock Shop',hasNextPage:false,products:[{key:id,title:'Integration shirt',category:'Shirts',image:'/images/demo-bag.png',moreVariants:false,variants:[{id:'gid://shopify/ProductVariant/1',key:'mock:gid://shopify/ProductVariant/1',title:'M',available:true,amount:'25',currency:'CAD',options:{Size:'M'}}]}]}}));
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
 await page.route('**/api/users/me/photo',async r=>r.fulfill({status:200,contentType:'image/png',body:previewPng}));
 await page.route('**/api/try-on/me',r=>{submissions++;return r.fulfill({json:{id:'test-job'}})});
 await page.route('**/api/try-on/test-job',r=>r.fulfill({json:{status:'succeeded'}}));
 await page.route('**/api/try-on/test-job/result',r=>r.fulfill({status:200,contentType:'image/png',body:previewPng}));
 await page.goto('/#/product/'+encodeURIComponent(id));await page.getByRole('button',{name:'Try on with my saved photo'}).click();await page.getByRole('button',{name:'Try on',exact:true}).click();
 await expect(page.getByAltText('You wearing Integration shirt')).toBeVisible();expect(submissions).toBe(1);
});

test('closing try-on during garment download cancels before submitting', async ({ page }) => {
  await setup(page);
  await page.route('**/api/users/me/photo', route =>
    route.fulfill({ contentType: 'image/png', body: previewPng }),
  );
  let submissions = 0;
  await page.route('**/api/try-on/me', route => {
    submissions++;
    return route.abort();
  });

  const releaseGarment = Promise.withResolvers<void>();
  await page.route('**/images/demo-bag.png', async route => {
    if (route.request().resourceType() !== 'fetch') return route.continue();
    await releaseGarment.promise;
    // The panel should already have cancelled the intercepted fetch.
    await route.fulfill({ contentType: 'image/png', body: previewPng }).catch(() => {});
  });

  await page.goto('/#/product/' + encodeURIComponent(id));
  const trigger = page.getByRole('button', { name: 'Try on with my saved photo' });
  await trigger.click();
  await expect(page.getByRole('button', { name: 'Close try-on' })).toBeFocused();

  const isGarmentFetch = (request: import('@playwright/test').Request) =>
    new URL(request.url()).pathname === '/images/demo-bag.png' && request.resourceType() === 'fetch';
  const garmentRequest = page.waitForRequest(isGarmentFetch);
  await page.getByRole('button', { name: 'Try on', exact: true }).click();
  await garmentRequest;

  try {
    const cancelled = page.waitForEvent('requestfailed', { predicate: isGarmentFetch, timeout: 3_000 });
    await page.keyboard.press('Escape');
    await cancelled;
    await expect(trigger).toBeFocused();
    expect(submissions).toBe(0);
  } finally {
    releaseGarment.resolve();
  }
});

test('a shopper can upload from disk and try the selected product without opening the camera',async ({page})=>{
  await setup(page);
  let saved=false, jobs=0;
  await page.route('**/api/users/me/photo',async route=>{
    if(route.request().method()==='POST'){
      expect(route.request().headers()['content-type']).toContain('multipart/form-data');
      expect(route.request().postDataBuffer()?.length).toBeGreaterThan(500000);
      saved=true;
    }
    if(!saved)return route.fulfill({status:404});
    return route.request().method()==='POST'?route.fulfill({json:{ok:true}}):route.fulfill({contentType:'image/png',body:previewPng});
  });
  await page.route('**/api/try-on/me',route=>{jobs++;return route.fulfill({json:{id:'gallery-test'}})});
  await page.route('**/api/try-on/gallery-test',route=>route.fulfill({json:{status:'succeeded'}}));
  await page.route('**/api/try-on/gallery-test/result',route=>route.fulfill({contentType:'image/png',body:previewPng}));
  await page.goto('/#/product/'+encodeURIComponent(id));
  await page.getByRole('button',{name:'Try on with my saved photo'}).click();
  const dialog=page.getByRole('dialog');
  const {readFile}=await import('node:fs/promises');
  await dialog.getByLabel('Choose from photos').setInputFiles({name:'sample.jpg',mimeType:'image/jpeg',buffer:await readFile('docs/history/prototype-images/campaign.png')});
  await expect(dialog.getByRole('img',{name:'Your full-body photo'})).toBeVisible();
  expect(saved).toBe(false);
  await dialog.getByRole('button',{name:'Save to my account'}).click();
  await expect(dialog.getByAltText('Your saved photo')).toBeVisible();
  expect(jobs).toBe(0);
  await dialog.getByRole('button',{name:'Try on',exact:true}).click();
  await expect(dialog.getByAltText('You wearing Integration shirt')).toBeVisible();
  expect(jobs).toBe(1);
});

test('studio remembers a visit after reload and returns from photo setup to the same collection', async ({page}) => {
  await setup(page);
  let saved = false;
  await page.route('**/api/auth/me', r => r.fulfill({json:{id:'shopper', hasPhoto:saved}}));
  await page.route('**/api/users/me/photo', r => {
    if (r.request().method() === 'POST') { saved = true; return r.fulfill({json:{ok:true}}); }
    return r.fulfill({contentType:'image/png',body:previewPng});
  });
  await page.goto('/#/product/' + encodeURIComponent(id));
  await expect(page.getByRole('button',{name:'Try on with my saved photo'})).toBeVisible();
  await page.locator('.bottom-nav').getByRole('link',{name:'Try on'}).click();
  await page.reload();
  await expect(page.getByRole('button',{name:'Try on Integration shirt'})).toBeVisible();
  await expect(page.locator('.studio-stores a')).toHaveAttribute('href','#/brand/mock');
  await page.getByRole('button',{name:'Add a photo',exact:true}).click();
  await page.getByLabel('Choose from photos').setInputFiles({name:'sample.jpg',mimeType:'image/jpeg',buffer:await (await import('node:fs/promises')).readFile('docs/history/prototype-images/campaign.png')});
  expect(saved).toBe(false);
  await page.getByRole('button',{name:'Save to my account'}).click();
  await page.getByRole('button',{name:'Return to Try On'}).click();
  await expect(page.getByRole('status')).toContainText('Your saved photo is ready');
  await page.getByRole('button',{name:'Try on Integration shirt'}).click();
  await expect(page.getByRole('dialog').getByAltText('Your saved photo')).toBeVisible();
});
