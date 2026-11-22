/** Deterministic, local editorial discovery. Never claims AI personalization or stock. */
import type { Product } from './core/domain.ts';
export const moods = [
  { id: 'all', label: 'All moods', note: 'An open invitation to explore.', terms: [] },
  { id: 'everyday', label: 'Off duty', note: 'Easy layers. A little less effort.', terms: ['everyday', 'casual', 'denim', 'shirt', 'tee', 'jacket', 'hoodie'] },
  { id: 'evening', label: 'After hours', note: 'A silhouette worth making plans for.', terms: ['dress', 'evening', 'silk', 'satin', 'tailor', 'blazer'] },
  { id: 'finishing', label: 'Finishing touches', note: 'The detail that makes it yours.', terms: ['shoe', 'accessor', 'bag', 'jewel', 'sandal', 'sneaker'] },
] as const;
export type MoodId = typeof moods[number]['id'];
export function moodProducts(products: Product[], mood: string) {
  const edit = moods.find((item) => item.id === mood) || moods[0];
  return !edit.terms.length ? products : products.filter((p) => {
    const text = `${p.name} ${p.category}`.toLowerCase();
    return (edit.terms as readonly string[]).some((term) => text.includes(term));
  });
}
export function studioProducts(products: Product[], mood: string, category: string) {
  return moodProducts(products, mood).filter((p) => category === 'All' || p.category === category);
}
export const storyCopy = [
  { title: 'The art of\neveryday.', kicker: '01 / OFF DUTY', description: 'Familiar silhouettes. Unexpected combinations. Find a little freedom in what you wear.', mood: 'everyday' as MoodId },
  { title: 'Make an\nentrance.', kicker: '02 / AFTER HOURS', description: 'Let the silhouette do the talking. Explore pieces for whatever the evening becomes.', mood: 'evening' as MoodId },
  { title: 'Your point\nof view.', kicker: '03 / YOUR EDIT', description: 'Explore the pieces that feel like you. Discover a new silhouette or try a different direction.', mood: 'all' as MoodId },
];
