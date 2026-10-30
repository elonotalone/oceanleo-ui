export const EDITOR_ASSET_MANIFEST_SCHEMA =
  "oceanleo.editor-asset-manifest.v1" as const;

export interface EditorAssetManifestV1 {
  schema: typeof EDITOR_ASSET_MANIFEST_SCHEMA;
  editorId: string;
  localEntry: string;
  version: string;
  hash: string;
  license: string;
  actions: readonly string[];
  nativeCapabilities: readonly string[];
}

// 每个家族的第一方远端（含分身 oceanbizs.com）与用户内容域都不许当本地编辑器入口。
const REMOTE_APEXES = ["oceanleo.com", "oceanleo.cn", "oceanleo.app", "oceanbizs.com"];
const REMOTE_SUFFIXES = REMOTE_APEXES.map((apex) => `.${apex}`);

export function isForbiddenRemoteEditorEntry(entry: string): boolean {
  const raw = String(entry || "").trim();
  if (!raw) return true;
  if (raw.startsWith("/") && !raw.startsWith("//")) return false;
  if (raw.startsWith("./") || raw.startsWith("../")) return false;
  let parsed: URL;
  try {
    parsed = new URL(raw, "http://127.0.0.1/");
  } catch {
    return true;
  }
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === "http:" && (host === "127.0.0.1" || host === "localhost")) {
    return false;
  }
  if (REMOTE_APEXES.includes(host)) {
    return true;
  }
  return REMOTE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
