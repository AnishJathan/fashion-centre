import type { Product } from './core/domain.ts';
import { money, validMoney } from './core/domain.ts';
import { currencyMinorUnits } from './core/currencyMinorUnits.ts';
import type { Route } from './navigation.ts';

/** This helper is deliberately deterministic: no network, model, account or storage. */
export const STYLE_CHAT_LIMIT = 400;
export const STYLE_CHAT_HISTORY_LIMIT = 24;
export type StyleAssistantContext = {
  products: readonly Product[];
  brandId?: string;
  currentProductId?: string;
  catalogueLoading?: boolean;
  catalogueError?: string;
};
export type StyleReply = {
  text: string;
  productIds: string[];
  currency?: string;
  actions: { label: string; route: Route }[];
};
export type StyleBudget =
  | { kind: 'none' }
  | { kind: 'clarify'; text: string }
  | { kind: 'budget'; amount: number; currency: string; inclusive: boolean; remainder: string };

const budgetWords = /\b(under|below|less than|cheaper than|up to|at most|maximum|max|budget(?: of)?|within)\b/gi;
const amountPattern = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const currencyAmount = new RegExp(`\\b([a-z]{3})\\s+(-?${amountPattern})(?![\\d.,])|(-?${amountPattern})\\s*([a-z]{3})\\b`, 'gi');

/** Currency codes are mandatory; $ and ¥ are intentionally not guessed. */
export function styleBudget(query: string): StyleBudget {
  const matches = [...query.matchAll(currencyAmount)].filter(match => {
    const code = (match[1] || match[4]).toUpperCase();
    return Object.hasOwn(currencyMinorUnits, code) || /\b(?:under|below|budget|maximum|max|within|at most|up to)\b/i.test(query);
  });
  const intended = /\b(?:under|below|less than|cheaper than|up to|at most|maximum|max|budget|within)\b/i.test(query)
    || /[$€£₹¥]\s*\d/.test(query) || matches.length > 0;
  if (!intended) return { kind: 'none' };
  if (matches.length !== 1) return {
    kind: 'clarify',
    text: 'Use one amount and a currency code, such as “dresses under USD 50” or “tops up to INR 2000”. I don’t convert currencies or guess what $ means.',
  };
  const match = matches[0];
  const currency = (match[1] || match[4]).toUpperCase();
  const amount = Number((match[2] || match[3]).replaceAll(',', ''));
  const remainder = query.replace(match[0], ' ').replace(budgetWords, ' ');
  if (!validMoney(amount, currency) || /[$€£₹¥]|\d/.test(remainder)) return {
    kind: 'clarify',
    text: 'Please use one valid, non-negative amount with a currency code, for example “under USD 50”. Price ranges and currency conversion aren’t supported here.',
  };
  return { kind: 'budget', amount, currency, inclusive: !/\b(?:under|below|less than|cheaper than)\b/i.test(query), remainder };
}

function scopedProducts(context: StyleAssistantContext) {
  return context.products.filter(product => !context.brandId || product.brandId === context.brandId);
}
const stopWords = new Set('a an the i me my you can could would please show find search browse catalogue catalog collection recommend suggest suggestions recommendations want need looking look for something some any all items item products product options option style styles to of that is are and with budget'.split(' '));
function singular(value: string) {
  if (value === 'dresses') return 'dress';
  if (value === 'accessories') return 'accessory';
  return value.length > 3 && value.endsWith('s') && !value.endsWith('ss') ? value.slice(0, -1) : value;
}
function words(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\p{N}]+/gu)?.map(singular) || [];
}
function reply(text: string, actions: StyleReply['actions'] = []): StyleReply {
  return { text, productIds: [], actions };
}
const scope = (name: Route['name'], brandId?: string): Route => ({ name, ...(brandId ? { brandId } : {}) });

export function styleAssistantWelcome(context: StyleAssistantContext): StyleReply {
  return reply(`Search ${context.brandId ? 'this store’s' : 'the'} loaded catalogue by name, category or budget with a currency code. Or ask about Try On, your bag or demo orders.`);
}

export function styleAssistantStarters(context: StyleAssistantContext): string[] {
  const products = scopedProducts(context);
  const category = products.find(product => product.category.trim())?.category.trim();
  const currency = products.flatMap(product => product.variants).find(variant => variant.available && validMoney(variant.amount, variant.currency))?.currency;
  return [category && category.length <= 30 ? `Show ${category}` : 'Browse catalogue', currency ? `Under ${currency} 50` : 'Find by budget', 'Try On help', 'Bag & orders'];
}

