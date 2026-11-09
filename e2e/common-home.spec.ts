import {test,expect} from '@playwright/test';

for(const width of [390,1440]) test(`common home includes enabled stores and clears previous page restrictions ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.route('**/api/integrations/shopify/status',r=>r.fulfill({json:{shops:[{key:'mock',name:'Mock Shop'},{key:'apparel',name:'Elysian Thread'}]}}));
  await page.route('**/api/integrations/shopify/catalogue/*',r=>{
    const id=new URL(r.request().url()).pathname.split('/').pop()!;
    return r.fulfill({json:{shopKey:id,shopName:id==='mock'?'Demo North':'Demo South',hasNextPage:false,products:[{
      key:id+':gid://shopify/Product/1',title:id==='mock'?'North shirt':'South trousers',category:id==='mock'?'Shirts':'Trousers',image:'/images/campaign.png',moreVariants:false,
      variants:[{id:'gid://shopify/ProductVariant/1',key:id+':gid://shopify/ProductVariant/1',title:'M',available:true,amount:'25.50',currency:id==='mock'?'CAD':'USD',options:{Size:'M'}}]
    }]}});
  });
  const home=async(count:number)=>{
    if(await page.locator('.brand-mode').count()) await page.getByRole('link',{name:'Back to Fashion Centre',exact:true}).click();
    await page.locator('.bottom-nav').getByRole('link',{name:'Discover',exact:true}).click();
    await expect(page.locator('.product')).toHaveCount(count);
    await expect(page.locator('header .logo')).toHaveText('Fashion Centre');
    await expect(page.locator('.catalogue-controls')).toHaveCount(0);
    await expect(page.getByLabel('Filter by store')).toHaveCount(0);
    await expect(page.getByLabel('Sort products')).toHaveCount(0);
    await expect(page.getByRole('button',{name:/Switch to .* theme/})).toHaveCount(0);
  };
  await page.goto('/'); await home(0);
  await expect(page.getByRole('heading',{name:'Your Fashion Centre starts here.'})).toBeVisible();
  await page.goto('/#/merchant'); await page.getByRole('button',{name:'Onboard Mock Shop',exact:true}).click(); await home(1);
  await page.goto('/#/merchant'); await page.getByRole('button',{name:'Onboard Elysian Thread',exact:true}).click(); await home(2);
  await expect(page.locator('.product .price')).toHaveText(['CAD 25.50','USD 25.50']);
  for(const brand of ['Demo North','Demo South']) {
    await page.locator('.brand-grid a').filter({hasText:brand}).click();
    await expect(page.locator('.product')).toHaveCount(1);
    await page.getByLabel('Search catalogue').fill('unmatched'); await page.getByLabel('Sort products').selectOption('price');
    await home(2); await expect(page.getByLabel('Search catalogue')).toHaveValue('');
  }
  // Saved-page store restrictions remain available there but never restrict home.
  await page.locator('.product .save').first().click();
  await page.locator('.bottom-nav').getByRole('link',{name:'Saved',exact:true}).click();
  await page.getByLabel('Filter by store').selectOption('apparel'); await expect(page.locator('.product')).toHaveCount(0);
  await home(2);
  await page.getByLabel('Search catalogue').fill('South'); await expect(page.locator('.product')).toHaveCount(1);
  await page.getByLabel('Search catalogue').fill(''); await expect(page.locator('.product')).toHaveCount(2);
  for(const theme of ['Light','Dark']) {
    await page.locator('.bottom-nav').getByRole('link',{name:'Profile'}).click(); await page.getByRole('radio',{name:theme,exact:true}).check();
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('fc.theme.v1'))).toBe(JSON.stringify(theme.toLowerCase()));
    await home(2); await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme',theme.toLowerCase());
    await expect(page.locator('.product')).toHaveCount(2);
    await page.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(i=>i.decode().catch(()=>{}))));
    await page.evaluate(()=>{if(document.activeElement instanceof HTMLElement)document.activeElement.blur()});
    await page.screenshot({path:`screenshots/common-home-${theme.toLowerCase()}-${width}.png`,fullPage:true});
  }
  await page.goto('/#/merchant'); await page.getByRole('button',{name:'Disable Mock Shop',exact:true}).click(); await home(1);
  await expect(page.locator('.product-title')).toHaveText('South trousers');
  await page.goto('/#/merchant'); await page.getByRole('button',{name:'Disable Elysian Thread',exact:true}).click(); await home(0);
  await expect(page.getByRole('heading',{name:'Your Fashion Centre starts here.'})).toBeVisible();
});
