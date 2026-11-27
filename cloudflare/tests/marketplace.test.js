import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {getPlatformProxy} from 'wrangler';
import worker from '../src/index.js';
import {checkoutLink} from '../src/marketplace.js';
import {digest,now} from '../src/http.js';

let platform,env;
before(async()=>{
  platform=await getPlatformProxy({persist:false});
  env=platform.env;
  const migrations = new URL('../migrations/',import.meta.url);
  for (const file of (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort()) {
    const schema = await readFile(new URL(file, migrations), 'utf8');
    for (const sql of schema.split(';').filter(s => s.trim())) await env.DB.prepare(sql).run();
  }
});
after(async()=>{await platform?.dispose();});
function route(path,init={}) {return worker.fetch(new Request('https://fashion.example'+path,init),env);}
const shop='fixture.myshopify.com',key='shop-fixture';
const line=(id,n=1)=>({variantKey:key+':gid://shopify/ProductVariant/'+id,quantity:n});
test('checkout contains exactly the selected merchant’s variants and quantities',()=>{
  assert.equal(checkoutLink(shop,[line(1),line(2,3),line(1)]),'https://fixture.myshopify.com/cart/1:2,2:3');
  assert.throws(()=>checkoutLink(shop,[{variantKey:'shop-other:gid://shopify/ProductVariant/1',quantity:1}]));
  assert.throws(()=>checkoutLink(shop,[line(1,0)]));
});
test('merchant readiness explains missing setup and product previews require a shop session', async () => {
  const readiness = await (await route('/api/merchant/shopify/readiness')).json();
  assert.equal(readiness.ready, false);
  assert.equal(readiness.connected, false);
  assert.ok(readiness.blockers.length);
  assert.equal((await route('/api/merchant/shopify/products')).status, 401);
});
test('published directory and checkout depend on merchant publication, unrelated sessions cannot publish',async()=>{
  await env.DB.prepare('INSERT INTO stores VALUES(?,?,1)').bind(shop,'Fixture').run();
  const directory=await (await route('/api/integrations/shopify/status')).json();
  assert.deepEqual(directory.shops.filter(s=>!s.preview),[{key,name:'Fixture'}]);
  const checkout=()=>route('/api/integrations/shopify/checkout/'+key,{method:'POST',body:JSON.stringify({lines:[line(123)]})});
  assert.equal((await (await checkout()).json()).url,'https://fixture.myshopify.com/cart/123:1');
  const publish=cookie=>route('/api/merchant/shopify/publish',{method:'POST',headers:{Cookie:cookie},body:'{"published":false}'});
  assert.equal((await publish('fc_session=shopper')).status,401);
  await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digest('merchant'),'shopify',shop,now()+60).run();
  assert.equal((await publish('fc_merchant=merchant')).status,200);
  assert.equal((await checkout()).status,404);
});
test('anonymous photos and invalid uninstall requests fail before private data changes',async()=>{
  assert.equal((await route('/api/users/me/photo')).status,401);
  const result=await worker.fetch(new Request('https://fashion.example/api/merchant/shopify/webhook',{method:'POST',body:'{}'}),{...env,SHOPIFY_CLIENT_SECRET:'fixture'});
  assert.equal(result.status,401);
});

