// 12 个编辑器族回放画法的懒加载表（work-chat 契约 §8.4）。
// 每个 frames/<族>.tsx 默认导出 ReplayFrameRenderer | null；null 或加载失败 = 播放器用 fallback.tsx 的通用画法。
import type { ImEditorKind } from "../../../../lib/im/types";
import type { ReplayFrameRenderer } from "../frame-types";

type FrameModule = { default: ReplayFrameRenderer | null };
type FrameLoader = () => Promise<FrameModule>;

export const FRAME_LOADERS: Record<ImEditorKind, FrameLoader> = {
  richdoc: () => import("./richdoc"),
  grid: () => import("./grid"),
  deck: () => import("./deck"),
  image: () => import("./image"),
  vector: () => import("./vector"),
  chart: () => import("./chart"),
  game: () => import("./game"),
  model3d: () => import("./model3d"),
  audio: () => import("./audio"),
  pdf: () => import("./pdf"),
  video: () => import("./video"),
  workflow: () => import("./workflow"),
};

const cache = new Map<ImEditorKind, ReplayFrameRenderer | null>();

/** 取一个编辑器族的渲染器；没有（占位 null、未知族、加载失败）一律回落 null。 */
export async function loadFrameRenderer(
  kind: ImEditorKind | null | undefined,
): Promise<ReplayFrameRenderer | null> {
  if (!kind) return null;
  if (cache.has(kind)) return cache.get(kind) ?? null;
  const loader = FRAME_LOADERS[kind];
  if (!loader) return null;
  try {
    const mod = await loader();
    const renderer = mod?.default ?? null;
    cache.set(kind, renderer);
    return renderer;
  } catch {
    cache.set(kind, null);
    return null;
  }
}

export function resetFrameRendererCache(): void {
  cache.clear();
}
