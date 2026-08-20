// ============================================================================
// @oceanleo/ui — 二维码编码器（纯函数，无依赖、无 DOM）
// ----------------------------------------------------------------------------
// 长图页脚上的二维码回链到 Copy Link 的同一个地址。为它引一个 npm 包不划算：
// 我们只需要「字节模式 + 纠错级别 M」这一条路径，规范里剩下的模式一概用不上。
//
// 实现按 ISO/IEC 18004：字节模式编码 → 分块 → GF(256) 上的 Reed-Solomon 纠错 →
// 交织 → 布点（跳过时序列）→ 8 种掩码按罚分择优 → 写格式/版本信息。
// 覆盖版本 1–20（M 级最多 ~430 字节），分享链接远用不到上限。
// ============================================================================

/** 纠错级别固定 M（格式信息位 0b00），够用且模块数不至于太密。 */
const ECC_LEVEL_BITS = 0b00;

/** M 级每块的纠错码字数，索引 = 版本号（1–20）。 */
const ECC_PER_BLOCK_M = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26,
  26, 26,
];

/** M 级的分块数，索引 = 版本号（1–20）。 */
const BLOCKS_M = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
];

const MAX_VERSION = 20;

export interface QrMatrix {
  size: number;
  version: number;
  modules: boolean[][];
}

// ---------------------------------------------------------------------------
// GF(256) 算术
// ---------------------------------------------------------------------------

function gfMultiply(left: number, right: number): number {
  let result = 0;
  for (let shift = 7; shift >= 0; shift -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((right >>> shift) & 1) * left;
  }
  return result & 0xff;
}

