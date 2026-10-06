/**
 * 多人同改时的「只撤自己」撤销（F07）。
 *
 * 做法：不存整份快照，而是每一步只存「我这一步改了哪些实体、改前是什么、改后是什么」。
 * 撤销时拿「现在的文档」逐个核对：实体现在还等于我当时写下的值，才改回改前；
 * 对方已经删掉或改过这个实体，就跳过（并告诉调用方跳过了几个），不动对方的工作。
 *
 * 纯函数 + 一个小栈，不依赖 React / yjs，node 里直接测。视频、音频、3D 三个编辑器共用
 * （放在 video-editor 目录是因为本任务书的文件范围；调用方从这里 import）。
 */

export type EntityRecord = Record<string, unknown>;

export interface EntityDocShape {
  order: string[];
  entities: Record<string, EntityRecord>;
  meta?: Record<string, unknown>;
}

export interface EntityChange {
  id: string;
  /** 改前；null = 这一步新建了它。 */
  before: EntityRecord | null;
  /** 改后；null = 这一步删掉了它。 */
  after: EntityRecord | null;
  /** 改前它在顺序里的前一个实体（还原被删的实体时放回原位）。 */
  prevId: string | null;
}

export interface MetaChange {
  key: string;
  hadBefore: boolean;
  before: unknown;
  hadAfter: boolean;
  after: unknown;
}

export interface EntityStep {
  entities: EntityChange[];
  meta: MetaChange[];
  /** 记录时间（毫秒），合并连续拖动用。 */
  at: number;
}

