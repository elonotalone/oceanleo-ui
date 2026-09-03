/**
 * QR code and barcode objects for design mode (task criterion 2, last item).
 *
 * This module owns everything *except* the glyph generation: what the user is
 * allowed to encode, how the symbol is placed and sized on the artboard, and
 * how it round-trips through the carrier. Turning a payload into modules or
 * bars needs an encoder library, and only W01 may add dependencies (§10 rule
 * 4), so `signals/deps-requests.md` #2 asks for `qrcode` + `jsbarcode` and the
 * renderer is injected here rather than guessed at.
 *
 * Splitting it this way is not just protocol compliance: input validation is
 * where the user-visible failures live. A barcode with a wrong check digit
 * scans as the wrong product, and no encoder library will catch that for you —
 * `jsbarcode` will happily draw whatever digits it is handed.
 */

import type { FabricCarrierAxis } from "../fabric-carrier-schema";

export type BarcodeSymbology = "qr" | "ean13" | "ean8" | "code128" | "upca";

export const BARCODE_SYMBOLOGIES: readonly BarcodeSymbology[] = Object.freeze([
  "qr",
  "ean13",
  "ean8",
  "code128",
  "upca",
]);

/**
 * QR error-correction levels, lowest to highest redundancy. `M` is the default
 * because printed marketing material gets creased and photographed at an
 * angle; `L` only pays off when the payload is near the capacity limit.
 */
export type QrErrorCorrection = "L" | "M" | "Q" | "H";

export const QR_ERROR_CORRECTION_DEFAULT: QrErrorCorrection = "M";

/**
 * Byte-mode capacity at version 40 for each correction level. Used to reject
 * an over-long payload with a clear message instead of letting the encoder
 * throw something opaque at the user.
 */
const QR_BYTE_CAPACITY: Readonly<Record<QrErrorCorrection, number>> = Object.freeze({
  L: 2953,
  M: 2331,
  Q: 1663,
  H: 1273,
});

export type BarcodeRejection =
  | { ok: true; value: string }
  | { ok: false; reason: string };

const DIGITS_ONLY = /^\d+$/;
/** Code 128 covers the printable ASCII range; anything else cannot be encoded. */
const CODE128_RANGE = /^[\x20-\x7e]+$/;

/**
 * GS1 check digit: weight the digits 1,3,1,3… from the right, then take the
 * amount needed to reach the next multiple of ten. EAN-8, EAN-13 and UPC-A all
 * use it, differing only in length.
 */
export function gs1CheckDigit(digitsWithoutCheck: string): number {
  let sum = 0;
  const reversed = [...digitsWithoutCheck].reverse();
  reversed.forEach((digit, index) => {
    sum += Number(digit) * (index % 2 === 0 ? 3 : 1);
  });
  return (10 - (sum % 10)) % 10;
}

const FIXED_LENGTHS: Partial<Record<BarcodeSymbology, number>> = {
  ean13: 13,
  ean8: 8,
  upca: 12,
};

/**
 * Validates a payload for the chosen symbology, and completes the check digit
 * when the user leaves it off — which is what they normally have to hand, since
 * product codes are quoted without it as often as with it.
 */
export function normalizeBarcodeValue(
  symbology: BarcodeSymbology,
  raw: string,
  options: { errorCorrection?: QrErrorCorrection } = {},
): BarcodeRejection {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, reason: "内容不能为空。" };

  if (symbology === "qr") {
    const level = options.errorCorrection ?? QR_ERROR_CORRECTION_DEFAULT;
    // Capacity is counted in bytes, not characters: one Chinese character is
    // three bytes in UTF-8, so a character-length check would let a payload
    // through that the encoder then refuses.
    const bytes = new TextEncoder().encode(value).length;
    const capacity = QR_BYTE_CAPACITY[level];
    if (bytes > capacity) {
      return {
        ok: false,
        reason: `内容有 ${bytes} 字节，超过纠错等级 ${level} 的上限 ${capacity} 字节；缩短内容或把纠错等级调低。`,
      };
    }
    return { ok: true, value };
  }

  if (symbology === "code128") {
    if (!CODE128_RANGE.test(value)) {
      return { ok: false, reason: "Code 128 只能编码可打印的 ASCII 字符，不能放中文。" };
    }
    return { ok: true, value };
  }

  const total = FIXED_LENGTHS[symbology]!;
  if (!DIGITS_ONLY.test(value)) {
    return { ok: false, reason: `${symbology.toUpperCase()} 只能是数字。` };
  }
  if (value.length === total - 1) {
    return { ok: true, value: `${value}${gs1CheckDigit(value)}` };
  }
  if (value.length !== total) {
    return {
      ok: false,
      reason: `${symbology.toUpperCase()} 需要 ${total} 位数字（或 ${total - 1} 位由我们补校验位），现在是 ${value.length} 位。`,
    };
  }
  const expected = gs1CheckDigit(value.slice(0, -1));
  if (Number(value.at(-1)) !== expected) {
    return {
      ok: false,
      reason: `校验位不对：末位应该是 ${expected}。这样的码印出来会扫成别的商品。`,
    };
  }
  return { ok: true, value };
}