/** 生成多项式 (x-α⁰)(x-α¹)…；返回不含首项 1 的系数，高次在前。 */
export function reedSolomonGenerator(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let position = 0; position < degree; position += 1) {
      result[position] = gfMultiply(result[position], root);
      if (position + 1 < degree) result[position] ^= result[position + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function reedSolomonRemainder(data: number[], generator: number[]): number[] {
  const result = new Array<number>(generator.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ (result.shift() as number);
    result.push(0);
    for (let index = 0; index < generator.length; index += 1) {
      result[index] ^= gfMultiply(generator[index], factor);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 容量
// ---------------------------------------------------------------------------

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = Math.ceil((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let pos = size - 7; result.length < count; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

function rawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const count = Math.floor(version / 7) + 2;
    result -= (25 * count - 10) * count - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version: number): number {
  return (
    Math.floor(rawDataModules(version) / 8) -
    ECC_PER_BLOCK_M[version] * BLOCKS_M[version]
  );
}

function utf8Bytes(text: string): number[] {
  const out: number[] = [];
  for (const character of text) {
    const point = character.codePointAt(0) as number;
    if (point < 0x80) out.push(point);
    else if (point < 0x800) {
      out.push(0xc0 | (point >> 6), 0x80 | (point & 0x3f));
    } else if (point < 0x10000) {
      out.push(
        0xe0 | (point >> 12),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    } else {
      out.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 0x3f),
        0x80 | ((point >> 6) & 0x3f),
        0x80 | (point & 0x3f),
      );
    }
  }
  return out;
}

function pickVersion(byteCount: number): number {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const lengthBits = version < 10 ? 8 : 16;
    const needed = Math.ceil((4 + lengthBits + byteCount * 8) / 8);
    if (needed <= dataCodewords(version)) return version;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// 编码
// ---------------------------------------------------------------------------

function encodeCodewords(bytes: number[], version: number): number[] {
  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let shift = count - 1; shift >= 0; shift -= 1) {
      bits.push((value >>> shift) & 1);
    }
  };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);

  const capacityBits = dataCodewords(version) * 8;
  push(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      byte = (byte << 1) | bits[index + offset];
    }
    codewords.push(byte);
  }
  for (let pad = 0xec; codewords.length < dataCodewords(version); pad ^= 0xec ^ 0x11) {
    codewords.push(pad);
  }
  return codewords;
}

function interleave(codewords: number[], version: number): number[] {
  const blockCount = BLOCKS_M[version];
  const eccLength = ECC_PER_BLOCK_M[version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlockLength = Math.floor(rawCodewords / blockCount) - eccLength;
  const shortBlockCount = blockCount - (rawCodewords % blockCount);
  const generator = reedSolomonGenerator(eccLength);

  const blocks: number[][] = [];
  const eccBlocks: number[][] = [];
  let cursor = 0;
  for (let index = 0; index < blockCount; index += 1) {
    const length = shortBlockLength + (index < shortBlockCount ? 0 : 1);
    const data = codewords.slice(cursor, cursor + length);
    cursor += length;
    blocks.push(data);
    eccBlocks.push(reedSolomonRemainder(data, generator));
  }

  const result: number[] = [];
  for (let index = 0; index < shortBlockLength + 1; index += 1) {
    for (let block = 0; block < blockCount; block += 1) {
      if (index < blocks[block].length) result.push(blocks[block][index]);
    }
  }
  for (let index = 0; index < eccLength; index += 1) {
    for (let block = 0; block < blockCount; block += 1) {
      result.push(eccBlocks[block][index]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 布点
// ---------------------------------------------------------------------------

interface Canvas {
  size: number;
  modules: boolean[][];
  reserved: boolean[][];
}

function createCanvas(size: number): Canvas {
  const make = () =>
    Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { size, modules: make(), reserved: make() };
}

function setFunction(canvas: Canvas, x: number, y: number, dark: boolean): void {
  if (x < 0 || y < 0 || x >= canvas.size || y >= canvas.size) return;
  canvas.modules[y][x] = dark;
  canvas.reserved[y][x] = true;
}

function drawFinder(canvas: Canvas, centerX: number, centerY: number): void {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunction(
        canvas,
        centerX + dx,
        centerY + dy,
        distance !== 2 && distance !== 4,
      );
    }
  }
}

function drawAlignment(canvas: Canvas, centerX: number, centerY: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      setFunction(
        canvas,
        centerX + dx,
        centerY + dy,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
      );
    }
  }
}

/** BCH(15,5)：格式信息。掩码号 0–7。 */
export function formatBits(mask: number): number {
  const data = (ECC_LEVEL_BITS << 3) | mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return ((data << 10) | remainder) ^ 0x5412;
}

function versionBits(version: number): number {
  let remainder = version;
  for (let index = 0; index < 12; index += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  return (version << 12) | remainder;
}

function drawFunctionPatterns(canvas: Canvas, version: number): void {
  const size = canvas.size;
  for (let index = 0; index < size; index += 1) {
    setFunction(canvas, 6, index, index % 2 === 0);
    setFunction(canvas, index, 6, index % 2 === 0);
  }
  drawFinder(canvas, 3, 3);
  drawFinder(canvas, size - 4, 3);
  drawFinder(canvas, 3, size - 4);

  const positions = alignmentPositions(version);
  for (let i = 0; i < positions.length; i += 1) {
    for (let j = 0; j < positions.length; j += 1) {
      const skipCorner =
        (i === 0 && j === 0) ||
        (i === 0 && j === positions.length - 1) ||
        (i === positions.length - 1 && j === 0);
      if (skipCorner) continue;
      drawAlignment(canvas, positions[i], positions[j]);
    }
  }

  // 格式信息位先按掩码 0 占位，真值在选完掩码后重写。必须走 drawFormat 同一组坐标：
  // 用「row 8 / col 8 全填」去占位会把 (6,8) 与 (8,6) 这两个**时序格**覆盖掉。
  drawFormat(canvas, 0);

  if (version >= 7) {
    const bits = versionBits(version);
    for (let index = 0; index < 18; index += 1) {
      const dark = ((bits >>> index) & 1) === 1;
      const a = size - 11 + (index % 3);
      const b = Math.floor(index / 3);
      setFunction(canvas, a, b, dark);
      setFunction(canvas, b, a, dark);
    }
  }
}

function drawCodewords(canvas: Canvas, data: number[]): void {
  const size = canvas.size;
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    const column = right <= 6 ? right - 1 : right;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = column - offset;
        const upward = ((column + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (canvas.reserved[y][x]) continue;
        if (bitIndex < data.length * 8) {
          const byte = data[bitIndex >>> 3];
          canvas.modules[y][x] = ((byte >>> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex += 1;
        }
      }
    }
  }
}

function maskBit(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
  }
}

function applyMask(canvas: Canvas, mask: number): void {
  for (let y = 0; y < canvas.size; y += 1) {
    for (let x = 0; x < canvas.size; x += 1) {
      if (canvas.reserved[y][x]) continue;
      if (maskBit(mask, x, y)) canvas.modules[y][x] = !canvas.modules[y][x];
    }
  }
}

function drawFormat(canvas: Canvas, mask: number): void {
  const bits = formatBits(mask);
  const size = canvas.size;
  for (let index = 0; index <= 5; index += 1) {
    setFunction(canvas, 8, index, ((bits >>> index) & 1) === 1);
  }
  setFunction(canvas, 8, 7, ((bits >>> 6) & 1) === 1);
  setFunction(canvas, 8, 8, ((bits >>> 7) & 1) === 1);
  setFunction(canvas, 7, 8, ((bits >>> 8) & 1) === 1);
  for (let index = 9; index < 15; index += 1) {
    setFunction(canvas, 14 - index, 8, ((bits >>> index) & 1) === 1);
  }
  for (let index = 0; index < 8; index += 1) {
    setFunction(canvas, size - 1 - index, 8, ((bits >>> index) & 1) === 1);
  }
  for (let index = 8; index < 15; index += 1) {
    setFunction(canvas, 8, size - 15 + index, ((bits >>> index) & 1) === 1);
  }
  setFunction(canvas, 8, size - 8, true);
}

function penalty(canvas: Canvas): number {
  const size = canvas.size;
  const at = (x: number, y: number) => canvas.modules[y][x];
  let score = 0;

  const runScore = (run: number) => (run >= 5 ? run - 2 : 0);
  for (let y = 0; y < size; y += 1) {
    let run = 1;
    for (let x = 1; x < size; x += 1) {
      if (at(x, y) === at(x - 1, y)) run += 1;
      else {
        score += runScore(run);
        run = 1;
      }
    }
    score += runScore(run);
  }
  for (let x = 0; x < size; x += 1) {
    let run = 1;
    for (let y = 1; y < size; y += 1) {
      if (at(x, y) === at(x, y - 1)) run += 1;
      else {
        score += runScore(run);
        run = 1;
      }
    }
    score += runScore(run);
  }
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const value = at(x, y);
      if (
        value === at(x + 1, y) &&
        value === at(x, y + 1) &&
        value === at(x + 1, y + 1)
      ) {
        score += 3;
      }
    }
  }
  const finderLike = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true],
  ];
  const matches = (get: (index: number) => boolean, start: number) =>
    finderLike.some((pattern) =>
      pattern.every((cell, offset) => get(start + offset) === cell),
    );
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x + 11 <= size; x += 1) {
      if (matches((index) => at(index, y), x)) score += 40;
    }
  }
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y + 11 <= size; y += 1) {
      if (matches((index) => at(x, index), y)) score += 40;
    }
  }
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (at(x, y)) dark += 1;
  }
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
}

