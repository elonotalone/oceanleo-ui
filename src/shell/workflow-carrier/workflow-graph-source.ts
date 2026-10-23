import type { LibraryItem } from "../library-data";
import { isDurableLibraryItem } from "../library-data";
import {
  storedEditorProjectUrl,
  unwrapStoredEditorProject,
  type TextLoader,
} from "../advanced-routes/stored-editor-project";
import { parseVideoCanvasSource } from "./video-canvas-source";
import { parseVideoCanvasProject } from "./video-canvas-local-session";
import { VIDEO_CANVAS_NODE_KINDS } from "./video-canvas-schema";
import type { VideoCanvasGraph, VideoCanvasProject } from "./video-canvas-schema";
import { parseVideoProjectDoc, type VideoDocParse } from "./video-project-doc";

const NATIVE_VIDEO_PROJECT_SCHEMA = "oceanleo.video.project.v2";
const NATIVE_VIDEO_PROJECT_VERSION = 2;
const NATIVE_NODE_KINDS = new Set([
  "text",
  "image",
  "video",
  "audio",
  "script",
  "model",
  "subtitle",
  "composite",
  "delivery",
  "director",
  "storyboard",
  "timeline",
]);
const NATIVE_TO_WORKFLOW_KIND: Record<string, (typeof VIDEO_CANVAS_NODE_KINDS)[number]> = {
  text: "text",
  image: "source",
  video: "source",
  audio: "source",
  script: "text",
  model: "source",
  subtitle: "text",
  composite: "concat",
  delivery: "output",
  // These core-only kinds have no workflow-v1 semantic twin. `nativeKind`
  // remains attached to the read-only projection; these neutral card kinds
  // are never eligible for a v1 graph write.
  director: "source",
  storyboard: "source",
  timeline: "source",
};

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : null;
}

function nonEmptyString(value: unknown, max = 256): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function nativeNodeKind(
  node: RecordValue,
): (typeof VIDEO_CANVAS_NODE_KINDS)[number] | null {
  const legacy = record(node.legacySourceNode);
  const legacyKind = legacy?.kind;
  if (typeof legacyKind === "string" && (VIDEO_CANVAS_NODE_KINDS as readonly string[]).includes(legacyKind)) {
    return legacyKind as (typeof VIDEO_CANVAS_NODE_KINDS)[number];
  }
  const nativeKind = typeof node.kind === "string" ? node.kind : "";
  return NATIVE_TO_WORKFLOW_KIND[nativeKind] || null;
}

function workflowPorts(value: unknown): VideoCanvasGraph["nodes"][number]["ports"] | null {
  const ports = record(value);
  if (!ports) return null;
  const parse = (candidate: unknown) => {
    if (candidate === undefined) return [];
    if (!Array.isArray(candidate) || candidate.length > 8) return null;
    const parsed = [];
    const seen = new Set<string>();
    for (const item of candidate) {
      const port = record(item);
      if (
        !port ||
        !nonEmptyString(port.name, 128) ||
        seen.has(port.name) ||
        typeof port.dataType !== "string" ||
        !["video", "audio", "image", "text", "number", "any"].includes(port.dataType) ||
        (port.required !== undefined && typeof port.required !== "boolean")
      ) return null;
      seen.add(port.name);
      parsed.push({
        name: port.name,
        dataType: port.dataType as "video" | "audio" | "image" | "text" | "number" | "any",
        ...(typeof port.required === "boolean" ? { required: port.required } : {}),
      });
    }
    return parsed;
  };
  const inputs = parse(ports.inputs);
  const outputs = parse(ports.outputs);
  if (!inputs || !outputs) return null;
  return { inputs, outputs };
}

/**
 * The iframe's canonical v2 document is not the carrier's v1 graph shape.
 * Project only its exact head into the host's read-only graph view; v1 source
 * sidecars supply original kinds, params, and named ports when present.
 */
