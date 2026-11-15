"use client";

import {
  cancelDurableVideoRun,
  createDurableVideoProject,
  createDurableVideoRun,
  getDurableVideoCapabilities,
  getDurableVideoRun,
  promoteDurableVideoVersion,
  type DurableVideoCanvasGraph,
} from "./canvas-gateway";
import {
  deterministicDigest,
  recordDurableVideoRun,
  updateDurableVideoRun,
  withDurableVideoState,
  type CanvasNodeDefinition,
  type DurableVideoProjectState,
  type VideoProject,
} from "./project-model";

const DURABLE_PROVIDER = "bailian-video";
const DURABLE_OPERATION = "video.generate.text";
const DURABLE_TOOL_VERSION = "leovideo-canvas-v2.1";

function hash32(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= hash >>> 13;
  }
  return hash >>> 0;
}

export function durableUuid(value: string): string {
  const compact = value.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
  )?.[0];
  if (compact) return compact.toLowerCase();
  const raw = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35]
    .map((seed) => hash32(value, seed).toString(16).padStart(8, "0"))
    .join("")
    .split("");
  raw[12] = "5";
  raw[16] = ((Number.parseInt(raw[16], 16) & 0x3) | 0x8).toString(16);
  const hex = raw.join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function providerModel(model: string | undefined): string | undefined {
  const value = (model || "").trim();
  return value && !/^(?:platform[- ]default|平台默认)$/i.test(value)
    ? value.slice(0, 160)
    : undefined;
}

export function durableGraphForVideoNode(
  node: CanvasNodeDefinition,
): DurableVideoCanvasGraph {
  if (node.kind !== "video") {
    throw new Error("Durable video generation requires a Video node.");
  }
  const prompt = (node.prompt || "").trim();
  if (!prompt) throw new Error("Add a video prompt before Generate.");
  const model = providerModel(node.model);
  return {
    schema: "oceanleo.video.canvas.v2",
    nodes: [
      {
        id: durableUuid(node.nodeId),
        operation: DURABLE_OPERATION,
        normalized_params: {
          prompt: prompt.slice(0, 8_000),
          ratio: node.ratio || "16:9",
          duration: Math.max(
            1,
            Math.min(30, Math.round(node.durationSeconds || 5)),
          ),
          sharpness: "2K",
        },
        tool_version: DURABLE_TOOL_VERSION,
        input_asset_ids: [],
        depends_on: [],
        output_slot: "video",
        provider: DURABLE_PROVIDER,
        ...(model ? { provider_model: model } : {}),
        billing: "provider",
      },
    ],
    edges: [],
  };
}

export async function durableVideoCapability(): Promise<{
  enabled: boolean;
  reason?: string;
}> {
  try {
    const capabilities = await getDurableVideoCapabilities();
    const provider = capabilities.providers?.[DURABLE_PROVIDER];
    const supported = provider?.supported_operations || [];
    if (
      provider?.available === true &&
      supported.includes(DURABLE_OPERATION)
    ) {
      return { enabled: true };
    }
    return {
      enabled: false,
      reason:
        provider?.limitation ||
        "The durable text-to-video provider is not available.",
    };
  } catch (error) {
    return {
      enabled: false,
      reason:
        error instanceof Error
          ? error.message
          : "Durable video capability discovery failed.",
    };
  }
}

async function syncedProject(
  project: VideoProject,
  node: CanvasNodeDefinition,
  selectionEpoch: number,
): Promise<VideoProject> {
  const graph = durableGraphForVideoNode(node);
  const graphFingerprint = deterministicDigest(graph);
  let durable: DurableVideoProjectState | undefined = project.durable;
  if (!durable) {
    const workspaceId = durableUuid(`${project.projectId}:workspace`);
    const created = await createDurableVideoProject({
      name: project.title.slice(0, 240) || "LeoVideo project",
      workspaceId,
      graph,
    });
    durable = {
      workspaceId,
      projectId: created.project_id,
      headVersionId: created.head_version_id,
      headEpoch: created.head_epoch,
      graphFingerprint,
      syncedLocalVersionId: project.headVersionId,
      syncedSelectionEpoch: 0,
      runs: [],
    };
  }
  if (
    durable.graphFingerprint !== graphFingerprint ||
    durable.syncedLocalVersionId !== project.headVersionId ||
    durable.syncedSelectionEpoch !== selectionEpoch
  ) {
    const promoted = await promoteDurableVideoVersion({
      projectId: durable.projectId,
      expectedHeadVersionId: durable.headVersionId,
      expectedHeadEpoch: durable.headEpoch,
      graph,
      selectionEpoch,
      message: `Sync ${project.headVersionId}`.slice(0, 2_000),
    });
    durable = {
      ...durable,
      projectId: promoted.project_id,
      headVersionId: promoted.head_version_id,
      headEpoch: promoted.head_epoch,
      graphFingerprint,
      syncedLocalVersionId: project.headVersionId,
      syncedSelectionEpoch: selectionEpoch,
    };
  }
  return withDurableVideoState(project, durable);
}

export async function submitDurableVideoGeneration(input: {
  project: VideoProject;
  node: CanvasNodeDefinition;
  selectionEpoch: number;
  commandRequestId: string;
  onSynced(project: VideoProject): boolean;
}): Promise<{ project: VideoProject; runId: string; created: boolean }> {
  const project = await syncedProject(
    input.project,
    input.node,
    input.selectionEpoch,
  );
  if (!input.onSynced(project)) {
    throw new Error(
      "Project head or selection changed before durable submission.",
    );
  }
  const durable = project.durable;
  if (!durable) throw new Error("Durable Project binding was not created.");
  const receipt = await createDurableVideoRun({
    projectId: durable.projectId,
    commandId: "canvas.node.generate.video",
    commandRequestId: input.commandRequestId,
    projectVersionId: durable.headVersionId,
    expectedHeadEpoch: durable.headEpoch,
    targetNodeIds: [durableUuid(input.node.nodeId)],
  });
  const timestamp = new Date().toISOString();
  return {
    project: recordDurableVideoRun(project, {
      runId: receipt.run_id,
      commandRequestId: input.commandRequestId,
      nodeId: input.node.nodeId,
      remoteProjectVersionId: durable.headVersionId,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
    }),
    runId: receipt.run_id,
    created: receipt.created,
  };
}

export async function refreshDurableVideoRun(
  project: VideoProject,
  runId: string,
): Promise<{ project: VideoProject; status: string; message: string }> {
  if (!project.durable?.runs.some((run) => run.runId === runId)) {
    throw new Error("Durable Run receipt is not part of this Project.");
  }
  const snapshot = await getDurableVideoRun(runId);
  const status = String(snapshot.status || "unknown").slice(0, 80);
  const detail = snapshot.error_message || snapshot.error_code;
  return {
    project: updateDurableVideoRun(project, runId, status),
    status,
    message: detail ? `${status}: ${detail}` : `Durable Run is ${status}.`,
  };
}

export async function requestDurableVideoRunCancel(
  project: VideoProject,
  runId: string,
): Promise<{ project: VideoProject; status: string }> {
  if (!project.durable?.runs.some((run) => run.runId === runId)) {
    throw new Error("Durable Run receipt is not part of this Project.");
  }
  const response = await cancelDurableVideoRun(runId);
  const status = String(response.status || "cancelling").slice(0, 80);
  return {
    project: updateDurableVideoRun(project, runId, status),
    status,
  };
}
