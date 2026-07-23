const TEXT_SOURCE_LIMIT = 32 * 1024 * 1024;
const GLTF_RESOURCE_LIMIT = 1_024;
const URI_LENGTH_LIMIT = 8_192;

const FORMAT_LABELS = {
  unknown: "未知二进制",
  json: "普通 JSON",
  svg: "SVG",
  mp4: "MP4/M4A",
  webm: "WebM/Matroska",
  mp3: "MP3",
  wav: "WAV",
  flac: "FLAC",
  ogg: "Ogg",
  aac: "AAC",
  pdf: "PDF",
  glb: "GLB",
  gltf: "glTF",
  "video-project": "OceanLeo 视频工程",
  png: "PNG",
  jpeg: "JPEG",
  gif: "GIF",
  webp: "WebP",
  avif: "AVIF/HEIF",
};

const EXPECTED_FORMATS = {
  video: new Set(["mp4", "webm"]),
  audio: new Set(["mp3", "wav", "flac", "ogg", "aac", "mp4"]),
  image: new Set(["png", "jpeg", "gif", "webp", "avif", "svg"]),
  pdf: new Set(["pdf"]),
  model3d: new Set(["glb", "gltf"]),
  "video-project": new Set(["video-project"]),
};

const EXPECTED_LABELS = {
  video: "可解码的视频（MP4/WebM）",
  audio: "可解码的音频（MP3/WAV/FLAC/Ogg/AAC/M4A）",
  image: "可显示的图片",
  pdf: "真实 PDF",
  model3d: "GLB 或 glTF 2.x 模型",
  "video-project": "oceanleo.timeline.v1 视频工程",
};

function bytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("source bytes must be an ArrayBuffer or typed array");
}

function ascii(source, offset, length) {
  let result = "";
  for (let index = offset; index < offset + length; index += 1) {
    result += String.fromCharCode(source[index] || 0);
  }
  return result;
}

function uint32le(source, offset) {
  return (
    source[offset] |
    (source[offset + 1] << 8) |
    (source[offset + 2] << 16) |
    (source[offset + 3] << 24)
  ) >>> 0;
}

function uint32be(source, offset) {
  return (
    (source[offset] << 24) |
    (source[offset + 1] << 16) |
    (source[offset + 2] << 8) |
    source[offset + 3]
  ) >>> 0;
}

function jsonTextCandidate(source) {
  let index = 0;
  if (
    source.length >= 3 &&
    source[0] === 0xef &&
    source[1] === 0xbb &&
    source[2] === 0xbf
  ) {
    index = 3;
  }
  while (index < source.length && /\s/.test(String.fromCharCode(source[index]))) {
    index += 1;
  }
  return source[index] === 0x7b || source[index] === 0x5b;
}

function hasMp3Frame(source) {
  const limit = Math.min(source.length - 3, 4_096);
  for (let index = 0; index < limit; index += 1) {
    if (source[index] !== 0xff || (source[index + 1] & 0xe0) !== 0xe0) continue;
    const version = (source[index + 1] >> 3) & 0x03;
    const layer = (source[index + 1] >> 1) & 0x03;
    const bitrate = (source[index + 2] >> 4) & 0x0f;
    const sampleRate = (source[index + 2] >> 2) & 0x03;
    if (version !== 1 && layer !== 0 && bitrate !== 0 && bitrate !== 15 && sampleRate !== 3) {
      return true;
    }
  }
  return false;
}

function isoBrand(source, totalBytes) {
  if (source.length < 12 || ascii(source, 4, 4) !== "ftyp") return "";
  let boxSize = uint32be(source, 0);
  let brandOffset = 8;
  if (boxSize === 1) {
    if (source.length < 20) return "";
    const high = uint32be(source, 8);
    const low = uint32be(source, 12);
    boxSize = high * 0x1_0000_0000 + low;
    brandOffset = 16;
  } else if (boxSize === 0) {
    boxSize = totalBytes;
  }
  if (
    !Number.isSafeInteger(boxSize) ||
    boxSize < brandOffset + 8 ||
    boxSize > totalBytes
  ) return "";
  const brand = ascii(source, brandOffset, 4);
  return /^[\x20-\x7e]{4}$/.test(brand) ? brand.toLowerCase() : "";
}

