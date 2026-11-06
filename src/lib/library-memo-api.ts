import { imFetch } from "./im/client";

export interface LibraryMemoArtifact {
  id: string;
  revision_id: string;
  name: string;
  mime: string;
  media_type: string;
}

export interface LibraryMemoItem {
  id: string;
  kind: "text" | "artifact";
  text?: string | null;
  artifact?: LibraryMemoArtifact | null;
  created_at: string;
}

export function listLibraryMemoItems(): Promise<{ items: LibraryMemoItem[] }> {
  return imFetch<{ items: LibraryMemoItem[] }>("/v1/library/memo/items");
}

export function addLibraryMemoText(text: string): Promise<{ item: LibraryMemoItem }> {
  return imFetch<{ item: LibraryMemoItem }>("/v1/library/memo/items", {
    method: "POST",
    json: { kind: "text", text },
  });
}

export function addLibraryMemoArtifact(artifactId: string, revisionId?: string): Promise<{ item: LibraryMemoItem }> {
  return imFetch<{ item: LibraryMemoItem }>("/v1/library/memo/items", {
    method: "POST",
    json: { kind: "artifact", artifact_id: artifactId, ...(revisionId ? { revision_id: revisionId } : {}) },
  });
}

export function deleteLibraryMemoItem(itemId: string): Promise<void> {
  return imFetch<void>(`/v1/library/memo/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
}