function cloneCanvas(canvas: Canvas): Canvas {
  return {
    size: canvas.size,
    modules: canvas.modules.map((row) => [...row]),
    reserved: canvas.reserved.map((row) => [...row]),
  };
}

/**
 * 文本 → 二维码矩阵。超出版本 20 的容量返回 null（调用方就不画二维码）。
 * `modules[y][x] === true` 是黑格。
 */
export function encodeQrMatrix(text: string): QrMatrix | null {
  const value = String(text || "");
  if (!value) return null;
  const bytes = utf8Bytes(value);
  const version = pickVersion(bytes.length);
  if (!version) return null;
  const codewords = interleave(encodeCodewords(bytes, version), version);
  const size = version * 4 + 17;

  const base = createCanvas(size);
  drawFunctionPatterns(base, version);
  drawCodewords(base, codewords);

  let best: Canvas | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = cloneCanvas(base);
    applyMask(candidate, mask);
    drawFormat(candidate, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  if (!best) return null;
  return { size, version, modules: best.modules };
}

/**
 * 把矩阵按布点顺序读回交织后的码字。
 * 存在的理由是可验证性：布点、掩码、格式信息三件事只有能**读回来**才算做对，
 * 而在 node 里没有扫码枪。测试用它做往返断言。
 */
export function readQrCodewords(matrix: QrMatrix): number[] {
  const canvas = createCanvas(matrix.size);
  drawFunctionPatterns(canvas, matrix.version);
  let format = 0;
  for (let index = 0; index <= 5; index += 1) {
    if (matrix.modules[index][8]) format |= 1 << index;
  }
  if (matrix.modules[7][8]) format |= 1 << 6;
  if (matrix.modules[8][8]) format |= 1 << 7;
  if (matrix.modules[8][7]) format |= 1 << 8;
  for (let index = 9; index < 15; index += 1) {
    if (matrix.modules[8][14 - index]) format |= 1 << index;
  }
  const mask = ((format ^ 0x5412) >>> 10) & 0b111;

  const bits: number[] = [];
  const size = matrix.size;
  for (let right = size - 1; right >= 1; right -= 2) {
    const column = right <= 6 ? right - 1 : right;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let offset = 0; offset < 2; offset += 1) {
        const x = column - offset;
        const upward = ((column + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (canvas.reserved[y][x]) continue;
        const dark = maskBit(mask, x, y)
          ? !matrix.modules[y][x]
          : matrix.modules[y][x];
        bits.push(dark ? 1 : 0);
      }
    }
  }
  const codewords: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    let byte = 0;
    for (let offset = 0; offset < 8; offset += 1) {
      byte = (byte << 1) | bits[index + offset];
    }
    codewords.push(byte);
  }
  return codewords;
}