export function binarySourceFormat(value, totalBytes = undefined) {
  const source = bytes(value);
  const size = Number.isFinite(totalBytes) ? Number(totalBytes) : source.byteLength;
  if (source.length >= 20 && ascii(source, 0, 4) === "glTF") {
    const version = uint32le(source, 4);
    const declared = uint32le(source, 8);
    const jsonLength = uint32le(source, 12);
    const jsonType = uint32le(source, 16);
    return (
      version === 2 &&
      declared >= 20 &&
      declared === size &&
      jsonLength > 0 &&
      20 + jsonLength <= declared &&
      jsonType === 0x4e4f534a
    ) ? "glb" : "unknown";
  }
  if (source.length >= 5) {
    const prefix = new TextDecoder().decode(source.subarray(0, Math.min(1_024, source.length)));
    if (prefix.includes("%PDF-")) return "pdf";
  }
  if (
    source.length >= 8 &&
    source[0] === 0x89 &&
    ascii(source, 1, 3) === "PNG" &&
    source[4] === 0x0d &&
    source[5] === 0x0a &&
    source[6] === 0x1a &&
    source[7] === 0x0a
  ) return "png";
  if (source[0] === 0xff && source[1] === 0xd8 && source[2] === 0xff) return "jpeg";
  if (ascii(source, 0, 6) === "GIF87a" || ascii(source, 0, 6) === "GIF89a") return "gif";
  if (ascii(source, 0, 4) === "RIFF" && ascii(source, 8, 4) === "WEBP") return "webp";
  const brand = isoBrand(source, size);
  if (["avif", "avis", "heic", "heix", "mif1", "msf1"].includes(brand)) return "avif";
  if (brand) return "mp4";
  if (
    source[0] === 0x1a &&
    source[1] === 0x45 &&
    source[2] === 0xdf &&
    source[3] === 0xa3
  ) return "webm";
  if (ascii(source, 0, 3) === "ID3" || hasMp3Frame(source)) return "mp3";
  if (ascii(source, 0, 4) === "RIFF" && ascii(source, 8, 4) === "WAVE") return "wav";
  if (ascii(source, 0, 4) === "fLaC") return "flac";
  if (ascii(source, 0, 4) === "OggS") return "ogg";
  if (
    source[0] === 0xff &&
    (source[1] & 0xf6) === 0xf0
  ) return "aac";
  return "unknown";
}

export function parseGltfDocument(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text).replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("glTF JSON 无法解析");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    !parsed.asset ||
    typeof parsed.asset !== "object" ||
    !/^2(?:\.|$)/.test(String(parsed.asset.version || ""))
  ) {
    throw new Error("glTF 必须声明 asset.version 2.x");
  }
  for (const key of ["buffers", "images"]) {
    if (parsed[key] !== undefined && !Array.isArray(parsed[key])) {
      throw new Error(`glTF ${key} 必须是数组`);
    }
  }
  for (const [index, buffer] of (parsed.buffers || []).entries()) {
    if (
      !buffer ||
      typeof buffer !== "object" ||
      typeof buffer.uri !== "string" ||
      !buffer.uri.trim()
    ) {
      throw new Error(`glTF JSON buffer ${index} 缺少可加载 URI`);
    }
  }
  for (const [index, image] of (parsed.images || []).entries()) {
    if (
      !image ||
      typeof image !== "object" ||
      (typeof image.uri !== "string" && !Number.isInteger(image.bufferView))
    ) {
      throw new Error(`glTF image ${index} 必须引用 URI 或 bufferView`);
    }
  }
  return parsed;
}

