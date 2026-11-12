import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraStageHeight,
  previewHeight,
  otpFieldMetrics,
} from "../src/photo/layout.ts";

test("account photo previews fit compact phones and stay bounded on tablets", () => {
  assert.equal(previewHeight(244, 568), 273);
  assert.equal(previewHeight(1000, 1200), 420);
  assert.equal(previewHeight(300, 800, true), 270);
  assert.equal(previewHeight(800, 1200, true), 300);
  assert.ok(previewHeight(200, 320) >= 160);
});

test("camera framing responds to rotation and compact screen height", () => {
  assert.equal(cameraStageHeight(280, 568), 284);
  assert.equal(cameraStageHeight(700, 390), 220);
  assert.equal(cameraStageHeight(900, 1300), 480);
});

test("invalid initial layout measurements use bounded fallback dimensions", () => {
  for (const value of [0, -1, NaN, Infinity]) {
    assert.equal(previewHeight(value, value), 307);
    assert.equal(cameraStageHeight(value, value), 320);
  }
});

test("six-digit OTP uses explicit line height and fits narrow inputs at accessibility sizes", () => {
  for (const width of [180, 220, 280, 600]) {
    for (const scale of [1, 1.5, 2, 3.5]) {
      const metrics = otpFieldMetrics(width, scale);
      assert.ok(metrics.lineHeight > metrics.fontSize);
      assert.ok(
        (metrics.fontSize * 6 * 0.66 + metrics.letterSpacing * 6) * scale <=
          width - 32 + 0.001,
      );
      assert.ok(metrics.minHeight >= metrics.lineHeight * scale + 28);
    }
  }
  assert.ok(
    otpFieldMetrics(240, 2).fontSize * 2 > otpFieldMetrics(240, 1).fontSize,
  );
});
