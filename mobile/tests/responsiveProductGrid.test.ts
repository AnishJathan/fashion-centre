import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as domain from "../src/core/domain.ts";
import * as home from "../src/commerceHome.ts";
import * as layout from "../src/shoppingLayout.ts";
import { pageLayout } from "../src/design.ts";

// Executes the real grid and its onLayout handler, with native boundaries mocked.
// This verifies reflow state and sizing, not native pixels or physical hinges.
const source = ts.transpileModule(
  fs.readFileSync(new URL("../src/ShoppingComponents.tsx", import.meta.url), "utf8"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } },
).outputText;

function harness() {
  let measuredWidth = 0;
  const window = { width: 1024, fontScale: 1 };
  const react = {
    createElement: (type: any, props: any, ...children: any[]) => ({ type, props: { ...props, children } }),
    useState: () => [measuredWidth, (value: number) => { measuredWidth = value; }],
  };
  const modules: Record<string, any> = {
    react: { __esModule: true, default: react, ...react },
    "react-native": { Pressable: "Pressable", Text: "Text", View: "View", useWindowDimensions: () => window },
    "./ui": { ...Object.fromEntries(["Badge", "Body", "Button", "Card", "Heading", "Icon", "Photo", "Title"].map(name => [name, name])), usePalette: () => ({}) },
    "./core/domain": domain,
    "./commerceHome": home,
    "./shoppingLayout": layout,
  };
  const module = { exports: {} as Record<string, any> };
  new Function("require", "module", "exports", source)(
    (name: string) => { assert.ok(name in modules, `Unexpected dependency: ${name}`); return modules[name]; },
    module,
    module.exports,
  );
  const products = Array.from({ length: 12 }, (_, index): domain.Product => ({
    id: `store:${index}`, brandId: "store", brandName: "Store",
    name: `Product ${index}`, category: "Tops", image: "/top.svg",
    variants: [], moreVariants: false,
  }));
  return {
    window,
    render: () => module.exports.ProductGrid({ products, onView() {}, onTryOn() {} }),
  };
}

test("real ProductGrid reflows on parent measurements when folding, resizing and changing text size", () => {
  const h = harness();
  const widths = [320, 344, 360, 390, 430, 540, 720, 768, 884, 1024];
  let grid = h.render();
  for (const width of [...widths, ...widths.toReversed()]) {
    for (const fontScale of [1, 1.2, 1.3, 2, 1]) {
      for (const insets of [{ left: 0, right: 0 }, { left: 48, right: 30 }]) {
        const contentWidth = pageLayout(width, fontScale, insets).contentWidth;
        // Keep the window wide to prove the actual parent measurement wins.
        h.window.fontScale = fontScale;
        grid.props.onLayout({ nativeEvent: { layout: { width: contentWidth } } });
        grid = h.render();
        const cards = grid.props.children.flat();
        assert.equal(cards.length, 12);
        assert.equal(grid.props.style.flexWrap, "wrap");
        const expected = layout.shoppingGridLayout(contentWidth, fontScale);
        for (const card of cards) {
          assert.equal(card.props.style.width, expected.cardWidth);
          assert.ok(card.props.style.width <= contentWidth);
          const viewButton = card.props.children.find((child: any) => child?.props?.accessibilityLabel?.startsWith("View "));
          assert.ok(viewButton.props.style({ pressed: false }).minHeight >= 48);
          const tryOn = card.props.children.find((child: any) => child?.props?.accessibilityLabel?.startsWith("Try on "));
          assert.ok(tryOn.props.style.minHeight >= 48);
        }
        const rowWidth = expected.cardWidth * expected.columns + grid.props.style.gap * (expected.columns - 1);
        assert.ok(rowWidth <= contentWidth + 0.001);
      }
    }
  }
});
