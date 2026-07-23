"use client";

import { uploadFile } from "../../lib/database";
import {
  renderTimeline,
  type RenderJobState,
  type SubmitRenderPayload,
} from "../video-editor/render-client";
import type { TimelineDoc } from "../video-editor/types";
import type {
  Model3DDirectorDocument,
  Model3DPrevisAdapter,
  Model3DPrevisAdapterContext,
  Model3DPrevisMedia,
} from "./model3d-director";
import type {
  Model3DPlayblastCapture,
  Model3DSceneRuntime,
} from "./model3d-runtime.mjs";

export const MODEL3D_PLAYBLAST_TIMELINE_SCHEMA =
  "oceanleo.model3d-playblast-timeline@1" as const;

export interface Model3DPlayblastSourceUpload {
  url: string;
}

export interface Model3DPlayblastAdapterOptions {
  getRuntime: () => Model3DSceneRuntime | null;
  getDocument?: () => Readonly<Model3DDirectorDocument>;
  siteId?: string;
  title?: string;
  parentId?: string;
  fps?: number;
  pollMs?: number;
  adapterId?: string;
  uploadSource?: (
    file: File,
    input: {
      siteId: string;
      title: string;
      requestId: string;
      signal: AbortSignal;
    },
  ) => Promise<Model3DPlayblastSourceUpload>;
  render?: (
    payload: SubmitRenderPayload,
    onState: (state: RenderJobState, jobId: string) => void,
    pollMs: number,
    signal: AbortSignal,
  ) => Promise<string>;
}

function typedError(
  code: string,
  message: string,
  retryable = false,
): Error & { code: string; retryable: boolean } {
  const error = new Error(message) as Error & {
    code: string;
    retryable: boolean;
  };
  error.code = code;
  error.retryable = retryable;
  return error;
}

function evenDimension(value: number, fallback: number): number {
  const bounded = Math.max(16, Math.min(3_840, Math.round(value || fallback)));
  return bounded - (bounded % 2);
}

export function model3DPlayblastTimeline(
  sourceUrl: string,
  capture: Pick<
    Model3DPlayblastCapture,
    "durationMs" | "fps" | "width" | "height"
  >,
  requestId: string,
): Readonly<TimelineDoc> {
  const url = sourceUrl.trim();
  if (!url) throw typedError("model3d-playblast-source-missing", "Playblast source URL is missing");
  const durationMs = Math.round(Number(capture.durationMs));
  if (!Number.isFinite(durationMs) || durationMs < 100) {
    throw typedError(
      "model3d-playblast-duration-invalid",
      "Playblast source duration is invalid",
    );
  }
  const fps = Math.max(1, Math.min(60, Math.round(capture.fps || 24)));
  return Object.freeze({
    width: evenDimension(capture.width, 1_280),
    height: evenDimension(capture.height, 720),
    fps,
    tracks: Object.freeze([
      Object.freeze({
        id: `model3d-playblast-track-${requestId}`,
        kind: "video" as const,
        clips: Object.freeze([
          Object.freeze({
            id: `model3d-playblast-clip-${requestId}`,
            start_ms: 0,
            duration_ms: durationMs,
            source_duration_ms: durationMs,
            source_url: url,
            in_ms: 0,
            speed: 1,
            volume: 0,
            muted: true,
            x: 0.5,
            y: 0.5,
            scale: 1,
            opacity: 1,
            rotation: 0,
            fit: "contain" as const,
          }),
        ]),
      }),
    ]),
  }) as unknown as Readonly<TimelineDoc>;
}

function renderProgress(
  state: RenderJobState,
): Parameters<Model3DPrevisAdapterContext["onProgress"]>[0] {
  switch (state.status) {
    case "charging":
      return { phase: "uploading", progress: 0.7, message: "Charging render" };
    case "queued":
      return { phase: "encoding", progress: 0.74, message: "Render queued" };
    case "running":
      return { phase: "encoding", progress: 0.84, message: "Rendering MP4" };
    case "canceling":
    case "canceled":
      return { phase: "canceling", progress: 0.84 };
    case "settling":
      return { phase: "uploading", progress: 0.95, message: "Storing durable MP4" };
    case "done":
      return { phase: "complete", progress: 1 };
    case "error":
      return { phase: "encoding", progress: 0.9, message: state.error };
  }
}

async function defaultUploadSource(
  file: File,
  input: {
    siteId: string;
    title: string;
    signal: AbortSignal;
  },
): Promise<Model3DPlayblastSourceUpload> {
  if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");
  const uploaded = await uploadFile(file, {
    siteId: input.siteId,
    title: input.title,
  });
  if (input.signal.aborted) throw new DOMException("Aborted", "AbortError");
  const url = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !url) {
    throw typedError(
      "model3d-playblast-upload-failed",
      uploaded.error || "Playblast source upload failed",
      true,
    );
  }
  return { url };
}

function activeBinding(document: Readonly<Model3DDirectorDocument>) {
  const shot = document.shots.find(
    (entry) => entry.id === document.activeShotId,
  );
  const take = shot?.takes.find(
    (entry) => entry.id === document.activeTakeId,
  );
  if (!shot || !take) {
    throw typedError(
      "model3d-playblast-binding-missing",
      "Playblast requires an active director shot and take",
    );
  }
  return { shot, take };
}

