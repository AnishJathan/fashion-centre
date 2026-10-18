import {test,expect} from '@playwright/test';
for(const width of [390,1440])test(`complete demo checkout lifecycle ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===390?844:1000});
 const writes:string[]=[];page.on('request',request=>{if(['POST','PUT','PATCH','DELETE'].includes(request.method()))writes.push(request.url())});
 await page.goto('/#/checkout/violet');await expect(page.getByRole('heading',{name:'Nothing to check out here.'})).toBeVisible();await expect(page.getByRole('button',{name:'Place demo order'})).toHaveCount(0);
 await page.goto('/#/product/p1');await page.getByRole('button',{name:'S',exact:true}).click();await page.getByRole('button',{name:/Add to cart/}).click();await page.getByRole('button',{name:/Add to cart/}).click();await page.getByRole('button',{name:'L',exact:true}).click();await page.getByRole('button',{name:/Add to cart/}).click();
 await page.goto('/#/product/p2');await page.getByRole('button',{name:/Add to cart/}).click();
 await page.goto('/#/cart');const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('fc.commerce.v1')!));
 await page.getByRole('link',{name:'Demo checkout · STUDIO VIOLET',exact:true}).click();await expect(page.getByText('Size S · Qty 2')).toBeVisible();await expect(page.getByText('Size L · Qty 1')).toBeVisible();
 await page.screenshot({path:`screenshots/checkout-review-${width}.png`,fullPage:true});
 await page.getByRole('link',{name:'Cancel and keep shopping',exact:true}).click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('fc.commerce.v1')!))).toEqual(before);
 await page.getByRole('link',{name:'Demo checkout · STUDIO VIOLET',exact:true}).click();await page.reload();await expect(page.getByRole('button',{name:'Place demo order',exact:true})).toBeVisible();
 // Two immediate submissions exercise the synchronous latch and reducer protection.
 await page.getByRole('button',{name:'Place demo order',exact:true}).evaluate((button:HTMLButtonElement)=>{button.click();button.click()});
 await expect(page.getByText('Demo order placed',{exact:true})).toBeVisible();const orderUrl=page.url();
 let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('fc.commerce.v1')!));expect(state.orders).toHaveLength(4);const order=state.orders[0];expect(order.id).toMatch(/^DEMO-[0-9a-f-]{36}$/);expect(order.brandId).toBe('violet');expect(order.sample).toBe(true);expect(Number.isFinite(Date.parse(order.date))).toBe(true);expect(order.lines.map((l:any)=>[l.size,l.quantity,l.price,l.color])).toEqual([['S',2,119,'Denim blue'],['L',1,119,'Denim blue']]);expect(state.cart).toEqual([{productId:'p2',size:'M',quantity:1}]);
 await page.reload();await expect(page.getByText(order.id,{exact:true})).toBeVisible();await page.goBack();await expect(page.getByRole('heading',{name:'Nothing to check out here.'})).toBeVisible();await page.goForward();expect(page.url()).toBe(orderUrl);await expect(page.getByText('Demo order placed',{exact:true})).toBeVisible();
 await page.screenshot({path:`screenshots/checkout-confirmation-${width}.png`,fullPage:true});await page.getByRole('link',{name:'View all orders',exact:false}).click();await page.getByLabel('Filter orders by type').selectOption('Yours');await expect(page.locator('.order-card')).toHaveCount(1);await expect(page.locator('.order-card')).toContainText('YOUR DEMO ORDER');await page.locator('.order-card').click();expect(page.url()).toBe(orderUrl);
 await page.goto('/#/cart');await page.getByRole('link',{name:'Demo checkout · NIMBLE SUPPLY',exact:true}).click();await page.getByRole('button',{name:'Place demo order',exact:true}).click();await expect(page.getByText('Demo order placed',{exact:true})).toBeVisible();
 state=await page.evaluate(()=>JSON.parse(localStorage.getItem('fc.commerce.v1')!));expect(state.orders).toHaveLength(5);expect(new Set(state.orders.map((o:any)=>o.id)).size).toBe(5);expect(state.cart).toEqual([]);
 await page.goto('/#/cart');await expect(page.getByRole('heading',{name:'Room for something you love.'})).toBeVisible();await page.goto('/#/orders');await page.getByLabel('Filter orders by type').selectOption('Yours');await expect(page.locator('.order-card')).toHaveCount(2);await page.getByLabel('Filter orders by type').selectOption('Samples');await expect(page.locator('.order-card')).toHaveCount(3);
 expect(writes).toEqual([]);
});
