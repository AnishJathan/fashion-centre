import test from "node:test";
import assert from "node:assert/strict";
import { CaptureGate } from "../src/photo/quality.ts";
import { runCaptureStep, shouldStopScanner } from "../src/photo/scanSession.ts";
function setup() {
  let active = true,
    now = 0,
    n = 0;
  const removed: string[] = [],
    capture: number[] = [],
    gate = new CaptureGate();
  const options = {
    active: () => active,
    gate,
    now: () => now,
    capture: async (q: number) => {
      capture.push(q);
      return { uri: "file://frame-" + ++n };
    },
    analyze: async () => ({
      ready: true,
      code: "ready" as const,
      message: "Hold still",
    }),
    normalize: async () => ({ uri: "file://normalized" }),
    validate: async () => {},
    remove: async (uri: string) => {
      removed.push(uri);
    },
    message: () => {},
  };
  return {
    options,
    removed,
    capture,
    setTime: (v: number) => {
      now = v;
    },
    stop: () => {
      active = false;
    },
  };
}
test("automatic capture waits for sustained good samples then validates final image", async () => {
  const s = setup();
  for (const t of [0, 500, 1000]) {
    s.setTime(t);
    assert.equal(await runCaptureStep(s.options), null);
  }
  s.setTime(1500);
  assert.deepEqual(await runCaptureStep(s.options), {
    uri: "file://normalized",
  });
  assert.deepEqual(s.capture, [0.35, 0.35, 0.35, 0.35, 0.92]);
  assert.equal(s.removed.length, 5);
  assert.equal(s.removed.includes("file://normalized"), false);
});
test("cancel during analysis discards late sample without full-resolution capture", async () => {
  const s = setup();
  s.options.analyze = async () => {
    s.stop();
    return { ready: true, code: "ready", message: "ok" };
  };
  assert.equal(await runCaptureStep(s.options), null);
  assert.deepEqual(s.capture, [0.35]);
  assert.equal(s.removed.length, 1);
});
test("failed final validation removes normalized personal image and both raw frames", async () => {
  const s = setup();
  for (const t of [0, 500, 1000]) s.options.gate.observe(true, t);
  s.setTime(1500);
  s.options.validate = async () => {
    throw Error("blurry");
  };
  await assert.rejects(runCaptureStep(s.options), /blurry/);
  assert.deepEqual(s.removed, [
    "file://frame-1",
    "file://frame-2",
    "file://normalized",
  ]);
});
test("closed session never opens camera and cancellation after normalization clears image", async () => {
  const s = setup();
  s.stop();
  assert.equal(await runCaptureStep(s.options), null);
  assert.equal(s.capture.length, 0);
  const p = setup();
  for (const t of [0, 500, 1000]) p.options.gate.observe(true, t);
  p.setTime(1500);
  p.options.normalize = async () => {
    p.stop();
    return { uri: "file://normalized" };
  };
  assert.equal(await runCaptureStep(p.options), null);
  assert.ok(p.removed.includes("file://normalized"));
});

test("permission sheet does not cancel first scan, real background does",()=>{assert.equal(shouldStopScanner("inactive",true),false);assert.equal(shouldStopScanner("inactive",false),true);assert.equal(shouldStopScanner("background",true),true);assert.equal(shouldStopScanner("active",false),false);});