export interface EntityApplyResult {
  doc: EntityDocShape;
  applied: number;
  skipped: number;
  /** 实际生效的那部分（放进反向栈）；一个都没生效时为 null。 */
  step: EntityStep | null;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function sameEntity(a: EntityRecord | null | undefined, b: EntityRecord | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return sameValue(a, b);
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function prevOf(order: readonly string[], id: string): string | null {
  const index = order.indexOf(id);
  return index > 0 ? order[index - 1] : null;
}

/** 两份实体文档之间「我改了什么」。没有任何差别返回 null。 */
export function diffEntityDocs(
  before: EntityDocShape,
  after: EntityDocShape,
  at: number = Date.now(),
): EntityStep | null {
  const entities: EntityChange[] = [];
  const ids = new Set<string>([...Object.keys(before.entities), ...Object.keys(after.entities)]);
  for (const id of ids) {
    const was = before.entities[id] ?? null;
    const now = after.entities[id] ?? null;
    if (sameEntity(was, now)) continue;
    entities.push({ id, before: clone(was), after: clone(now), prevId: prevOf(before.order, id) });
  }
  const meta: MetaChange[] = [];
  const beforeMeta = before.meta ?? {};
  const afterMeta = after.meta ?? {};
  for (const key of new Set([...Object.keys(beforeMeta), ...Object.keys(afterMeta)])) {
    const hadBefore = key in beforeMeta && beforeMeta[key] !== undefined;
    const hadAfter = key in afterMeta && afterMeta[key] !== undefined;
    if (hadBefore === hadAfter && sameValue(beforeMeta[key], afterMeta[key])) continue;
    meta.push({ key, hadBefore, before: clone(beforeMeta[key]), hadAfter, after: clone(afterMeta[key]) });
  }
  if (!entities.length && !meta.length) return null;
  return { entities, meta, at };
}

/** 把两步合成一步：同一个实体取更早的「改前」和更晚的「改后」。 */
export function mergeSteps(first: EntityStep, second: EntityStep): EntityStep {
  const byId = new Map<string, EntityChange>();
  for (const change of first.entities) byId.set(change.id, { ...change });
  for (const change of second.entities) {
    const existing = byId.get(change.id);
    if (!existing) byId.set(change.id, { ...change });
    else existing.after = change.after;
  }
  const entities = [...byId.values()].filter((change) => !sameEntity(change.before, change.after));
  const metaByKey = new Map<string, MetaChange>();
  for (const change of first.meta) metaByKey.set(change.key, { ...change });
  for (const change of second.meta) {
    const existing = metaByKey.get(change.key);
    if (!existing) metaByKey.set(change.key, { ...change });
    else {
      existing.hadAfter = change.hadAfter;
      existing.after = change.after;
    }
  }
  const meta = [...metaByKey.values()].filter(
    (change) => !(change.hadBefore === change.hadAfter && sameValue(change.before, change.after)),
  );
  return { entities, meta, at: second.at };
}

export interface ApplyStepOptions {
  /** 把实体放回文档前再问一句（例如片段所属的轨道还在不在）；返回 false 就当跳过。 */
  canRestore?: (id: string, entity: EntityRecord, doc: EntityDocShape) => boolean;
}

/**
 * 把一步改回去（`direction: "undo"`）或重做（`"redo"`），只动「现在仍等于那一步写下的值」的实体。
 */
export function applyStep(
  current: EntityDocShape,
  step: EntityStep,
  direction: "undo" | "redo",
  options: ApplyStepOptions = {},
): EntityApplyResult {
  const doc: EntityDocShape = {
    order: [...current.order],
    entities: { ...current.entities },
    meta: { ...(current.meta ?? {}) },
  };
  const appliedEntities: EntityChange[] = [];
  const appliedMeta: MetaChange[] = [];
  let skipped = 0;

  // 撤销按相反顺序改回；重做按原顺序。
  const changes = direction === "undo" ? [...step.entities].reverse() : step.entities;
  for (const change of changes) {
    const expected = direction === "undo" ? change.after : change.before;
    const target = direction === "undo" ? change.before : change.after;
    const present = doc.entities[change.id] ?? null;
    if (!sameEntity(present, expected)) {
      skipped += 1;
      continue;
    }
    if (target === null) {
      delete doc.entities[change.id];
      const index = doc.order.indexOf(change.id);
      if (index >= 0) doc.order.splice(index, 1);
      appliedEntities.push(change);
      continue;
    }
    if (options.canRestore && !options.canRestore(change.id, target, doc)) {
      skipped += 1;
      continue;
    }
    doc.entities[change.id] = clone(target);
    if (!doc.order.includes(change.id)) {
      const anchor = change.prevId && doc.order.includes(change.prevId) ? doc.order.indexOf(change.prevId) + 1 : 0;
      doc.order.splice(anchor, 0, change.id);
    }
    appliedEntities.push(change);
  }

  for (const change of step.meta) {
    const expectedHad = direction === "undo" ? change.hadAfter : change.hadBefore;
    const expected = direction === "undo" ? change.after : change.before;
    const targetHad = direction === "undo" ? change.hadBefore : change.hadAfter;
    const target = direction === "undo" ? change.before : change.after;
    const meta = doc.meta ?? (doc.meta = {});
    const presentHad = change.key in meta && meta[change.key] !== undefined;
    if (presentHad !== expectedHad || (presentHad && !sameValue(meta[change.key], expected))) {
      skipped += 1;
      continue;
    }
    if (targetHad) meta[change.key] = clone(target);
    else delete meta[change.key];
    appliedMeta.push(change);
  }

  const applied = appliedEntities.length + appliedMeta.length;
  return {
    doc,
    applied,
    skipped,
    step: applied ? { entities: appliedEntities, meta: appliedMeta, at: step.at } : null,
  };
}

export interface EntityUndoOutcome {
  /** 撤销 / 重做后的新文档；什么也没改时为 null。 */
  doc: EntityDocShape | null;
  applied: number;
  /** 因为对方已经改过或删掉而没动的实体数。 */
  skipped: number;
  /** 栈里本来就空。 */
  empty: boolean;
}

export interface EntityUndoStackOptions {
  limit?: number;
  /** 连续两步在这么多毫秒内且碰的是同一批实体，合成一步（拖动、拖滑杆）。 */
  coalesceMs?: number;
  now?: () => number;
}

/** 只记「我自己改的」那些步；对方的改动从不进栈。 */
export class EntityUndoStack {
  private undoSteps: EntityStep[] = [];
  private redoSteps: EntityStep[] = [];
  private readonly limit: number;
  private readonly coalesceMs: number;
  private readonly now: () => number;

  constructor(options: EntityUndoStackOptions = {}) {
    this.limit = options.limit ?? 100;
    this.coalesceMs = options.coalesceMs ?? 400;
    this.now = options.now ?? Date.now;
  }

  get undoDepth(): number {
    return this.undoSteps.length;
  }

  get redoDepth(): number {
    return this.redoSteps.length;
  }

  get canUndo(): boolean {
    return this.undoSteps.length > 0;
  }

  get canRedo(): boolean {
    return this.redoSteps.length > 0;
  }

  clear(): void {
    this.undoSteps = [];
    this.redoSteps = [];
  }

  /** 记下我刚做的一步（`before` / `after` 是这一步前后的实体文档）。 */
  record(before: EntityDocShape, after: EntityDocShape): boolean {
    const step = diffEntityDocs(before, after, this.now());
    if (!step) return false;
    const last = this.undoSteps[this.undoSteps.length - 1];
    if (
      last &&
      this.coalesceMs > 0 &&
      step.at - last.at <= this.coalesceMs &&
      !this.redoSteps.length &&
      step.entities.length > 0 &&
      step.entities.every((change) => last.entities.some((other) => other.id === change.id))
    ) {
      const merged = mergeSteps(last, step);
      if (merged.entities.length || merged.meta.length) this.undoSteps[this.undoSteps.length - 1] = merged;
      else this.undoSteps.pop();
      return true;
    }
    this.undoSteps.push(step);
    if (this.undoSteps.length > this.limit) this.undoSteps.shift();
    this.redoSteps = [];
    return true;
  }

  undo(current: EntityDocShape, options?: ApplyStepOptions): EntityUndoOutcome {
    const step = this.undoSteps.pop();
    if (!step) return { doc: null, applied: 0, skipped: 0, empty: true };
    const result = applyStep(current, step, "undo", options);
    if (result.step) this.redoSteps.push(result.step);
    return { doc: result.applied ? result.doc : null, applied: result.applied, skipped: result.skipped, empty: false };
  }

  redo(current: EntityDocShape, options?: ApplyStepOptions): EntityUndoOutcome {
    const step = this.redoSteps.pop();
    if (!step) return { doc: null, applied: 0, skipped: 0, empty: true };
    const result = applyStep(current, step, "redo", options);
    if (result.step) this.undoSteps.push(result.step);
    return { doc: result.applied ? result.doc : null, applied: result.applied, skipped: result.skipped, empty: false };
  }
}

// ------------------------------------------------------------------ 一次编辑会话

export interface EntityEditSessionOptions<T> {
  toEntities(state: T): EntityDocShape;
  fromEntities(input: EntityDocShape & { meta: Record<string, unknown> }, prev: T | null): T;
  stack?: EntityUndoStack;
  canRestore?: ApplyStepOptions["canRestore"];
}

export interface EntityHistoryResult<T> {
  /** 要当作「本端改动」应用到编辑器的新状态；什么都没改回去时为 null。 */
  state: T | null;
  applied: number;
  skipped: number;
  empty: boolean;
}

/**
 * 把「谁改的」分清楚：本端的改动进撤销栈，远端 / 种子 / 外部版本只更新基准、不进栈。
 * React 胶水（use-entity-collab）每次本端状态变化调 `noteLocal`，远端回灌调 `noteKnown`。
 */
export class EntityEditSession<T> {
  readonly stack: EntityUndoStack;
  private base: EntityDocShape | null = null;
  private suppressNextLocal = false;
  private readonly opts: EntityEditSessionOptions<T>;

  constructor(options: EntityEditSessionOptions<T>) {
    this.opts = options;
    this.stack = options.stack ?? new EntityUndoStack();
  }

  /** 已知状态（种子、对方的改动、外部版本）：只更新基准，不进撤销栈。 */
  noteKnown(state: T): void {
    this.base = this.opts.toEntities(state);
  }

  /** 本端状态变了：记一步。返回是否记下了。 */
  noteLocal(state: T): boolean {
    const next = this.opts.toEntities(state);
    const before = this.base;
    this.base = next;
    if (this.suppressNextLocal) {
      this.suppressNextLocal = false;
      return false;
    }
    if (!before) return false;
    return this.stack.record(before, next);
  }

  reset(): void {
    this.base = null;
    this.suppressNextLocal = false;
    this.stack.clear();
  }

  private run(direction: "undo" | "redo", current: T): EntityHistoryResult<T> {
    const outcome =
      direction === "undo"
        ? this.stack.undo(this.opts.toEntities(current), { canRestore: this.opts.canRestore })
        : this.stack.redo(this.opts.toEntities(current), { canRestore: this.opts.canRestore });
    if (!outcome.doc) {
      return { state: null, applied: 0, skipped: outcome.skipped, empty: outcome.empty };
    }
    const next = this.opts.fromEntities({ ...outcome.doc, meta: outcome.doc.meta ?? {} }, current);
    // 这次应用不算「我又改了一步」：下一次 noteLocal 只更新基准。
    this.suppressNextLocal = true;
    return { state: next, applied: outcome.applied, skipped: outcome.skipped, empty: false };
  }

  undo(current: T): EntityHistoryResult<T> {
    return this.run("undo", current);
  }

  redo(current: T): EntityHistoryResult<T> {
    return this.run("redo", current);
  }

  /** 应用撤销结果后若编辑器没有产生状态变化，调用方用它放掉「跳过下一次」。 */
  releaseSuppression(): void {
    this.suppressNextLocal = false;
  }
}
