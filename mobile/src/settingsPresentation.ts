/** Settings controls use a single column when space or text scaling needs it. */
export function stackSettingsControls(
  width: number,
  fontScale: number,
): boolean {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 390;
  const safeScale = Number.isFinite(fontScale) ? Math.max(1, fontScale) : 1;
  return safeWidth < 360 || safeScale >= 1.3;
}

export function shopifyDomain(value: string): { host: string; valid: boolean } {
  const host = value.trim().toLowerCase();
  return {
    host,
    valid: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(host),
  };
}

/** This preview never treats readiness data as permission to connect a store. */
export function merchantReadinessBlockers(value: unknown): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Invalid readiness response.");
  const data = value as Record<string, unknown>;
  if (
    data.ready !== false ||
    data.connected !== false ||
    !Array.isArray(data.blockers) ||
    !data.blockers.every((blocker: unknown) => typeof blocker === "string")
  )
    throw new Error("Invalid readiness response.");
  return data.blockers;
}
