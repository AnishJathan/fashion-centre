import { createContext, useContext, type AnchorHTMLAttributes } from 'react';
import { scopeHref } from './navigationScope';
export const BrandContext = createContext('');
export function BrandLink({ href = '', global = false, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { global?: boolean }) {
  const brand = useContext(BrandContext);
  return <a {...props} href={scopeHref(href, brand, global)} />;
}