test('two mocked Shopify owners install, publish, check out separately and uninstall', async t => {
  const {createHmac} = await import('node:crypto');
  const origin = 'https://fashion.example';
  const secret = 'test-only-shopify-secret';
  const bindings = {...env, AUTH_PUBLIC_ORIGIN: origin, SHOPIFY_CLIENT_ID: 'fixture-client', SHOPIFY_CLIENT_SECRET: secret};
  const call = (path, init) => worker.fetch(new Request(origin + path, init), bindings);
  const merchants = ['test-amber', 'test-sand'];
  const storefront = {data: {products: {nodes: [], pageInfo: {hasNextPage: false, endCursor: null}}}};
  t.mock.method(globalThis, 'fetch', async address => {
    const url = new URL(address);
    assert.ok(merchants.some(handle => url.host === handle + '.myshopify.com'));
    if (url.pathname === '/admin/oauth/access_token') {
      return Response.json({access_token: 'mock', expires_in: 3600, associated_user: {account_owner: true}});
    }
    assert.equal(url.pathname, '/api/2026-10/graphql.json');
    return Response.json(storefront);
  });
  for (const handle of merchants) {
    const shop = handle + '.myshopify.com';
    const start = await call('/api/auth/sign-in/shopify/browser?platform=web&shop=' + shop);
    const auth = new URL(start.headers.get('Location'));
    assert.equal(auth.hostname, shop);
    const callback = new URLSearchParams({code:'mock', shop, state:auth.searchParams.get('state'), timestamp:String(now())});
    callback.sort();
    callback.set('hmac', createHmac('sha256', secret).update(callback.toString()).digest('hex'));
    const path = '/api/auth/sign-in/shopify/callback?' + callback;
    const headers = {Cookie:start.headers.getSetCookie()[0].split(';')[0]};
    const finish = await call(path, {headers});
    assert.match(finish.headers.get('Location'), /signin=success/);
    assert.equal((await call(path, {headers})).status, 400);
    const owner = finish.headers.getSetCookie().find(cookie => cookie.startsWith('fc_merchant=')).split(';')[0];
    const readiness = await (await call('/api/merchant/shopify/readiness', {headers:{Cookie:owner}})).json();
    assert.equal(readiness.connected, true);
    assert.equal(readiness.published, false);
    const preview = await call('/api/merchant/shopify/products', {headers:{Cookie:owner}});
    assert.equal(preview.status, 200);
    assert.equal((await preview.json()).shopKey, 'shop-' + handle);
    const publish = await call('/api/merchant/shopify/publish', {method:'POST', headers:{Cookie:owner}, body:JSON.stringify({published:true})});
    assert.equal(publish.status, 200);
    const response = await call('/api/integrations/shopify/checkout/shop-' + handle, {method:'POST', body:JSON.stringify({lines:[
      {variantKey:'shop-' + handle + ':gid://shopify/ProductVariant/123',quantity:2}
    ]})});
    assert.equal((await response.json()).url, 'https://' + shop + '/cart/123:2');
  }
  const directory = async () => (await (await call('/api/integrations/shopify/status')).json()).shops.filter(s => !s.preview).map(s => s.key);
  assert.deepEqual(await directory(), merchants.map(s => 'shop-' + s));
  const shop = merchants[0] + '.myshopify.com';
  const body = JSON.stringify({myshopify_domain:shop});
  const uninstall = await call('/api/merchant/shopify/webhook', {method:'POST', body, headers:{
    'X-Shopify-Topic':'app/uninstalled', 'X-Shopify-Shop-Domain':shop,
    'X-Shopify-Hmac-Sha256':createHmac('sha256',secret).update(body).digest('base64')
  }});
  assert.equal(uninstall.status, 204);
  assert.deepEqual(await directory(), ['shop-' + merchants[1]]);
});