function extensionForVideo(mimeType: string): string {
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("ogg")) return "ogv";
  return "webm";
}

/**
 * Real local-to-durable playblast executor:
 * Three canvas → MediaRecorder source → durable file upload → TimelineDoc →
 * cancellable gateway FFmpeg render → durable MP4 receipt.
 */
export function createModel3DPlayblastAdapter(
  options: Model3DPlayblastAdapterOptions,
): Model3DPrevisAdapter {
  const uploadSource = options.uploadSource || defaultUploadSource;
  const render = options.render || renderTimeline;
  const siteId = options.siteId?.trim() || "threed";
  const title = options.title?.trim() || "3D playblast";
  const fps = Math.max(1, Math.min(60, Math.round(options.fps || 24)));
  const pollMs = Math.max(250, options.pollMs || 2_000);
  return {
    id: options.adapterId?.trim() || "three-mediarecorder-timeline-ffmpeg",
    availability(kind) {
      if (kind !== "playblast") {
        return {
          enabled: false,
          reason: "This adapter only executes playblast captures",
        };
      }
      const runtime = options.getRuntime();
      if (!runtime) {
        return { enabled: false, reason: "The Three scene runtime is not ready" };
      }
      const runtimeCapability = runtime.playblastCapability();
      if (!runtimeCapability.enabled) return runtimeCapability;
      const document = options.getDocument?.();
      if (document) {
        try {
          const { shot } = activeBinding(document);
          if (shot.durationMs > 120_000) {
            return {
              enabled: false,
              reason:
                "Browser playblast supports shots up to 120000ms; shorten or split this shot",
            };
          }
          if (shot.camera.projection === "orthographic") {
            return {
              enabled: false,
              reason:
                "The current Three workbench cannot record an orthographic director camera",
            };
          }
          if (shot.camera.depthOfFieldEnabled) {
            const depthOfField = runtime.depthOfFieldCapability();
            if (!depthOfField.enabled) return depthOfField;
          }
        } catch (caught) {
          return {
            enabled: false,
            reason:
              caught instanceof Error
                ? caught.message
                : "Playblast director binding is invalid",
          };
        }
      }
      return runtimeCapability;
    },
    async capture(
      kind,
      document,
      context,
    ): Promise<Model3DPrevisMedia> {
      if (kind !== "playblast") {
        throw typedError(
          "model3d-playblast-kind-invalid",
          "This adapter only executes playblast captures",
        );
      }
      const runtime = options.getRuntime();
      if (!runtime) {
        throw typedError(
          "model3d-playblast-runtime-missing",
          "The Three scene runtime is not ready",
          true,
        );
      }
      const { shot, take } = activeBinding(document);
      context.onProgress({
        phase: "capturing",
        progress: 0.02,
        message: `Capturing ${shot.name} / ${take.name}`,
      });
      const capture = await runtime.capturePlayblast({
        durationMs: shot.durationMs,
        fps,
        camera: shot.camera,
        motionPath: take.motionPath,
        poses: take.poses,
        signal: context.signal,
        onProgress: (progress) =>
          context.onProgress({
            phase: "capturing",
            progress: 0.02 + progress * 0.53,
          }),
      });
      if (context.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      context.onProgress({
        phase: "uploading",
        progress: 0.58,
        message: "Uploading playblast source",
      });
      const sourceTitle = `${title}-${shot.name}-${take.name}`;
      const source = await uploadSource(
        new File(
          [capture.blob],
          `${context.requestId}.${extensionForVideo(capture.mimeType)}`,
          { type: capture.mimeType },
        ),
        {
          siteId,
          title: sourceTitle,
          requestId: context.requestId,
          signal: context.signal,
        },
      );
      const timeline = model3DPlayblastTimeline(
        source.url,
        capture,
        context.requestId,
      );
      context.onProgress({
        phase: "encoding",
        progress: 0.68,
        message: "Submitting timeline render",
      });
      let renderJobId = "";
      const url = await render(
        {
          timeline: structuredClone(timeline) as TimelineDoc,
          title: sourceTitle,
          site_id: siteId,
          ...(options.parentId ? { parent_id: options.parentId } : {}),
        },
        (state, jobId) => {
          if (jobId) renderJobId = jobId;
          context.onProgress(renderProgress(state));
        },
        pollMs,
        context.signal,
      );
      if (!url) {
        throw typedError(
          "model3d-playblast-render-empty",
          "Timeline renderer completed without a durable MP4 URL",
          true,
        );
      }
      return {
        url,
        mimeType: "video/mp4",
        sourceUrl: source.url,
        ...(renderJobId ? { renderJobId } : {}),
        timelineSchema: MODEL3D_PLAYBLAST_TIMELINE_SCHEMA,
        width: timeline.width,
        height: timeline.height,
        durationMs: capture.durationMs,
        fps: capture.fps,
        frameCount: capture.frameCount,
      };
    },
  };
}
