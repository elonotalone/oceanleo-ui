import { normalizeArtifactEditorCommand, type ArtifactEditorCommand, type ArtifactProjection, type ArtifactType } from "../../artifact-contract";
import { type LibraryItem } from "../../library-data";
import {
  addProjectNode,
  nodeDimensions,
  projectHead,
  registerAsset,
  stableId,
  updateProjectNode,
  type AssetKind,
  type CanvasNodeDefinition,
  type VideoProject,
} from "./project-model";

export type DurableCanvasMaterial = LibraryItem & {
  artifactId: string;
  revisionId: string;
  artifactType: ArtifactType;
  artifact: ArtifactProjection;
};

function canvasAssetKind(
  artifactType: ArtifactType,
): Extract<AssetKind, "image" | "video" | "audio"> | null {
  if (
    artifactType === "single_file_image" ||
    artifactType === "composite_image" ||
    artifactType === "vector_image" ||
    artifactType === "chart"
  ) {
    return "image";
  }
  if (artifactType === "video") return "video";
  if (artifactType === "audio") return "audio";
  return null;
}

function isDurableCanvasMaterial(
  item: LibraryItem,
): item is DurableCanvasMaterial {
  return Boolean(
    item.artifactId &&
      item.revisionId &&
      item.artifactType &&
      item.artifact &&
      item.artifact.artifactId === item.artifactId &&
      item.artifact.revisionId === item.revisionId &&
      item.artifact.artifactType === item.artifactType,
  );
}

export function canvasAcceptsArtifactMaterial(
  item: LibraryItem,
  action: "insert" | "replace" | "apply" | "merge",
  selectedNode: CanvasNodeDefinition | null,
): boolean {
  if (!isDurableCanvasMaterial(item) || !item.artifact.integrity.ok) {
    return false;
  }
  const kind = canvasAssetKind(item.artifactType);
  if (!kind || !item.artifact.access.canRead || !item.artifact.sourceFormat) {
    return false;
  }
  try {
    pinnedRendition(item);
  } catch {
    return false;
  }
  if (action === "insert") return item.artifact.access.canInsert;
  if (action === "replace") {
    return Boolean(
      item.artifact.access.canReplace && selectedNode?.kind === kind,
    );
  }
  return false;
}

export function createCanvasArtifactCommand(input: {
  action: "insert" | "replace";
  item: DurableCanvasMaterial;
  project: VideoProject;
  selectedNode: CanvasNodeDefinition | null;
  insertPosition: { x: number; y: number };
}): ArtifactEditorCommand {
  const kind = canvasAssetKind(input.item.artifactType);
  if (
    !kind ||
    !canvasAcceptsArtifactMaterial(
      input.item,
      input.action,
      input.selectedNode,
    )
  ) {
    throw new Error("The active canvas cannot accept this pinned artifact.");
  }
  const targetNode =
    input.action === "replace" ? input.selectedNode : null;
  if (input.action === "replace" && !targetNode) {
    throw new Error("Replace requires a compatible selected canvas node.");
  }
  const dimensions = nodeDimensions(targetNode?.kind || kind);
  const position = targetNode?.position || input.insertPosition;
  const targetRevisionId = input.project.headVersionId;
  return {
    schema: "oceanleo.editor-command.v1",
    commandId: stableId("artifact-command"),
    historyGroupId: stableId("artifact-history"),
    action: input.action,
    source: {
      artifactId: input.item.artifactId,
      revisionId: input.item.revisionId,
      artifactType: input.item.artifactType,
      sourceFormat: input.item.artifact.sourceFormat,
    },
    target: {
      documentId: input.project.projectId,
      ...(targetNode ? { targetId: targetNode.nodeId } : {}),
      slotId: "asset",
      geometry: {
        x: position.x,
        y: position.y,
        width: dimensions.width,
        height: dimensions.height,
      },
    },
    strategy:
      input.action === "insert"
        ? { mode: "insert-new-object" }
        : {
            mode: "replace-selection",
            preserve: ["slot", "geometry"],
          },
    expectedRevision: { targetRevisionId },
    cas: { expectedRevisionId: targetRevisionId },
  };
}