test('Google native callback exchanges the code, verifies identity and creates a shopper session', async t => {
  const {generateKeyPair, exportJWK, SignJWT} = await import('jose');
  const {publicKey, privateKey} = await generateKeyPair('RS256');
  const jwk = {...await exportJWK(publicKey), kid:'test-key', alg:'RS256'};
  const origin = 'https://fashion.example';
  const client = 'test-google-client';
  const bindings = {...env, AUTH_PUBLIC_ORIGIN:origin, GOOGLE_CLIENT_ID:client, GOOGLE_CLIENT_SECRET:'test-only'};
  const call = (path, init) => worker.fetch(new Request(origin + path, init), bindings);
  const post = value => ({method:'POST', body:JSON.stringify(value)});
  const appReturn = 'fashioncentre://auth/complete';
  const start = await (await call('/api/auth/sign-in/google/start', post({platform:'native',returnTo:appReturn}))).json();
  assert.equal(new URL(start.url).searchParams.get('return'), appReturn);
  const browser = await worker.fetch(new Request(start.url), bindings);
  const google = new URL(browser.headers.get('Location'));
  const binding = browser.headers.getSetCookie()[0].split(';')[0];
  const idToken = await new SignJWT({nonce:google.searchParams.get('nonce')})
    .setProtectedHeader({alg:'RS256', kid:jwk.kid}).setIssuer('https://accounts.google.com')
    .setSubject('fixture-subject').setAudience(client).setExpirationTime('5m').sign(privateKey);
  t.mock.method(globalThis, 'fetch', async (address, init) => {
    // workerd supports manual and follow. Credential exchanges must reject redirects.
    assert.equal(init.redirect, 'manual');
    if (String(address) === 'https://www.googleapis.com/oauth2/v3/certs') return Response.json({keys:[jwk]});
    assert.equal(String(address), 'https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(init.body);
    assert.equal(await digest(form.get('code_verifier')), google.searchParams.get('code_challenge'));
    return Response.json({id_token:idToken});
  });
  const callback = await call('/api/auth/sign-in/google/callback?code=test-code&state=' + google.searchParams.get('state'), {headers:{Cookie:binding}});
  const returned = new URL(callback.headers.get('Location'));
  assert.equal(returned.origin, 'null');
  assert.equal(returned.protocol + '//' + returned.host + returned.pathname, 'fashioncentre://auth/complete');
  const finish = await call('/api/auth/sign-in/google/finish', post({grant:returned.searchParams.get('grant'), verifier:start.verifier}));
  assert.equal(finish.status, 204);
  const account = await call('/api/auth/me', {headers:{Cookie:finish.headers.getSetCookie()[0].split(';')[0]}});
  assert.equal(account.status, 200);
});

test('account photo upload converts PNG to a private JPEG and isolates shoppers', async () => {
  const user = 'photo-test-user';
  const other = 'another-photo-test-user';
  for (const subject of [user, other]) {
    await env.DB.prepare('INSERT INTO users(id) VALUES(?)').bind(subject).run();
    await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digest(subject), 'google', subject, now()+60).run();
  }
  const headers = {Cookie:'fc_session=' + user};
  const photo = '/api/users/me/photo';
  assert.equal((await route(photo, {headers})).status, 404);
  const form = new FormData();
  const png = await readFile(new URL('../../mobile/assets/identity/google-g.png', import.meta.url));
  form.set('file', new Blob([png], {type:'image/png'}), 'fixture.png');
  const upload = await route(photo, {method:'POST', headers, body:form});
  assert.equal(upload.status, 200, await upload.text());
  assert.equal((await (await route('/api/auth/me', {headers})).json()).hasPhoto, true);
  const saved = await route(photo, {headers});
  assert.equal(saved.headers.get('Content-Type'), 'image/jpeg');
  assert.equal(saved.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual([...new Uint8Array(await saved.arrayBuffer()).slice(0,3)], [255,216,255]);
  assert.equal((await route(photo, {headers:{Cookie:'fc_session=' + other}})).status, 404);
});

test('preview directory lists both browsable sample catalogues without a merchant installation', async () => {
  const {shops} = await (await route('/api/integrations/shopify/status')).json();
  const samples = shops.filter(s => s.preview);
  assert.deepEqual(samples.map(s => s.key), ['mock','apparel']);
  for (const {key,name} of samples) {
    const response = await route('/api/integrations/shopify/catalogue/' + key);
    assert.equal(response.status, 200);
    const catalogue = await response.json();
    assert.equal(catalogue.shopName, name);
    assert.ok(catalogue.products.length > 0);
    assert.ok(catalogue.products.every(p => p.key.startsWith(key + ':') && p.variants.length > 0));
    assert.equal((await route('/api/integrations/shopify/checkout/' + key, {method:'POST'})).status,404);
  }
});

test('saved gallery photo and a garment generate an owner-only job and JPEG result', async t => {
  const subject='gallery-fixture', cookie='gallery-session';
  await env.DB.prepare('INSERT INTO users(id) VALUES(?)').bind(subject).run();
  await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digest(cookie),'google',subject,now()+180).run();
  const bindings={...env,PRUNA_API_KEY:'test'};
  const call=(path,init={})=>worker.fetch(new Request('https://fashion.example'+path,{...init,headers:{Cookie:'fc_session='+cookie,...init.headers}}),bindings);
  const photoPath='/api/users/me/photo';
  assert.equal((await call(photoPath,{method:'HEAD'})).status,404);
  const person=await readFile(new URL('../../docs/history/prototype-images/campaign.png',import.meta.url));
  const garment=await readFile(new URL('../../mobile/assets/editorial/off-duty.jpg',import.meta.url));
  const form=(name,bytes)=>{const data=new FormData();data.set(name,new Blob([bytes],{type:'image/jpeg'}),name+'.jpg');return data};
  assert.equal((await call(photoPath,{method:'POST',body:form('file',person)})).status,200);
  assert.equal((await call(photoPath,{method:'HEAD'})).status,200);
  const files=[];
  t.mock.method(globalThis,'fetch',async (address,options)=>{
    const url=new URL(address);
    assert.equal(url.origin,'https://api.pruna.ai');
    assert.equal(options.headers.apikey,'test');
    if(url.pathname==='/v1/files'){
      const image=options.body.get('content');assert.ok(image.size>0);
      files.push(image.name);return Response.json({urls:{get:url.origin+'/v1/files/'+image.name}});
    }
    if(url.pathname==='/v1/predictions'){
      assert.equal(options.headers.Model,'p-image-try-on');
      const {input}=JSON.parse(options.body);
      assert.ok(input.person_image.endsWith('/person.jpg'));assert.ok(input.garment_images[0].endsWith('/garment.jpg'));
      return Response.json({id:'test-job'});
    }
    if(url.pathname==='/v1/predictions/status/test-job')return Response.json({status:'succeeded',generation_url:'/v1/predictions/delivery/test/result.jpg'});
    assert.equal(url.pathname,'/v1/predictions/delivery/test/result.jpg');
    return new Response(garment,{headers:{'Content-Type':'image/jpeg'}});
  });
  const start=await call('/api/try-on/me',{method:'POST',body:form('garment',garment)});
  assert.equal(start.status,200);
  assert.deepEqual(files.sort(),['garment.jpg','person.jpg']);
  const {id}=await start.json(),job='/api/try-on/'+id;
  assert.equal((await (await call(job)).json()).status,'succeeded');
  const result=await call(job+'/result');
  assert.equal(result.headers.get('Content-Type'),'image/jpeg');
  assert.equal((await result.arrayBuffer()).byteLength,garment.length);
  assert.equal((await call(job+'/result',{headers:{Cookie:''}})).status,401);
});

