import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { refreshArtifactRendition, stageArtifactBlob } from "../artifact-client";
import type { LibraryItem } from "../library-data";
import type { VideoMaterialKind } from "./video-project-material";

const MAX_BYTES = 20 * 1024 * 1024;
const MEDIA = new Set(["image/png", "image/jpeg", "image/webp", "audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/webm", "audio/flac", "video/mp4", "video/webm", "video/quicktime", "video/ogg"]);

/** Refresh the source grant once at insertion; only verified bytes enter the document. */
export async function stageVideoMaterial(rootId: string, material: LibraryItem, kind: VideoMaterialKind, tt: (text: string) => string = text => text) {
  const identity = { artifactId: String(material.artifactId || ""), revisionId: String(material.revisionId || "") };
  const full = await refreshArtifactRendition(identity, "full");
  if (!full.ok || !full.data?.url) throw new Error(full.error || tt("这份素材没能插入，请重试"));
  const blob = await fetchMediaBlob(full.data.url, { cache: "no-store", maxBytes: MAX_BYTES });
  if (!MEDIA.has(blob.type) || !blob.type.startsWith(`${kind}/`)) throw new Error(tt("这个编辑器用不了这类素材"));
  const file = new File([blob], `${material.title || kind}.${blob.type.split("/")[1].replace(/[^a-z0-9]/g, "")}`, { type: blob.type });
  const staged = await stageArtifactBlob(rootId, file);
  if (!staged.ok || !staged.data) throw new Error(staged.error || tt("这份素材没能插入，请重试"));
  return { receipt: staged.data, blob };
}

/** Read exactly one owner-authorized dependency, never infer a public storage URL. */
export async function videoDependencyBlob(reference: Record<string, unknown>, signal: AbortSignal) {
  const path = String(reference.path || "");
  if (!/^assets\/[A-Za-z0-9._/-]{1,200}$/.test(path) || path.includes("..")) throw new Error("素材路径不合法。");
  const token = await accessToken();
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${GATEWAY_BASE}/v1/artifacts/${encodeURIComponent(String(reference.artifactId))}/revisions/${encodeURIComponent(String(reference.revisionId))}/source-dependencies/${encoded}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}, signal, credentials: "omit",
  });
  if (!response.ok) throw new Error("素材暂时无法读取。");
  const body = await response.json();
  const raw = String(body.accessUrl || body.access_url || "");
  const url = new URL(raw, GATEWAY_BASE);
  if (url.origin !== new URL(GATEWAY_BASE).origin) throw new Error("素材地址不在私有网关内。");
  return fetchMediaBlob(url.href, { cache: "no-store", maxBytes: MAX_BYTES, signal });
}
