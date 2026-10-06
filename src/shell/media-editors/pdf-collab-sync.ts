/**
 * PDF 按批注多人同改的对齐器（work-chat 第二轮 F05）。不依赖 React、不依赖 WebSocket：
 * 给它一个「房间」（只用 `doc` / `needsSeed` / `completeSeed` / `role` / `lock` / `self`）和一个「字节宿主」，
 * 它负责把本地字节里的批注 / 表单 / 页结构与共享文档做三方合并。
 *
 * 为什么不用 `bindJsonState.push`：它是「整份状态覆盖」，本地字节是异步解析出来的，
 * 解析那一刻对方的新批注可能刚到、本地还没有——整份覆盖会把对方的批注当成「我删了」。
 * 这里每次只把「本地相对上次对齐 base 的改动」写进共享文档，对方的东西不会被碰。
 */
import { readJsonStateRoot, hasJsonStateRoot, writeJsonStateRoot, SEED_ORIGIN } from "../collab/bind-json-state";
import { isCollabReadOnly } from "../collab/provider";
import type { CollabRoom } from "../collab/index";
import {
  pdfSyncApply,
  pdfSyncDiff,
  pdfSyncReconcile,
  type PdfSyncOps,
} from "../collab/adapters/pdf";
import type { EntityDoc } from "../collab/adapters/video";
import {
  applyPdfKeepTargets,
  applyPdfSyncOps,
  isOpaquePdfAnnotation,
  readPdfCollabShape,
} from "./pdf-collab-bytes";

export const PDF_COLLAB_ROOT = "oceanleo:pdf";

type Shape = Required<EntityDoc>;
type RoomLike = Pick<CollabRoom, "doc" | "needsSeed" | "completeSeed" | "role" | "lock" | "self" | "status">;

export type PdfReplaceResult = "applied" | "unchanged" | "busy";

export interface PdfSyncHost {
  getBytes(): Uint8Array | null;
  /**
   * 静默换字节（不进撤销栈、不清选区）：`transform` 拿到应用那一刻的字节，返回 null = 没有要改的。
   * 应用时字节已被本地另一次编辑换掉 / 正有一次编辑在跑 → 返回 `"busy"`，对齐器稍后重来，不会丢任何一边。
   */
  replaceBytes(transform: (current: Uint8Array) => Promise<Uint8Array | null>): Promise<PdfReplaceResult>;
}

export interface PdfCollabSyncOptions {
  room: RoomLike;
  host: PdfSyncHost;
  /** 本端此刻是否持有整页锁（只有它能把页结构推给别人）。 */
  holdsPages(): boolean;
  /** 表单字段是否一起同步。 */
  includeFields?: boolean;
  /** 对齐出了变化（给界面刷新用）：本地字节被补了对方的改动。 */
  onInbound?(): void;
  rootName?: string;
  /** 测试用：忙时重试的等待毫秒数。 */
  retryDelayMs?: number;
}

/** 本地动过的字段：键 → 字段名集合；`"+"` = 我新增了这条，`"-"` = 我删了这条。撤销时只撤这些，别人的保持原样。 */
type Authored = Map<string, Set<string>>;

export interface PdfCollabSync {
  /** 排一次对齐（多次调用合并成一次）；返回这一轮结束时的 Promise。 */
  reconcile(): Promise<void>;
  /** 载入完成（未编辑）时记下 base：本地在同步前做的改动之后仍会被推出去。 */
  setBaseline(bytes: Uint8Array): Promise<void>;
  /**
   * 撤销 / 重做 / 重新载入后字节被换成一份旧版本：把不是我改的批注与表单字段补回来，
   * 我自己改过的保持旧版本里的样子。`keepEverything` = 整份重新载入（别人保存了新页结构）：
   * 所有批注都以当前为准，只采纳新字节里的页结构。
   */
  adjustRestored(restored: Uint8Array, current: Uint8Array, options?: { keepEverything?: boolean }): Promise<Uint8Array>;
  /** 释放房间时先把页结构对齐一次（调用方在放锁之前 await）。 */
  flush(): Promise<void>;
  /** 本地改动涉及的键（测试与诊断用）。 */
  authoredKeys(): string[];
  dispose(): void;
}

const dataKeys = (shape: EntityDoc): string[] => Object.keys(shape.entities).filter((key) => !key.startsWith("p:"));

function recordAuthored(authored: Authored, ops: PdfSyncOps): void {
  const add = (key: string, field: string) => {
    const set = authored.get(key) ?? new Set<string>();
    set.add(field);
    authored.set(key, set);
  };
  for (const key of ops.removes) add(key, "-");
  for (const [key, change] of Object.entries(ops.upserts)) {
    if (change.isNew) add(key, "+");
    for (const field of Object.keys(change.set)) add(key, field);
    for (const field of change.unset) add(key, field);
  }
}