/** 交织的逆操作：从读回的码字里取出数据码字（不做纠错，只做还原）。 */
export function deinterleaveQrData(
  codewords: readonly number[],
  version: number,
): number[] {
  const blockCount = BLOCKS_M[version];
  const eccLength = ECC_PER_BLOCK_M[version];
  const rawCodewords = Math.floor(rawDataModules(version) / 8);
  const shortBlockLength = Math.floor(rawCodewords / blockCount) - eccLength;
  const shortBlockCount = blockCount - (rawCodewords % blockCount);
  const lengths = Array.from({ length: blockCount }, (_, index) =>
    index < shortBlockCount ? shortBlockLength : shortBlockLength + 1,
  );
  const blocks: number[][] = lengths.map(() => []);
  let cursor = 0;
  for (let index = 0; index < shortBlockLength + 1; index += 1) {
    for (let block = 0; block < blockCount; block += 1) {
      if (index < lengths[block]) blocks[block].push(codewords[cursor++]);
    }
  }
  return blocks.flat();
}

/** 数据码字 → 原始字符串（只认字节模式，与 `encodeQrMatrix` 对称）。 */
export function decodeQrByteMode(
  data: readonly number[],
  version: number,
): string {
  const bits: number[] = [];
  for (const byte of data) {
    for (let shift = 7; shift >= 0; shift -= 1) bits.push((byte >>> shift) & 1);
  }
  const take = (count: number, from: number) => {
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      value = (value << 1) | bits[from + index];
    }
    return value;
  };
  if (take(4, 0) !== 0b0100) return "";
  const lengthBits = version < 10 ? 8 : 16;
  const length = take(lengthBits, 4);
  const bytes: number[] = [];
  for (let index = 0; index < length; index += 1) {
    bytes.push(take(8, 4 + lengthBits + index * 8));
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}
