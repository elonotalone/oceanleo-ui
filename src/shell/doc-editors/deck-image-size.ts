/** Read image dimensions without decoding pixels or loading external resources. */
export function deckImageAspectRatio(bytes: Uint8Array | undefined): number | undefined {
  if (!bytes || bytes.length < 10) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ratio = (width: number, height: number) => width > 0 && height > 0 ? width / height : undefined;
  if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return ratio(view.getUint32(16), view.getUint32(20));
  if (bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70) return ratio(view.getUint16(6, true), view.getUint16(8, true));
  if (bytes[0] === 255 && bytes[1] === 216) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset++] !== 255) continue;
      const marker = bytes[offset++];
      if (marker === 255 || marker === 0 || marker === 216 || marker >= 208 && marker <= 215) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) return ratio(view.getUint16(offset + 5), view.getUint16(offset + 3));
      offset += length;
    }
  }
  if (bytes.length >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") {
    const kind = String.fromCharCode(...bytes.subarray(12, 16));
    if (kind === "VP8X") return ratio(1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16));
    if (kind === "VP8L") return ratio(1 + ((bytes[21] | bytes[22] << 8) & 0x3fff), 1 + ((bytes[22] >> 6 | bytes[23] << 2 | bytes[24] << 10) & 0x3fff));
    if (kind === "VP8 ") return ratio(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
  }
  // AVIF/HEIF image spatial extents (ISO BMFF full box).
  for (let offset = 4; offset + 16 <= Math.min(bytes.length, 1_048_576); offset++) {
    if (bytes[offset] === 105 && bytes[offset + 1] === 115 && bytes[offset + 2] === 112 && bytes[offset + 3] === 101) {
      const size = view.getUint32(offset - 4);
      if (size >= 20 && offset - 4 + size <= bytes.length) return ratio(view.getUint32(offset + 8), view.getUint32(offset + 12));
    }
  }
  if (bytes.length >= 26 && bytes[0] === 66 && bytes[1] === 77) return ratio(Math.abs(view.getInt32(18, true)), Math.abs(view.getInt32(22, true)));
  const svg = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 16384)));
  const root = /<svg\b([^>]*)>/i.exec(svg)?.[1];
  if (root) {
    const dimension = (key: string) => {
      const match = new RegExp(`\\b${key}=["']([\\d.]+)(px|pt|in|cm|mm)?["']`, "i").exec(root);
      const units: Record<string, number> = { pt: 96 / 72, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, px: 1 };
      return match ? Number(match[1]) * (units[match[2]?.toLowerCase()] || 1) : 0;
    };
    const intrinsic = ratio(dimension("width"), dimension("height"));
    if (intrinsic) return intrinsic;
    const box = /\bviewBox=["']([^"']+)["']/i.exec(root)?.[1].trim().split(/[\s,]+/).map(Number);
    if (box?.length === 4) return ratio(box[2], box[3]);
  }
  return undefined;
}
