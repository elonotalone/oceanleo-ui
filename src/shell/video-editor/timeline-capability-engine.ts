import {
  addClipToTrack,
  addTrackTo,
  changeClipSpeed,
  createEmptyDoc,
  duplicateClipIn,
  findClip,
  moveClipTo,
  normalizeTimelineDoc,
  patchClipIn,
  removeClipFrom,
  removeTrackFrom,
  splitClipAt,
  timelineDocIssue,
  trimClipTo,
} from "./timeline-model";
import type {
  TimelineClip,
  TimelineDoc,
  TimelineTrack,
  TrackKind,
} from "./types";

export const TIMELINE_KERNEL_SCHEMA = "oceanleo.timeline-kernel@1" as const;
export const TIMELINE_SNAPSHOT_SCHEMA = "oceanleo.timeline-snapshot@1" as const;
export const TIMELINE_RUN_RECEIPT_SCHEMA =
  "oceanleo.timeline-run-receipt@1" as const;
export const TIMELINE_DOCUMENT_VERSION = 1 as const;

export type TimelineSemanticCommandId =
  | "set-canvas"
  | "add-track"
  | "remove-track"
  | "add-clip"
  | "remove-clip"
  | "move-clip"
  | "trim-clip"
  | "split-clip"
  | "duplicate-clip"
  | "patch-clip"
  | "set-clip-speed";

export interface TimelineCommandDescriptor {
  id: TimelineSemanticCommandId;
  mutates: "document";
  immutable: true;
  description: string;
}

const timelineCommand = (
  id: TimelineSemanticCommandId,
  description: string,
): TimelineCommandDescriptor => ({
  id,
  mutates: "document",
  immutable: true,
  description,
});

export const TIMELINE_COMMAND_REGISTRY = Object.freeze([
  timelineCommand("set-canvas", "Set normalized output dimensions and frame rate."),
  timelineCommand("add-track", "Append a typed media track."),
  timelineCommand("remove-track", "Remove a track while retaining one root track."),
  timelineCommand("add-clip", "Append a clip to a compatible track."),
  timelineCommand("remove-clip", "Remove a clip by stable identity."),
  timelineCommand("move-clip", "Move a clip with overlap resolution."),
  timelineCommand("trim-clip", "Trim a clip edge within source and neighbor bounds."),
  timelineCommand("split-clip", "Split a clip at a timeline timestamp."),
  timelineCommand("duplicate-clip", "Duplicate a clip with a fresh identity."),
  timelineCommand("patch-clip", "Patch safe clip properties without changing identity."),
  timelineCommand("set-clip-speed", "Change speed while preserving source span."),
]) as readonly TimelineCommandDescriptor[];

export type TimelineSemanticCommand =
  | {
      id: "set-canvas";
      width: number;
      height: number;
      fps: number;
    }
  | { id: "add-track"; kind: TrackKind }
  | { id: "remove-track"; trackId: string }
  | { id: "add-clip"; trackId: string; clip: TimelineClip }
  | { id: "remove-clip"; clipId: string }
  | {
      id: "move-clip";
      clipId: string;
      targetTrackId: string;
      startMs: number;
    }
  | {
      id: "trim-clip";
      clipId: string;
      edge: "start" | "end";
      timeMs: number;
    }
  | { id: "split-clip"; clipId: string; timeMs: number }
  | { id: "duplicate-clip"; clipId: string }
  | {
      id: "patch-clip";
      clipId: string;
      patch: Partial<Omit<TimelineClip, "id">>;
    }
  | { id: "set-clip-speed"; clipId: string; speed: number };

export interface TimelineKernelState {
  schema: typeof TIMELINE_KERNEL_SCHEMA;
  documentVersion: typeof TIMELINE_DOCUMENT_VERSION;
  revision: number;
  doc: Readonly<TimelineDoc>;
  dirty: boolean;
  lastCommandId?: TimelineSemanticCommandId;
  updatedAt: string;
}