test('a shopper can update only their own profile name', async () => {
  await env.DB.prepare('INSERT INTO users(id) VALUES(?)').bind('profile-owner').run();
  await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?,?)').bind(await digest('profile-session'),'google','profile-owner',now()+120).run();
  const headers = {Cookie:'fc_session=profile-session','Content-Type':'application/json'};
  const update = (accountId,firstName) => route('/api/auth/me',{method:'POST',headers,body:JSON.stringify({accountId,firstName})});
  assert.equal((await update('another-shopper','Test')).status,409);
  assert.equal((await update('profile-owner','   ')).status,400);
  assert.equal((await update('profile-owner',' Alex ')).status,200);
  assert.equal((await (await route('/api/auth/me',{headers})).json()).firstName,'Alex');
});

test('Apple form callback verifies the signed identity and reuses the same shopper account', async t => {
  const {generateKeyPair, exportJWK, exportPKCS8, jwtVerify, SignJWT} = await import('jose');
  const signing = await generateKeyPair('ES256', {extractable:true});
  const apple = await generateKeyPair('RS256');
  const jwk = {...await exportJWK(apple.publicKey), kid:'apple-test-key', alg:'RS256'};
  const origin = 'https://fashion.example';
  const appleOrigin = 'https://appleid.apple.com';
  const client = 'com.example.fashion.web';
  const bindings = {...env, AUTH_PUBLIC_ORIGIN:origin, APPLE_SERVICES_ID:client,
    APPLE_TEAM_ID:'fixture-team', APPLE_KEY_ID:'fixture-signing-key', APPLE_PRIVATE_KEY:await exportPKCS8(signing.privateKey)};
  const call = (path, init) => worker.fetch(new Request(origin + path, init), bindings);
  const post = value => ({method:'POST', body:JSON.stringify(value)});
  const startPath = '/api/auth/sign-in/apple/start';
  const callbackPath = '/api/auth/sign-in/apple/callback';
  assert.deepEqual(await (await route('/api/auth/providers')).json(), {apple:false});
  assert.equal((await route(startPath,post({platform:'native'}))).status, 503);
  assert.deepEqual(await (await call('/api/auth/providers')).json(), {apple:true});
  assert.equal((await call(startPath,post({platform:'native',returnTo:'https://other.example'}))).status, 400);

  let nonce, codeExchanges = 0;
  t.mock.method(globalThis, 'fetch', async (address, init) => {
    assert.equal(init.redirect, 'manual');
    if (String(address) === appleOrigin + '/auth/keys') return Response.json({keys:[jwk]});
    assert.equal(String(address), appleOrigin + '/auth/token');
    codeExchanges++;
    const form = new URLSearchParams(init.body);
    assert.equal(form.get('redirect_uri'), origin + callbackPath);
    const {protectedHeader} = await jwtVerify(form.get('client_secret'), signing.publicKey, {
      issuer:bindings.APPLE_TEAM_ID, audience:appleOrigin, subject:client, algorithms:['ES256'],
    });
    assert.equal(protectedHeader.kid, bindings.APPLE_KEY_ID);
    const idToken = await new SignJWT({nonce})
      .setProtectedHeader({alg:'RS256', kid:jwk.kid}).setIssuer(appleOrigin)
      .setSubject('apple-fixture-subject').setAudience(client).setIssuedAt().setExpirationTime('5m').sign(apple.privateKey);
    return Response.json({id_token:idToken});
  });

  async function begin(platform) {
    const start = await (await call(startPath, post({platform}))).json();
    const browser = await worker.fetch(new Request(start.url), bindings);
    const url = new URL(browser.headers.get('Location'));
    assert.equal(url.origin, appleOrigin);
    assert.equal(url.searchParams.get('response_mode'), 'form_post');
    assert.equal(url.searchParams.get('redirect_uri'), origin + callbackPath);
    const [cookie] = browser.headers.getSetCookie();
    assert.match(cookie, /HttpOnly; SameSite=None/);
    return {verifier:start.verifier, state:url.searchParams.get('state'), nonce:url.searchParams.get('nonce'), cookie:cookie.split(';')[0]};
  }

  const submit = (flow, values={}, sendCookie=true) => call(callbackPath, {
    method:'POST', headers:{Origin:appleOrigin, ...(sendCookie?{Cookie:flow.cookie}:{})},
    body:new URLSearchParams({state:flow.state, ...values}),
  });

  const native = await begin('native');
  assert.equal((await submit(native,{code:'fixture-code'},false)).status, 400);
  assert.equal(codeExchanges, 0);
  nonce = native.nonce;
  const callback = await submit(native, {code:'fixture-code', user:JSON.stringify({name:{firstName:'Taylor'}})});
  const returned = new URL(callback.headers.get('Location'));
  assert.equal(returned.protocol + '//' + returned.host + returned.pathname, 'fashioncentre://auth/complete');
  assert.equal((await submit(native, {code:'fixture-code'})).status, 400);
  const proof = post({grant:returned.searchParams.get('grant'), verifier:native.verifier});
  const finish = await call('/api/auth/sign-in/apple/finish', proof);
  assert.equal(finish.status, 204);
  assert.equal((await call('/api/auth/sign-in/apple/finish', proof)).status, 400);
  const account = cookie => call('/api/auth/me', {headers:{Cookie:cookie}});
  const shopper = await (await account(finish.headers.getSetCookie()[0].split(';')[0])).json();
  assert.equal(shopper.firstName, 'Taylor');

  const web = await begin('web');
  nonce = web.nonce;
  const returning = await submit(web, {code:'returning-fixture-code'});
  const cookie = returning.headers.getSetCookie()[1].split(';')[0];
  assert.equal((await (await account(cookie)).json()).id, shopper.id);
  assert.equal((await call('/api/auth/logout', {method:'POST', headers:{Cookie:cookie}})).status, 204);
  assert.equal((await account(cookie)).status, 401);

  const invalid = await begin('web');
  nonce = 'wrong-nonce';
  const rejected = await submit(invalid, {code:'invalid-nonce'});
  assert.match(rejected.headers.get('Location'), /signin=failed/);
  assert.equal(rejected.headers.getSetCookie().length, 1);

  const cancel = await begin('native');
  const cancelled = await submit(cancel, {error:'user_cancelled_authorize'});
  assert.equal(cancelled.headers.get('Location'), 'fashioncentre://auth/complete?signin=cancelled');
  assert.equal(codeExchanges, 3);

  // Only the Apple callback accepts a cross-origin POST.
  assert.equal((await call('/api/auth/logout', {method:'POST', headers:{Origin:appleOrigin}})).status, 403);
});
