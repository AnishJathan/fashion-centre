import assert from "node:assert/strict";
import test from "node:test";
import { cleanRoute, parseLink, routeNames } from "../src/navigation.ts";
import {
  metrics,
  pageLayout,
  palettes,
  visibleBadgeCount,
} from "../src/design.ts";
import {
  activeTab,
  isRootTab,
  tabDestination,
} from "../src/shellPresentation.ts";
const luminance = (hex: string) => {
  const rgb = hex
    .slice(1)
    .match(/../g)!
    .map((h) => parseInt(h, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a: string, b: string) => {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
test("mobile layouts retain padding, bounded tablet width and large-text compact behavior", () => {
  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    const layout = pageLayout(width);
    assert.ok(layout.horizontal >= 12);
    assert.ok(
      layout.contentWidth <= metrics.maxContentWidth - layout.horizontal * 2,
    );
    assert.ok(layout.contentWidth < width);
  }
  assert.equal(pageLayout(390, 1.5).compact, true);
  assert.equal(pageLayout(320).compact, true);
  assert.equal(pageLayout(1024).tablet, true);
  assert.equal(metrics.touch >= 48, true);
  assert.equal(pageLayout(Number.NaN).contentWidth, 366);
});
test("body, muted, accent and feedback text meet normal-size contrast in both themes", () => {
  for (const p of Object.values(palettes)) {
    for (const bg of [p.background, p.surface, p.tint]) {
      assert.ok(contrast(p.text, bg) >= 4.5);
      assert.ok(contrast(p.muted, bg) >= 4.5);
      assert.ok(contrast(p.accent, bg) >= 4.5);
      assert.ok(contrast(p.success, bg) >= 4.5);
      assert.ok(contrast(p.controlLine, bg) >= 3);
    }
    assert.ok(contrast(p.controlLine, p.surface) >= 3);
    assert.ok(contrast(p.onAccent, p.accent) >= 4.5);
    assert.ok(contrast(p.error, p.errorSurface) >= 4.5);
  }
});
test("Fashion Centre uses electric ocean blue, cool surfaces and deep ink without the rejected purple palette", () => {
  assert.equal(palettes.light.accent, "#0057D9");
  assert.equal(palettes.dark.accent, "#72B6FF");
  assert.equal(palettes.light.background, "#F5F9FF");
  assert.equal(palettes.light.text, "#101B2D");
  assert.equal(palettes.dark.background, "#0B1424");
  assert.equal(palettes.dark.surface, "#142137");
  const retired = ["#5D35F2", "#C6A5FF", "#EDE5FC", "#342342", "#A5442D", "#F1A88B", "#FBF8F3"];
  for (const palette of Object.values(palettes)) {
    for (const color of Object.values(palette)) assert.ok(!retired.includes(color));
  }
});
test("native tabs identify nested destinations and retain only intended store scope", () => {
  assert.equal(activeTab("product"), "home");
  assert.equal(activeTab("orders"), "cart");
  assert.equal(activeTab("order"), "cart");
  assert.equal(activeTab("stores"), "home");
  assert.equal(activeTab("brands"), "home");
  assert.equal(activeTab("settings"), "profile");
  assert.equal(isRootTab("settings"), false);
  assert.equal(isRootTab("checkout"), false);
  assert.equal(isRootTab("cart"), true);
  assert.deepEqual(
    tabDestination("home", {
      name: "product",
      brandId: "mock",
      productId: "mock:123",
    }),
    { name: "brand", brandId: "mock" },
  );
  assert.deepEqual(
    tabDestination("brands", { name: "cart", brandId: "mock" }),
    { name: "brands" },
  );
  assert.deepEqual(
    tabDestination("cart", { name: "product", brandId: "mock" }),
    { name: "cart", brandId: "mock" },
  );
  assert.equal(visibleBadgeCount(0), "0");
  assert.equal(visibleBadgeCount(1000), "99+");
});


test("removed wishlist route cannot be reached through old links or register as a tab", () => {
  assert.equal((routeNames as readonly string[]).includes("saved"), false);
  for (const link of ["fashioncentre://saved", "fashioncentre://saved?brand=mock", "#/saved", "/saved", "fashioncentre://wishlist"]) {
    assert.equal(parseLink(link), null);
  }
  assert.deepEqual(cleanRoute({ name: "saved" as any }), { name: "home" });
  assert.equal(isRootTab("saved" as any), false);
});
