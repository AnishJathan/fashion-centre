import { CaptureGate, type PhotoFeedback } from "./quality.ts";
/** iOS permission sheets temporarily mark the app inactive. Do not close the first scan for that sheet. */
export function shouldStopScanner(state: string, permissionPending: boolean) {
  return state === 'background' || state === 'inactive' && !permissionPending;
}
/** One serialized camera check. All temporary images remain caller-private and are cleaned,
 * including capture/analysis results arriving after the screen has closed. */
export async function runCaptureStep<T extends { uri: string }>(options: {
  active: () => boolean;
  gate: CaptureGate;
  now: () => number;
  capture: (quality: number) => Promise<{ uri: string } | undefined>;
  analyze: (uri: string) => Promise<PhotoFeedback>;
  normalize: (uri: string) => Promise<T>;
  validate: (photo: T) => Promise<void>;
  remove: (uri: string) => Promise<void>;
  message: (message: string) => void;
}): Promise<T | null> {
  let sample: string | undefined,
    final: string | undefined,
    photo: T | null = null;
  try {
    if (!options.active()) return null;
    sample = (await options.capture(0.35))?.uri;
    if (!sample) throw new Error("The camera did not return a photo.");
    if (!options.active()) return null;
    const feedback = await options.analyze(sample);
    if (!options.active()) return null;
    options.message(feedback.message);
    if (!options.gate.observe(feedback.ready, options.now())) return null;
    options.gate.reset();
    options.message("Checking the full-resolution photo…");
    final = (await options.capture(0.92))?.uri;
    if (!final) throw new Error("The camera did not return the final photo.");
    if (!options.active()) return null;
    photo = await options.normalize(final);
    if (!options.active()) return null;
    await options.validate(photo);
    if (!options.active()) return null;
    const accepted = photo;
    photo = null;
    return accepted;
  } catch (error) {
    options.gate.reset();
    throw error;
  } finally {
    for (const uri of [sample, final, photo?.uri])
      if (uri) await options.remove(uri).catch(() => {});
  }
}