function nativeVideoProjectGraph(value: unknown): VideoCanvasGraph | null {
  const project = record(value);
  if (!project || project.schema !== NATIVE_VIDEO_PROJECT_SCHEMA) return null;
  if (project.schemaVersion !== NATIVE_VIDEO_PROJECT_VERSION) {
    throw new Error("视频工程版本无法安全投影；未改用旧图覆盖当前版本。");
  }
  const versions = record(project.versions);
  const headVersionId = project.headVersionId;
  if (!versions || !nonEmptyString(headVersionId) || !Object.hasOwn(versions, headVersionId)) {
    throw new Error("视频工程 head 版本缺失；未改用旧图覆盖当前版本。");
  }
  const head = record(versions[headVersionId]);
  const graph = record(head?.graph);
  if (
    !head || head.versionId !== headVersionId || !graph ||
    !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) ||
    graph.nodes.length > 500 || graph.edges.length > 2_000
  ) {
    throw new Error("视频工程 head 节点图无效；未改用旧图覆盖当前版本。");
  }

  const nodeIds = new Set<string>();
  const nodes: VideoCanvasGraph["nodes"] = [];
  for (const candidate of graph.nodes) {
    const node = record(candidate);
    const position = record(node?.position);
    const id = node?.nodeId;
    const kind = node ? nativeNodeKind(node) : null;
    const legacy = record(node?.legacySourceNode);
    const legacyPorts = legacy ? workflowPorts(legacy.ports) : null;
    if (
      !node || !nonEmptyString(id) || nodeIds.has(id) || !kind ||
      !NATIVE_NODE_KINDS.has(String(node.kind || "")) ||
      !position || typeof position.x !== "number" || !Number.isFinite(position.x) ||
      typeof position.y !== "number" || !Number.isFinite(position.y) ||
      Math.abs(position.x) > 20_000 || Math.abs(position.y) > 20_000 ||
      (legacy && (legacy.id !== id || typeof legacy.kind !== "string" || !legacyPorts))
    ) {
      throw new Error("视频工程含有无法投影的节点；未改用旧图覆盖当前版本。");
    }
    nodeIds.add(id);
    const params = legacy
      ? record(legacy.params) || {}
      : {
          ...(typeof node.prompt === "string" ? { prompt: node.prompt } : {}),
          ...(typeof node.text === "string" ? { text: node.text } : {}),
          ...(typeof node.model === "string" ? { model: node.model } : {}),
          ...(typeof node.ratio === "string" ? { ratio: node.ratio } : {}),
          ...(typeof node.durationSeconds === "number" ? { durationSeconds: node.durationSeconds } : {}),
        };
    nodes.push({
      id,
      kind,
      label: typeof node.title === "string" ? node.title.slice(0, 256) : id,
      x: position.x,
      y: position.y,
      params,
      ports: legacyPorts || { inputs: [], outputs: [] },
      nativeKind: node.kind,
      ...(typeof node.assetId === "string" ? { assetId: node.assetId } : {}),
      ...(legacy ? { legacySourceNode: structuredClone(legacy) } : {}),
    } as VideoCanvasGraph["nodes"][number]);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edgeIds = new Set<string>();
  const edges: VideoCanvasGraph["edges"] = [];
  for (const candidate of graph.edges) {
    const edge = record(candidate);
    const legacy = record(edge?.legacySourceEdge);
    const id = edge?.edgeId;
    const fromNodeId = edge?.sourceNodeId;
    const toNodeId = edge?.targetNodeId;
    const fromPort = typeof edge?.sourceHandle === "string" && edge.sourceHandle
      ? edge.sourceHandle
      : legacy
        ? legacy.fromPort
        : "out-media";
    const toPort = typeof edge?.targetHandle === "string" && edge.targetHandle
      ? edge.targetHandle
      : legacy
        ? legacy.toPort
        : "in-media";
    const fromNode = typeof fromNodeId === "string" ? nodeById.get(fromNodeId) : undefined;
    const toNode = typeof toNodeId === "string" ? nodeById.get(toNodeId) : undefined;
    if (
      !edge || !nonEmptyString(id) || edgeIds.has(id) ||
      !nonEmptyString(fromNodeId) || !nonEmptyString(toNodeId) ||
      !fromNode || !toNode || !nonEmptyString(fromPort, 128) || !nonEmptyString(toPort, 128) ||
      (legacy && (
        legacy.id !== id || legacy.fromNodeId !== fromNodeId || legacy.toNodeId !== toNodeId ||
        legacy.fromPort !== fromPort || legacy.toPort !== toPort ||
        (edge.sourceHandle !== undefined && edge.sourceHandle !== legacy.fromPort) ||
        (edge.targetHandle !== undefined && edge.targetHandle !== legacy.toPort)
      ))
    ) {
      throw new Error("视频工程含有悬空或不一致的连线；未改用旧图覆盖当前版本。");
    }
    edgeIds.add(id);
    const outputs = fromNode.ports.outputs ?? (fromNode.ports.outputs = []);
    const inputs = toNode.ports.inputs ?? (toNode.ports.inputs = []);
    const hasOutput = outputs.some((port) => port.name === fromPort);
    const hasInput = inputs.some((port) => port.name === toPort);
    if (legacy && (!hasOutput || !hasInput)) {
      throw new Error("视频工程原始命名端口与连线不一致；未改用旧图覆盖当前版本。");
    }
    if (!legacy) {
      if (!hasOutput) outputs.push({ name: fromPort, dataType: "any" });
      if (!hasInput) inputs.push({ name: toPort, dataType: "any" });
    }
    edges.push({
      id,
      fromNodeId,
      fromPort,
      toNodeId,
      toPort,
      ...(typeof legacy?.condition === "string" ? { condition: legacy.condition } : {}),
      ...(legacy ? { legacySourceEdge: structuredClone(legacy) } : {}),
    } as VideoCanvasGraph["edges"][number]);
  }
  return { nodes, edges, readOnlyNativeV2: true } as VideoCanvasGraph;
}