/** Actions navigate only. All authentication, photo and generation gates remain downstream. */
export function styleAssistantReply(input: string, context: StyleAssistantContext): StyleReply {
  const query = input.trim().slice(0, STYLE_CHAT_LIMIT);
  const products = scopedProducts(context);
  if (!query || /^(?:hi|hey|hello|help)[!?.\s]*$/i.test(query)) return styleAssistantWelcome(context);
  if (/\b(?:try[ -]?on|photo|photos|camera)\b/i.test(query)) {
    const product = products.find(item => item.id === context.currentProductId);
    return reply('Try On starts with a garment and the existing preparation screens. Any account, photo or generation steps keep their own checks and confirmations. This chat can’t view or upload photos, or generate a try-on.', [{
      label: product ? 'Prepare this garment' : 'Open Try On preparation',
      route: { ...scope('prepare', product?.brandId || context.brandId), ...(product ? { productId: product.id } : {}) },
    }]);
  }
  if (/\b(?:bag|cart|basket|orders?|checkout|shipping|delivery|refund|payment|purchase)\b/i.test(query)) return reply(
    'Your bag holds the pieces you add from product pages. Checkout and order records here are local demos, not real purchases or delivery tracking. I can open those screens, but can’t place an order or change your bag.',
    [{ label: 'Open bag', route: scope('cart', context.brandId) }, { label: 'View demo orders', route: scope('orders', context.brandId) }],
  );
  if (/\b(?:live ai|are you ai|real ai|privacy|private|send messages|save messages|data|clear chat)\b/i.test(query)) return reply('I’m a local, rule-based demo helper, not live AI. Chat text stays in memory on this device and clears when you close this panel. No chat messages or photos are sent anywhere. I only search catalogue data already loaded by the app.');

  const budget = styleBudget(query);
  if (budget.kind === 'clarify') return reply(budget.text);
  const terms = words(budget.kind === 'budget' ? budget.remainder : query).filter(word => !stopWords.has(word));
  if (!products.length) return reply(context.catalogueLoading
    ? 'The catalogue is still loading. Once pieces appear, I can search them here. Try On, bag and order help are available now.'
    : context.catalogueError
      ? 'The catalogue hasn’t loaded successfully. Retry it in the shop, then ask me again. Try On, bag and order help are still available.'
      : 'There are no loaded pieces in this view yet. Open Stores to browse or enable a demo store, then ask me about its catalogue.',
    [{ label: 'Browse stores', route: { name: 'brands' } }]);
  const matches = products.filter(product => {
    const tokens = words(`${product.name} ${product.category} ${product.brandName}`);
    return terms.every(term => tokens.includes(term)) && (budget.kind !== 'budget' || product.variants.some(variant =>
      variant.available && variant.currency === budget.currency && validMoney(variant.amount, variant.currency)
      && (budget.inclusive ? variant.amount <= budget.amount : variant.amount < budget.amount)));
  });
  if (!matches.length) return reply(`I couldn’t find a match in ${context.brandId ? 'this store’s' : 'the'} loaded catalogue${budget.kind === 'budget' ? ` ${budget.inclusive ? 'up to' : 'under'} ${money(budget.amount, budget.currency)}` : ''}. Try a product name or category that appears in the shop. I can also help with Try On, your bag and demo orders.`);
  const displayed = matches.slice(0, 4);
  return {
    text: `Here ${displayed.length === 1 ? 'is a match' : 'are matches'} from the loaded catalogue${budget.kind === 'budget' ? ` ${budget.inclusive ? 'up to' : 'under'} ${money(budget.amount, budget.currency)}` : ''}, in catalogue order.${matches.length > 4 ? ' Showing the first 4; add a name or category to narrow it down.' : ''} Open a piece to check its current variants and availability.`,
    productIds: displayed.map(product => product.id),
    ...(budget.kind === 'budget' ? { currency: budget.currency } : {}),
    actions: [],
  };
}

export function styleAssistantPrice(product: Product, currency?: string): string {
  const prices = new Map<string, number>();
  for (const variant of product.variants) if (variant.available && (!currency || currency === variant.currency) && validMoney(variant.amount, variant.currency)) {
    prices.set(variant.currency, Math.min(prices.get(variant.currency) ?? Infinity, variant.amount));
  }
  return prices.size ? [...prices].map(([code, amount]) => `From ${money(amount, code)}`).join(' · ') : 'Check product availability';
}

export function styleAssistantLayout(width: number, height: number, fontScale = 1) {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 390;
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 800;
  const textScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  // Keep the shop visible on normal phones. Short windows and larger text can
  // use more of the safe area, without making the transcript or controls clip.
  return {
    panelWidth: Math.min(440, Math.max(0, safeWidth - 24)),
    panelHeight: Math.min(480, Math.max(0, safeHeight - 24), Math.max(260 * textScale, Math.round(safeHeight * 0.7))),
  };
}