/** 把页结构换成 `local` 的、数据键保持 `base` 的：base 里的页永远等于本地字节里的页。 */
function withLocalPages(base: Shape, local: Shape): Shape {
  const entities: Shape["entities"] = {};
  const order: string[] = [];
  for (const key of local.order) {
    if (key.startsWith("p:") && local.entities[key]) {
      entities[key] = local.entities[key]!;
      order.push(key);
    }
  }
  for (const key of base.order) {
    if (key.startsWith("p:") || !base.entities[key]) continue;
    entities[key] = base.entities[key]!;
    order.push(key);
  }
  return { order, entities, meta: local.meta ?? base.meta };
}

export function createPdfCollabSync(options: PdfCollabSyncOptions): PdfCollabSync {
  const { room, host } = options;
  const rootName = options.rootName ?? PDF_COLLAB_ROOT;
  const includeFields = options.includeFields !== false;
  const retryDelay = options.retryDelayMs ?? 120;
  const authored: Authored = new Map();
  let base: Shape | null = null;
  let baseline: Shape | null = null;
  let disposed = false;
  let running: Promise<void> | null = null;
  let again = false;
  let lastBytes: Uint8Array | null = null;
  let lastSharedKey = "";
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const root = room.doc.getMap(rootName);
  const onRemoteChange = (_events: unknown, transaction: { origin: unknown; local?: boolean }) => {
    if (disposed) return;
    // 本地写入（LOCAL_ORIGIN / SEED_ORIGIN 是 Symbol）不触发；网络来的更新（origin 不是这两个 Symbol）才排对齐。
    if (typeof transaction.origin === "symbol") return;
    void api.reconcile();
  };
  root.observeDeep(onRemoteChange as never);

  const scheduleRetry = () => {
    if (disposed || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      lastBytes = null;
      void api.reconcile();
    }, retryDelay);
  };

  async function runOnce(): Promise<void> {
    if (disposed) return;
    if (room.status !== "synced") return;
    const bytes = host.getBytes();
    if (!bytes) return;
    const readOnly = isCollabReadOnly(room as CollabRoom);
    const holdsPages = !readOnly && options.holdsPages();
    const sharedKey = `${readOnly}:${holdsPages}:${JSON.stringify(readJsonStateRoot(room.doc, rootName))}`;
    if (bytes === lastBytes && sharedKey === lastSharedKey) return;
    const read = await readPdfCollabShape(bytes, { fields: includeFields });
    if (disposed) return;
    const local: Shape = read.shape;
    const hasRoot = hasJsonStateRoot(room.doc, rootName);
    if (!hasRoot) {
      if (room.needsSeed && !isCollabReadOnly(room as CollabRoom)) {
        writeJsonStateRoot(room.doc, rootName, local, SEED_ORIGIN);
        room.completeSeed([rootName]);
        base = local;
        lastBytes = bytes;
        lastSharedKey = `${readOnly}:${holdsPages}:${JSON.stringify(readJsonStateRoot(room.doc, rootName))}`;
      }
      return; // 别人在种，等它
    }
    if (!base) base = baseline ?? local;
    const shared: Shape = readJsonStateRoot(room.doc, rootName);
    const localPages = new Set(read.pageIds);
    const canBuild = (_key: string, entity: Record<string, unknown>) => !isOpaquePdfAnnotation(entity);
    const hasLocalPage = (pageId: string) => localPages.has(pageId);

    let inbound: PdfSyncOps;
    let nextBase: Shape;
    let merged: Shape;

    if (readOnly) {
      // 只读：本地没推送的改动先留着（锁放开后再推），只把别人的改动补进来。
      const pending = pdfSyncDiff(base, local);
      const result = pdfSyncReconcile({ base: local, local, shared, holdsPages: false, hasLocalPage, canBuild });
      merged = result.merged;
      const held = new Set([...Object.keys(pending.upserts), ...pending.removes]);
      inbound = {
        upserts: Object.fromEntries(Object.entries(result.inbound.upserts).filter(([key]) => !held.has(key))),
        removes: result.inbound.removes.filter((key) => !held.has(key)),
        pageOrder: null,
      };
      nextBase = withLocalPages(pdfSyncApply(local, inbound), local);
      for (const key of held) {
        if (base.entities[key]) nextBase.entities[key] = base.entities[key]!;
        else delete nextBase.entities[key];
      }
      nextBase.order = nextBase.order.filter((key) => nextBase.entities[key]);
    } else {
      const localOps = pdfSyncDiff(base, local);
      recordAuthored(authored, localOps);
      const result = pdfSyncReconcile({ base, local, shared, holdsPages, hasLocalPage, canBuild });
      merged = result.merged;
      inbound = result.inbound;
      nextBase = withLocalPages(result.nextBase, local);
      if (result.pushNeeded) writeJsonStateRoot(room.doc, rootName, merged);
    }

    const hasInbound = Object.keys(inbound.upserts).length > 0 || inbound.removes.length > 0;
    if (hasInbound) {
      const skipped: string[] = [];
      const outcome = await host.replaceBytes(async (current) => {
        const applied = await applyPdfSyncOps(current, inbound, merged.entities);
        skipped.push(...applied.skipped);
        return applied.changed ? applied.bytes : null;
      });
      if (outcome === "busy") {
        // 本地正在编辑：这一轮的「对方改动」没落地。非只读时本地改动已经推出去了，base 前进到本地；下一轮重来。
        if (!readOnly) base = withLocalPages(local, local);
        lastBytes = null;
        scheduleRetry();
        return;
      }
      // 写不进字节的条目（认不出的类型、页不在本地）：base 里保持「本地的样子」，免得之后被当成「我删了」。
      for (const key of skipped) {
        if (!key.startsWith("a:") && !key.startsWith("f:")) continue;
        if (local.entities[key]) nextBase.entities[key] = local.entities[key]!;
        else delete nextBase.entities[key];
      }
      nextBase.order = nextBase.order.filter((key) => nextBase.entities[key]);
      if (outcome === "applied") options.onInbound?.();
    }
    base = nextBase;
    lastBytes = host.getBytes();
    lastSharedKey = `${readOnly}:${holdsPages}:${JSON.stringify(readJsonStateRoot(room.doc, rootName))}`;
    // 落地之后字节变了：再看一眼（本地可能在这期间又改了）。
    if (hasInbound && lastBytes !== bytes) again = true;
  }

  const api: PdfCollabSync = {
    reconcile() {
      if (disposed) return Promise.resolve();
      if (running) {
        again = true;
        return running;
      }
      running = (async () => {
        try {
          do {
            again = false;
            try {
              await runOnce();
            } catch {
              // 一轮失败（字节坏了、读取失败）不拖垮编辑；下一次本地改动 / 远端更新再来。
              lastBytes = null;
            }
          } while (again && !disposed);
        } finally {
          running = null;
        }
      })();
      return running;
    },

    async setBaseline(bytes) {
      if (baseline || base) return;
      try {
        baseline = (await readPdfCollabShape(bytes, { fields: includeFields })).shape;
      } catch {
        baseline = null;
      }
    },

    async adjustRestored(restored, current, adjustOptions = {}) {
      const [cur, res] = await Promise.all([
        readPdfCollabShape(current, { fields: includeFields }),
        readPdfCollabShape(restored, { fields: includeFields }),
      ]);
      const keep: Record<string, Record<string, unknown> | null> = {};
      const keys = new Set([...dataKeys(cur.shape), ...dataKeys(res.shape)]);
      for (const key of keys) {
        const now = cur.shape.entities[key] ?? null;
        const was = res.shape.entities[key] ?? null;
        if (!now && !was) continue;
        const mine = adjustOptions.keepEverything ? undefined : authored.get(key);
        if (!mine) {
          if (JSON.stringify(now) !== JSON.stringify(was)) keep[key] = now;
          continue;
        }
        if (now && !was) {
          if (!mine.has("+")) keep[key] = now; // 不是我新增的：别人加的，要保住
          continue;
        }
        if (!now && was) {
          if (!mine.has("-")) keep[key] = null; // 不是我删的：别人删的，不要复活
          continue;
        }
        // 两边都有：我动过的字段取旧版本里的值，其余取当前（别人改的）。
        const target: Record<string, unknown> = { ...was };
        for (const name of Object.keys(now!)) if (!mine.has(name)) target[name] = now![name];
        for (const name of Object.keys(was!)) if (!mine.has(name) && !(name in now!)) delete target[name];
        if (JSON.stringify(target) !== JSON.stringify(was)) keep[key] = target;
      }
      if (!Object.keys(keep).length) return restored;
      const outcome = await applyPdfKeepTargets(restored, keep);
      return outcome.bytes;
    },

    async flush() {
      lastBytes = null;
      await api.reconcile();
    },

    authoredKeys: () => [...authored.keys()],

    dispose() {
      if (disposed) return;
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      root.unobserveDeep(onRemoteChange as never);
    },
  };
  return api;
}