/** v2 project items open in the editable `VideoProjectStage`, not the v1 graph stage. */
export function isNativeVideoProjectItem(item: LibraryItem | null | undefined): boolean {
  return Boolean(item && sourceFormatIsNativeVideo(item));
}

function sourceFormatIsNativeVideo(item: LibraryItem): boolean {
  const metaFormat = item.meta?.source_format || item.meta?.format;
  return item.artifact?.sourceFormat === NATIVE_VIDEO_PROJECT_SCHEMA ||
    metaFormat === NATIVE_VIDEO_PROJECT_SCHEMA;
}

export function nativeVideoSourceUrl(item: LibraryItem): string {
  // A stale editor_project_url can still point at the pre-migration v1 body.
  // Canonical source/full renditions are authoritative for v2 reopens.
  return storedEditorProjectUrl({
    ...item,
    meta: { ...item.meta, editor_project_url: "" },
  });
}

export type WorkflowGraphPlan =
  | { kind: "ready"; graph: VideoCanvasGraph }
  | { kind: "blank"; graph: VideoCanvasGraph }
  | { kind: "remote"; url: string }
  | { kind: "fail"; error: string };

function emptyGraph(): VideoCanvasGraph {
  return { nodes: [], edges: [] };
}

function asGraph(value: unknown): VideoCanvasGraph | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fromWrapper = parseVideoCanvasProject(value);
  if (fromWrapper) return fromWrapper;
  const record = value as { nodes?: unknown; edges?: unknown };
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) return null;
  return {
    nodes: record.nodes as VideoCanvasGraph["nodes"],
    edges: record.edges as VideoCanvasGraph["edges"],
  };
}

function graphFromVideoCanvasProject(project: VideoCanvasProject): VideoCanvasGraph | null {
  const head =
    project.versions.find((version) => version.id === project.headVersionId) ||
    project.versions[0];
  return head?.graph ? asGraph(head.graph) : null;
}

