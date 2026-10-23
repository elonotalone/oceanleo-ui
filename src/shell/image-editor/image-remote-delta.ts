import type { EditorSnapshot } from "./editor-runtime";

type JsonObject = Record<string, unknown>;

function objectsById(snapshot: EditorSnapshot): Map<string, JsonObject> {
  const objects = Array.isArray(snapshot.json?.objects)
    ? (snapshot.json.objects as JsonObject[])
    : [];
  const map = new Map<string, JsonObject>();
  for (const object of objects) {
    if (object && typeof object === "object") map.set(String(object.oceanleoId ?? ""), object);
  }
  return map;
}

/**
 * 「别人的改动」到底动了什么：对象 id 与变化的字段名，不含取值（不泄露内容）。
 * 例：`a1b2:flipX,src;+c3d4;-e5f6;doc`。空串表示只有顺序变化。
 */
export function remoteDeltaSummary(
  before: EditorSnapshot,
  remote: EditorSnapshot,
  delta: { changed: Set<string>; added?: Set<string>; removed: Set<string> },
  docChanged: boolean,
  limit = 4,
): string {
  const was = objectsById(before);
  const now = objectsById(remote);
  const parts: string[] = [];
  for (const id of [...delta.changed].slice(0, limit)) {
    const prev = was.get(id);
    const next = now.get(id);
    if (!prev) {
      parts.push(`+${id.slice(0, 8)}`);
      continue;
    }
    const keys = new Set([...Object.keys(prev), ...Object.keys(next ?? {})]);
    const fields = [...keys]
      .filter((key) => JSON.stringify(prev[key]) !== JSON.stringify(next?.[key]))
      .slice(0, 6);
    parts.push(`${id.slice(0, 8)}:${fields.join(",")}`);
  }
  for (const id of [...delta.removed].slice(0, limit)) parts.push(`-${id.slice(0, 8)}`);
  if (docChanged) parts.push("doc");
  return parts.join(";");
}

/**
 * 不算「内容」的字段：锁定态派生出来的指针/控制柄样式，以及图片来源凭证里会过期的部分
 * （签名地址、过期时间、所属版本）。同一份字节（digest 相同）换了一张新签名不算别人改了图。
 * 协同对齐只比内容：否则每次重开都会把房间里上一场会话的旧签名套回画布、把画布标成「未保存」。
 */
const PRESENTATION_FIELDS = ["hasControls", "hoverCursor"] as const;

export interface ImageContentCompareOptions {
  /** 只比画面：对象 id（以及来源凭证里跟着 id 走的那个 id）不算内容。 */
  ignoreIds?: boolean;
}

function comparableObject(object: JsonObject, options: ImageContentCompareOptions = {}): JsonObject {
  const next: JsonObject = { ...object };
  for (const key of PRESENTATION_FIELDS) delete next[key];
  if (options.ignoreIds) delete next.oceanleoId;
  const dependency = next.oceanleoDependency;
  if (dependency && typeof dependency === "object" && !Array.isArray(dependency)) {
    const { id, kind, digest } = dependency as JsonObject;
    next.oceanleoDependency = options.ignoreIds ? { kind, digest } : { id, kind, digest };
  }
  return next;
}

export function collabComparableSnapshot(
  snapshot: EditorSnapshot,
  options: ImageContentCompareOptions = {},
): EditorSnapshot {
  const objects = Array.isArray(snapshot.json?.objects)
    ? (snapshot.json.objects as JsonObject[])
    : [];
  return {
    ...snapshot,
    json: {
      ...snapshot.json,
      objects: objects.map((object) =>
        object && typeof object === "object" ? comparableObject(object, options) : object,
      ),
    },
  };
}

/** 远端对象与本地是同一份字节时，沿用本地那张还没过期的来源凭证。 */
export function keepFresherDependency(local: unknown, remote: unknown): unknown {
  if (!local || typeof local !== "object" || !remote || typeof remote !== "object") return remote;
  const a = local as JsonObject;
  const b = remote as JsonObject;
  return a.digest && a.digest === b.digest ? { ...b, ...a } : remote;
}

/** 恢复回调的结果：`unchanged` = 记录与画布内容相同；`stale` = 记录比画布所基于的版本旧。 */
export type ImageRecoveryRestoreResult = boolean | "unchanged" | "stale";

/** 两份画布内容是否相同（忽略控制柄样式、来源签名、只在本机存在的裁剪框）。 */
export function sameImageContent(
  a: EditorSnapshot,
  b: EditorSnapshot,
  options: ImageContentCompareOptions = {},
): boolean {
  const key = (snapshot: EditorSnapshot) => {
    const comparable = collabComparableSnapshot(snapshot, options);
    const objects = (comparable.json.objects as JsonObject[]).filter(
      (object) => object?.oceanleoRole !== "crop",
    );
    return JSON.stringify([
      { ...comparable.json, objects },
      snapshot.doc?.width,
      snapshot.doc?.height,
      snapshot.canvasBackground,
    ]);
  };
  return key(a) === key(b);
}

/**
 * 远端与本地画面相同、只有对象 id 不同（重开时载入的版本给对象发了新 id，房间里还是上一场的 id）：
 * 返回「本地 id → 远端 id」的对照，按非裁剪对象的顺序一一对应；对不上返回 null。
 */
export function imageIdRelabelMap(local: EditorSnapshot, remote: EditorSnapshot): Map<string, string> | null {
  if (!sameImageContent(local, remote, { ignoreIds: true })) return null;
  const ids = (snapshot: EditorSnapshot) =>
    (Array.isArray(snapshot.json?.objects) ? (snapshot.json.objects as JsonObject[]) : [])
      .filter((object) => object?.oceanleoRole !== "crop")
      .map((object) => String(object?.oceanleoId ?? ""));
  const from = ids(local);
  const to = ids(remote);
  if (from.length !== to.length) return null;
  const map = new Map<string, string>();
  from.forEach((id, index) => {
    if (id && to[index] && id !== to[index]) map.set(id, to[index]);
  });
  return map;
}

/** 把一份快照（撤销栈里的）里的对象 id 按对照换掉。 */
export function relabelImageSnapshot(snapshot: EditorSnapshot, map: Map<string, string>): EditorSnapshot {
  if (!map.size || !Array.isArray(snapshot.json?.objects)) return snapshot;
  return {
    ...snapshot,
    json: {
      ...snapshot.json,
      objects: (snapshot.json.objects as JsonObject[]).map((object) => {
        const next = map.get(String(object?.oceanleoId ?? ""));
        if (!next) return object;
        const dependency = object.oceanleoDependency;
        return {
          ...object,
          oceanleoId: next,
          ...(dependency && typeof dependency === "object"
            ? { oceanleoDependency: { ...(dependency as JsonObject), id: next } }
            : {}),
        };
      }),
    },
  };
}
