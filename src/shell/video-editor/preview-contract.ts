import type { TimelineClip } from "./types";

/**
 * video-timeline.md §3.3 预览分辨率契约的公开面。判据本体在
 * `timeline-carrier.ts`（与 IR / 完备判据同源），这里转出来是因为调用方
 * 找「预览契约」时先来这个文件。
 */
export {
  assertPreviewResolution,
  previewRenditionSize,
  thumbnailRenditionSize,
  thumbnailResolutionOk,
  TIMELINE_DELIVERY_TIERS,
  deliveryTierFor,
} from "./timeline-carrier";
export type { PreviewResolutionVerdict, ResolutionPair } from "./timeline-carrier";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export interface TimelineVideoDrawSpec {
  drawWidth: number;
  drawHeight: number;
  centerX: number;
  centerY: number;
  rotationRadians: number;
  alpha: number;
  filter: string;
}

export function timelineVideoDrawSpec(
  clip: TimelineClip,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  transitionAlpha = 1,
): TimelineVideoDrawSpec {
  const fitMode = clip.fit ?? "contain";
  const scale = clip.scale ?? 1;
  let drawWidth: number;
  let drawHeight: number;
  if (fitMode === "stretch") {
    drawWidth = width * scale;
    drawHeight = height * scale;
  } else {
    const fit =
      fitMode === "cover"
        ? Math.max(width / sourceWidth, height / sourceHeight)
        : Math.min(width / sourceWidth, height / sourceHeight);
    drawWidth = sourceWidth * fit * scale;
    drawHeight = sourceHeight * fit * scale;
  }
  const brightness = Math.max(0, 1 + (clip.brightness ?? 0));
  const contrast = Math.max(0, clip.contrast ?? 1);
  const saturation = Math.max(0, clip.saturation ?? 1);
  return {
    drawWidth,
    drawHeight,
    centerX: (clip.x ?? 0.5) * width,
    centerY: (clip.y ?? 0.5) * height,
    rotationRadians: ((clip.rotation ?? 0) * Math.PI) / 180,
    alpha: clamp01(transitionAlpha * (clip.opacity ?? 1)),
    filter: `brightness(${brightness}) contrast(${contrast}) saturate(${saturation})`,
  };
}

export function drawTimelineVideoFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  clip: TimelineClip,
  width: number,
  height: number,
  transitionAlpha = 1,
): TimelineVideoDrawSpec {
  const spec = timelineVideoDrawSpec(
    clip,
    video.videoWidth,
    video.videoHeight,
    width,
    height,
    transitionAlpha,
  );
  ctx.save();
  ctx.translate(spec.centerX, spec.centerY);
  ctx.rotate(spec.rotationRadians);
  ctx.filter = spec.filter;
  ctx.globalAlpha = spec.alpha;
  ctx.drawImage(
    video,
    -spec.drawWidth / 2,
    -spec.drawHeight / 2,
    spec.drawWidth,
    spec.drawHeight,
  );
  ctx.restore();
  return spec;
}
