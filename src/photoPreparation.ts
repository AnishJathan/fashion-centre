export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 40000000;
export function validatePhotoHeader(type: string, size: number, bytes: Uint8Array) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type))
        throw new Error('Choose a JPEG, PNG or WebP photo. HEIC, SVG and other formats are not supported in this local preview.');
    if (size === 0 || size > MAX_PHOTO_BYTES)
        throw new Error('Choose a non-empty photo no larger than 10 MiB (local preview limit).');
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b);
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
    if (!((type === 'image/png' && png) || (type === 'image/jpeg' && jpeg) || (type === 'image/webp' && webp)))
        throw new Error('The file contents do not match its image type. Choose an original photo file.');
}
export function resolutionWarning(width: number, height: number) { return Math.min(width, height) < 768 ? 'The shorter edge is below 768 pixels. A sharper original may preserve more detail. This is local guidance, not a Pruna requirement or a quality score.' : ''; }
export async function inspectPhoto(file: File) {
    validatePhotoHeader(file.type, file.size, new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    const bytes = new Uint8Array(await file.arrayBuffer());
    const encoded = encodedDimensions(file.type, bytes);
    if (!encoded)
        throw new Error('This photo could not be decoded. Its image dimensions are missing or unsupported.');
    validateDimensions(encoded.width, encoded.height);
    if (file.type === 'image/png') validateStillPng(bytes);
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    }
    catch {
        throw new Error('This photo could not be decoded. It may be damaged or unsupported.');
    }
    const { width, height } = bitmap;
    bitmap.close();
    if (!width || !height || width > 12000 || height > 12000 || width * height > MAX_PHOTO_PIXELS)
        throw new Error('Photo dimensions exceed this preview’s limit: 12,000 pixels per edge and 40 megapixels.');
    return { width, height, warning: resolutionWarning(width, height) };
}

/** PNG animation is not a still photo. Inspect chunk framing before asking the browser to decode. */
export function validateStillPng(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 8;
    while (at + 12 <= bytes.length) {
        const length = view.getUint32(at), end = at + 12 + length;
        if (end > bytes.length) break;
        const kind = String.fromCharCode(...bytes.slice(at + 4, at + 8));
        if (kind === 'acTL' || kind === 'fcTL' || kind === 'fdAT')
            throw new Error('Choose a still photo. Animated PNG images are not supported.');
        if (kind === 'IEND' && length === 0 && end === bytes.length) return;
        at = end;
    }
    throw new Error('This photo could not be decoded. Its PNG chunk structure is incomplete.');
}
export function encodedDimensions(type: string, bytes: Uint8Array): {
    width: number;
    height: number;
} | null {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), ascii = (at: number, n: number) => String.fromCharCode(...bytes.slice(at, at + n));
    if (type === 'image/png' && bytes.length >= 24 && ascii(12, 4) === 'IHDR')
        return { width: view.getUint32(16), height: view.getUint32(20) };
    if (type === 'image/webp') {
        let at = 12, canvas: {
            width: number;
            height: number;
        } | null = null, frame: {
            width: number;
            height: number;
        } | null = null;
        while (at + 8 <= bytes.length) {
            const kind = ascii(at, 4), length = view.getUint32(at + 4, true), data = at + 8;
            if (data + length > bytes.length)
                return null;
            if (kind === 'VP8X' && length >= 10) {
                if (bytes[data] & 2)
                    return null;
                canvas = { width: 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16), height: 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16) };
            }
            if (kind === 'VP8L' && length >= 5 && bytes[data] === 0x2f) {
                if (frame)
                    return null;
                const bits = view.getUint32(data + 1, true);
                frame = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
            }
            if (kind === 'VP8 ' && length >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 1 && bytes[data + 5] === 0x2a) {
                if (frame)
                    return null;
                frame = { width: view.getUint16(data + 6, true) & 0x3fff, height: view.getUint16(data + 8, true) & 0x3fff };
            }
            at = data + length + (length % 2);
        }
        if (canvas && frame && (canvas.width !== frame.width || canvas.height !== frame.height))
            return null;
        return frame;
    }
    if (type === 'image/jpeg') {
        let at = 2;
        while (at + 3 < bytes.length) {
            if (bytes[at++] !== 255)
                return null;
            while (bytes[at] === 255)
                at++;
            const marker = bytes[at++];
            if (marker === 0xd9 || marker === 0xda)
                return null;
            if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7))
                continue;
            if (at + 2 > bytes.length)
                return null;
            const length = view.getUint16(at);
            if (length < 2 || at + length > bytes.length)
                return null;
            if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7)
                return { height: view.getUint16(at + 3), width: view.getUint16(at + 5) };
            at += length;
        }
    }
    return null;
}
export function validateDimensions(width: number, height: number) { if (!width || !height || width > 12000 || height > 12000 || width * height > MAX_PHOTO_PIXELS)
    throw new Error('Photo dimensions exceed this preview\'s limit: 12,000 pixels per edge and 40 megapixels.'); }
