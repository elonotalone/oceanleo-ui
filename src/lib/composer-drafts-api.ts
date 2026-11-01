import { imFetch } from "./im/client";

export interface ComposerDraftAttachmentRef {
  id: string;
  artifactId: string;
  revisionId: string;
  name?: string;
  mime?: string;
  mediaType?: string;
}

export interface ComposerDraftServerRecord {
  key: string;
  text: string;
  attachments: ComposerDraftAttachmentRef[];
  rev: number;
  device_id: string;
  updated_at: string;
}

export interface ComposerDraftPutResult {
  rev: number;
  updated_at: string;
}

export function getComposerDrafts(keys: string[]): Promise<{ drafts: ComposerDraftServerRecord[] }> {
  const query = keys.filter(Boolean).slice(0, 50).map((key) => encodeURIComponent(key)).join(",");
  return imFetch<{ drafts: ComposerDraftServerRecord[] }>(`/v1/composer-drafts?keys=${query}`);
}

export function putComposerDraft(
  key: string,
  body: { text: string; attachments: ComposerDraftAttachmentRef[]; device_id: string; base_rev?: number },
): Promise<ComposerDraftPutResult> {
  return imFetch<ComposerDraftPutResult>(`/v1/composer-drafts/${encodeURIComponent(key)}`, {
    method: "PUT",
    json: body,
  });
}
