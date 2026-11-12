export const requiredJoints = [
  "nose",
  "leftShoulder",
  "rightShoulder",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftAnkle",
  "rightAnkle",
] as const;
export type JointName = (typeof requiredJoints)[number];
export interface PosePoint {
  name: JointName;
  x: number;
  y: number;
  confidence: number;
}
export interface NativeAnalysis {
  width: number;
  height: number;
  brightness: number;
  sharpness: number;
  landmarks: PosePoint[];
  engine: string;
}
export type PhotoFeedback = {
  ready: boolean;
  code:
    "ready" | "portrait" | "resolution" | "dark" | "bright" | "blur" | "body";
  message: string;
};
/** Thresholds retained from the original web photo checks. Native models need device calibration. */
export function assessAnalysis(
  input: NativeAnalysis,
  live = false,
): PhotoFeedback {
  if (
    !Number.isSafeInteger(input.width) ||
    !Number.isSafeInteger(input.height) ||
    input.width <= 0 ||
    input.height <= 0 ||
    input.width > 12000 ||
    input.height > 12000 ||
    input.width * input.height > 40000000 ||
    !Number.isFinite(input.brightness) ||
    input.brightness < 0 ||
    input.brightness > 255 ||
    !Number.isFinite(input.sharpness) ||
    input.sharpness < 0 ||
    !Array.isArray(input.landmarks)
  )
    throw new Error("The on-device analyser returned invalid measurements.");
  if (input.height <= input.width)
    return {
      ready: false,
      code: "portrait",
      message: "Hold your phone upright and use a tall full-body photo.",
    };
  if (!live && input.height < 1000)
    return {
      ready: false,
      code: "resolution",
      message: "Use an upright photo at least 1,000 pixels tall.",
    };
  if (input.brightness < 50)
    return {
      ready: false,
      code: "dark",
      message: "Too dark. Move somewhere brighter.",
    };
  if (input.brightness > 220)
    return {
      ready: false,
      code: "bright",
      message: "Too bright. Avoid light behind you.",
    };
  if (input.sharpness < (live ? 40 : 120))
    return {
      ready: false,
      code: "blur",
      message: live
        ? "Hold still…"
        : "The photo looks blurry. Hold still and try again.",
    };
  const visible = (name: JointName) =>
    input.landmarks.filter((p) => p.name === name).length === 1 &&
    input.landmarks.some(
      (p) =>
        p.name === name &&
        Number.isFinite(p.confidence) &&
        p.confidence > 0.5 &&
        p.confidence <= 1 &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.y) &&
        p.x > 0.02 &&
        p.x < 0.98 &&
        p.y > 0.02 &&
        p.y < 0.98,
    );
  if (!requiredJoints.every(visible))
    return {
      ready: false,
      code: "body",
      message: input.landmarks.length
        ? "Step back so your head to your feet are in the frame."
        : "Stand in the frame with your full body visible.",
    };
  return {
    ready: true,
    code: "ready",
    message: live
      ? "Perfect, hold still…"
      : "Your photo passed the on-device checks.",
  };
}
/** Consecutive observations and elapsed time are both required; no capture from one good frame. */
export class CaptureGate {
  private good = 0;
  private started = 0;
  observe(ready: boolean, now: number): boolean {
    if (!ready || !Number.isFinite(now)) {
      this.reset();
      return false;
    }
    if (this.good === 0 || now < this.started) {
      this.started = now;
      this.good = 0;
    }
    this.good++;
    return this.good >= 4 && now - this.started >= 1400;
  }
  reset() {
    this.good = 0;
    this.started = 0;
  }
}
