// 在浏览器里把工作留痕重放成 Y.Doc（契约 §7.3「从这一步接手」与协同来源的逐帧画面）。
// `yjs` 由 W11 装进依赖；这里写成依赖注入：调用方传 `{ Doc, applyUpdate }`，测试里直接传真 yjs，
// 播放器默认用 `loadYjs()` 懒加载（加载失败 → null → 播放器用「改之前/改之后」通用画法）。
import type { TrailFrames } from "./replay-work-api";

export interface YDocLike {
  destroy?: () => void;
}

export interface YjsLike {
  Doc: new () => YDocLike;
  applyUpdate: (doc: YDocLike, update: Uint8Array, origin?: unknown) => void;
}

export type YjsLoader = () => Promise<YjsLike | null>;

/** 默认加载器：动态引入 yjs，引不到就给 null。 */
export const loadYjs: YjsLoader = async () => {
  try {
    const mod = (await import("yjs")) as unknown as YjsLike;
    return typeof mod.Doc === "function" && typeof mod.applyUpdate === "function" ? mod : null;
  } catch {
    return null;
  }
};

export function base64ToBytes(value: string): Uint8Array {
  const clean = String(value || "").replace(/\s+/g, "");
  if (!clean) return new Uint8Array(0);
  if (typeof atob === "function") {
    const binary = atob(clean);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  const buffer = (globalThis as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer;
  if (buffer) return new Uint8Array(buffer.from(clean, "base64"));
  throw new Error("no base64 decoder");
}

export interface TrailReconstructor {
  /** 还原到第 `seq` 号更新之后（含）的文档；往前走就地增量，往回走从基础状态重来。 */
  docAt(seq: number): YDocLike;
  /** 当前文档停在哪个 seq。 */
  readonly currentSeq: number;
  dispose(): void;
}

export function createTrailReconstructor(Y: YjsLike, frames: TrailFrames): TrailReconstructor {
  const updates = [...frames.updates].sort((a, b) => a.seq - b.seq);
  let doc: YDocLike | null = null;
  let applied = -1; // updates 里已应用到的下标
  let currentSeq = frames.base_seq;

  const rebuild = (): YDocLike => {
    doc?.destroy?.();
    const next = new Y.Doc();
    const base = base64ToBytes(frames.base_state);
    if (base.length > 0) Y.applyUpdate(next, base, "replay");
    doc = next;
    applied = -1;
    currentSeq = frames.base_seq;
    return next;
  };

  return {
    docAt(seq: number): YDocLike {
      let target = doc ?? rebuild();
      if (seq < currentSeq) target = rebuild();
      while (applied + 1 < updates.length && updates[applied + 1]!.seq <= seq) {
        applied += 1;
        const update = updates[applied]!;
        const bytes = base64ToBytes(update.update);
        if (bytes.length > 0) Y.applyUpdate(target, bytes, "replay");
        currentSeq = update.seq;
      }
      return target;
    },
    get currentSeq() {
      return currentSeq;
    },
    dispose() {
      doc?.destroy?.();
      doc = null;
      applied = -1;
    },
  };
}

/** 一步到位：还原到某个 seq 并交给编辑器族的 `fromY` 取快照（失败返回 null）。 */
export function snapshotAt(
  reconstructor: TrailReconstructor,
  seq: number,
  fromY: ((doc: unknown) => unknown) | undefined,
): unknown {
  if (!fromY) return null;
  try {
    return fromY(reconstructor.docAt(seq));
  } catch {
    return null;
  }
}
