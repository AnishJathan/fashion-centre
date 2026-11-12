import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import * as experience from '../src/brandExperience.ts';
import { palettes } from '../src/design.ts';

const source = ts.transpileModule(fs.readFileSync(new URL('../src/BrandRailBadge.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
type Element = { type: string; props: any };
function badge(id: string, name: string, theme: 'light' | 'dark', platform = 'ios') {
  const React = { Fragment: 'Fragment', createElement: (type: string, props: any, ...children: any[]) => ({ type, props: { ...props, children } }) };
  const modules: Record<string, any> = {
    react: { __esModule: true, default: React },
    'react-native': { Text: 'Text', View: 'View', Platform: { select: (values: any) => values[platform] ?? values.default } },
    'react-native-svg': { __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect' },
    './brandExperience': experience,
  };
  const module = { exports: {} as any };
  new Function('require', 'module', 'exports', 'fetch', source)((name: string) => {
    assert.ok(name in modules, `Unexpected dependency: ${name}`); return modules[name];
  }, module, module.exports, () => assert.fail('Local identity graphics must not request assets'));
  const root: Element = module.exports.BrandRailBadge({ id, name, theme });
  const nodes = (value: any): Element[] => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === 'object' ? [value, ...nodes(value.props?.children)] : [];
  return { root, all: nodes(root) };
}

test('rail identities use small circular original monograms and restrained decorative rings', () => {
  const structures: string[] = [];
  for (const [id, identity] of [['atelier-demo', 'atelier'], ['everyday-demo', 'everyday'], ['b', 'studio'], ['c', 'terra']]) {
    assert.equal(experience.brandIdentity(id), identity);
    const { root, all } = badge(id, 'Example Demo', 'light');
    assert.equal(root.props.style.width, 34);
    assert.equal(root.props.style.height, 34);
    assert.equal(root.props.style.borderRadius, 17);
    assert.equal(root.props.style.borderWidth, 1);
    const disk = root.props.children[0];
    assert.equal(disk.props.style.width, 26);
    assert.equal(disk.props.style.height, 26);
    assert.equal(disk.props.style.borderRadius, 13);
    assert.equal(disk.props.style.overflow, 'hidden');
    assert.equal(root.props.style.width - root.props.style.borderWidth * 2 - disk.props.style.width, 6, 'The circular monogram has a visible gap inside the ring');
    assert.equal(root.props.style.flexShrink, 0);
    assert.equal(root.props.accessible, false);
    assert.equal(root.props.importantForAccessibility, 'no-hide-descendants');
    assert.equal(root.props.pointerEvents, 'none');
    assert.equal(all.filter(node => node.type === 'Text').length, 1);
    assert.equal(all.find(node => node.type === 'Text')!.props.children.join(''), 'ED');
    assert.equal(all.some(node => ['Image', 'Photo'].includes(node.type)), false);
    assert.equal(all.find(node => node.type === 'Svg')!.props.focusable, false);
    assert.equal(all.find(node => node.type === 'Svg')!.props.width, 26);
    assert.equal(all.find(node => node.type === 'Svg')!.props.height, 26);
    structures.push(JSON.stringify(all.filter(node => ['Circle', 'Rect', 'Path'].includes(node.type))));
  }
  assert.equal(new Set(structures).size, 4, 'Identity should change the drawing, not just its colour');
});

test('local monograms reflect current names and stay fixed while the adjacent accessible name scales', () => {
  for (const name of ['Renamed Store', 'Élan Démo', '  Single  ', 'A Very Long Renamed Store']) {
    const label = badge('atelier-demo', name, 'light').all.find(node => node.type === 'Text')!;
    const expected = name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase();
    assert.equal(label.props.children.join(''), expected);
    assert.equal(label.props.allowFontScaling, false);
    assert.ok(label.props.style.fontSize <= 13);
  }
  for (const [platform, expected] of [['ios', 'Georgia'], ['android', 'serif'], ['web', 'Georgia']]) {
    assert.equal(badge('atelier-demo', 'Atelier Demo', 'light', platform).all.find(node => node.type === 'Text')!.props.style.fontFamily, expected);
  }
});

const luminance = (hex: string) => {
  const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
};
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);

test('every rail identity has readable names and initials in both light and dark appearances', () => {
  for (const id of ['atelier-demo', 'everyday-demo', 'b', 'c']) {
    for (const theme of ['light', 'dark'] as const) {
      const p = experience.brandExperience(id, theme).palette;
      assert.ok(contrast(p.text, palettes[theme].background) >= 4.5, `${id} ${theme} name on transparent rail`);
      assert.ok(contrast(p.text, p.tint) >= 4.5, `${id} ${theme} pressed name`);
      assert.ok(contrast(p.onAccent, p.accent) >= 4.5, `${id} ${theme} initials`);
      const { root, all } = badge(id, 'Example Demo', theme);
      assert.equal(root.props.style.backgroundColor, p.background);
      assert.equal(root.props.style.borderColor, p.accent);
      assert.equal(root.props.children[0].props.style.backgroundColor, p.accent);
      assert.equal(all.find(node => node.type === 'Text')!.props.style.color, p.onAccent);
    }
  }
});
