import assert from "node:assert/strict";
import test from "node:test";
import { shoppingGridLayout } from "../src/shoppingLayout.ts";
import { metrics, pageLayout } from "../src/design.ts";

test("normal phone catalogues use two compact columns without overflowing", () => {
  for (const width of [260, 280, 288, 300, 320, 335, 350, 375, 390, 480]) {
    const layout = shoppingGridLayout(width);
    assert.equal(layout.columns, 2);
    assert.ok(layout.cardWidth >= 126);
    assert.equal(layout.cardWidth * layout.columns + layout.gap, width);
  }
});
test("narrow phones and accessibility text use one readable column", () => {
  for (const [width, fontScale] of [
    [240, 1],
    [259, 1],
    [240, 1.2],
    [335, 1.3],
    [680, 2],
    [800, 3],
  ]) {
    const layout = shoppingGridLayout(width, fontScale);
    assert.equal(layout.columns, 1);
    assert.equal(layout.cardWidth, width);
  }
});
test("layout updates support rotation, font changes and initial zero measurements", () => {
  assert.equal(shoppingGridLayout(300).columns, 2);
  assert.equal(shoppingGridLayout(620).columns, 3);
  assert.equal(shoppingGridLayout(620, 1.5).columns, 1);
  for (const width of [0, -100, NaN, Infinity])
    assert.equal(shoppingGridLayout(width).cardWidth, 1);
});

test("large surfaces show more compact columns without overflow", () => {
  for (const [width, count] of [[520, 3], [680, 3], [700, 4], [960, 4]]) {
    const layout = shoppingGridLayout(width);
    assert.equal(layout.columns, count);
    assert.equal(layout.cardWidth * count + layout.gap * (count - 1), width);
    assert.ok(layout.cardWidth >= 126);
  }
});

test("phone, foldable-window and tablet grids fit actual safe-area content at every text scale", () => {
  for (const width of [320, 344, 360, 390, 430, 540, 720, 768, 884, 1024, 1440]) {
    for (const fontScale of [1, 1.2, 1.3, 1.4, 2, 3]) {
      for (const insets of [{ left: 0, right: 0 }, { left: 48, right: 30 }]) {
        const page = pageLayout(width, fontScale, insets);
        const grid = shoppingGridLayout(page.contentWidth, fontScale);
        const occupied = grid.cardWidth * grid.columns + grid.gap * (grid.columns - 1);
        assert.ok(Math.abs(occupied - page.contentWidth) < 0.001);
        assert.ok(occupied + page.paddingLeft + page.paddingRight <= width + 0.001);
        assert.ok(grid.cardWidth >= 126);
        assert.ok(grid.columns >= 1 && grid.columns <= 4);
        assert.ok(page.paddingLeft >= insets.left);
        assert.ok(page.paddingRight >= insets.right);
        assert.ok(page.contentWidth <= metrics.maxContentWidth - page.paddingLeft - page.paddingRight);
        if (fontScale >= 1.3) assert.equal(grid.columns, 1);
      }
    }
  }
});

test("safe-area layout normalizes missing or transient invalid inset values", () => {
  assert.equal(pageLayout(390).contentWidth, 366);
  assert.equal(pageLayout(390, 1, { left: 48, right: 30 }).contentWidth, 312);
  assert.equal(pageLayout(390, 1, { left: NaN, right: Infinity }).contentWidth, 366);
  assert.equal(pageLayout(390, 1, { left: -10, right: -20 }).contentWidth, 366);
});
