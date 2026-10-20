/**
 * Shared unwrap / URL pick for durable editor projects that live at an
 * authorized artifact or media URL instead of inline meta.
 */

import { isArtifactSourceTreeUrl } from "../artifact-contract";

export type StoredProjectItem = {
  url?: string | null;
  previewUrl?: string | null;
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
  const candidates = [
    meta.editor_project_url,
    meta.fabric_document_url,
    item.artifact?.renditions?.source?.url,
    item.artifact?.renditions?.full?.url,
    item.url,
    item.previewUrl,
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    // Source-tree is a credentialed API descriptor, not media fetch input.
    // Keep looking for the same browser-readable delivery used by preview.
    if (value && !isArtifactSourceTreeUrl(value)) return value;
  }
  return "";
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
