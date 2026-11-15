"use client";

import {
  cancelDurableVideoRun,
  createDurableVideoProject,
  createDurableVideoRun,
  getDurableVideoCapabilities,
  getDurableVideoRun,
  listDurableVideoRuns,
  promoteDurableVideoVersion,
  quoteDurableVideo,
  registerDurableVideoInput,
  type DurableVideoQuote,
  type DurableVideoRunSnapshot,
  type DurableVideoCanvasGraph,
} from "./canvas-gateway";
import {
  deterministicDigest,
  attachGeneratedAsset,
  projectHead,
  resolveCanvasInputs,
  withCanvasNodeGeneration,
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
  project?: VideoProject,
  inputAssets: Record<string, string> = {},
  quote?: DurableVideoQuote,
): DurableVideoCanvasGraph {
  if (node.kind !== "video") throw new Error("Select a Video node first.");
  const resolved = project ? resolveCanvasInputs(project, node.nodeId) : { prompt: node.prompt?.trim() || "", inputs: [], images: [], audio: [], videos: [] };
  const prompt = [node.prompt?.trim(), ...resolved.inputs.filter((input) => input.type === "text").map((input) => input.text)].filter(Boolean).join("\n\n");
  if (!prompt && !resolved.images.length) throw new Error("Add a prompt or connect a first-frame image.");
  if (resolved.images.length > 1) throw new Error("Video generation accepts one first-frame image. Keep one image connection.");
  if (resolved.audio.length || resolved.videos.length) throw new Error("This video model accepts text and one first-frame image; disconnect audio and video inputs.");
  const image = resolved.images[0];
  const imageId = image && inputAssets[image.assetId];
  if (image && !imageId) throw new Error("The connected first frame has not been registered.");
  return {
    schema: "oceanleo.video.canvas.v2",
    nodes: [{
      id: durableUuid(node.nodeId),
      operation: image ? "video.generate.image" : DURABLE_OPERATION,
      normalized_params: {
        prompt: prompt.slice(0, 8_000), ratio: node.ratio || "16:9",
        duration: Math.max(1, Math.min(30, Math.round(node.durationSeconds || 5))), sharpness: "2K",
        ...(imageId ? { image_asset_id: imageId } : {}),
        // Upstream work is already materialized. Snapshot its ports/edges here;
        // it must not be submitted as new billable provider work a second time.
        input_nodes: resolved.inputs.map((input) => ({ node_id: durableUuid(input.nodeId), edge_id: durableUuid(input.edgeId), type: input.type, ...(input.text ? { text: input.text } : {}), ...(input.asset ? { asset_id: inputAssets[input.asset.assetId] } : {}) })),
      },
      tool_version: DURABLE_TOOL_VERSION,
      input_asset_ids: imageId ? [imageId] : [], depends_on: [], output_slot: "video",
      provider: DURABLE_PROVIDER,
      ...(quote ? { provider_model: quote.provider_model, cost: quote.cost } : providerModel(node.model) ? { provider_model: providerModel(node.model) } : {}),
      billing: "provider",
    }],
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

const videoQuotes = new Map<string, { quote: DurableVideoQuote; at: number }>();
function quoteUsesImage(project: VideoProject, node: CanvasNodeDefinition): boolean {
  const graph = projectHead(project).graph;
  return graph.edges.some((edge) => edge.targetNodeId === node.nodeId && graph.nodes.some((source) => source.nodeId === edge.sourceNodeId && (source.kind === "image" || (source.assetId && project.assets[source.assetId]?.kind === "image"))));
}
function quoteKey(project: VideoProject, node: CanvasNodeDefinition): string {
  return deterministicDigest({ projectId: project.projectId, nodeId: node.nodeId, model: providerModel(node.model), duration: node.durationSeconds || 5, ratio: node.ratio || "16:9", image: quoteUsesImage(project, node) });
}
export function getPreparedVideoQuote(project: VideoProject, node: CanvasNodeDefinition): DurableVideoQuote | undefined {
  const cached = videoQuotes.get(quoteKey(project, node));
  return cached && Date.now() - cached.at < 300_000 ? cached.quote : undefined;
}
export async function prepareVideoQuote(project: VideoProject, node: CanvasNodeDefinition): Promise<DurableVideoQuote> {
  const key = quoteKey(project, node);
  const quote = await quoteDurableVideo({ model: providerModel(node.model), image: quoteUsesImage(project, node), duration: node.durationSeconds || 5, ratio: node.ratio || "16:9" });
  if (videoQuotes.size >= 100) videoQuotes.delete(videoQuotes.keys().next().value!);
  videoQuotes.set(key, { quote, at: Date.now() });
  return quote;
}

async function syncedProject(
  project: VideoProject,
  node: CanvasNodeDefinition,
  selectionEpoch: number,
): Promise<VideoProject> {
  const inputs = resolveCanvasInputs(project, node.nodeId);
  const quote = getPreparedVideoQuote(project, node) || await prepareVideoQuote(project, node);
  // Bootstrap the Project before registering owner-bound inputs.
  const initialGraph = durableGraphForVideoNode({ ...node, prompt: inputs.prompt || "First-frame video" }, undefined, {}, quote);
  let graph = initialGraph;
  let graphFingerprint = deterministicDigest(graph);
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
  const registered: Record<string, string> = {};
  for (const asset of inputs.images) {
    const receipt = await registerDurableVideoInput({ projectId: durable.projectId, localAssetId: asset.assetId, url: asset.sourceDependency ? undefined : asset.url, sourceDependency: asset.sourceDependency });
    registered[asset.assetId] = receipt.asset_id;
  }
  graph = durableGraphForVideoNode(node, project, registered, quote);
  graphFingerprint = deterministicDigest(graph);
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

export function reconcileDurableVideoRun(project: VideoProject, runId: string, snapshot: DurableVideoRunSnapshot): { project: VideoProject; status: string; message: string } {
  const run = project.durable?.runs.find((candidate) => candidate.runId === runId);
  if (!run) throw new Error("Durable Run receipt is not part of this Project.");
  if (snapshot.project_id !== project.durable!.projectId || snapshot.project_version_id !== run.remoteProjectVersionId) throw new Error("Run snapshot belongs to another project version.");
  const status = String(snapshot.status || "unknown");
  const node = projectHead(project).graph.nodes.find((candidate) => candidate.nodeId === run.nodeId);
  let next = project;
  const outputAssetIds = [...(run.outputAssetIds || [])];
  const laterFinished = project.durable!.runs.some((candidate) => candidate.nodeId === run.nodeId && candidate.createdAt > run.createdAt && candidate.outputAssetIds?.length);
  const previousAssetId = node?.assetId;
  if (node) for (const output of snapshot.output_assets || []) {
    if (output.node_id !== durableUuid(run.nodeId) || outputAssetIds.includes(output.id)) continue;
    if (!/^https?:\/\//.test(output.url)) throw new Error("Run output has no playable media URL.");
    const attached = attachGeneratedAsset(next, run.nodeId, { kind: "video", origin: "provider", title: node.title, url: output.url, mime: output.mime_type || "video/mp4", durationSeconds: output.duration_ms ? output.duration_ms / 1000 : node.durationSeconds, contentDigest: output.content_sha256 }, "canvas.node.generate.video");
    next = attached.project;
    if (laterFinished && previousAssetId) {
      const version = next.versions[next.headVersionId];
      const target = version.graph.nodes.find((candidate) => candidate.nodeId === run.nodeId);
      if (target) target.assetId = previousAssetId;
    }
    outputAssetIds.push(output.id);
  }
  const detail = snapshot.error_message || snapshot.error_code || (snapshot.node_runs || []).map((row) => row.error_message || row.error_code).find(Boolean);
  const message = status === "succeeded" ? (outputAssetIds.length ? "视频已生成，已加入镜头候选。" : "视频已完成，正在读取素材。")
    : status === "failed" ? `视频生成失败。\n${detail || "请检查输入后重试。"}`
    : status === "unknown_external_state" ? "供应商的提交结果未知。请先核实任务与费用，避免重复提交。"
    : ["cancelled", "cancelling"].includes(status) ? "已请求停止跟踪；供应商可能继续生成和计费。" : "视频正在生成，关闭页面后仍会继续。";
  const fullMessage = snapshot.refund_status ? `${message}\n${snapshot.refund_status === "refunded" ? "费用已退回。" : snapshot.refund_status === "charged" ? "已扣费，尚未确认退款。" : "费用状态暂时无法确认。"}` : message;
  // Idempotent polls do not dirty/autosave an unchanged project.
  const previous = project.durable!.runs.find((item) => item.runId === runId)!;
  if (next === project && previous.status === status && previous.message === fullMessage && previous.refundStatus === snapshot.refund_status) return { project, status, message: fullMessage };
  next = recordDurableVideoRun(next, { ...run, status, updatedAt: new Date().toISOString(), message: fullMessage, outputAssetIds, refundStatus: snapshot.refund_status });
  if (!laterFinished) next = withCanvasNodeGeneration(next, run.nodeId, status, fullMessage);
  return { project: next, status, message: fullMessage };
}

export async function refreshDurableVideoRun(project: VideoProject, runId: string): Promise<{ project: VideoProject; status: string; message: string }> {
  return reconcileDurableVideoRun(project, runId, await getDurableVideoRun(runId));
}

export function durableRunNeedsPolling(run: NonNullable<VideoProject["durable"]>["runs"][number]): boolean {
  return !["failed", "cancelled", "unknown_external_state"].includes(run.status) && (run.status !== "succeeded" || !run.outputAssetIds?.length);
}

/** Resume from saved receipts on mount. No provider re-submit, no stale head overwrite. */
export function startDurableVideoPolling(input: {
  getProject(): VideoProject;
  apply(project: VideoProject): void;
  onError?(error: unknown): void;
  schedule?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear?: (timer: ReturnType<typeof setTimeout>) => void;
}): () => void {
  let stopped = false;
  let delay = 1_000;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = input.schedule || setTimeout;
  const tick = async () => {
    let changed = false;
    const durable = input.getProject().durable;
    if (durable) try {
      const recovered = await listDurableVideoRuns(durable.projectId);
      if (stopped) return;
      for (const remote of recovered.items.slice().reverse()) {
        const latest = input.getProject();
        if (!latest.durable || latest.durable.projectId !== durable.projectId || latest.durable.runs.some((run) => run.runId === remote.id)) continue;
        const node = projectHead(latest).graph.nodes.find((node) => remote.target_node_ids.includes(durableUuid(node.nodeId)));
        if (!node) continue;
        input.apply(recordDurableVideoRun(latest, { runId: remote.id, commandRequestId: remote.command_request_id, nodeId: node.nodeId, remoteProjectVersionId: remote.project_version_id, status: remote.status, createdAt: remote.created_at, updatedAt: remote.created_at }));
        changed = true;
      }
    } catch (error) { if (!stopped) input.onError?.(error); }
    for (const run of input.getProject().durable?.runs || []) {
      if (stopped || !durableRunNeedsPolling(run)) continue;
      try {
        const snapshot = await getDurableVideoRun(run.runId);
        if (stopped) return;
        const latest = input.getProject();
        if (!latest.durable?.runs.some((candidate) => candidate.runId === run.runId)) continue;
        const result = reconcileDurableVideoRun(latest, run.runId, snapshot);
        if (result.project !== latest) { input.apply(result.project); changed = true; }
      } catch (error) { if (!stopped) input.onError?.(error); }
    }
    delay = changed ? 1_000 : Math.min(delay * 1.6, 15_000);
    if (!stopped) timer = schedule(() => { void tick(); }, delay);
  };
  timer = schedule(() => { void tick(); }, 0);
  return () => { stopped = true; (input.clear || clearTimeout)(timer); };
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
    project: withCanvasNodeGeneration(updateDurableVideoRun(project, runId, status), project.durable!.runs.find((run) => run.runId === runId)!.nodeId, status, "已请求停止跟踪；供应商可能继续生成和计费。"),
    status,
  };
}
