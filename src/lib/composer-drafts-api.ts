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
  void keys;
  return Promise.reject(new Error("composer drafts are device-local"));
}

export function putComposerDraft(
  key: string,
  body: { text: string; attachments: ComposerDraftAttachmentRef[]; device_id: string; base_rev?: number },
): Promise<ComposerDraftPutResult> {
  void key;
  void body;
  return Promise.reject(new Error("composer drafts are device-local"));
}
