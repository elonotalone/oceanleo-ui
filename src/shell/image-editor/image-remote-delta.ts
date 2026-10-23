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

function comparableObject(object: JsonObject): JsonObject {
  const next: JsonObject = { ...object };
  for (const key of PRESENTATION_FIELDS) delete next[key];
  const dependency = next.oceanleoDependency;
  if (dependency && typeof dependency === "object" && !Array.isArray(dependency)) {
    const { id, kind, digest } = dependency as JsonObject;
    next.oceanleoDependency = { id, kind, digest };
  }
  return next;
}

export function collabComparableSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  const objects = Array.isArray(snapshot.json?.objects)
    ? (snapshot.json.objects as JsonObject[])
    : [];
  return {
    ...snapshot,
    json: {
      ...snapshot.json,
      objects: objects.map((object) =>
        object && typeof object === "object" ? comparableObject(object) : object,
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
export function sameImageContent(a: EditorSnapshot, b: EditorSnapshot): boolean {
  const key = (snapshot: EditorSnapshot) => {
    const comparable = collabComparableSnapshot(snapshot);
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
