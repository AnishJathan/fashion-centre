export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_KEY = 'fc.theme.v1';
export function parseTheme(raw: string | null): ThemePreference {
  if (raw === null) return 'system';
  const value: unknown = JSON.parse(raw);
  if (value === 'system' || value === 'light' || value === 'dark') return value;
  throw new Error('Invalid theme preference');
}
export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}