export interface TimelineEditResult {
  changed: boolean;
  state: Readonly<TimelineKernelState>;
  createdClipId?: string;
}

export interface TimelineVersionSnapshot {
  schema: typeof TIMELINE_SNAPSHOT_SCHEMA;
  documentVersion: typeof TIMELINE_DOCUMENT_VERSION;
  snapshotId: string;
  revision: number;
  doc: Readonly<TimelineDoc>;
  createdAt: string;
}

export interface TimelineEngineClock {
  now?: () => string;
  makeId?: (prefix: string) => string;
}

function now(clock?: TimelineEngineClock): string {
  return clock?.now?.() || new Date().toISOString();
}

function defaultId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, "");
  return `${prefix}_${random || `${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2)}`}`;
}

function makeId(prefix: string, clock?: TimelineEngineClock): string {
  return clock?.makeId?.(prefix) || defaultId(prefix);
}

function freezeClip(clip: TimelineClip): Readonly<TimelineClip> {
  return Object.freeze({
    ...clip,
    ...(clip.style ? { style: Object.freeze({ ...clip.style }) } : {}),
    ...(clip.transition_in
      ? { transition_in: Object.freeze({ ...clip.transition_in }) }
      : {}),
  });
}

export function freezeTimelineDoc(doc: TimelineDoc): Readonly<TimelineDoc> {
  const tracks = doc.tracks.map((track) =>
    Object.freeze({
      ...track,
      clips: Object.freeze(track.clips.map(freezeClip)),
    }),
  );
  return Object.freeze({
    ...doc,
    tracks: Object.freeze(tracks),
  }) as unknown as Readonly<TimelineDoc>;
}

function canonicalTimelineDoc(value: TimelineDoc): Readonly<TimelineDoc> {
  const issue = timelineDocIssue(value);
  if (issue) throw new Error(`Invalid TimelineDoc: ${issue}`);
  return freezeTimelineDoc(normalizeTimelineDoc(value));
}

export function createTimelineKernelState(
  doc: TimelineDoc = createEmptyDoc(),
  options: TimelineEngineClock & { revision?: number; dirty?: boolean } = {},
): Readonly<TimelineKernelState> {
  const revision = Number(options.revision ?? 0);
  if (!Number.isInteger(revision) || revision < 0) {
    throw new Error("Timeline revision must be a non-negative integer");
  }
  return Object.freeze({
    schema: TIMELINE_KERNEL_SCHEMA,
    documentVersion: TIMELINE_DOCUMENT_VERSION,
    revision,
    doc: canonicalTimelineDoc(doc),
    dirty: options.dirty === true,
    updatedAt: now(options),
  });
}

function requireTrack(
  doc: Readonly<TimelineDoc>,
  trackId: string,
): Readonly<TimelineTrack> {
  const track = doc.tracks.find((entry) => entry.id === trackId);
  if (!track) throw new Error(`Timeline track not found: ${trackId}`);
  return track;
}

function requireClip(doc: Readonly<TimelineDoc>, clipId: string): void {
  if (!findClip(doc as TimelineDoc, clipId)) {
    throw new Error(`Timeline clip not found: ${clipId}`);
  }
}

