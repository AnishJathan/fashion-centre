
import { shopifyDomain } from '../mobile/src/settingsPresentation.ts';

export function canonicalShop(value: string): string | null {
  const { host, valid } = shopifyDomain(value);
  return valid ? host : null;
}