function pinnedRendition(item: DurableCanvasMaterial) {
  const artifact = item.artifact;
  const candidates = [
    artifact.access.canExportSource
      ? artifact.renditions.source
      : undefined,
    artifact.renditions.full,
    artifact.renditions.preview,
  ];
  const rendition = candidates.find(
    (candidate) =>
      candidate?.revisionId === item.revisionId &&
      Boolean(candidate.url) &&
      Boolean(candidate.digest),
  );
  if (!rendition) {
    throw new Error(
      "The pinned artifact has no digest-attested source/full/preview rendition.",
    );
  }
  return rendition;
}

export function applyCanvasArtifactCommand(input: {
  command: ArtifactEditorCommand;
  item: LibraryItem;
  project: VideoProject;
}): { project: VideoProject; selectedNodeId: string } {
  const command = normalizeArtifactEditorCommand(input.command);
  if (!command || !isDurableCanvasMaterial(input.item)) {
    throw new Error("The canvas rejected an invalid artifact editor command.");
  }
  const { item } = input;
  if (
    command.source.artifactId !== item.artifactId ||
    command.source.revisionId !== item.revisionId ||
    command.source.artifactType !== item.artifactType ||
    command.source.sourceFormat !== item.artifact.sourceFormat ||
    command.target.documentId !== input.project.projectId ||
    command.expectedRevision.targetRevisionId !==
      input.project.headVersionId ||
    command.cas.expectedRevisionId !== input.project.headVersionId
  ) {
    throw new Error(
      "Artifact source, target, or compare-and-swap revision changed.",
    );
  }
  const kind = canvasAssetKind(item.artifactType);
  if (!kind) throw new Error("Unsupported artifact type for video canvas.");
  const rendition = pinnedRendition(item);
  const registered = registerAsset(input.project, {
    assetId: `artifact:${item.artifactId}:${item.revisionId}`,
    kind,
    origin: "import",
    title: item.title,
    url: rendition.url,
    previewUrl:
      item.artifact.renditions.preview?.url ||
      item.previewUrl ||
      rendition.url,
    mime: rendition.mediaType || item.artifact.sourceFormat,
    width: rendition.width || undefined,
    height: rendition.height || undefined,
    durationSeconds:
      rendition.durationMs === null
        ? undefined
        : rendition.durationMs / 1_000,
    contentDigest: rendition.digest || undefined,
  });

  if (command.action === "insert") {
    const geometry = command.target.geometry;
    if (!geometry) {
      throw new Error("Insert command is missing its target geometry.");
    }
    const created = addProjectNode(
      registered.project,
      kind,
      { x: geometry.x, y: geometry.y },
      {
        title: item.title,
        assetId: registered.asset.assetId,
        ratio: kind === "audio" ? undefined : "16:9",
        durationSeconds:
          kind === "video" ? registered.asset.durationSeconds || 5 : undefined,
      },
    );
    return { project: created.project, selectedNodeId: created.nodeId };
  }

  const selected = projectHead(registered.project).graph.nodes.find(
    (node) => node.nodeId === command.target.targetId,
  );
  const geometry = command.target.geometry;
  const expectedDimensions = selected ? nodeDimensions(selected.kind) : null;
  if (
    !selected ||
    selected.kind !== kind ||
    command.target.slotId !== "asset" ||
    !geometry ||
    geometry.x !== selected.position.x ||
    geometry.y !== selected.position.y ||
    geometry.width !== expectedDimensions?.width ||
    geometry.height !== expectedDimensions?.height ||
    command.strategy.mode === "insert-new-object" ||
    !command.strategy.preserve.includes("slot") ||
    !command.strategy.preserve.includes("geometry")
  ) {
    throw new Error("Replace target no longer matches the selected canvas slot.");
  }
  return {
    project: updateProjectNode(
      registered.project,
      selected.nodeId,
      "canvas.artifact.replace",
      { assetId: registered.asset.assetId },
    ),
    selectedNodeId: selected.nodeId,
  };
}
