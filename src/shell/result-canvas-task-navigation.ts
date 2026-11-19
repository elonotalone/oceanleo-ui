import type { ArtifactMeta } from "../lib/agent";
import { attachmentRef } from "../lib/attachment-url";
import { normalizeWork } from "./library-data";
import { taskAttachmentLibraryAction, type TaskOpenableAttachment } from "./task-attachment-open";
import type { WorkspaceActionV1 } from "./workspace-actions";

/** Keep a file's pinned revision when transferring it to the outer Library detail. */
export function sidebarAttachmentAction(attachment: TaskOpenableAttachment): WorkspaceActionV1 | null {
  const action = taskAttachmentLibraryAction(attachment);
  if (!action) return null;
  const revisionId = attachmentRef(attachment)?.revisionId ||
    ("libraryItem" in attachment ? attachment.libraryItem?.revisionId : undefined);
  return { ...action, ...(revisionId ? { revisionId } : {}) };
}

/** An agent_artifacts row id alone is not an artifact root identity. */
export function sidebarArtifactAction(artifact: ArtifactMeta): WorkspaceActionV1 | null {
  const item = normalizeWork({ id: artifact.id || "", url: artifact.url || "", meta: artifact.meta });
  const meta = artifact.meta || {};
  return sidebarAttachmentAction({
    id: item.id,
    libraryItem: item,
    artifactId: typeof meta.artifact_id === "string" ? meta.artifact_id : undefined,
    revisionId: typeof meta.revision_id === "string" ? meta.revision_id : undefined,
  });
}
