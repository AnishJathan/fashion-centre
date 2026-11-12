/** Keep portrait previews useful without filling an entire compact phone screen. */
export function previewHeight(
  width: number,
  viewportHeight: number,
  compact = false,
) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 280;
  const safeHeight =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : 640;
  return Math.round(
    Math.max(
      160,
      Math.min(
        safeWidth * (compact ? 0.9 : 1.25),
        safeHeight * (compact ? 0.35 : 0.48),
        compact ? 300 : 420,
      ),
    ),
  );
}

export function cameraStageHeight(width: number, viewportHeight: number) {
  const safeWidth = Number.isFinite(width) && width > 0 ? width : 280;
  const safeHeight =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : 640;
  return Math.round(
    Math.max(220, Math.min(safeWidth * 1.4, safeHeight * 0.5, 480)),
  );
}

/** Keep all six digits visible while retaining the device's text scaling. */
export function otpFieldMetrics(fieldWidth: number, fontScale: number) {
  const width =
    Number.isFinite(fieldWidth) && fieldWidth > 32 ? fieldWidth : 240;
  const scale = Number.isFinite(fontScale) && fontScale > 0 ? fontScale : 1;
  const available = (width - 32) / scale;
  const fontSize = Math.min(26, available / (6 * 0.66));
  const letterSpacing = Math.max(
    0,
    Math.min(7, (available - fontSize * 6 * 0.66) / 6),
  );
  const lineHeight = Math.ceil(fontSize * 1.4);
  return {
    fontSize,
    lineHeight,
    letterSpacing,
    minHeight: Math.max(64, lineHeight * scale + 28),
  };
}