export function parseVideoProjectEnvelope(
  text,
  expectedSchema = "oceanleo.timeline.v1",
) {
  let parsed;
  try {
    parsed = JSON.parse(String(text).replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("视频工程 JSON 无法解析");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    parsed.schema !== expectedSchema ||
    parsed.version !== 1 ||
    !parsed.data ||
    typeof parsed.data !== "object" ||
    Array.isArray(parsed.data)
  ) {
    throw new Error(`视频工程必须是 ${expectedSchema} version 1`);
  }
  return parsed.data;
}

function textSourceFormat(text) {
  const trimmed = String(text).replace(/^\uFEFF/, "").trimStart();
  if (/^<svg(?:\s|>)/i.test(trimmed)) return "svg";
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return "unknown";
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    parsed.asset &&
    typeof parsed.asset === "object" &&
    /^2(?:\.|$)/.test(String(parsed.asset.version || ""))
  ) return "gltf";
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    parsed.schema === "oceanleo.timeline.v1" &&
    parsed.version === 1 &&
    parsed.data &&
    typeof parsed.data === "object" &&
    !Array.isArray(parsed.data)
  ) return "video-project";
  return "json";
}

export async function sourceFormatForBlob(blob) {
  if (!(blob instanceof Blob)) throw new TypeError("source must be a Blob");
  const prefix = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, 65_536)).arrayBuffer(),
  );
  const binary = binarySourceFormat(prefix, blob.size);
  if (binary !== "unknown") return binary;
  if (
    blob.size <= TEXT_SOURCE_LIMIT &&
    (jsonTextCandidate(prefix) ||
      new TextDecoder().decode(prefix.subarray(0, Math.min(prefix.length, 256))).trimStart().startsWith("<"))
  ) {
    return textSourceFormat(await blob.text());
  }
  return "unknown";
}

export async function assertBlobSource(blob, expected) {
  const accepted = EXPECTED_FORMATS[expected];
  if (!accepted) throw new TypeError(`unknown expected source kind: ${expected}`);
  const actual = await sourceFormatForBlob(blob);
  if (!accepted.has(actual)) {
    const mime = String(blob.type || "").trim() || "未声明";
    throw new Error(
      `源格式不匹配：需要${EXPECTED_LABELS[expected]}，实际为` +
      `${FORMAT_LABELS[actual] || actual}（MIME ${mime}）`,
    );
  }
  return actual;
}

export function gltfDependencyUris(document) {
  const entries = [
    ...(Array.isArray(document?.buffers) ? document.buffers : []),
    ...(Array.isArray(document?.images) ? document.images : []),
  ];
  if (entries.length > GLTF_RESOURCE_LIMIT) {
    throw new Error(`glTF 外部依赖超过 ${GLTF_RESOURCE_LIMIT} 项安全上限`);
  }
  return entries.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || entry.uri === undefined) return [];
    if (typeof entry.uri !== "string") {
      throw new Error("glTF 依赖 URI 无效或过长");
    }
    const uri = entry.uri.trim();
    if (!uri.startsWith("data:") && uri.length > URI_LENGTH_LIMIT) {
      throw new Error("glTF 依赖 URI 无效或过长");
    }
    return uri ? [uri] : [];
  });
}

export function rewriteGltfDependencyUris(document, sourceUrl, safeUrl) {
  if (typeof safeUrl !== "function") {
    throw new TypeError("safeUrl must be a function");
  }
  const cloned = JSON.parse(JSON.stringify(document));
  gltfDependencyUris(cloned);
  for (const key of ["buffers", "images"]) {
    for (const entry of Array.isArray(cloned[key]) ? cloned[key] : []) {
      const uri = typeof entry?.uri === "string" ? entry.uri.trim() : "";
      if (!uri || uri.startsWith("data:")) continue;
      if (uri.startsWith("blob:")) {
        throw new Error("glTF 依赖不能引用其他浏览器会话的 blob URL");
      }
      let resolved;
      try {
        resolved = new URL(uri, sourceUrl);
      } catch {
        throw new Error(`glTF 依赖地址无法解析：${uri.slice(0, 160)}`);
      }
      if (!["http:", "https:"].includes(resolved.protocol)) {
        throw new Error(`glTF 依赖协议不受支持：${resolved.protocol}`);
      }
      entry.uri = safeUrl(resolved.href);
    }
  }
  return cloned;
}
