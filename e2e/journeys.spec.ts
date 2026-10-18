import {test,expect} from '@playwright/test';
for(const viewport of [{width:390,height:844},{width:1440,height:1000}]){
 test(`core shopper journey ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');
 await expect(page.getByRole('heading',{name:/Discover your style/})).toBeVisible();
 await expect.poll(()=>page.locator('img').evaluateAll(images=>images.every(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`screenshots/home-${viewport.width}.png`,fullPage:true});
 const heart=page.getByRole('button',{name:'Save Everyday denim',exact:true});await heart.click();await page.getByRole('button',{name:'Unsave Everyday denim',exact:true}).click();await heart.click();
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Saved'}).click();await expect(page.locator('.product')).toHaveCount(1);await page.reload();await expect(page.locator('.product')).toHaveCount(1);
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Brands',exact:true}).click();await page.getByRole('link',{name:/STUDIO VIOLET A little/}).click();await expect(page.locator('.product')).toHaveCount(2);await expect(page.locator('header').getByRole('link',{name:'STUDIO VIOLET',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'+ Follow brand'}).click();await expect(page.getByRole('button',{name:'Following ✓'})).toBeVisible();
 await page.getByRole('button',{name:'View Everyday denim',exact:true}).click();await expect(page.getByRole('heading',{name:'Everyday denim',exact:true})).toBeVisible();await page.getByRole('button',{name:'Back to browsing'}).click();await expect(page.locator('header').getByRole('link',{name:'STUDIO VIOLET',exact:true})).toBeVisible();
 await page.goBack();await expect(page.getByRole('heading',{name:'Everyday denim',exact:true})).toBeVisible();await page.goForward();await expect(page.locator('header').getByRole('link',{name:'STUDIO VIOLET',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'← Fashion Centre'}).click();await expect(page.locator('.product')).toHaveCount(6);
 await page.getByRole('link',{name:/NIMBLE SUPPLY Made/}).click();await expect(page.locator('.product')).toHaveCount(2);await expect(page.getByRole('button',{name:'View Everyday denim',exact:true})).toHaveCount(0);
 await page.screenshot({path:`screenshots/brand-${viewport.width}.png`,fullPage:true});
 await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Try on'}).click();await expect(page.locator('video')).toHaveCount(0);await page.screenshot({path:`screenshots/try-on-${viewport.width}.png`});
 await page.locator('.try-feed').focus();await page.keyboard.press('ArrowDown');await expect.poll(()=>page.locator('.try-feed').evaluate(el=>el.scrollTop)).toBeGreaterThan(600);await page.getByRole('button',{name:'Close try-on'}).click();await expect(page.locator('header').getByRole('link',{name:'NIMBLE SUPPLY',exact:true})).toBeVisible();
 });
}