export function applyTimelineCommand(
  current: Readonly<TimelineKernelState>,
  command: TimelineSemanticCommand,
  clock: TimelineEngineClock = {},
): Readonly<TimelineEditResult> {
  if (
    current.schema !== TIMELINE_KERNEL_SCHEMA ||
    current.documentVersion !== TIMELINE_DOCUMENT_VERSION
  ) {
    throw new Error("Unsupported timeline kernel version");
  }
  const doc = current.doc as TimelineDoc;
  let next: TimelineDoc = doc;
  let createdClipId = "";
  switch (command.id) {
    case "set-canvas":
      next = normalizeTimelineDoc({
        ...doc,
        width: command.width,
        height: command.height,
        fps: command.fps,
      });
      break;
    case "add-track":
      if (!["video", "audio", "text", "image"].includes(command.kind)) {
        throw new Error(`Unsupported timeline track kind: ${command.kind}`);
      }
      next = addTrackTo(doc, command.kind);
      break;
    case "remove-track":
      requireTrack(current.doc, command.trackId);
      next = removeTrackFrom(doc, command.trackId);
      break;
    case "add-clip": {
      const track = requireTrack(current.doc, command.trackId);
      if (findClip(doc, command.clip.id)) {
        throw new Error(`Timeline clip id already exists: ${command.clip.id}`);
      }
      if (track.kind !== "text" && !command.clip.source_url) {
        throw new Error(`${track.kind} clip requires a source URL`);
      }
      next = addClipToTrack(doc, command.trackId, { ...command.clip });
      createdClipId = command.clip.id;
      break;
    }
    case "remove-clip":
      requireClip(current.doc, command.clipId);
      next = removeClipFrom(doc, command.clipId);
      break;
    case "move-clip":
      requireClip(current.doc, command.clipId);
      requireTrack(current.doc, command.targetTrackId);
      next = moveClipTo(
        doc,
        command.clipId,
        command.targetTrackId,
        command.startMs,
      );
      break;
    case "trim-clip":
      requireClip(current.doc, command.clipId);
      next = trimClipTo(
        doc,
        command.clipId,
        command.edge,
        command.timeMs,
      );
      break;
    case "split-clip": {
      requireClip(current.doc, command.clipId);
      const before = new Set(
        doc.tracks.flatMap((track) => track.clips.map((clip) => clip.id)),
      );
      next = splitClipAt(doc, command.clipId, command.timeMs);
      createdClipId =
        next.tracks
          .flatMap((track) => track.clips)
          .find((clip) => !before.has(clip.id))?.id || "";
      break;
    }
    case "duplicate-clip": {
      requireClip(current.doc, command.clipId);
      const duplicated = duplicateClipIn(doc, command.clipId);
      next = duplicated.doc;
      createdClipId = duplicated.newClipId;
      break;
    }
    case "patch-clip": {
      requireClip(current.doc, command.clipId);
      if ("id" in command.patch) {
        throw new Error("Timeline clip identity cannot be patched");
      }
      next = patchClipIn(doc, command.clipId, { ...command.patch });
      break;
    }
    case "set-clip-speed":
      requireClip(current.doc, command.clipId);
      next = changeClipSpeed(doc, command.clipId, command.speed);
      break;
  }
  if (next === doc) {
    return Object.freeze({ changed: false, state: current });
  }
  const state = Object.freeze({
    schema: TIMELINE_KERNEL_SCHEMA,
    documentVersion: TIMELINE_DOCUMENT_VERSION,
    revision: current.revision + 1,
    doc: canonicalTimelineDoc(next),
    dirty: true,
    lastCommandId: command.id,
    updatedAt: now(clock),
  });
  return Object.freeze({
    changed: true,
    state,
    ...(createdClipId ? { createdClipId } : {}),
  });
}

export function createTimelineVersionSnapshot(
  state: Readonly<TimelineKernelState>,
  clock: TimelineEngineClock = {},
): Readonly<TimelineVersionSnapshot> {
  if (
    state.schema !== TIMELINE_KERNEL_SCHEMA ||
    state.documentVersion !== TIMELINE_DOCUMENT_VERSION
  ) {
    throw new Error("Unsupported timeline kernel version");
  }
  return Object.freeze({
    schema: TIMELINE_SNAPSHOT_SCHEMA,
    documentVersion: TIMELINE_DOCUMENT_VERSION,
    snapshotId: makeId("timeline_snapshot", clock),
    revision: state.revision,
    // Save and render receive this exact immutable TimelineDoc reference.
    doc: state.doc,
    createdAt: now(clock),
  });
}

export interface TimelineCapabilityAvailability {
  enabled: boolean;
  reason?: string;
}

