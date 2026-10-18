import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
// Opt-in read-only integration smoke. Uses isolated contexts; never changes the user's browser.
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 await mkdir('screenshots/quality',{recursive:true});
 for(const width of [390,1440]){
  const context=await browser.newContext({viewport:{width,height:950}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5173/#/merchant');await page.getByRole('button',{name:'Onboard Elysian Thread',exact:true}).click();await page.getByRole('button',{name:'Onboard Mock Shop',exact:true}).click();await page.getByRole('link',{name:'Browse onboarded stores'}).click();await page.locator('.product').first().waitFor({timeout:25000});
  await page.waitForFunction(()=>document.querySelectorAll('.brand-grid > a').length===2,{},{timeout:25000});
  const count=await page.locator('.product').count();await page.locator('.hero img').evaluate(img=>img.decode());
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Public page overflow');
  // Full-page captures do not trigger native off-screen lazy loading by themselves.
  await page.locator('.product').evaluateAll(async cards=>{for(const card of cards){card.scrollIntoView();await new Promise(r=>setTimeout(r,40));}await Promise.all(Array.from(document.images).map(img=>img.decode().catch(()=>{})));window.scrollTo(0,0);});
  const failedPhotos=await page.locator('.image-fallback').count();
  await page.screenshot({path:`screenshots/quality/public-home-${width}.png`,fullPage:true});
  await page.locator('.product-title').first().click();await page.getByRole('link',{name:'View catalogue photos full screen'}).click();await page.getByRole('dialog').waitFor();await page.screenshot({path:`screenshots/quality/public-photo-viewer-${width}.png`});await page.getByRole('button',{name:'Close photo viewer'}).click();
  await page.goto('http://127.0.0.1:5173/#/brand/mock');await page.getByRole('button',{name:'Follow store',exact:true}).waitFor();await page.locator('.product').first().waitFor();
  const storeCount=await page.locator('.product').count();if(storeCount===0||storeCount>=count)throw Error('Brand context is not isolated');
  await page.locator('.brand-context a[href="#/"]').click();await page.waitForFunction(expected=>document.querySelectorAll('.product').length===expected,count);
  if(errors.length)throw Error('Browser errors: '+errors.join(';'));
  console.log(JSON.stringify({width,products:count,mockStoreProducts:storeCount,brandReturnVerified:true,failedPhotos,overflow:false,pageErrors:0,source:'live read-only public Mock Shop and Elysian Thread'}));await context.close();
 }
}finally{await browser.close()}
