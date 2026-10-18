import { test, expect, type Page } from '@playwright/test';

async function catalogue(page: Page) {
  await page.route('**/api/integrations/shopify/status', r => r.fulfill({ json: { shops: [{ key:'mock', name:'Mock Shop' }] } }));
  await page.route('**/api/integrations/shopify/catalogue/*', r => r.fulfill({ json: {
    shopKey:'mock', shopName:'Demo collection', hasNextPage:false,
    products:[{ key:'mock:gid://shopify/Product/1', title:'Violet edit shirt', category:'Shirts', image:'/images/campaign.png', moreVariants:false,
      variants:[{ id:'gid://shopify/ProductVariant/1', key:'mock:gid://shopify/ProductVariant/1', title:'M', available:true, amount:'25.50', currency:'CAD', options:{Size:'M'} }] }]
  } }));
  await page.addInitScript(() => { if (!localStorage.getItem('fc.stores.v1')) localStorage.setItem('fc.stores.v1', JSON.stringify([{id:'mock',enabled:true,onboardedAt:'2026-10-18'}])); });
}
async function assertScreen(page: Page, dark: boolean) {
  await expect(page.locator('html')).toHaveAttribute('data-theme', dark ? 'dark' : 'light');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (dark) {
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(20, 17, 28)');
    for (const panel of await page.locator('.commerce-panel,.owner-card,.login-card,.preparation-panel').all()) {
      await expect(panel).toHaveCSS('background-color', 'rgb(32, 26, 43)');
      await expect(panel).toHaveCSS('color', 'rgb(244, 239, 251)');
    }
    const lowContrast = await page.locator('body *').evaluateAll(elements => {
      const rgb = (value:string) => (value.match(/[\d.]+/g) || []).map(Number);
      const luminance = (c:number[]) => c.slice(0,3).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      return elements.flatMap(el => {
        if (!Array.from(el.childNodes).some(n=>n.nodeType===3 && n.textContent?.trim()) || !(el instanceof HTMLElement) || !el.offsetWidth || !el.offsetHeight || el.closest('option,[disabled],.catalogue-hero')) return [];
        let parent:Element|null=el, background:number[]=[];
        while(parent) { background=rgb(getComputedStyle(parent).backgroundColor); if(background.length===3 || background[3]>0) break; parent=parent.parentElement; }
        if(background.length<3) return [];
        const foreground=rgb(getComputedStyle(el).color), a=luminance(foreground), b=luminance(background);
        const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
        return ratio<4.5?[{text:el.textContent?.trim().slice(0,50),ratio}]:[];
      });
    });
    expect(lowContrast, 'Text on solid dark surfaces meets 4.5:1; photographic gradients are visually inspected').toEqual([]);
  }
  for (const photo of await page.locator('img:not(.nav-icon)').all()) await expect(photo).toHaveCSS('filter', 'none');
}
async function capture(page: Page, name: string) {
  await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode().catch(() => {}))));
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.screenshot({ path:`screenshots/themes/${name}.png`, fullPage:true });
}

