/** Pure task-content route validation; safe to use from ACP/native reducers. */
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const ATTACHMENT = new RegExp(`^/v1/tasks/(${UUID})/(messages|frames)/([1-9][0-9]*)/attachments/(${UUID})\\?revision_id=([^&#]+)$`);
const UUID_RE = new RegExp(`^${UUID}$`);
const REVISION = /^[A-Za-z0-9_-]{1,160}$/;
const FRAME_BLOCK = new RegExp(`^/v1/tasks/(${UUID})/frames/([1-9][0-9]*)/blocks/(0|[1-9][0-9]*)(\\?thumbnail=true)?$`);

export interface TaskAttachmentScope {
  taskId: string;
  kind: "messages" | "frames";
  rowId: number | string;
  artifactId: string;
  revisionId?: string;
}

export interface ScopedAttachmentLike {
  url?: string;
  previewUrl?: string;
  taskScopedUrl?: string;
  native_archive?: { download_path?: string };
  nativeArchive?: { download_path?: string };
}

export function isTaskContentId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function parseTaskAttachmentPath(value: unknown): (TaskAttachmentScope & { path: string; revisionId: string }) | null {
  if (typeof value !== "string") return null;
  const match = ATTACHMENT.exec(value);
  if (!match || !Number.isSafeInteger(Number(match[3]))) return null;
  let revisionId: string;
  try { revisionId = decodeURIComponent(match[5]); } catch { return null; }
  if (!REVISION.test(revisionId)) return null;
  const path = `/v1/tasks/${match[1]}/${match[2]}/${match[3]}/attachments/${match[4]}?revision_id=${encodeURIComponent(revisionId)}`;
  return { taskId: match[1], kind: match[2] as "messages" | "frames", rowId: Number(match[3]), artifactId: match[4], revisionId, path };
}

export function taskAttachmentRoute(scope: TaskAttachmentScope): string | null {
  if (!isTaskContentId(scope.taskId) || !isTaskContentId(scope.artifactId) || !scope.revisionId || !REVISION.test(scope.revisionId)) return null;
  if (scope.kind !== "messages" && scope.kind !== "frames") return null;
  return parseTaskAttachmentPath(`/v1/tasks/${scope.taskId}/${scope.kind}/${scope.rowId}/attachments/${scope.artifactId}?revision_id=${encodeURIComponent(scope.revisionId)}`)?.path || null;
}

function candidates(value: ScopedAttachmentLike | string | null | undefined): unknown[] {
  return typeof value === "string" ? [value] : value ? [value.taskScopedUrl, value.url, value.previewUrl, value.native_archive?.download_path, value.nativeArchive?.download_path] : [];
}

export function taskAttachmentPath(value: ScopedAttachmentLike | string | null | undefined): string | null {
  for (const candidate of candidates(value)) {
    if (typeof candidate === "string") {
      const block = FRAME_BLOCK.exec(candidate);
      if (block && Number.isSafeInteger(Number(block[2])) && Number.isSafeInteger(Number(block[3]))) return candidate;
    }
    const parsed = parseTaskAttachmentPath(candidate);
    if (parsed) return parsed.path;
  }
  return null;
}

/** Candidate detection is intentionally broader: malformed task URLs fail closed. */
export function hasTaskAttachmentPath(value: ScopedAttachmentLike | string | null | undefined): boolean {
  if (value && typeof value !== "string" && value.taskScopedUrl) return true;
  return candidates(value).some(candidate => typeof candidate === "string" && /(?:\/|%2f)v1(?:\/|%2f)tasks(?:\/|%2f)/i.test(candidate.replace(/\\/g, "/")));
}