export interface TimelineRunProgress {
  phase:
    | "validating"
    | "saving"
    | "submitting"
    | "queued"
    | "rendering"
    | "finalizing"
    | "complete"
    | "canceling";
  progress: number;
  message?: string;
}

export interface TimelineRunError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface TimelineSaveResult {
  versionId: string;
  url?: string;
  projectUrl?: string;
  projectSchema?: string;
}

export interface TimelineRenderResult {
  jobId: string;
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
}

export interface TimelineAdapterContext {
  runId: string;
  signal: AbortSignal;
  setExternalRunId: (value: string) => void;
  onProgress: (value: TimelineRunProgress) => void;
}

export interface TimelineSaveAdapter {
  id: string;
  availability?: () => TimelineCapabilityAvailability;
  execute: (
    snapshot: Readonly<TimelineVersionSnapshot>,
    context: TimelineAdapterContext,
  ) => Promise<TimelineSaveResult>;
  cancel?: (
    runId: string,
    externalRunId: string | undefined,
    snapshot: Readonly<TimelineVersionSnapshot>,
  ) => Promise<void>;
}

export interface TimelineRenderAdapter {
  id: string;
  availability?: () => TimelineCapabilityAvailability;
  execute: (
    snapshot: Readonly<TimelineVersionSnapshot>,
    context: TimelineAdapterContext,
  ) => Promise<TimelineRenderResult>;
  cancel: (
    runId: string,
    externalRunId: string | undefined,
    snapshot: Readonly<TimelineVersionSnapshot>,
  ) => Promise<void>;
}

export type TimelineRunKind = "save" | "render";
export type TimelineRunStatus =
  | "unsupported"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled";

export interface TimelineRunSnapshot {
  runId: string;
  kind: TimelineRunKind;
  status: TimelineRunStatus;
  version: Readonly<TimelineVersionSnapshot>;
  progress: Readonly<TimelineRunProgress>;
  externalRunId?: string;
  disabledReason?: string;
  error?: Readonly<TimelineRunError>;
}

export interface TimelineRunReceipt<Result> {
  schema: typeof TIMELINE_RUN_RECEIPT_SCHEMA;
  runId: string;
  kind: TimelineRunKind;
  status: Exclude<TimelineRunStatus, "running">;
  adapter?: string;
  version: Readonly<TimelineVersionSnapshot>;
  progress: Readonly<TimelineRunProgress>;
  externalRunId?: string;
  disabledReason?: string;
  error?: Readonly<TimelineRunError>;
  delivery?: Readonly<Result>;
  startedAt: string;
  completedAt: string;
}

export type TimelineSaveReceipt = TimelineRunReceipt<TimelineSaveResult>;
export type TimelineRenderReceipt = TimelineRunReceipt<TimelineRenderResult>;

export interface TimelineRunHandle<Result> {
  runId: string;
  result: Promise<Readonly<TimelineRunReceipt<Result>>>;
  cancel: () => void;
  snapshot: () => Readonly<TimelineRunSnapshot>;
}

function runError(caught: unknown): Readonly<TimelineRunError> {
  const record =
    caught && typeof caught === "object"
      ? (caught as { code?: unknown; retryable?: unknown })
      : {};
  return Object.freeze({
    code:
      typeof record.code === "string" && record.code
        ? record.code.slice(0, 100)
        : "timeline-run-failed",
    message:
      caught instanceof Error
        ? caught.message.slice(0, 2_000)
        : "Timeline adapter failed",
    retryable: record.retryable === true,
  });
}

function isAbort(caught: unknown): boolean {
  return (
    (caught instanceof DOMException && caught.name === "AbortError") ||
    (Boolean(caught) &&
      typeof caught === "object" &&
      (caught as { name?: unknown }).name === "AbortError")
  );
}

