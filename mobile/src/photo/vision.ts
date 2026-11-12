import { requireOptionalNativeModule } from "expo-modules-core";
import { assessAnalysis, type NativeAnalysis } from "./quality";
import { analysisCapabilities } from "./validation";
interface VisionModule {
  analyze(uri: string, sampleSide: number): Promise<NativeAnalysis>;
}
const module = requireOptionalNativeModule<VisionModule>("FashionVision");
export const hasNativeVision = !!module;
export const capabilities = analysisCapabilities(hasNativeVision);
export const visionUnavailableMessage =
  "On-device photo analysis requires a Fashion Centre development or release build. Expo Go does not include this custom module. Build the app with npm run ios or npm run android.";
export async function analyzePhoto(uri: string, live = false) {
  if (!module) throw new Error(visionUnavailableMessage);
  if (!uri.startsWith("file://"))
    throw new Error("Only temporary local photos can be analysed.");
  const analysis = await module.analyze(uri, live ? 320 : 512);
  return { analysis, feedback: assessAnalysis(analysis, live) };
}
export async function requireGoodPhoto(uri: string) {
  const result = await analyzePhoto(uri);
  if (!result.feedback.ready) throw new Error(result.feedback.message);
  return result.analysis;
}
