/**
 * Shared unwrap / URL pick for durable editor projects that live at an
 * authorized artifact or media URL instead of inline meta.
 */

export type StoredProjectItem = {
  url?: string | null;
  content?: string | null;
  artifactId?: string | null;
  meta?: Record<string, unknown> | null;
  artifact?: {
    renditions?: {
      source?: { url?: string | null } | null;
      full?: { url?: string | null } | null;
    };
  };
};

export function storedEditorProjectUrl(item: StoredProjectItem | null | undefined): string {
  if (!item) return "";
  const meta = item.meta && typeof item.meta === "object" ? item.meta : {};
  for (const key of ["editor_project_url", "fabric_document_url"] as const) {
    const value = String(meta[key] || "").trim();
    if (value) return value;
  }
  const source = String(item.artifact?.renditions?.source?.url || "").trim();
  if (source) return source;
  const full = String(item.artifact?.renditions?.full?.url || "").trim();
  if (full) return full;
  return String(item.url || "").trim();
}

export function unwrapStoredEditorProject(text: string): unknown {
  const parsed = JSON.parse(text) as unknown;
  if (
    parsed &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as { version?: unknown }).version === 1 &&
    typeof (parsed as { schema?: unknown }).schema === "string" &&
    Object.prototype.hasOwnProperty.call(parsed, "data") &&
    !Object.prototype.hasOwnProperty.call(parsed, "pages")
  ) {
    return (parsed as { data: unknown }).data;
  }
  return parsed;
}

export function localRemoteEditorWorkbenchChoice(
  preferLocal: boolean,
): "local-core" | "hosted-embed" {
  return preferLocal ? "local-core" : "hosted-embed";
}

export type TextLoader = (url: string) => Promise<string>;
