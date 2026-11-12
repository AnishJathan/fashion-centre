/** Presentation-only sizing, shared by the shopping grid and its tests. */
export const SHOPPING_GRID_GAP = 8;
export function shoppingGridLayout(availableWidth: number, fontScale = 1) {
  const width = Number.isFinite(availableWidth)
    ? Math.max(1, availableWidth)
    : 1;
  const scale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const columns = scale >= 1.3 ? 1 : width >= 700 ? 4 : width >= 520 ? 3 : width >= 260 ? 2 : 1;
  return {
    columns,
    gap: SHOPPING_GRID_GAP,
    cardWidth: (width - SHOPPING_GRID_GAP * (columns - 1)) / columns,
  };
}
