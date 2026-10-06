// 矢量图（vector_image）的回放纯函数（work-chat W13，契约 §8.4 / §9.15）。
//
// 查到的事实（读码，2026-10-06）：矢量图没有自己的 React 编辑面。
//   - `src/shell/vector-editor/*` 目前没有被任何路由引用；
//   - `vector_image` 由嵌入画布（iframe）编辑，路由是 `advanced-routes/EmbeddedRoute.tsx`；
//   - 提交走 `design-composite-commit.ts` 的 typed commit，source format 是 `svg` / `svg+xml`。
// 所以矢量图只做「一次一人」：没有 Y 实体、没有 toEntities/fromEntities；
// 回放只画版本前后：版本 JSON/文本 → SVG 文本 → 经 `<img src="data:image/svg+xml;base64,…">` 显示。
// 图片方式加载的 SVG 不执行脚本；**绝不把 SVG 插进 DOM**。
export interface VectorSnapshot {
  /** SVG 文本（只用来算 data URI 与统计图形数，不进 DOM）。 */
  svg?: string;
  /** 版本是一个已托管地址时（http/https），直接作为 <img src>。 */
  url?: string;
}

const MAX_SVG_CHARS = 2_000_000;

function textOf(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function looksLikeSvg(text: string): boolean {
  return /<svg[\s>]/i.test(text);
}

/** 作品版本 → 快照：认 SVG 文本、`{svg|content|source|text}` 对象、`{url}` 对象。 */
export function vectorFromRevision(json: unknown): VectorSnapshot | null {
  if (typeof json === "string") {
    const text = textOf(json);
    if (!text) return null;
    if (looksLikeSvg(text)) return text.length <= MAX_SVG_CHARS ? { svg: text } : null;
    return /^https?:\/\//i.test(text.trim()) ? { url: text.trim() } : null;
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const row = json as Record<string, unknown>;
  for (const key of ["svg", "content", "source", "text"]) {
    const text = textOf(row[key]);
    if (text && looksLikeSvg(text)) return text.length <= MAX_SVG_CHARS ? { svg: text } : null;
  }
  const url = textOf(row.url) ?? textOf(row.source_url);
  if (url && /^https?:\/\//i.test(url)) return { url };
  return null;
}

function utf8Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** 只给 <img src> 用：SVG 文本 → base64 data URI；已托管地址原样（只认 http/https）。 */
export function vectorImageSrc(snapshot: VectorSnapshot | null | undefined): string | null {
  if (!snapshot) return null;
  if (snapshot.svg) return `data:image/svg+xml;base64,${utf8Base64(snapshot.svg)}`;
  if (snapshot.url && /^https?:\/\//i.test(snapshot.url)) return snapshot.url;
  return null;
}

const SHAPE_TAGS = /<(path|rect|circle|ellipse|line|polygon|polyline|text|image|use)\b/gi;

export function vectorShapeCount(snapshot: VectorSnapshot | null | undefined): number {
  return snapshot?.svg ? (snapshot.svg.match(SHAPE_TAGS) || []).length : 0;
}

interface ChangeNote {
  zh: string;
  vars?: Record<string, string | number>;
}

export function vectorChangeNote(prevRaw: unknown, nextRaw: unknown): ChangeNote | null {
  const prev = prevRaw as VectorSnapshot | null | undefined;
  const next = nextRaw as VectorSnapshot | null | undefined;
  if (!next) return null;
  if (!prev) return { zh: "创建了矢量图" };
  if (prev.svg === next.svg && prev.url === next.url) return null;
  if (prev.svg && next.svg) {
    const delta = vectorShapeCount(next) - vectorShapeCount(prev);
    if (delta > 0) return { zh: "新增了 {n} 个图形", vars: { n: delta } };
    if (delta < 0) return { zh: "删除了 {n} 个图形", vars: { n: -delta } };
  }
  return { zh: "改了矢量图" };
}

export function vectorDescribeChange(prev: unknown, next: unknown): string | null {
  const note = vectorChangeNote(prev, next);
  if (!note) return null;
  return note.zh.replace(/\{(\w+)\}/g, (match, key: string) => (note.vars && key in note.vars ? String(note.vars[key]) : match));
}

/** 「从这一步接手」：交出这一版的 SVG 文本（或已托管地址），由播放器按 svg 源格式另存为新作品。 */
export function vectorToArtifactJson(snapshot: unknown): unknown {
  const value = snapshot as VectorSnapshot | null;
  if (!value) return null;
  if (value.svg) return { format: "svg", svg: value.svg };
  if (value.url) return { format: "svg", url: value.url };
  return null;
}
