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

const REMOTE_SUFFIXES = [".oceanleo.com", ".oceanleo.cn", ".oceanleo.app"];

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
  if (host === "oceanleo.com" || host === "oceanleo.cn" || host === "oceanleo.app") {
    return true;
  }
  return REMOTE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}
