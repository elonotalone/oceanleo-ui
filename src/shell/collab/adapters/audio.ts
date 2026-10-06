/**
 * 音频的多人同改适配（work-chat W14，契约 §9.15）。
 *
 * 编辑器的作品状态 = `AudioProjectData`：一个源文件地址 + 一串按顺序施加的编辑操作
 * （裁剪 / 删除 / 淡入淡出 / 增益 / 效果）+ 署名。
 *
 * 合并粒度 = 一条编辑操作：每条操作一个实体。操作本身没有 id，这里用「操作内容的哈希 +
 * 这份内容第几次出现」生成稳定 id（两个客户端对同一串操作算出同一批 id，不会重复种入）。
 * 两个人同时各加一条操作，两条都保留，按协同数组的确定顺序排在日志里。
 *
 * 限制（如实写明）：裁剪 / 删除会让后面的时间轴整体移位，操作之间不可交换。所以合并出来的
 * 日志「两人各自的操作都在」，但两人对同一段重叠区间做删除 / 裁剪时，最终音频可能与任何
 * 一方预想的不同——这是现有「操作日志 + 重放」模型的性质，不是合并出错。
 */
import { readEntityRoot, type EntityDoc } from "./video";

export const AUDIO_ROOT = "oceanleo:audio";

export interface AudioCollabOperation {
  type: string;
  [field: string]: unknown;
}

export interface AudioCollabState {
  sourceUrl: string;
  operations: AudioCollabOperation[];
  attribution?: unknown[];
}

const OP = "op:";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** 给一串操作各算一个稳定 id：`<内容哈希>-<同内容第几次出现>`。 */
export function audioOperationIds(operations: readonly AudioCollabOperation[]): string[] {
  const counts = new Map<string, number>();
  return operations.map((operation) => {
    const hash = fnv1a(canonicalJson(operation));
    const nth = counts.get(hash) ?? 0;
    counts.set(hash, nth + 1);
    return `${hash}-${nth}`;
  });
}

export function audioToEntities(state: AudioCollabState): EntityDoc {
  const ids = audioOperationIds(state.operations ?? []);
  const order: string[] = [];
  const entities: Record<string, Record<string, unknown>> = {};
  (state.operations ?? []).forEach((operation, index) => {
    const key = `${OP}${ids[index]}`;
    const entity: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(operation)) {
      if (value !== undefined) entity[name] = value;
    }
    order.push(key);
    entities[key] = entity;
  });
  return {
    order,
    entities,
    meta: {
      sourceUrl: state.sourceUrl ?? "",
      ...(state.attribution !== undefined ? { attribution: state.attribution } : {}),
    },
  };
}

export function audioFromEntities(
  input: { order: string[]; entities: Record<string, Record<string, unknown>>; meta?: Record<string, unknown> },
  prev: AudioCollabState | null,
): AudioCollabState {
  const operations: AudioCollabOperation[] = [];
  const seen = new Set<string>();
  for (const key of input.order) {
    if (!key.startsWith(OP) || seen.has(key)) continue;
    seen.add(key);
    const entity = input.entities[key];
    if (isRecord(entity) && typeof entity.type === "string") operations.push({ ...entity } as AudioCollabOperation);
  }
  const meta = input.meta ?? {};
  return {
    sourceUrl: typeof meta.sourceUrl === "string" ? meta.sourceUrl : prev?.sourceUrl ?? "",
    operations,
    ...(Array.isArray(meta.attribution) ? { attribution: meta.attribution } : {}),
  };
}

export function audioFromYDoc(doc: unknown): AudioCollabState {
  return audioFromEntities(readEntityRoot(doc, AUDIO_ROOT), null);
}

export function audioFromRevisionJson(json: unknown): AudioCollabState {
  const record = isRecord(json) ? json : {};
  return {
    sourceUrl: String(record.sourceUrl ?? ""),
    operations: Array.isArray(record.operations)
      ? (record.operations as unknown[]).filter(isRecord).map((op) => ({ ...op }) as AudioCollabOperation)
      : [],
    ...(Array.isArray(record.attribution) ? { attribution: record.attribution } : {}),
  };
}

export interface AudioSegment {
  /** 操作类型：crop / delete / fade / gain / effects。 */
  type: string;
  start: number | null;
  end: number | null;
  /** 供回放着色用的稳定 id。 */
  id: string;
}

/** 轨道示意：每条操作一个片段；没有区间的操作（整段）start/end 为 null。 */
export function audioSegments(state: AudioCollabState): AudioSegment[] {
  const ids = audioOperationIds(state.operations ?? []);
  return (state.operations ?? []).map((operation, index) => ({
    type: operation.type,
    start: typeof operation.start === "number" ? operation.start : null,
    end: typeof operation.end === "number" ? operation.end : null,
    id: ids[index],
  }));
}

export function audioDescribeChange(prev: unknown, next: unknown): string | null {
  if (!isRecord(next) || !Array.isArray(next.operations)) return null;
  const nextOps = next.operations as AudioCollabOperation[];
  const prevOps = isRecord(prev) && Array.isArray(prev.operations) ? (prev.operations as AudioCollabOperation[]) : [];
  const before = new Set(audioOperationIds(prevOps));
  const after = audioOperationIds(nextOps);
  const afterSet = new Set(after);
  const added = after.filter((id) => !before.has(id)).length;
  const removed = [...before].filter((id) => !afterSet.has(id)).length;
  const parts: string[] = [];
  if (added) parts.push(`加了 ${added} 个剪辑操作`);
  if (removed) parts.push(`撤掉了 ${removed} 个剪辑操作`);
  return parts.length ? parts.join("，") : null;
}

export function audioToArtifactJson(snapshot: unknown): unknown {
  return audioFromRevisionJson(snapshot);
}