for (const width of [320,390,430,1440]) test(`light and dark navigation, profile keyboard and persistence ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:900}); await page.emulateMedia({colorScheme:'light'}); await catalogue(page);
  await page.goto('/'); await expect(page.locator('.product')).toHaveCount(1);
  await assertScreen(page,false); await capture(page,`home-light-${width}`);
  await expect(page.getByRole('button',{name:/Switch to .* theme/})).toHaveCount(0);
  await page.locator('.bottom-nav').getByRole('link',{name:'Profile'}).click();
  await page.getByRole('radio',{name:'Use device'}).focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio',{name:'Dark',exact:true})).toBeChecked();
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('fc.theme.v1'))).toBe('"dark"');
  await page.locator('.bottom-nav').getByRole('link',{name:'Discover'}).click();
  await assertScreen(page,true); await capture(page,`home-dark-${width}`);
  const nav = page.locator('.bottom-nav');
  if(width<700) expect((await nav.boundingBox())!.height).toBe(60);
  for(const link of await nav.getByRole('link').all()) { const b=(await link.boundingBox())!; expect(b.height).toBeGreaterThanOrEqual(44); expect(b.width).toBeGreaterThanOrEqual(44); }
  await page.reload(); await assertScreen(page,true);
  await nav.getByRole('link',{name:'Profile'}).click();
  await expect(page.getByRole('radio',{name:'Dark',exact:true})).toBeChecked();
  await page.getByRole('radio',{name:'Dark',exact:true}).focus(); await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('radio',{name:'Light',exact:true})).toBeChecked(); await assertScreen(page,false);
  await page.reload(); await assertScreen(page,false);
  await page.getByRole('radio',{name:'Use device'}).check();
  await page.emulateMedia({colorScheme:'dark'}); await assertScreen(page,true);
  await capture(page,`profile-dark-${width}`);
  await page.emulateMedia({colorScheme:'light'}); await assertScreen(page,false);
});

for (const width of [390,1440]) test(`both themes across shopper, management, checkout and photo dialog ${width}`, async ({page}) => {
  await page.setViewportSize({width,height:900}); await catalogue(page); await page.goto('/');
  for(const dark of [false,true]) {
    const label=dark?'dark':'light';
    await page.goto('/#/profile');
    await page.getByRole('radio',{name:dark?'Dark':'Light',exact:true}).check();
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('fc.theme.v1'))).toBe(JSON.stringify(label));
    for(const route of ['/owner','/merchant','/brands','/brand/mock','/saved','/profile','/try','/try/'+encodeURIComponent('mock:gid://shopify/Product/1'),'/login']) {
      await page.goto('/#'+route); await assertScreen(page,dark);
      await capture(page,`${route.startsWith('/try/')?'preparation':route.slice(1).replaceAll('/','-')}-${label}-${width}`);
    }
    await page.goto('/'); await page.locator('.product-title').click(); await assertScreen(page,dark); await capture(page,`product-${label}-${width}`);
    await page.getByRole('link',{name:'View catalogue photos full screen'}).click();
    await expect(page.getByRole('dialog')).toBeVisible(); await assertScreen(page,dark); await capture(page,`photos-${label}-${width}`);
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button',{name:'Add to demo cart'}).click(); await page.getByRole('button',{name:'Dismiss notification'}).click();
    await page.getByRole('link',{name:/View your cart/}).click(); await assertScreen(page,dark); await capture(page,`cart-${label}-${width}`);
    await page.getByRole('link',{name:/Demo checkout/}).click(); await assertScreen(page,dark); await capture(page,`checkout-${label}-${width}`);
    await page.getByRole('button',{name:'Place demo order'}).click(); await expect(page.getByRole('heading',{name:'Demo order placed',exact:true})).toBeVisible();
    await assertScreen(page,dark); await capture(page,`order-${label}-${width}`);
  }
});

test('system bootstrap, cross-tab synchronization, malformed recovery and blocked storage',async({page,context})=>{
  await page.emulateMedia({colorScheme:'dark'}); await page.goto('/#/profile'); await assertScreen(page,true);
  expect(await page.evaluate(()=>localStorage.getItem('fc.theme.v1'))).toBeNull();
  const other=await context.newPage(); await other.goto('/#/profile');
  await page.getByRole('radio',{name:'Light',exact:true}).check(); await expect(other.locator('html')).toHaveAttribute('data-theme','light');
  await other.getByRole('radio',{name:'Dark',exact:true}).check(); await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await other.close();
  await page.evaluate(()=>localStorage.setItem('fc.theme.v1','broken-original')); await page.reload();
  await page.getByRole('radio',{name:'Light',exact:true}).check();
  await expect.poll(()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('fc.theme.v1.recovery.')).map(k=>localStorage.getItem(k)))).toContain('broken-original');
  await page.evaluate(()=>{ const original=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){if(key==='fc.theme.v1')throw new Error('quota');return original.call(this,key,value);}; });
  await page.getByRole('radio',{name:'Dark',exact:true}).check(); await assertScreen(page,true);
  await expect(page.locator('.theme-settings')).toContainText('this tab only');
  expect(await page.evaluate(()=>localStorage.getItem('fc.theme.v1'))).toBe('"light"');
  await page.reload(); await assertScreen(page,false);
  await page.evaluate(()=>{ const original=Storage.prototype.getItem; Storage.prototype.getItem=function(key){if(key==='fc.theme.v1')throw new Error('blocked');return original.call(this,key);}; window.dispatchEvent(new StorageEvent('storage',{key:'fc.theme.v1'})); });
  await page.getByRole('radio',{name:'Light',exact:true}).check();
  await expect(page.locator('.theme-settings')).toContainText('this tab only');
});
