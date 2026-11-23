import {expect,test} from '@playwright/test';

test('shopper edits their name, reopens Profile, finds delivery help and signs out',async({page})=>{
  let name='Taylor', signedIn=true;
  await page.route('**/api/auth/me',async route=>{
    if(!signedIn) return route.fulfill({status:401});
    if(route.request().method()==='POST'){
      const data=route.request().postDataJSON();
      expect(data.accountId).toBe('shopper');
      name=data.firstName;
      return route.fulfill({json:{firstName:name}});
    }
    return route.fulfill({json:{id:'shopper',firstName:name,hasPhoto:true}});
  });
  await page.route('**/api/auth/logout',route=>{signedIn=false;return route.fulfill({status:204});});
  await page.goto('/#/profile');
  await page.getByRole('button',{name:'Edit name'}).click();
  await page.getByLabel('Profile name').fill('Alex');
  await page.getByRole('button',{name:'Save name'}).click();
  await expect(page.getByRole('heading',{name:'Alex'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Alex'})).toBeVisible();
  await page.getByText('How do I change my delivery address or payment method?',{exact:true}).click();
  await expect(page.getByText(/Enter your address and payment details at that store/)).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('link',{name:'Sign in or manage account'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Alex'})).toHaveCount(0);
});

test('clearing browsing history requires confirmation and preserves followed stores',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('fc.browsing.v1',JSON.stringify({products:['demo:shirt'],stores:['demo']}));
    localStorage.setItem('fc.followed',JSON.stringify(['demo']));
  });
  await page.goto('/#/profile');
  const clear = page.getByRole('button',{name:'Clear browsing history'});
  page.once('dialog',d=>d.dismiss());
  await clear.click();
  await expect(clear).toBeVisible();
  page.once('dialog',d=>d.accept());
  await clear.click();
  await expect(page.getByText('Browsing history cleared.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('fc.browsing.v1'))).toBeNull();
  expect(await page.evaluate(()=>localStorage.getItem('fc.followed'))).toBe('["demo"]');
});
