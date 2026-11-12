import assert from "node:assert/strict";
import test from "node:test";
import {
  analysisCapabilities,
  normalisePhone,
  safeGarmentUrl,
  validateDimensions,
  validatePhotoHeader,
  encodedDimensions,
  validateStillPng,
} from "../src/photo/validation.ts";
test("native analysis does not invent pose, exposure or capture capability", () => {
  assert.equal(analysisCapabilities().fullBody, false);
  assert.equal(analysisCapabilities().brightness, false);
  assert.equal(analysisCapabilities().sharpness, false);
  assert.equal(analysisCapabilities().automaticCapture, false);
  assert.equal(analysisCapabilities(true).fullBody, true);
  assert.equal(analysisCapabilities(true).automaticCapture, true);
});
test("phone normalization matches supported national lengths", () => {
  assert.equal(normalisePhone("+61", "0400 000 000"), "+61400000000");
  assert.equal(normalisePhone("+1", "+1 415 555 0123"), "+14155550123");
  assert.throws(() => normalisePhone("+61", "12"));
});
test("safe garment references reject external hosts and credential URLs", () => {
  assert.equal(
    safeGarmentUrl("/images/demo.jpg", "https://app.example"),
    "https://app.example/images/demo.jpg",
  );
  assert.throws(() =>
    safeGarmentUrl("https://cdn.shopify.com.evil.example/p.jpg", ""),
  );
  assert.throws(() => safeGarmentUrl("https://u:p@cdn.shopify.com/p.jpg", ""));
  assert.throws(() =>
    safeGarmentUrl("/images/../private", "https://app.example"),
  );
});
test("reject invalid file size, mismatched bytes and excessive dimensions", () => {
  assert.throws(() => validatePhotoHeader("image/jpeg", 0, new Uint8Array()));
  assert.throws(() =>
    validatePhotoHeader("image/png", 12, new Uint8Array([255, 216, 255])),
  );
  assert.throws(() => validateDimensions(12001, 100));
  assert.throws(() => validateDimensions(8000, 8000));
  assert.equal(encodedDimensions("image/jpeg", new Uint8Array()), null);
  assert.throws(() => validateStillPng(new Uint8Array(12)));
});
