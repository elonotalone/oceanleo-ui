import { fetchMediaBlobRefreshing } from "../../lib/media-proxy";
import { refreshArtifactRendition } from "../artifact-client";
import type { ArtifactRenditionPurpose } from "../artifact-contract";
import type { AudioProjectData } from "./audio-workbench-state";
import {
  applyAudioOperation,
  audioBufferBytes,
  encodeWav,
  isAudioProjectSchemaId,
  MAX_AUDIO_FILE_BYTES,
  MAX_COMPRESSED_AUDIO_BYTES,
  MAX_DECODED_AUDIO_BYTES,
  validAudioProject,
} from "./audio-workbench-utils";
import { assertBlobSource } from "./source-integrity.mjs";

/**
 * 音频工程里 `sourceUrl` 是「基础素材」的地址。编辑器在打开时把当时拿到的
 * **签名访问地址**（`/v1/artifact-renditions/access/<token>`，TTL 300 s，见
 * `TYPED_ARTIFACT_ACCESS_TTL_SECONDS`）原样写进了工程 JSON。五分钟后这个地址就是
 * 410 Gone，于是已保存的工程既打不开（编辑器）也放不出来（查看器）。
 *
 * token 的载荷自带 `artifact` / `revision` / `purpose`，足够重新换发一个新地址，
 * 所以这里不去「修」存量 JSON，而是在用的时候按身份换新。
 */
export interface ArtifactAccessIdentity {
  artifactId: string;
  revisionId: string;
  purpose: ArtifactRenditionPurpose;
}

const ACCESS_PATH = /\/v1\/artifact-renditions\/access\/([^/?#]+)/;
const ACCESS_PURPOSES = new Set<string>([
  "source",
  "full",
  "preview",
  "thumbnail",
  "editor_manifest",
]);

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const padded = segment
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(segment.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 只读取 token 载荷里的身份，不验签（验签是服务端的事，换发时服务端重新授权）。 */
export function artifactAccessIdentity(
  url: string,
): ArtifactAccessIdentity | null {
  const match = ACCESS_PATH.exec(String(url || ""));
  if (!match) return null;
  const payload = decodeBase64UrlJson(match[1].split(".")[0] || "");
  const artifactId = String(payload?.artifact || "").trim();
  const revisionId = String(payload?.revision || "").trim();
  const purpose = String(payload?.purpose || "").trim();
  if (!artifactId || !revisionId || !ACCESS_PURPOSES.has(purpose)) return null;
  return {
    artifactId,
    revisionId,
    purpose: purpose as ArtifactRenditionPurpose,
  };
}

/**
 * 给一个（可能已过期的）签名访问地址换发新地址。认不出身份或换发失败返回 null，
 * 调用方此时只剩原地址可试。
 */
export async function refreshedArtifactAccessUrl(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const identity = artifactAccessIdentity(url);
  if (!identity) return null;
  const order: ArtifactRenditionPurpose[] = [
    identity.purpose,
    ...(["source", "full"] as const).filter(
      (purpose) => purpose !== identity.purpose,
    ),
  ];
  for (const purpose of order) {
    const result = await refreshArtifactRendition(
      { artifactId: identity.artifactId, revisionId: identity.revisionId },
      purpose,
      signal,
    );
    if (result.ok && result.data?.url) return result.data.url;
    if (signal?.aborted) return null;
  }
  return null;
}

/** 读取工程 JSON（`{schema, version, data}` 信封）里的音频工程。 */
export async function loadAudioProjectFromUrl(
  url: string,
  signal?: AbortSignal,
): Promise<AudioProjectData> {
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`音频工程读取失败（HTTP ${response.status}）`);
  }
  const text = await response.text();
  if (!text || text.length > 20_000_000) {
    throw new Error("音频工程为空或超过 20MB 安全上限");
  }
  const parsed = JSON.parse(text) as { schema?: unknown; data?: unknown };
  if (!isAudioProjectSchemaId(parsed?.schema) || !validAudioProject(parsed?.data)) {
    throw new Error("音频工程格式无效");
  }
  return parsed.data;
}

/** 工程引用的基础素材字节；410 时按 token 身份换发新地址再取一次。 */
export async function fetchAudioProjectSourceBlob(
  sourceUrl: string,
  signal?: AbortSignal,
): Promise<Blob> {
  return fetchMediaBlobRefreshing(sourceUrl, {
    maxBytes: MAX_AUDIO_FILE_BYTES,
    signal,
    refreshGoneUrl: (gone) => refreshedArtifactAccessUrl(gone, signal),
  });
}

/**
 * 把一份音频工程还原成浏览器能直接播放的字节：没有任何编辑时就是基础素材本身，
 * 有编辑时在客户端把操作日志逐条套上再编成 WAV（和编辑器打开同一工程时的结果一致）。
 */
export async function renderAudioProjectPlayable(
  project: AudioProjectData,
  signal?: AbortSignal,
): Promise<Blob> {
  if (!project.sourceUrl.trim()) {
    throw new Error("这份音频工程没有引用任何基础音频");
  }
  const blob = await fetchAudioProjectSourceBlob(project.sourceUrl, signal);
  const format = await assertBlobSource(blob, "audio");
  if (!project.operations.length) return blob;
  if (
    ["mp3", "mp4", "aac", "ogg"].includes(format) &&
    blob.size > MAX_COMPRESSED_AUDIO_BYTES
  ) {
    throw new Error("压缩音频解码后可能超过浏览器内存");
  }
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
  } catch {
    throw new Error("基础音频有正确容器签名，但没有浏览器可解码的音轨");
  } finally {
    await context.close().catch(() => undefined);
  }
  for (const operation of project.operations) {
    decoded = applyAudioOperation(decoded, operation);
  }
  if (audioBufferBytes(decoded) > MAX_DECODED_AUDIO_BYTES) {
    throw new Error("音频解码后过大");
  }
  return encodeWav(decoded);
}
