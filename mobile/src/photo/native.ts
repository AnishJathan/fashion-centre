import { File } from "expo-file-system";
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
export async function inspectFile(uri: string, declaredType?: string) {
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
  const type = validatePhotoHeader(declaredType, info.size, bytes);
  const dimensions = encodedDimensions(type, bytes);
  if (!dimensions) throw new Error("Unsupported or damaged image dimensions.");
  validateDimensions(dimensions.width, dimensions.height);
  if (type === "image/png") validateStillPng(bytes);
  return dimensions;
}
let pickerOpen = false;
export function isPickingLibraryPhoto() { return pickerOpen; }
async function chooseLibraryPhoto(options: Picker.ImagePickerOptions) {
  pickerOpen = true;
  try { return await Picker.launchImageLibraryAsync(options); }
  finally { pickerOpen = false; }
}
export async function takePhoto(source: "camera" | "library" = "camera"): Promise<LocalPhoto | null> {
  if (source === "camera" && !(await Picker.requestCameraPermissionsAsync()).granted) {
    throw new Error("Camera access was not granted. You can change access in your device settings.");
  }
  const options: Picker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: false,
    quality: 1,
    base64: false,
    exif: false,
  };
  const result = source === "library" ? await chooseLibraryPhoto(options) : await Picker.launchCameraAsync(options);
  if (result.canceled) return null;
  const { uri } = result.assets[0];
  try {
    // The system picker can label a supported photo with the wrong MIME type.
    return await normalizeLocalPhoto(uri);
  } finally {
    if (FS.cacheDirectory && uri.startsWith(FS.cacheDirectory))
      await FS.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}

/** Produces a private, metadata-stripped JPEG in the app cache; caller owns cleanup. */
export async function normalizeLocalPhoto(
  uri: string,
  declaredType?: string,
): Promise<LocalPhoto> {
  await inspectFile(uri, declaredType);
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
  form.append(key, new File(photo.uri), photo.name);
}