export function parseStoredWorkflowGraph(text: string): VideoCanvasGraph {
  const unwrapped = unwrapStoredEditorProject(text);
  const asObject =
    typeof unwrapped === "string" ? (JSON.parse(unwrapped) as unknown) : unwrapped;
  const nativeGraph = nativeVideoProjectGraph(asObject);
  if (nativeGraph) return nativeGraph;
  const graph = asGraph(asObject);
  if (graph) return graph;
  const project = parseVideoCanvasSource(
    typeof asObject === "string" ? asObject : JSON.stringify(asObject),
  );
  const fromProject = graphFromVideoCanvasProject(project);
  if (fromProject) return fromProject;
  throw new Error("工作流工程里没有可打开的节点图");
}

export function planWorkflowGraphFromItem(
  item: LibraryItem | null | undefined,
): WorkflowGraphPlan {
  if (!item) {
    return { kind: "blank", graph: emptyGraph() };
  }
  if (sourceFormatIsNativeVideo(item)) {
    const url = nativeVideoSourceUrl(item);
    if (url) return { kind: "remote", url };
    return {
      kind: "fail",
      error: "这份视频工程没有可读取的当前 v2 源版本，未改用旧图画覆盖原件。",
    };
  }
  const meta = item.meta as { graph?: unknown } | undefined;
  const inline = asGraph(meta?.graph);
  if (inline && (inline.nodes.length > 0 || inline.edges.length > 0)) {
    return { kind: "ready", graph: inline };
  }
  if (inline && !item.artifactId && !storedEditorProjectUrl(item)) {
    return { kind: "ready", graph: inline };
  }
  const url = storedEditorProjectUrl(item);
  if (url) return { kind: "remote", url };
  if (isDurableLibraryItem(item) || item.artifactId) {
    return {
      kind: "fail",
      error: "这份工作流没有可打开的节点图，未改用空白图画覆盖原件。",
    };
  }
  return { kind: "blank", graph: emptyGraph() };
}

export async function hydrateWorkflowGraph(
  plan: WorkflowGraphPlan,
  loadText: TextLoader,
): Promise<{ ok: true; graph: VideoCanvasGraph } | { ok: false; error: string }> {
  if (plan.kind === "ready" || plan.kind === "blank") {
    return { ok: true, graph: plan.graph };
  }
  if (plan.kind === "fail") return { ok: false, error: plan.error };
  try {
    const text = await loadText(plan.url);
    if (!text || !String(text).trim()) {
      return {
        ok: false,
        error: "远程工作流工程为空，未改用空白图画覆盖原件。",
      };
    }
    return { ok: true, graph: parseStoredWorkflowGraph(text) };
  } catch (caught) {
    const detail =
      caught instanceof Error && caught.message.trim()
        ? caught.message.trim()
        : "远程工作流工程无法读取";
    return {
      ok: false,
      error: `${detail}，未改用空白图画覆盖原件。`,
    };
  }
}

/**
 * Loads the exact stored v2 project for editing. Fails closed with a sentence;
 * never substitutes a blank or projected graph for a source it cannot read.
 */
export async function loadVideoProjectDoc(
  item: LibraryItem,
  loadText: TextLoader,
): Promise<VideoDocParse> {
  const url = nativeVideoSourceUrl(item);
  if (!url) {
    return { ok: false, error: "这份视频画布没有可读取的当前版本，未改用空白画布覆盖原件。" };
  }
  let text: string;
  try {
    text = await loadText(url);
  } catch (caught) {
    const detail = caught instanceof Error && caught.message.trim() ? caught.message.trim() : "视频画布读取失败";
    return { ok: false, error: `${detail}，未改用空白画布覆盖原件。` };
  }
  if (!text || !String(text).trim()) {
    return { ok: false, error: "视频画布的源文件是空的，未改用空白画布覆盖原件。" };
  }
  let value: unknown;
  try {
    const unwrapped = unwrapStoredEditorProject(text);
    value = typeof unwrapped === "string" ? JSON.parse(unwrapped) : unwrapped;
  } catch {
    return { ok: false, error: "视频画布的源文件不是有效的 JSON，未改用空白画布覆盖原件。" };
  }
  return parseVideoProjectDoc(value);
}
