import {expect, test} from '@playwright/test';

test('phone picker supports search and keyboard selection and sends the selected calling code', async ({page}) => {
  await page.setViewportSize({width: 320, height: 720});
  await page.goto('/#/login');
  const picker = page.getByRole('button', {name: /Country code,/});
  await picker.click();
  const search = page.getByRole('searchbox', {name:'Search countries'});
  await expect(search).toBeFocused();
  await search.fill('+1');
  await expect(page.getByRole('option')).toHaveCount(2);
  await search.fill('India');
  await search.press('ArrowDown'); await page.keyboard.press('Enter');
  await expect(picker).toHaveAccessibleName('Country code, India +91');
  await expect(picker).toBeFocused();
  await picker.click(); await search.fill('zzzz'); await expect(page.getByText('No matching countries.')).toBeVisible();
  await search.press('Escape'); await expect(picker).toBeFocused();
  let phone = '';
  await page.route('**/api/auth/request-code', route => {
    phone = route.request().postDataJSON().phone;
    return route.fulfill({json:{expiresInSeconds:120}});
  });
  await page.getByLabel('WhatsApp number').fill('9876501234');
  await page.getByRole('button',{name:/Send code on WhatsApp/}).click();
  await expect(page.getByLabel('Enter 6-digit code')).toBeVisible();
  expect(phone).toBe('+919876501234');
});

for (const provider of ['google','apple','shopify'] as const) {
  test(provider+' sign-in returns to the correct account and can sign out', async ({page}) => {
    const merchant = provider === 'shopify';
    const route = merchant ? 'owner' : 'login';
    const providerButton = merchant ? 'Sign in with Shopify' : provider === 'apple' ? 'Sign in with Apple' : 'Continue with Google';
    let signedIn = false;
    await page.route('**/api/auth/providers', request => request.fulfill({json:{apple:provider === 'apple'}}));
    const sessionPath = merchant ? '/api/auth/sign-in/shopify' : '/api/auth';
    await page.route('**'+sessionPath+'/me', request => request.fulfill(signedIn
      ? {json: merchant ? {shop:'fixture.myshopify.com'} : {id:'fixture-user',hasPhoto:false}}
      : {status:401,json:{}}));
    await page.route('**/api/auth/sign-in/'+provider+'/start', request => {
      expect(request.request().postDataJSON()).toEqual(merchant ? {platform:'web',shop:'fixture.myshopify.com'} : {platform:'web'});
      const url = new URL('/api/auth/sign-in/'+provider+'/browser?platform=web', request.request().url());
      return request.fulfill({json:{url:url.href}});
    });
    await page.route('**/api/auth/sign-in/'+provider+'/browser?*', request => {
      signedIn = true;
      return request.fulfill({status:303,headers:{location:'/?signin=success#/'+route}});
    });
    await page.route('**'+sessionPath+'/logout', request => {signedIn=false; return request.fulfill({status:204});});
    await page.goto('/#/login');
    if (merchant) {
      await page.getByRole('link',{name:'For stores'}).click();
      await page.getByLabel('Shopify store domain').fill('Fixture.myshopify.com');
    }
    await page.getByRole('button',{name:providerButton}).click();
    await expect(page.getByText(merchant ? /Signed in to fixture.myshopify.com/ : /You’re signed in/)).toBeVisible();
    await expect(page).not.toHaveURL(/signin=/);
    await page.getByRole('button',{name:merchant ? 'Sign out of merchant account' : 'Sign out',exact:true}).click();
    await expect(page.getByRole('button',{name:providerButton})).toBeVisible();
    expect(signedIn).toBe(false);
  });
}

test('unconfigured Google and cancelled Shopify return actionable feedback', async ({page}) => {
  await page.route('**/api/auth/sign-in/google/start', request => request.fulfill({status:503}));
  await page.route('**/api/auth/providers', request => request.fulfill({json:{apple:false}}));
  await page.goto('/#/login');
  await expect(page.getByRole('button',{name:'Sign in with Apple'})).toHaveCount(0);
  await page.getByRole('button',{name:'Continue with Google'}).click();
  await expect(page.getByRole('alert')).toContainText('Google sign-in is unavailable');
  await page.goto('/?signin=cancelled#/owner');
  await expect(
    page.getByText('Sign-in was cancelled', { exact: false })
  ).toBeVisible();
  await expect(page.getByLabel('Shopify store domain')).toBeVisible();
});
