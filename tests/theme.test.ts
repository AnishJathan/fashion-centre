import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { parseTheme, resolveTheme } from '../src/themePreference.ts';

test('theme parser rejects malformed records and respects explicit preferences', () => {
  assert.equal(parseTheme(null), 'system');
  for (const invalid of ['null', '{}', '"sepia"', '{broken']) assert.throws(() => parseTheme(invalid));
  for (const preference of ['light', 'dark', 'system'] as const) {
    assert.equal(parseTheme(JSON.stringify(preference)), preference);
    for (const systemDark of [false, true]) assert.equal(resolveTheme(preference, systemDark), preference === 'system' ? systemDark ? 'dark' : 'light' : preference);
  }
});

test('pre-paint bootstrap matches runtime fallback without writing or repairing storage', () => {
  const script = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
  for (const raw of [null, '"light"', '"dark"', '"system"', '{}', 'broken', 'blocked']) {
    for (const systemDark of [false, true]) {
      const root = { dataset: {} as Record<string, string> };
      runInNewContext(script, { document: { documentElement: root }, localStorage: { getItem: () => { if (raw === 'blocked') throw new Error('blocked'); return raw; }, setItem: () => { throw new Error('unexpected write'); } }, matchMedia: () => ({ matches: systemDark }) });
      let preference: ReturnType<typeof parseTheme> = 'system';
      try { preference = parseTheme(raw); } catch { /* Runtime fallback */ }
      assert.equal(root.dataset.theme, resolveTheme(preference, systemDark));
    }
  }
});
