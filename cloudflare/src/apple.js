import {createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT} from 'jose';
import {digest, now} from './http.js';

export const appleIssuer = 'https://appleid.apple.com';
const keys = createRemoteJWKSet(new URL('/auth/keys', appleIssuer));

export function appleConfigured(env) {
  return [env.APPLE_SERVICES_ID, env.APPLE_TEAM_ID, env.APPLE_KEY_ID, env.APPLE_PRIVATE_KEY]
    .every(value => typeof value === 'string' && value.trim().length > 0);
}

function firstName(params) {
  try {
    const name = JSON.parse(params.get('user') || '{}')?.name?.firstName;
    return typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) : '';
  } catch {
    return '';
  }
}

export async function exchangeApple(env, params, binding, callback) {
  const privateKey = await importPKCS8(env.APPLE_PRIVATE_KEY.replaceAll('\\n', '\n').trim(), 'ES256');
  const clientSecret = await new SignJWT({})
    .setProtectedHeader({alg: 'ES256', kid: env.APPLE_KEY_ID})
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_SERVICES_ID)
    .setAudience(appleIssuer)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

  const response = await fetch(new URL('/auth/token', appleIssuer), {
    method: 'POST',
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id: env.APPLE_SERVICES_ID,
      client_secret: clientSecret,
      code: params.get('code'),
      grant_type: 'authorization_code',
      redirect_uri: callback,
    }).toString(),
  });
  if (!response.ok) throw new Error('Apple code exchange failed.');
  const {payload} = await jwtVerify((await response.json()).id_token, keys, {
    issuer: appleIssuer,
    audience: env.APPLE_SERVICES_ID,
    algorithms: ['RS256'],
    requiredClaims: ['exp', 'iat', 'sub', 'nonce'],
    maxTokenAge: '10m',
    clockTolerance: '30s',
  });
  if (typeof payload.sub !== 'string' || !payload.sub || payload.nonce !== await digest('nonce:' + binding)) {
    throw new Error('Apple identity could not be verified.');
  }

  // Apple identities remain distinct from Google and phone identities.
  const user = await env.DB.prepare(
    'INSERT INTO users(id,apple_sub_hash,first_name) VALUES(?,?,?) ' +
    'ON CONFLICT(apple_sub_hash) DO UPDATE SET apple_sub_hash=excluded.apple_sub_hash RETURNING id'
  ).bind(crypto.randomUUID(), await digest(payload.sub), firstName(params)).first();
  return {subject: user.id, expires: now() + 2592000};
}
