import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeQrByteMode,
  deinterleaveQrData,
  encodeQrMatrix,
  formatBits,
  readQrCodewords,
  reedSolomonGenerator,
} from "../src/shell/share/share-qr.ts";

/** 独立于被测代码另算一张反对数表，用来把规范里的 α 指数翻成整数系数。 */
function antilogTable() {
  const exp = new Array(255);
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    exp[index] = value;
    value = ((value << 1) ^ (value & 0x80 ? 0x11d : 0)) & 0xff;
  }
  return exp;
}

test("GF(256) 生成多项式与 ISO/IEC 18004 附录 A 的 α 指数逐项一致", () => {
  const exp = antilogTable();
  // 规范给的是 α 指数；代码里存的是整数系数，比较前先换算。
  const spec10 = [251, 67, 46, 61, 118, 70, 64, 94, 32, 45];
  const spec16 = [
    120, 104, 107, 109, 102, 161, 76, 3, 91, 191, 147, 169, 182, 194, 225, 120,
  ];
  assert.deepEqual(
    reedSolomonGenerator(10),
    spec10.map((exponent) => exp[exponent]),
  );
  assert.deepEqual(
    reedSolomonGenerator(16),
    spec16.map((exponent) => exp[exponent]),
  );
});

test("M 级格式信息位与 ISO/IEC 18004 附表逐位一致", () => {
  const expected = [
    "101010000010010",
    "101000100100101",
    "101111001111100",
    "101101101001011",
    "100010111111001",
    "100000011001110",
    "100111110010111",
    "100101010100000",
  ];
  for (let mask = 0; mask < 8; mask += 1) {
    assert.equal(
      formatBits(mask).toString(2).padStart(15, "0"),
      expected[mask],
      `掩码 ${mask} 的格式信息不对`,
    );
  }
});

test("分享链接编码成合法矩阵：尺寸、定位图形、时序列、固定暗格", () => {
  const matrix = encodeQrMatrix("https://oceanleo.com/share/aB3xY7zQ");
  assert.ok(matrix);
  assert.equal(matrix.size, matrix.version * 4 + 17);
  const at = (x, y) => matrix.modules[y][x];

  // 三个角的定位图形（7×7 的回字）。
  for (const [ox, oy] of [
    [0, 0],
    [matrix.size - 7, 0],
    [0, matrix.size - 7],
  ]) {
    for (let dy = 0; dy < 7; dy += 1) {
      for (let dx = 0; dx < 7; dx += 1) {
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        assert.equal(
          at(ox + dx, oy + dy),
          ring !== 2,
          `定位图形 (${ox + dx},${oy + dy}) 不对`,
        );
      }
    }
  }
  // 时序列黑白相间。
  for (let index = 8; index < matrix.size - 8; index += 1) {
    assert.equal(at(6, index), index % 2 === 0);
    assert.equal(at(index, 6), index % 2 === 0);
  }
  // 规范要求恒为暗的那一格。
  assert.equal(at(8, matrix.size - 8), true);
});

test("布点 + 掩码 + 交织可逆：矩阵能读回原始链接", () => {
  for (const text of [
    "https://oceanleo.com/share/abc123",
    "https://leoimage.oceanleo.com/share/0123456789abcdef0123456789abcdef",
    "https://oceanleo.com/share/短链也要能扫",
  ]) {
    const matrix = encodeQrMatrix(text);
    assert.ok(matrix, `${text} 应当能编码`);
    const data = deinterleaveQrData(readQrCodewords(matrix), matrix.version);
    assert.equal(decodeQrByteMode(data, matrix.version), text);
  }
});

test("空串不出二维码；超长内容不崩，只是拿不到矩阵", () => {
  assert.equal(encodeQrMatrix(""), null);
  assert.equal(encodeQrMatrix("x".repeat(20000)), null);
});
