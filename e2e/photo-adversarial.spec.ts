import {test,expect} from '@playwright/test';
test('late photo decoding cannot restore replaced or cancelled photos and picker focus remains visible',async({page})=>{
 await page.addInitScript(()=>{
  const win=window as any;win.photoAudit={pending:[],created:[],revoked:[]};
  const original=createImageBitmap.bind(window),create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  window.createImageBitmap=((file:Blob)=>original(file).then(bitmap=>new Promise<ImageBitmap>(resolve=>win.photoAudit.pending.push(()=>resolve(bitmap))))) as typeof createImageBitmap;
  URL.createObjectURL=(blob:Blob)=>{const url=create(blob);win.photoAudit.created.push(url);return url};
  URL.revokeObjectURL=url=>{win.photoAudit.revoked.push(url);revoke(url)};
 });
 await page.route('**/api/integrations/shopify/status',r=>r.fulfill({json:{shops:[{key:'mock',name:'Mock Shop'}]}}));
 await page.route('**/api/integrations/shopify/catalogue/*',r=>r.fulfill({json:{shopKey:'mock',shopName:'Test store',products:[{key:'mock:gid://shopify/Product/1',title:'Test garment',category:'Shirts',image:'/images/campaign.png',variants:[],moreVariants:false}],hasNextPage:false}}));
 await page.goto('/#/merchant');await page.getByRole('button',{name:'Onboard Mock Shop'}).click();await page.goto('/#/try/mock%3Agid%3A%2F%2Fshopify%2FProduct%2F1');
 const input=page.getByLabel('Choose personal photo');await expect(input).toHaveAttribute('tabindex','-1');
 const images=await page.evaluate(()=>[120,240].map(width=>{const c=document.createElement('canvas');c.width=width;c.height=180;return c.toDataURL('image/png').split(',')[1]}));
 const file=(i:number)=>({name:`synthetic-${i}.png`,mimeType:'image/png',buffer:Buffer.from(images[i],'base64')});
 const pending=()=>page.evaluate(()=>(window as any).photoAudit.pending.length);
 const release=async(i:number)=>{await page.evaluate(n=>(window as any).photoAudit.pending[n](),i);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));};
 await page.getByRole('button',{name:'Choose a photo from this device'}).focus();
 await input.setInputFiles(file(0));await expect.poll(pending).toBe(1);
 await input.setInputFiles(file(1));await expect.poll(pending).toBe(2);
 await release(1);await expect(page.locator('.person-preview')).toBeVisible();await expect(page.getByRole('button',{name:'Replace photo'})).toBeFocused();
 const second=await page.locator('.person-preview').getAttribute('src');
 await release(0);await expect(page.locator('.person-preview')).toHaveAttribute('src',second!);expect(await page.evaluate(()=>(window as any).photoAudit.created.length)).toBe(1);
 await page.getByRole('button',{name:'Remove photo'}).click();await expect(page.getByRole('button',{name:'Choose a photo from this device'})).toBeFocused();
 expect(await page.evaluate(u=>(window as any).photoAudit.revoked.includes(u),second)).toBe(true);
 await input.setInputFiles(file(0));await expect.poll(pending).toBe(3);await page.getByRole('button',{name:'Cancel preparation'}).click();await release(2);
 await expect(page.locator('.person-preview')).toHaveCount(0);expect(await page.evaluate(()=>(window as any).photoAudit.created.length)).toBe(1);
 await expect(page.getByLabel('Catalogue garment')).toHaveValue('');
});