export interface BarcodePlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * QR symbols are square and barcodes are wide; keeping the caller from having
 * to know that is the difference between a scannable symbol and a stretched
 * one that no reader will accept.
 */
export const BARCODE_ASPECT: Readonly<Record<BarcodeSymbology, number>> = Object.freeze({
  qr: 1,
  ean13: 1.45,
  ean8: 1.2,
  code128: 2,
  upca: 1.45,
});

/** Below roughly this size a printed symbol stops scanning reliably. */
export const BARCODE_MIN_EDGE_PX = 64;

export function barcodePlacement(
  symbology: BarcodeSymbology,
  artboard: { width: number; height: number },
  request: Partial<BarcodePlacement> = {},
): BarcodePlacement {
  const aspect = BARCODE_ASPECT[symbology];
  const width = Math.max(
    BARCODE_MIN_EDGE_PX,
    Math.round(request.width ?? Math.min(artboard.width * 0.25, 320)),
  );
  const height = Math.max(
    BARCODE_MIN_EDGE_PX / aspect,
    Math.round(request.height ?? width / aspect),
  );
  return {
    width,
    height,
    left: Math.round(request.left ?? (artboard.width - width) / 2),
    top: Math.round(request.top ?? (artboard.height - height) / 2),
  };
}

export interface BarcodeObjectRequest {
  symbology: BarcodeSymbology;
  value: string;
  errorCorrection?: QrErrorCorrection;
  placement?: Partial<BarcodePlacement>;
  foreground?: string;
  background?: string;
  objectId: string;
}

export interface BarcodeRenderer {
  /** Returns the symbol as an image data URL, or null when it cannot encode. */
  (input: {
    symbology: BarcodeSymbology;
    value: string;
    errorCorrection: QrErrorCorrection;
    width: number;
    height: number;
    foreground: string;
    background: string;
  }): Promise<string | null>;
}

/**
 * Stored on the Fabric object as `oceanleoBarcode`, and registered in
 * `SNAPSHOT_PROPS`: Fabric 6 silently drops custom properties that are not
 * declared, so an unregistered payload would survive in memory and vanish on
 * save (carrier spec §6.2, trap two).
 */
export interface BarcodePayload {
  symbology: BarcodeSymbology;
  value: string;
  errorCorrection: QrErrorCorrection;
  foreground: string;
  background: string;
}

export interface BarcodeObjectResult {
  ok: boolean;
  reason?: string;
  object?: Record<string, unknown>;
  /** The value actually encoded, with any completed check digit. */
  encodedValue?: string;
}

/**
 * A barcode is `structure`, not `skin`: it carries the product identity, and a
 * reskin that swapped or dropped it would change what the artwork *means*.
 * The payload is kept on the object so the symbol can be re-encoded at a
 * different size later without asking the user to type it again.
 */
export const BARCODE_AXIS: FabricCarrierAxis = "structure";

export async function createBarcodeObject(
  request: BarcodeObjectRequest,
  artboard: { width: number; height: number },
  render: BarcodeRenderer,
): Promise<BarcodeObjectResult> {
  const normalized = normalizeBarcodeValue(request.symbology, request.value, {
    errorCorrection: request.errorCorrection,
  });
  if (!normalized.ok) return { ok: false, reason: normalized.reason };

  const placement = barcodePlacement(request.symbology, artboard, request.placement);
  const errorCorrection = request.errorCorrection ?? QR_ERROR_CORRECTION_DEFAULT;
  const foreground = request.foreground ?? "#000000";
  const background = request.background ?? "#ffffff";

  const source = await render({
    symbology: request.symbology,
    value: normalized.value,
    errorCorrection,
    width: placement.width,
    height: placement.height,
    foreground,
    background,
  });
  if (!source) {
    return { ok: false, reason: "生成条码图形失败，请检查内容后重试。" };
  }

  return {
    ok: true,
    encodedValue: normalized.value,
    object: {
      type: "image",
      src: source,
      ...placement,
      oceanleoId: request.objectId,
      oceanleoAxis: BARCODE_AXIS,
      oceanleoKind: "barcode",
      oceanleoBarcode: {
        symbology: request.symbology,
        value: normalized.value,
        errorCorrection,
        foreground,
        background,
      },
    },
  };
}
