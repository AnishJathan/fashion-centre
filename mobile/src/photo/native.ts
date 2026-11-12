import * as FS from "expo-file-system/legacy";
import * as Picker from "expo-image-picker";
import * as Manipulator from "expo-image-manipulator";
import {
  encodedDimensions,
  validateDimensions,
  validatePhotoHeader,
  validateStillPng,
  resolutionWarning,
  MAX_PHOTO_BYTES,
} from "./validation";
export type LocalPhoto = {
  uri: string;
  name: string;
  type: string;
  width: number;
  height: number;
  warning: string;
};
export async function discard(photo: LocalPhoto | null) {
  if (photo)
    await FS.deleteAsync(photo.uri, { idempotent: true }).catch(() => {});
}
function decode64(s: string) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let bits = 0,
    value = 0,
    index = 0;
  for (const c of s) {
    const n = alphabet.indexOf(c);
    if (n < 0) continue;
    value = (value << 6) | n;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[index++] = (value >> bits) & 255;
    }
  }
  return out.subarray(0, index);
}
export async function inspectFile(uri: string, type: string) {
  const info = await FS.getInfoAsync(uri);
  if (
    !info.exists ||
    info.isDirectory ||
    !("size" in info) ||
    info.size <= 0 ||
    info.size > MAX_PHOTO_BYTES
  )
    throw new Error("Choose a non-empty image no larger than 10 MiB.");
  // Refuse an oversized file before any byte read; read at most the validated limit.
  const bytes = decode64(
    await FS.readAsStringAsync(uri, {
      encoding: FS.EncodingType.Base64,
      position: 0,
      length: info.size,
    }),
  );
  validatePhotoHeader(type, info.size, bytes);
  const dimensions = encodedDimensions(type, bytes);
  if (!dimensions) throw new Error("Unsupported or damaged image dimensions.");
  validateDimensions(dimensions.width, dimensions.height);
  if (type === "image/png") validateStillPng(bytes);
  return dimensions;
}
export async function choosePhoto(camera: boolean): Promise<LocalPhoto | null> {
  const permission = camera
    ? await Picker.requestCameraPermissionsAsync()
    : await Picker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Permission was not granted. You can change access in your device settings.",
    );
  const options: Picker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
    base64: false,
    exif: false,
  };
  const result = camera
    ? await Picker.launchCameraAsync(options)
    : await Picker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  const type =
    asset.mimeType ||
    (/\.png$/i.test(asset.uri)
      ? "image/png"
      : /\.webp$/i.test(asset.uri)
        ? "image/webp"
        : "image/jpeg");
  try {
    return await normalizeLocalPhoto(asset.uri, type);
  } finally {
    if (FS.cacheDirectory && asset.uri.startsWith(FS.cacheDirectory))
      await FS.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});
  }
}

/** Produces a private, metadata-stripped JPEG in the app cache; caller owns cleanup. */
export async function normalizeLocalPhoto(
  uri: string,
  type = "image/jpeg",
): Promise<LocalPhoto> {
  await inspectFile(uri, type);
  const photo = await Manipulator.manipulateAsync(uri, [], {
    compress: 0.9,
    format: Manipulator.SaveFormat.JPEG,
  });
  try {
    await inspectFile(photo.uri, "image/jpeg");
    validateDimensions(photo.width, photo.height);
    return {
      uri: photo.uri,
      name: "full-body.jpg",
      type: "image/jpeg",
      width: photo.width,
      height: photo.height,
      warning: resolutionWarning(photo.width, photo.height),
    };
  } catch (e) {
    await FS.deleteAsync(photo.uri, { idempotent: true }).catch(() => {});
    throw e;
  }
}
export function appendPhoto(
  form: FormData,
  key: string,
  photo: Pick<LocalPhoto, "uri" | "name" | "type">,
) {
  form.append(key, photo as unknown as Blob);
}
