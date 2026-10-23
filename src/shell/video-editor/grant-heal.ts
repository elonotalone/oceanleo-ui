// ============================================================================
// @oceanleo/ui — 时间线素材地址自愈（2026-10-23 W11）
// ----------------------------------------------------------------------------
// 库条目的媒体地址常是 `/v1/artifact-renditions/access/<grant>`：几分钟就 410。
// 它一旦进了工程（seed、协同房间、已存 revision），关掉重开预览就黑、保存前的
// 素材预检也过不去。这里把这种地址换掉：
//   1. 按 grant 里的 artifact / revision（或调用方给的身份）重签一份新鲜地址；
//   2. 再拷进持久存储（importMediaUrl），拿到不会过期的地址；
//   3. 拷贝失败时退回新鲜地址——本次能用，下次打开再自愈一次，不吞错误到用户眼前变黑。
// 纯逻辑，依赖由调用方注入，便于测试。
// ============================================================================

import { isExpiringArtifactGrantUrl } from "./video-timeline-source";
import type { TimelineDoc, TrackKind } from "./types";

export interface ArtifactGrantIdentity {
  artifactId: string;
  revisionId: string;
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (typeof atob === "function") {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  return "";
}

/** 从 grant 地址读出它签给的 artifact / revision；读不出返回 null（只读解析，不验签）。 */
export function artifactGrantIdentity(url: string): ArtifactGrantIdentity | null {
  if (!isExpiringArtifactGrantUrl(url)) return null;
  try {
    const parsed = new URL(url, "https://api.oceanleo.com");
    const marker = "/artifact-renditions/access/";
    const token = parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length);
    const payload = JSON.parse(base64UrlDecode(token.split(".")[0] || "")) as Record<
      string,
      unknown
    >;
    const artifactId = String(payload.artifact || "").trim();
    const revisionId = String(payload.revision || "").trim();
    return artifactId && revisionId ? { artifactId, revisionId } : null;
  } catch {
    return null;
  }
}

export interface GrantHealDeps {
  /** 重签：返回新鲜地址；失败返回空串。 */
  refresh: (identity: ArtifactGrantIdentity) => Promise<string>;
  /** 拷进持久存储：返回持久地址；失败抛错。 */
  importUrl: (url: string, kind: TrackKind) => Promise<string>;
}

/** 换一条 grant 地址：持久地址 > 新鲜地址 > 原样（返回空串表示换不了）。 */
export async function healGrantUrl(
  url: string,
  kind: TrackKind,
  deps: GrantHealDeps,
  fallbackIdentity?: ArtifactGrantIdentity | null,
): Promise<{ url: string; durable: boolean }> {
  const identity = artifactGrantIdentity(url) || fallbackIdentity || null;
  const fresh = identity ? await deps.refresh(identity).catch(() => "") : "";
  if (!fresh) return { url: "", durable: false };
  try {
    const durable = await deps.importUrl(fresh, kind);
    if (durable && !isExpiringArtifactGrantUrl(durable)) return { url: durable, durable: true };
  } catch {
    /* 退回新鲜地址 */
  }
  return { url: fresh, durable: false };
}

/** 工程里所有过期型 grant 地址（去重，带轨道类型）。 */
export function expiringGrantSources(doc: TimelineDoc): Map<string, TrackKind> {
  const found = new Map<string, TrackKind>();
  for (const track of doc.tracks) {
    if (track.kind === "text") continue;
    for (const clip of track.clips) {
      const source = clip.source_url || "";
      if (source && !found.has(source) && isExpiringArtifactGrantUrl(source)) {
        found.set(source, track.kind);
      }
    }
  }
  return found;
}

/** 按映射替换片段地址；没有变化时返回原对象。 */
export function replaceClipSources(
  doc: TimelineDoc,
  replacements: ReadonlyMap<string, string>,
): TimelineDoc {
  if (!replacements.size) return doc;
  let changed = false;
  const tracks = doc.tracks.map((track) => {
    if (track.kind === "text") return track;
    let trackChanged = false;
    const clips = track.clips.map((clip) => {
      const next = replacements.get(clip.source_url || "");
      if (!next || next === clip.source_url) return clip;
      trackChanged = true;
      return { ...clip, source_url: next };
    });
    if (!trackChanged) return track;
    changed = true;
    return { ...track, clips };
  });
  return changed ? { ...doc, tracks } : doc;
}

/** 整份工程自愈：返回替换映射（旧 → 新）。 */
export async function healTimelineGrants(
  doc: TimelineDoc,
  deps: GrantHealDeps,
): Promise<Map<string, string>> {
  const replacements = new Map<string, string>();
  for (const [source, kind] of expiringGrantSources(doc)) {
    const healed = await healGrantUrl(source, kind, deps);
    if (healed.url) replacements.set(source, healed.url);
  }
  return replacements;
}
