import assert from "node:assert/strict";
import test from "node:test";

import {
  BARCODE_ASPECT,
  BARCODE_AXIS,
  BARCODE_MIN_EDGE_PX,
  BARCODE_SYMBOLOGIES,
  QR_ERROR_CORRECTION_DEFAULT,
  barcodePlacement,
  createBarcodeObject,
  gs1CheckDigit,
  normalizeBarcodeValue,
} from "../src/shell/image-editor/design-mode/barcode.ts";
import { SNAPSHOT_PROPS } from "../src/shell/image-editor/editor-objects.ts";

const artboard = { width: 1080, height: 1920 };
const renderer = async () => "data:image/png;base64,AAAA";

test("GS1 check digits match known real-world codes", () => {
  // Well-known published barcodes, used as fixtures rather than as anything
  // the code computes for itself.
  assert.equal(gs1CheckDigit("400638133393"), 1); // EAN-13 4006381333931
  assert.equal(gs1CheckDigit("978020137962"), 4); // ISBN-13 9780201379624
  assert.equal(gs1CheckDigit("9638507"), 4); // EAN-8 96385074
  assert.equal(gs1CheckDigit("03600029145"), 2); // UPC-A 036000291452
});

test("a missing check digit is completed rather than rejected", () => {
  const completed = normalizeBarcodeValue("ean13", "400638133393");
  assert.deepEqual(completed, { ok: true, value: "4006381333931" });

  const already = normalizeBarcodeValue("ean13", "4006381333931");
  assert.deepEqual(already, { ok: true, value: "4006381333931" });
});

test("a wrong check digit is refused with the digit that was expected", () => {
  const wrong = normalizeBarcodeValue("ean13", "4006381333939");
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /末位应该是 1/);
  assert.match(wrong.reason, /扫成别的商品/, "the user needs to know why this matters");
});

test("numeric symbologies refuse letters and wrong lengths", () => {
  assert.equal(normalizeBarcodeValue("ean13", "40063813339A").ok, false);
  assert.equal(normalizeBarcodeValue("ean8", "12345").ok, false);
  assert.equal(normalizeBarcodeValue("upca", "0360002914").ok, false);
  assert.equal(normalizeBarcodeValue("ean8", "9638507").ok, true);
});

test("Code 128 accepts printable ASCII and refuses Chinese", () => {
  assert.equal(normalizeBarcodeValue("code128", "SKU-2026/09-A").ok, true);
  const chinese = normalizeBarcodeValue("code128", "订单号");
  assert.equal(chinese.ok, false);
  assert.match(chinese.reason, /不能放中文/);
});

test("QR capacity is counted in bytes, not characters", () => {
  // 900 Chinese characters is 2700 UTF-8 bytes: comfortably under the 2953
  // character count people assume, and over the 2331-byte limit at level M.
  const payload = "码".repeat(900);
  assert.equal(payload.length, 900);

  const atM = normalizeBarcodeValue("qr", payload);
  assert.equal(atM.ok, false);
  assert.match(atM.reason, /2700 字节/);

  const atL = normalizeBarcodeValue("qr", payload, { errorCorrection: "L" });
  assert.equal(atL.ok, true, "the same payload fits at the lower correction level");
});

test("empty input is refused for every symbology", () => {
  for (const symbology of BARCODE_SYMBOLOGIES) {
    const result = normalizeBarcodeValue(symbology, "   ");
    assert.equal(result.ok, false, symbology);
    assert.match(result.reason, /不能为空/);
  }
});

test("QR is square and barcodes stay wide", () => {
  const qr = barcodePlacement("qr", artboard);
  assert.equal(qr.width, qr.height, "a stretched QR code stops scanning");

  const ean = barcodePlacement("ean13", artboard);
  assert.ok(ean.width > ean.height);
  assert.ok(Math.abs(ean.width / ean.height - BARCODE_ASPECT.ean13) < 0.05);
});

test("symbols are centred by default and never shrink below the scannable size", () => {
  const placed = barcodePlacement("qr", artboard);
  assert.equal(placed.left, Math.round((artboard.width - placed.width) / 2));
  assert.equal(placed.top, Math.round((artboard.height - placed.height) / 2));

  // Asserting `>= BARCODE_MIN_EDGE_PX` alone would pass trivially if the floor
  // were ever set to 0, so the floor itself has to be a scannable size.
  assert.ok(
    BARCODE_MIN_EDGE_PX >= 48,
    "a floor below ~48px is not a floor; printed symbols stop scanning",
  );
  const tiny = barcodePlacement("qr", artboard, { width: 4, height: 4 });
  assert.ok(tiny.width >= BARCODE_MIN_EDGE_PX);
  assert.ok(tiny.height >= BARCODE_MIN_EDGE_PX / BARCODE_ASPECT.qr);
  assert.ok(tiny.width > 4, "the requested 4px must have been raised, not honoured");
});

test("an explicit placement is honoured", () => {
  const placed = barcodePlacement("qr", artboard, { left: 10, top: 20, width: 200, height: 200 });
  assert.deepEqual(placed, { left: 10, top: 20, width: 200, height: 200 });
});

test("a valid request produces a Fabric image object carrying its payload", async () => {
  const result = await createBarcodeObject(
    { symbology: "ean13", value: "400638133393", objectId: "bc1" },
    artboard,
    renderer,
  );
  assert.equal(result.ok, true);
  assert.equal(result.encodedValue, "4006381333931");
  assert.equal(result.object.type, "image");
  assert.equal(result.object.oceanleoId, "bc1");
  assert.equal(result.object.oceanleoAxis, BARCODE_AXIS);
  assert.equal(
    result.object.oceanleoBarcode.value,
    "4006381333931",
    "the completed value must be stored, not the one the user typed",
  );
  assert.equal(result.object.oceanleoBarcode.errorCorrection, QR_ERROR_CORRECTION_DEFAULT);
});

test("a barcode belongs to structure, so a reskin cannot drop it", () => {
  assert.equal(
    BARCODE_AXIS,
    "structure",
    "marking it skin would let a recolour discard the product identity",
  );
});

test("the payload is registered for serialization or it vanishes on save", () => {
  assert.ok(
    SNAPSHOT_PROPS.includes("oceanleoBarcode"),
    "Fabric 6 drops undeclared custom properties from toObject() (carrier spec §6.2)",
  );
});

test("an invalid payload never reaches the encoder", async () => {
  let called = 0;
  const result = await createBarcodeObject(
    { symbology: "ean13", value: "4006381333939", objectId: "bc2" },
    artboard,
    async () => {
      called += 1;
      return "data:image/png;base64,AAAA";
    },
  );
  assert.equal(result.ok, false);
  assert.equal(called, 0);
  assert.equal(result.object, undefined);
});

test("an encoder that cannot draw the symbol is reported, not ignored", async () => {
  const result = await createBarcodeObject(
    { symbology: "qr", value: "https://oceanleo.com", objectId: "bc3" },
    artboard,
    async () => null,
  );
  assert.equal(result.ok, false);
  assert.match(result.reason, /生成条码图形失败/);
});
