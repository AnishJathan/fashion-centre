const valid = (id: string) => /^[a-z0-9-]+$/.test(id) ? id : '';
export function parseNavigation(hash: string) {
  const [path, search = ''] = (hash.replace(/^#/, '') || '/').split('?');
  let owner = '';
  try {
    if (/^\/(brand|checkout)\//.test(path)) owner = valid(decodeURIComponent(path.slice(path.indexOf('/', 1) + 1)));
    else if (/^\/(product|try|photos)\//.test(path)) owner = valid(decodeURIComponent(path.slice(path.indexOf('/', 1) + 1)).split(':')[0]);
  } catch { /* Existing route validation displays malformed URLs safely. */ }
  return { route: path, brandId: owner || valid(new URLSearchParams(search).get('brand') || '') };
}
/** The URL owns context: refresh, copied links and browser history retain the same shop. */
export function scopeHref(href: string, brandId: string, global = false) {
  if (!href.startsWith('#/')) return href;
  const { route, brandId: destination } = parseNavigation(href);
  if (global || route === '/brands') return '#' + route;
  if (destination) return href;
  if (!brandId) return href;
  if (route === '/') return '#/brand/' + encodeURIComponent(brandId);
  return '#' + route + '?brand=' + encodeURIComponent(brandId);
}