function normalizeProgress(
  value: TimelineRunProgress,
  previous: number,
): Readonly<TimelineRunProgress> {
  return Object.freeze({
    phase: value.phase,
    progress: Math.max(
      previous,
      Math.min(1, Number.isFinite(value.progress) ? value.progress : previous),
    ),
    ...(value.message
      ? { message: String(value.message).trim().slice(0, 500) }
      : {}),
  });
}

function adapterAvailability(
  adapter:
    | { availability?: () => TimelineCapabilityAvailability }
    | null
    | undefined,
  kind: TimelineRunKind,
): Readonly<TimelineCapabilityAvailability> {
  if (!adapter) {
    return Object.freeze({
      enabled: false,
      reason: `No timeline ${kind} adapter is configured`,
    });
  }
  const available = adapter.availability?.() || { enabled: true };
  return Object.freeze({
    enabled: available.enabled === true,
    ...(available.reason ? { reason: available.reason } : {}),
  });
}

function startTimelineRun<Result>(
  kind: TimelineRunKind,
  adapter: {
    id: string;
    availability?: () => TimelineCapabilityAvailability;
    execute: (
      snapshot: Readonly<TimelineVersionSnapshot>,
      context: TimelineAdapterContext,
    ) => Promise<Result>;
    cancel?: (
      runId: string,
      externalRunId: string | undefined,
      snapshot: Readonly<TimelineVersionSnapshot>,
    ) => Promise<void>;
  } | null | undefined,
  version: Readonly<TimelineVersionSnapshot>,
  options: TimelineEngineClock & {
    onState?: (state: Readonly<TimelineRunSnapshot>) => void;
  } = {},
): TimelineRunHandle<Result> {
  if (
    version.schema !== TIMELINE_SNAPSHOT_SCHEMA ||
    version.documentVersion !== TIMELINE_DOCUMENT_VERSION
  ) {
    throw new Error("Unsupported TimelineDoc version snapshot");
  }
  const availability = adapterAvailability(adapter, kind);
  const runId = makeId(`timeline_${kind}`, options);
  const startedAt = now(options);
  const controller = new AbortController();
  let externalRunId = "";
  let current: Readonly<TimelineRunSnapshot> = Object.freeze({
    runId,
    kind,
    status: availability.enabled ? "running" : "unsupported",
    version,
    progress: Object.freeze({ phase: "validating", progress: 0 }),
    ...(!availability.enabled && availability.reason
      ? { disabledReason: availability.reason }
      : {}),
  });
  const emit = (patch: Partial<TimelineRunSnapshot>) => {
    current = Object.freeze({ ...current, ...patch });
    options.onState?.(current);
  };
  options.onState?.(current);

  let result: Promise<Readonly<TimelineRunReceipt<Result>>>;
  if (!adapter || !availability.enabled) {
    result = Promise.resolve(
      Object.freeze({
        schema: TIMELINE_RUN_RECEIPT_SCHEMA,
        runId,
        kind,
        status: "unsupported",
        ...(adapter?.id ? { adapter: adapter.id } : {}),
        version,
        progress: current.progress,
        ...(availability.reason
          ? { disabledReason: availability.reason }
          : {}),
        startedAt,
        completedAt: now(options),
      }),
    );
  } else {
    result = (async () => {
      try {
        const delivery = await adapter.execute(version, {
          runId,
          signal: controller.signal,
          setExternalRunId(value) {
            externalRunId = String(value || "").trim().slice(0, 300);
            emit({
              ...(externalRunId ? { externalRunId } : {}),
            });
          },
          onProgress(value) {
            emit({
              progress: normalizeProgress(
                value,
                current.progress.progress,
              ),
            });
          },
        });
        if (controller.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        const progress = Object.freeze({
          phase: "complete" as const,
          progress: 1,
        });
        emit({ status: "succeeded", progress });
        return Object.freeze({
          schema: TIMELINE_RUN_RECEIPT_SCHEMA,
          runId,
          kind,
          status: "succeeded",
          adapter: adapter.id,
          version,
          progress,
          ...(externalRunId ? { externalRunId } : {}),
          delivery: Object.freeze({ ...delivery }),
          startedAt,
          completedAt: now(options),
        });
      } catch (caught) {
        if (controller.signal.aborted || isAbort(caught)) {
          const progress = Object.freeze({
            phase: "canceling" as const,
            progress: current.progress.progress,
          });
          emit({ status: "canceled", progress });
          return Object.freeze({
            schema: TIMELINE_RUN_RECEIPT_SCHEMA,
            runId,
            kind,
            status: "canceled",
            adapter: adapter.id,
            version,
            progress,
            ...(externalRunId ? { externalRunId } : {}),
            startedAt,
            completedAt: now(options),
          });
        }
        const error = runError(caught);
        emit({ status: "failed", error });
        return Object.freeze({
          schema: TIMELINE_RUN_RECEIPT_SCHEMA,
          runId,
          kind,
          status: "failed",
          adapter: adapter.id,
          version,
          progress: current.progress,
          ...(externalRunId ? { externalRunId } : {}),
          error,
          startedAt,
          completedAt: now(options),
        });
      }
    })();
  }
  return {
    runId,
    result,
    cancel: () => {
      if (current.status !== "running") return;
      emit({
        progress: Object.freeze({
          phase: "canceling",
          progress: current.progress.progress,
        }),
      });
      controller.abort();
      if (adapter?.cancel) {
        void adapter
          .cancel(runId, externalRunId || undefined, version)
          .catch(() => undefined);
      }
    },
    snapshot: () => current,
  };
}

export function startTimelineSave(
  adapter: TimelineSaveAdapter | null | undefined,
  version: Readonly<TimelineVersionSnapshot>,
  options?: TimelineEngineClock & {
    onState?: (state: Readonly<TimelineRunSnapshot>) => void;
  },
): TimelineRunHandle<TimelineSaveResult> {
  return startTimelineRun("save", adapter, version, options);
}

export function startTimelineRender(
  adapter: TimelineRenderAdapter | null | undefined,
  version: Readonly<TimelineVersionSnapshot>,
  options?: TimelineEngineClock & {
    onState?: (state: Readonly<TimelineRunSnapshot>) => void;
  },
): TimelineRunHandle<TimelineRenderResult> {
  return startTimelineRun("render", adapter, version, options);
}

export interface TimelineCompositeKernel {
  state: () => Readonly<TimelineKernelState>;
  dispatch: (command: TimelineSemanticCommand) => Readonly<TimelineEditResult>;
  version: () => Readonly<TimelineVersionSnapshot>;
  save: (
    adapter: TimelineSaveAdapter | null | undefined,
  ) => TimelineRunHandle<TimelineSaveResult>;
  render: (
    adapter: TimelineRenderAdapter | null | undefined,
  ) => TimelineRunHandle<TimelineRenderResult>;
}

/**
 * Small stateful facade for adapters. It caches one immutable version object per
 * revision, ensuring save and render receive the same TimelineDoc snapshot.
 */
export function createTimelineCompositeKernel(
  doc?: TimelineDoc,
  clock: TimelineEngineClock = {},
): TimelineCompositeKernel {
  let state = createTimelineKernelState(doc, clock);
  let cachedVersion: Readonly<TimelineVersionSnapshot> | null = null;
  const version = () => {
    if (!cachedVersion || cachedVersion.revision !== state.revision) {
      cachedVersion = createTimelineVersionSnapshot(state, clock);
    }
    return cachedVersion;
  };
  return {
    state: () => state,
    dispatch(command) {
      const result = applyTimelineCommand(state, command, clock);
      if (result.changed) {
        state = result.state;
        cachedVersion = null;
      }
      return result;
    },
    version,
    save: (adapter) => startTimelineSave(adapter, version(), clock),
    render: (adapter) => startTimelineRender(adapter, version(), clock),
  };
}
