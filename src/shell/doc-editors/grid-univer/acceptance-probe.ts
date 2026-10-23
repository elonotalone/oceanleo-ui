/**
 * 验收探针（W10 2026-10-23）：把表格舞台的保存相关状态挂到
 * `globalThis.__oceanleoGridUniverPaint` 上，浏览器场景据此判断「这一次改动
 * 有没有被算成本人改动、有没有被远端整本替换」。只写计数与短字符串，不含单元格内容。
 */
type GridProbe = Record<string, unknown> & { events?: string[] };

function probe(): GridProbe | null {
  if (typeof globalThis === "undefined") return null;
  const host = globalThis as { __oceanleoGridUniverPaint?: GridProbe };
  host.__oceanleoGridUniverPaint ??= {};
  return host.__oceanleoGridUniverPaint;
}

/** 记一条状态（覆盖同名键）。 */
export function setGridProbe(key: string, value: unknown): void {
  const target = probe();
  if (target) target[key] = value;
}

/** 追加一条事件（只留最近 40 条），带相对时间戳。 */
export function noteGridProbe(event: string): void {
  const target = probe();
  if (!target) return;
  const events = (target.events ??= []);
  events.push(`${Math.round(typeof performance !== "undefined" ? performance.now() : 0)}:${event}`);
  if (events.length > 40) events.splice(0, events.length - 40);
}
