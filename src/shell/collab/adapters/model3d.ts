/**
 * 3D 场景的多人同改适配（work-chat W14，契约 §9.15）。
 *
 * 编辑器的作品状态 = `Model3DRouteSnapshot`：一份检查点模型地址 + 一份「操作日志」
 * （移动/材质/相机/灯光/增删节点/显隐）+ 视图参数 + 批注 + 导演脚本。
 *
 * 合并粒度 = 场景节点上的一个属性：日志里「同一目标 × 同一种操作（× 材质序号 × 贴图槽）」
 * 只留最后一条，作为一个实体；两个人同时挪不同的物体、或者同一个物体的不同属性都保留，
 * 同一属性后改的人胜。操作的 `value` 摊平成 `v.<字段>`，所以「改位置」和「改缩放」
 * 同时发生也不互相覆盖。批注按 id 各一个实体。
 *
 * 视口（azimuth / elevation / zoom / autoRotate）是每个人自己的镜头，不同步。
 *
 * 取舍（如实写明）：日志被折叠成「每个属性一条最新操作」，所以协同期间不保留逐步撤销的
 * 中间态；最终场景与逐条重放等价。
 */
import { readEntityRoot, type EntityDoc } from "./video";

export const MODEL3D_ROOT = "oceanleo:model3d";

export interface Model3DCollabOperation {
  id: string;
  kind: string;
  target: string;
  [field: string]: unknown;
}

export interface Model3DCollabAnnotation {
  id: string;
  [field: string]: unknown;
}

export interface Model3DCollabSnapshot {
  checkpointUrl: string;
  operations: Model3DCollabOperation[];
  provenance?: unknown;
  /** 版本里带的封面缩略图地址（有就画，没有不画）。 */
  posterUrl?: string;
  view: Record<string, unknown> & { annotations?: Model3DCollabAnnotation[] };
}

const OP = "op:";
const ANN = "ann:";
/** 不进协同的视口字段。 */
const LOCAL_VIEW_FIELDS = ["azimuth", "elevation", "zoom", "autoRotate"] as const;
const DEFAULT_VIEWPORT = { azimuth: 35, elevation: 65, zoom: 110, autoRotate: false };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** 操作的合并键：同一目标 × 同一类操作 × 材质序号 × 贴图槽。 */
export function model3dOperationKey(operation: Model3DCollabOperation): string {
  return [
    operation.target,
    operation.kind,
    operation.materialIndex ?? "",
    operation.slot ?? "",
  ].join("|");
}

export function model3dToEntities(state: Model3DCollabSnapshot): EntityDoc {
  const order: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  const slotByKey = new Map<string, string>();
  for (const operation of state.operations ?? []) {
    const key = `${OP}${model3dOperationKey(operation)}`;
    const { id, kind, target, value, ...rest } = operation;
    const entity: Record<string, unknown> = { opId: id, kind, target };
    for (const [name, field] of Object.entries(rest)) {
      if (field !== undefined) entity[name] = field;
    }
    if (isRecord(value)) {
      for (const [name, field] of Object.entries(value)) entity[`v.${name}`] = field;
      entity.valueShape = "object";
    } else if (value !== undefined) {
      entity.value = value;
    }
    if (!slotByKey.has(key)) {
      slotByKey.set(key, key);
      order.push(key);
    }
    entities[key] = entity;
  }
  for (const annotation of state.view?.annotations ?? []) {
    const { id, ...fields } = annotation;
    const key = `${ANN}${id}`;
    order.push(key);
    entities[key] = { ...fields };
  }
  const view = { ...(state.view ?? {}) };
  delete view.annotations;
  for (const name of LOCAL_VIEW_FIELDS) delete view[name];
  // 视图参数逐字段进 meta（`view.<名字>`），两个人同时改曝光和背景都保留。
  const meta: Record<string, unknown> = {
    checkpointUrl: state.checkpointUrl ?? "",
    ...(state.provenance !== undefined ? { provenance: state.provenance } : {}),
  };
  for (const [name, field] of Object.entries(view)) {
    if (field !== undefined) meta[`view.${name}`] = field;
  }
  return { order, entities, meta };
}

export function model3dFromEntities(
  input: { order: string[]; entities: Record<string, Record<string, unknown>>; meta?: Record<string, unknown> },
  prev: Model3DCollabSnapshot | null,
): Model3DCollabSnapshot {
  const operations: Model3DCollabOperation[] = [];
  const annotations: Model3DCollabAnnotation[] = [];
  const seen = new Set<string>();
  for (const key of input.order) {
    if (seen.has(key)) continue;
    seen.add(key);
    const entity = input.entities[key];
    if (!isRecord(entity)) continue;
    if (key.startsWith(OP)) {
      const { opId, kind, target, valueShape, ...fields } = entity;
      const operation: Model3DCollabOperation = { id: String(opId ?? key), kind: String(kind), target: String(target) };
      const value: Record<string, unknown> = {};
      for (const [name, field] of Object.entries(fields)) {
        if (name.startsWith("v.")) value[name.slice(2)] = field;
        else operation[name] = field;
      }
      if (valueShape === "object") operation.value = value;
      operations.push(operation);
    } else if (key.startsWith(ANN)) {
      annotations.push({ ...entity, id: key.slice(ANN.length) });
    }
  }
  const meta = input.meta ?? {};
  const metaView: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(meta)) {
    if (name.startsWith("view.")) metaView[name.slice(5)] = field;
  }
  const keepViewport = (name: (typeof LOCAL_VIEW_FIELDS)[number]) =>
    prev?.view?.[name] ?? DEFAULT_VIEWPORT[name];
  const view: Model3DCollabSnapshot["view"] = {
    ...metaView,
    azimuth: keepViewport("azimuth"),
    elevation: keepViewport("elevation"),
    zoom: keepViewport("zoom"),
    autoRotate: keepViewport("autoRotate"),
    annotations,
  };
  const checkpointUrl = typeof meta.checkpointUrl === "string" ? meta.checkpointUrl : prev?.checkpointUrl ?? "";
  view.sourceUrl = (metaView.sourceUrl as string | undefined) ?? checkpointUrl;
  return {
    checkpointUrl,
    operations,
    ...(meta.provenance !== undefined ? { provenance: meta.provenance } : {}),
    view,
  };
}

