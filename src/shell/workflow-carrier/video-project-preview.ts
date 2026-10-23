/**
 * 库卡片封面：把当前节点图画成一张 PNG（D11 §5.2「库卡片随之更新」）。
 *
 * 封面是静态图，不跟网站明暗走：用浅色中性底，节点卡带种类色带和名称。
 * 画不出来（没有 canvas、空图）返回 null，由共享保存内核如实记成封面警告，
 * workflow 契约里 preview 是选配，不会因此假成功或假失败。
 */
import { videoKindAccent, videoKindSpec } from "./video-canvas-kinds";
import { videoDocGraph, type VideoProjectDoc } from "./video-project-doc";

export const VIDEO_PREVIEW_WIDTH = 960;
export const VIDEO_PREVIEW_HEIGHT = 540;
const NODE_W = 180;
const NODE_H = 64;
const PAD = 48;

export interface PreviewLayout {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/** Fit every node box into the cover with padding; pure for tests. */
export function videoPreviewLayout(
  points: ReadonlyArray<{ x: number; y: number }>,
  width = VIDEO_PREVIEW_WIDTH,
  height = VIDEO_PREVIEW_HEIGHT,
): PreviewLayout {
  if (!points.length) return { scale: 1, offsetX: PAD, offsetY: PAD };
  const minX = Math.min(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxX = Math.max(...points.map((p) => p.x)) + NODE_W;
  const maxY = Math.max(...points.map((p) => p.y)) + NODE_H;
  const scale = Math.min(
    1.4,
    (width - PAD * 2) / Math.max(1, maxX - minX),
    (height - PAD * 2) / Math.max(1, maxY - minY),
  );
  return {
    scale,
    offsetX: (width - (maxX - minX) * scale) / 2 - minX * scale,
    offsetY: (height - (maxY - minY) * scale) / 2 - minY * scale,
  };
}

function makeCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = VIDEO_PREVIEW_WIDTH;
  canvas.height = VIDEO_PREVIEW_HEIGHT;
  return typeof canvas.getContext === "function" ? canvas : null;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function renderVideoProjectPreview(
  doc: VideoProjectDoc,
  label: (text: string) => string = (text) => text,
): Promise<Blob | null> {
  const { nodes, edges } = videoDocGraph(doc);
  if (!nodes.length) return null;
  const canvas = makeCanvas();
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx) return null;
  const layout = videoPreviewLayout(nodes.map((node) => node.position));
  const box = (x: number, y: number) => ({
    x: x * layout.scale + layout.offsetX,
    y: y * layout.scale + layout.offsetY,
    w: NODE_W * layout.scale,
    h: NODE_H * layout.scale,
  });
  ctx.fillStyle = "#f4f4f5";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  ctx.strokeStyle = "#a1a1aa";
  ctx.lineWidth = Math.max(1, 1.5 * layout.scale);
  for (const edge of edges) {
    const from = byId.get(edge.sourceNodeId);
    const to = byId.get(edge.targetNodeId);
    if (!from || !to) continue;
    const a = box(from.position.x, from.position.y);
    const b = box(to.position.x, to.position.y);
    const sx = a.x + a.w;
    const sy = a.y + a.h / 2;
    const tx = b.x;
    const ty = b.y + b.h / 2;
    const bend = Math.max(24, Math.abs(tx - sx) / 2);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx + bend, sy, tx - bend, ty, tx, ty);
    ctx.stroke();
  }
  const fontSize = Math.max(9, Math.round(13 * layout.scale));
  for (const node of nodes) {
    const b = box(node.position.x, node.position.y);
    roundRect(ctx, b.x, b.y, b.w, b.h, 8 * layout.scale);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#e4e4e7";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = videoKindAccent(node.kind, "light");
    ctx.fillRect(b.x, b.y + 6 * layout.scale, 3 * layout.scale, b.h - 12 * layout.scale);
    ctx.fillStyle = "#71717a";
    ctx.font = `${Math.max(8, fontSize - 2)}px system-ui, sans-serif`;
    ctx.fillText(label(videoKindSpec(node.kind).label), b.x + 12 * layout.scale, b.y + b.h * 0.38, b.w - 20 * layout.scale);
    ctx.fillStyle = "#18181b";
    ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
    ctx.fillText(node.title || label(videoKindSpec(node.kind).label), b.x + 12 * layout.scale, b.y + b.h * 0.72, b.w - 20 * layout.scale);
  }
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob && blob.size > 0 ? blob : null), "image/png");
    } catch {
      resolve(null);
    }
  });
}
