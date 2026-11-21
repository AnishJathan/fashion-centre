/** Shared by the Expo renderer and Vite's first-paint web theme. Use semantic
 * colours for controls so appearance changes never recolour catalogue photos. */
export const metrics = {
  touch: 48,
  compactGap: 8,
  gap: 16,
  sectionGap: 24,
  cardRadius: 24,
  insetRadius: 14,
  controlRadius: 12,
  pillRadius: 999,
  dockWidth: 432,
  dockHeight: 64,
  dockOffset: 3,
  dockInnerPadding: 3,
  maxContentWidth: 1200,
} as const;

export const displayFont = "DMSerifText";
export const motion = { press: 140, reveal: 240 } as const;

export const palettes = {
  light: {
    background: "#F8F5EE", surface: "#FFFCF6", text: "#28231E", muted: "#64594E",
    accent: "#934124", onAccent: "#FFF9EF", line: "#D9CFC1", controlLine: "#877665",
    tint: "#EEE4D6", error: "#932F2A", errorSurface: "#F9E9E4", success: "#365B42",
    disabled: "#E6DED1", cover: "#EADFCD", coverInk: "#30261D", coverMuted: "#645445",
    dock: "#332B25", dockLine: "#50443A", dockText: "#DED2C6", dockSelected: "#F5D7B6", dockSelectedInk: "#402A1C",
  },
  dark: {
    background: "#1A1815", surface: "#24211D", text: "#F8F1E6", muted: "#C3B6A5",
    accent: "#F3AC85", onAccent: "#301C13", line: "#4B4238", controlLine: "#978775",
    tint: "#352E26", error: "#FFB3A7", errorSurface: "#462B26", success: "#B2D1AC",
    disabled: "#3A342C", cover: "#342A22", coverInk: "#FAEEDF", coverMuted: "#D5C0AA",
    dock: "#302923", dockLine: "#635549", dockText: "#DFD3C6", dockSelected: "#F1BD95", dockSelectedInk: "#39251A",
  },
} as const;

export function pageLayout(
  width: number,
  fontScale = 1,
  insets: { left?: number; right?: number } = {},
) {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 390;
  const safeScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  const horizontal = safeWidth < 700 ? metrics.gap : metrics.sectionGap;
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
