import type { LibraryItem } from "../library-data";

export interface ExpectedVideoCanvasSaveHead {
  artifactId: string;
  expectedRevisionId: string;
  /** Previously opened/accepted durable heads for this same artifact root. */
  seenRevisionIds?: ReadonlySet<string>;
}

type DurableVideoCanvasSaveItem = LibraryItem & {
  artifactId: string;
  revisionId: string;
  artifact: NonNullable<LibraryItem["artifact"]>;
};

/** Only a complete typed Library response for a newly committed head is a save receipt. */
export function durableVideoSaveReceipt(
  value: LibraryItem | undefined,
  expected: ExpectedVideoCanvasSaveHead,
): value is DurableVideoCanvasSaveItem {
  const artifact = value?.artifact;
  if (
    !value ||
    !value.artifactId ||
    !value.revisionId ||
    !artifact ||
    artifact.artifactId !== value.artifactId ||
    artifact.revisionId !== value.revisionId ||
    !artifact.renditions ||
    typeof artifact.renditions !== "object"
  ) return false;
  const source = artifact.renditions.source;
  const preview = artifact.renditions.preview || artifact.renditions.full;
  return Boolean(
    value.artifactId === expected.artifactId &&
      value.revisionId &&
      value.revisionId !== expected.expectedRevisionId &&
      !expected.seenRevisionIds?.has(value.revisionId) &&
      value.meta?.previous_revision_id === expected.expectedRevisionId &&
      value.artifactType === "workflow" &&
      artifact.artifactType === "workflow" &&
      artifact.editorCapability === "video-canvas" &&
      artifact.sourceFormat === "oceanleo.video.project.v2" &&
      artifact.integrity?.ok === true &&
      source?.purpose === "source" &&
      source.revisionId === value.revisionId &&
      preview?.revisionId === value.revisionId &&
      Boolean(preview.digest),
  );
}
