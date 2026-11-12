/** Shared platform-independent layout rules for the native interface. */
export const metrics = {
  touch: 48,
  compactGap: 8,
  gap: 16,
  sectionGap: 24,
  cardRadius: 12,
  controlRadius: 12,
  maxContentWidth: 1040,
} as const;

export const palettes = {
  light: {
    background: "#F5F9FF",
    surface: "#FFFFFF",
    text: "#101B2D",
    muted: "#536177",
    accent: "#0057D9",
    onAccent: "#FFFFFF",
    line: "#DDE6F2",
    controlLine: "#70819A",
    tint: "#E5F0FF",
    error: "#AA2438",
    errorSurface: "#FFF0F0",
    success: "#276B4C",
    disabled: "#E0E7F0",
  },
  dark: {
    background: "#0B1424",
    surface: "#142137",
    text: "#F3F8FF",
    muted: "#AFBDD1",
    accent: "#72B6FF",
    onAccent: "#071A36",
    line: "#2D405A",
    controlLine: "#7C93B2",
    tint: "#18324D",
    error: "#FFACAA",
    errorSurface: "#3D2427",
    success: "#A1D9B7",
    disabled: "#2B3B52",
  },
} as const;

export function pageLayout(
  width: number,
  fontScale = 1,
  insets: { left?: number; right?: number } = {},
) {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 390;
  const safeScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const horizontal = safeWidth < 700 ? 12 : 20;
  const paddingLeft = Math.max(horizontal, Number.isFinite(insets.left) ? insets.left! : 0);
  const paddingRight = Math.max(horizontal, Number.isFinite(insets.right) ? insets.right! : 0);
  return {
    horizontal,
    paddingLeft,
    paddingRight,
    contentWidth: Math.max(
      0,
      Math.min(safeWidth, metrics.maxContentWidth) - paddingLeft - paddingRight,
    ),
    compact: safeWidth < 360 || safeScale >= 1.4,
    tablet: safeWidth >= 700,
  };
}

export function visibleBadgeCount(count: number) {
  return count > 99 ? "99+" : String(Math.max(0, Math.floor(count)));
}
