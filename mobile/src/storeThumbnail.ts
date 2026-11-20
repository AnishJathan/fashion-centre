/** Request a card-sized rendition from Shopify while retaining the source image for product detail. */
export function storeThumbnail(source: string) {
  if (!source.startsWith("https://cdn.shopify.com/")) return source;
  const url = new URL(source);
  url.searchParams.set("width", "480");
  return url.href;
}