/** 折叠后的作品状态：协同往返的「规范形」。 */
export function model3dCanonical(state: Model3DCollabSnapshot): Model3DCollabSnapshot {
  return model3dFromEntities(model3dToEntities(state) as never, state);
}

export function model3dFromYDoc(doc: unknown): Model3DCollabSnapshot {
  return model3dFromEntities(readEntityRoot(doc, MODEL3D_ROOT), null);
}

export function model3dFromRevisionJson(json: unknown): Model3DCollabSnapshot {
  const record = isRecord(json) ? json : {};
  const operations = Array.isArray(record.operations)
    ? (record.operations as unknown[]).filter(isRecord).map((op) => ({ ...op }) as Model3DCollabOperation)
    : [];
  const view = isRecord(record.view) ? { ...record.view } : {};
  if (!Array.isArray(view.annotations)) view.annotations = [];
  const checkpointUrl = String(record.checkpointUrl ?? record.sourceUrl ?? view.sourceUrl ?? "");
  for (const name of LOCAL_VIEW_FIELDS) if (view[name] === undefined) view[name] = DEFAULT_VIEWPORT[name];
  return {
    checkpointUrl,
    operations,
    ...(record.provenance !== undefined ? { provenance: record.provenance } : {}),
    ...(typeof record.posterUrl === "string" && record.posterUrl ? { posterUrl: record.posterUrl } : {}),
    view: view as Model3DCollabSnapshot["view"],
  };
}

export interface Model3DSceneNodeRow {
  /** 场景节点路径（操作的 target）。 */
  target: string;
  /** 这个节点上发生过哪几类操作。 */
  kinds: string[];
  removed: boolean;
  added: boolean;
  hidden: boolean;
}

/** 场景节点树的平铺行：回放画「节点树」用。 */
export function model3dSceneRows(state: Model3DCollabSnapshot): Model3DSceneNodeRow[] {
  const rows = new Map<string, Model3DSceneNodeRow>();
  for (const operation of state.operations ?? []) {
    const row = rows.get(operation.target) ?? { target: operation.target, kinds: [], removed: false, added: false, hidden: false };
    if (!row.kinds.includes(operation.kind)) row.kinds.push(operation.kind);
    if (operation.kind === "presence") {
      row.removed = operation.present === false;
      row.added = operation.present !== false;
    }
    if (operation.kind === "visibility") row.hidden = operation.visible === false;
    rows.set(operation.target, row);
  }
  return [...rows.values()];
}

function operationSignature(operation: Model3DCollabOperation): string {
  const { id: _id, ...rest } = operation;
  return JSON.stringify(rest);
}

export function model3dDiff(prev: Model3DCollabSnapshot | null, next: Model3DCollabSnapshot) {
  const before = new Map<string, string>();
  for (const operation of prev?.operations ?? []) before.set(model3dOperationKey(operation), operationSignature(operation));
  const touchedNodes = new Set<string>();
  let changedOps = 0;
  for (const operation of next.operations ?? []) {
    const old = before.get(model3dOperationKey(operation));
    if (old !== operationSignature(operation)) {
      changedOps += 1;
      touchedNodes.add(operation.target);
    }
  }
  const beforeAnnotations = new Map((prev?.view?.annotations ?? []).map((a) => [a.id, JSON.stringify(a)]));
  const afterAnnotations = next.view?.annotations ?? [];
  const annotationsAdded = afterAnnotations.filter((a) => !beforeAnnotations.has(a.id)).length;
  const annotationsChanged = afterAnnotations.filter(
    (a) => beforeAnnotations.has(a.id) && beforeAnnotations.get(a.id) !== JSON.stringify(a),
  ).length;
  return { changedOps, touchedNodes: [...touchedNodes], annotationsAdded, annotationsChanged };
}

export function model3dDescribeChange(prev: unknown, next: unknown): string | null {
  if (!isRecord(next) || !Array.isArray(next.operations)) return null;
  const before = isRecord(prev) && Array.isArray(prev.operations) ? (prev as unknown as Model3DCollabSnapshot) : null;
  const diff = model3dDiff(before, next as unknown as Model3DCollabSnapshot);
  const parts: string[] = [];
  if (diff.touchedNodes.length) parts.push(`动了 ${diff.touchedNodes.length} 个场景节点`);
  if (diff.annotationsAdded) parts.push(`加了 ${diff.annotationsAdded} 条批注`);
  if (diff.annotationsChanged) parts.push(`改了 ${diff.annotationsChanged} 条批注`);
  return parts.length ? parts.join("，") : null;
}

export function model3dToArtifactJson(snapshot: unknown): unknown {
  return model3dFromRevisionJson(snapshot);
}
