import test from "node:test";
import assert from "node:assert/strict";
import {
  assessAnalysis,
  CaptureGate,
  requiredJoints,
  type NativeAnalysis,
} from "../src/photo/quality.ts";
const good = (): NativeAnalysis => ({
  width: 1080,
  height: 1920,
  brightness: 140,
  sharpness: 150,
  landmarks: requiredJoints.map((name) => ({
    name,
    x: 0.5,
    y: 0.5,
    confidence: 0.9,
  })),
  engine: "synthetic",
});
test("original portrait, resolution, exposure and sharpness rules are enforced", () => {
  assert.equal(assessAnalysis(good()).ready, true);
  assert.equal(assessAnalysis({ ...good(), width: 2000 }).code, "portrait");
  assert.equal(
    assessAnalysis({ ...good(), width: 600, height: 900 }).code,
    "resolution",
  );
  assert.equal(assessAnalysis({ ...good(), brightness: 49 }).code, "dark");
  assert.equal(assessAnalysis({ ...good(), brightness: 221 }).code, "bright");
  assert.equal(assessAnalysis({ ...good(), sharpness: 119 }).code, "blur");
  assert.equal(assessAnalysis({ ...good(), sharpness: 40 }, true).ready, true);
});
test("all nine joints must be confident and inside image margins", () => {
  for (const name of requiredJoints) {
    assert.equal(
      assessAnalysis({
        ...good(),
        landmarks: good().landmarks.filter((p) => p.name !== name),
      }).ready,
      false,
    );
    assert.equal(
      assessAnalysis({
        ...good(),
        landmarks: good().landmarks.map((p) =>
          p.name === name ? { ...p, confidence: 0.5 } : p,
        ),
      }).ready,
      false,
    );
    assert.equal(
      assessAnalysis({
        ...good(),
        landmarks: good().landmarks.map((p) =>
          p.name === name ? { ...p, y: 0.99 } : p,
        ),
      }).ready,
      false,
    );
  }
  assert.equal(
    assessAnalysis({
      ...good(),
      landmarks: [...good().landmarks, good().landmarks[0]],
    }).ready,
    false,
  );
});
test("malformed native readings fail closed", () => {
  for (const bad of [
    { brightness: NaN },
    { sharpness: -1 },
    { width: 0 },
    { height: 13000 },
    { brightness: 256 },
  ])
    assert.throws(() => assessAnalysis({ ...good(), ...bad }));
});
test("automatic capture needs sustained consecutive good observations and resets on interruption", () => {
  const gate = new CaptureGate();
  assert.equal(gate.observe(true, 0), false);
  assert.equal(gate.observe(true, 350), false);
  assert.equal(gate.observe(true, 700), false);
  assert.equal(gate.observe(true, 1050), false);
  assert.equal(gate.observe(true, 1400), true);
  gate.observe(false, 1500);
  assert.equal(gate.observe(true, 1600), false);
  assert.equal(gate.observe(true, 2000), false);
  assert.equal(gate.observe(true, 2400), false);
  assert.equal(gate.observe(true, 3000), true);
  gate.reset();
  assert.equal(gate.observe(true, 4000), false);
});
