// Generate the Shopify CLI file once the team has chosen its Worker hostname.
import {writeFileSync} from 'node:fs';
const origin=new URL(process.env.AUTH_PUBLIC_ORIGIN);
const client=process.env.SHOPIFY_CLIENT_ID;
if(origin.protocol!=='https:'||origin.origin!==process.env.AUTH_PUBLIC_ORIGIN||!client||!/^[\w-]+$/.test(client))throw Error('Set an HTTPS AUTH_PUBLIC_ORIGIN and SHOPIFY_CLIENT_ID.');
writeFileSync(new URL('shopify.app.toml',import.meta.url),`client_id = "${client}"
name = "Fashion Centre"
application_url = "${origin.origin}/api/merchant/shopify/launch"
embedded = false

[access_scopes]
scopes = "read_products"
use_legacy_install_flow = true

[auth]
redirect_urls = ["${origin.origin}/api/auth/sign-in/shopify/callback"]

[webhooks]
api_version = "2026-10"

[[webhooks.subscriptions]]
topics = ["app/uninstalled"]
uri = "/api/merchant/shopify/webhook"

[[webhooks.subscriptions]]
compliance_topics = ["customers/data_request", "customers/redact", "shop/redact"]
uri = "/api/merchant/shopify/webhook"
`);
