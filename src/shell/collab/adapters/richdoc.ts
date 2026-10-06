// 富文本（TipTap）的多人同改适配：W12，work-chat 契约 §8.4 / §9.15，做法见 tasks/_EDITORS.md。
//
// 这个文件只放不依赖浏览器与 React 的部分，Node 单测可直接加载：
//   - 协同根名、用户颜色/光标 DOM 的安全构造（不用 innerHTML）；
//   - 「什么时候该播种 / 等同步 / 可编辑」的状态判断，以及种子、保存、外部新版本三条流程函数；
//   - 回放：协同文档（Y.XmlFragment）或作品版本 JSON → 同一种规范快照，一句话描述变化，接手时还原作品 JSON。
// 真正的 TipTap 扩展装配在 `use-rich-doc-editor.ts`，那里 import 本文件。

/** `Collaboration.configure({ field })` 与 `completeSeed([…])` 用的根名。 */
export const RICHDOC_COLLAB_FIELD = "oceanleo:richdoc";
export const RICHDOC_COLLAB_EDITOR_KIND = "richdoc";

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// ── 用户颜色与光标 ──────────────────────────────────────────────────────────

const SAFE_COLOR = /^(?:#[0-9a-fA-F]{3,8}|hsl\(\s*\d{1,3}(?:\.\d+)?\s*,\s*\d{1,3}(?:\.\d+)?%\s*,\s*\d{1,3}(?:\.\d+)?%\s*\))$/;

/** 颜色只认 `#rgb` 与 `hsl(…)`；别的一律回落，不把别人给的字符串拼进样式。 */
export function safeCollabColor(color: unknown, fallback = "#6366f1"): string {
  return typeof color === "string" && SAFE_COLOR.test(color.trim()) ? color.trim() : fallback;
}

export interface RichDocCaretUser {
  id: string;
  name: string;
  color: string;
}

/** 交给 `CollaborationCaret.configure({ user })` 的用户。 */
export function richDocCaretUser(self: {
  id: string;
  name: string;
  color: string;
}): RichDocCaretUser {
  return {
    id: String(self.id),
    name: String(self.name || "").slice(0, 40),
    color: safeCollabColor(self.color),
  };
}

interface DomLike {
  createElement(tag: string): {
    className: string;
    textContent: string | null;
    style: Record<string, string> & { setProperty?: (k: string, v: string) => void };
    appendChild(child: unknown): unknown;
    setAttribute(name: string, value: string): void;
  };
}

/**
 * 别人的光标：一条带颜色的竖线 + 名字小牌。只用 `createElement` / `textContent` / `style`，
 * 名字与颜色都当纯文本处理（颜色先过白名单）。
 */
export function renderRichDocCaret(
  user: Record<string, unknown>,
  doc: DomLike = (globalThis as unknown as { document: DomLike }).document,
): HTMLElement {
  const color = safeCollabColor(user.color);
  const caret = doc.createElement("span");
  caret.className = "oleo-richdoc-caret";
  caret.style.borderLeft = `2px solid ${color}`;
  caret.style.marginLeft = "-1px";
  caret.style.marginRight = "-1px";
  caret.style.position = "relative";
  caret.style.wordBreak = "normal";
  caret.style.pointerEvents = "none";
  const label = doc.createElement("div");
  label.className = "oleo-richdoc-caret-label";
  label.textContent = typeof user.name === "string" ? user.name.slice(0, 40) : "";
  label.style.position = "absolute";
  label.style.top = "-1.35em";
  label.style.left = "-2px";
  label.style.padding = "0 4px";
  label.style.borderRadius = "3px 3px 3px 0";
  label.style.fontSize = "10px";
  label.style.lineHeight = "1.35";
  label.style.whiteSpace = "nowrap";
  label.style.color = "#fff";
  label.style.background = color;
  label.style.userSelect = "none";
  caret.appendChild(label);
  return caret as unknown as HTMLElement;
}

/** 别人选中的文字：他的颜色的半透明底。 */
export function richDocSelectionRender(user: Record<string, unknown>): {
  nodeName: string;
  class: string;
  style: string;
} {
  const color = safeCollabColor(user.color);
  return {
    nodeName: "span",
    class: "oleo-richdoc-selection",
    style: `background-color: ${translucent(color)}`,
  };
}

/** 给白名单颜色加 20% 透明度：`#rgb`/`#rrggbb[aa]` 与 `hsl(…)` 各有各的写法。 */
function translucent(color: string): string {
  const hsl = /^hsl\(\s*([\d.]+)\s*,\s*([\d.]+%)\s*,\s*([\d.]+%)\s*\)$/.exec(color);
  if (hsl) return `hsla(${hsl[1]}, ${hsl[2]}, ${hsl[3]}, 0.2)`;
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(color);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}33`;
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return `${color}33`;
  // 4/5/7/8 位（自带透明度）等罕见写法：回落到默认色，不拼接。
  return "#6366f133";
}

// ── 阶段判断 ────────────────────────────────────────────────────────────────

export interface RichDocRoomLike {
  status: string;
  needsSeed: boolean;
  role?: string;
}

export type RichDocCollabPhase =
  /** 不在协同里：一切照旧。 */
  | "off"
  /** 还没连上：编辑器不可编辑。 */
  | "connecting"
  /** 这个客户端该播种，但作品内容还没读出来。 */
  | "load-source"
  /** 这个客户端该播种，内容已就绪：现在就把作品内容写进协同文档。 */
  | "seed"
  /** 别人播种或还在同步：等 `synced`。 */
  | "wait-sync"
  /** 可以编辑，内容以协同文档为准。 */
  | "live";

export function richDocCollabPhase(input: {
  room: RichDocRoomLike | null | undefined;
  /** 作品内容（原有读取链路）是否已读出。 */
  contentReady: boolean;
  /** 本客户端是否已完成播种。 */
  seeded: boolean;
  /** 之前是否进入过 live（断线后继续编辑，不再回到等待）。 */
  wasLive?: boolean;
}): RichDocCollabPhase {
  const { room } = input;
  if (!room || room.status === "denied" || room.status === "disabled") return "off";
  if (room.status === "connecting") return input.wasLive ? "live" : "connecting";
  if (room.status === "offline") return input.wasLive ? "live" : "connecting";
  if (room.needsSeed && !input.seeded) return input.contentReady ? "seed" : "load-source";
  if (room.needsSeed && input.seeded) return "live";
  return room.status === "synced" ? "live" : input.wasLive ? "live" : "wait-sync";
}

/** 协同里的富文本是否应该只读：房间只读，或还没就绪。 */
export function richDocEditable(phase: RichDocCollabPhase, readOnly: boolean): boolean {
  if (phase === "off") return !readOnly;
  return phase === "live" && !readOnly;
}

// ── 三条流程 ────────────────────────────────────────────────────────────────

export interface RichDocSeedRoom {
  completeSeed(roots: string[]): void;
}

/**
 * 种子：把作品内容写进协同文档（`setContent` 由编辑器完成，它通过协同扩展落进 Y.XmlFragment），
 * 清掉撤销栈（别人撤销不该撤到「空白」），再通知服务端种完了。
 */
export function seedRichDoc(input: {
  room: RichDocSeedRoom;
  setContent: () => void;
  clearUndo?: () => void;
}): void {
  input.setContent();
  input.clearUndo?.();
  input.room.completeSeed([RICHDOC_COLLAB_FIELD]);
}

export interface RichDocSaveRoom {
  isSaver: boolean;
  status?: string;
  markSaved(revisionId: string): void;
}

/**
 * 保存：只有房间里的保存者存版本（不在协同里 → 照常存）；存成功后告诉房间这是哪个版本。
 * `save` 是原有的保存函数，返回的 `revisionId` 缺失时不通知（没产生新版本）。
 */
export async function saveRichDocWithRoom<T extends { revisionId?: string } | null>(input: {
  room: RichDocSaveRoom | null | undefined;
  save: () => Promise<T>;
}): Promise<{ skipped: boolean; result: T | null }> {
  const { room } = input;
  const inCollab = Boolean(room) && room!.status !== "denied" && room!.status !== "disabled";
  if (inCollab && !room!.isSaver) return { skipped: true, result: null };
  const result = await input.save();
  const revisionId = result && typeof result.revisionId === "string" ? result.revisionId : "";
  if (inCollab && revisionId) room!.markSaved(revisionId);
  return { skipped: false, result };
}

export interface RichDocExternalRoom {
  onExternalRevision(cb: (revisionId: string, origin: string) => void): () => void;
  markSaved(revisionId: string): void;
}

/**
 * 外部新版本（AI、专业模式、导入存了新版本）：只有保存者会收到。
 * 用原有的读取函数取该版本 → 整篇替换进协同文档（别人的光标会跳位，可接受）→
 * `markSaved` 并清掉「未保存」，不再多存一份重复版本。
 * 同时到来多条时只认最后一条；读取失败不动当前内容。
 */
export function followRichDocExternalRevisions<TContent>(input: {
  room: RichDocExternalRoom;
  read: (revisionId: string, origin: string) => Promise<TContent | null>;
  apply: (content: TContent, revisionId: string) => void;
  markClean: () => void;
  onError?: (error: unknown) => void;
}): () => void {
  let latest = 0;
  let alive = true;
  const off = input.room.onExternalRevision((revisionId, origin) => {
    const ticket = ++latest;
    void input
      .read(revisionId, origin)
      .then((content) => {
        if (!alive || ticket !== latest || content === null || content === undefined) return;
        input.apply(content, revisionId);
        input.room.markSaved(revisionId);
        input.markClean();
      })
      .catch((error) => input.onError?.(error));
  });
  return () => {
    alive = false;
    off();
  };
}

// ── 回放：快照 ──────────────────────────────────────────────────────────────

export interface RichDocMark {
  type: string;
  attrs?: Rec;
}

export interface RichDocNode {
  type: string;
  attrs?: Rec;
  content?: RichDocNode[];
  marks?: RichDocMark[];
  text?: string;
}

export interface RichDocSnapshot {
  type: "doc";
  content: RichDocNode[];
}

function cleanAttrs(attrs: unknown): Rec | undefined {
  if (!isRec(attrs)) return undefined;
  const out: Rec = {};
  for (const key of Object.keys(attrs).sort()) {
    const value = attrs[key];
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (isRec(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

function normalizeMarks(marks: unknown): RichDocMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: RichDocMark[] = [];
  for (const mark of marks) {
    if (!isRec(mark) || typeof mark.type !== "string") continue;
    const attrs = cleanAttrs(mark.attrs);
    out.push(attrs ? { type: mark.type, attrs } : { type: mark.type });
  }
  out.sort((a, b) => stable(a).localeCompare(stable(b)));
  return out.length > 0 ? out : undefined;
}

function normalizeNodes(nodes: unknown): RichDocNode[] {
  const out: RichDocNode[] = [];
  if (!Array.isArray(nodes)) return out;
  for (const raw of nodes) {
    if (!isRec(raw) || typeof raw.type !== "string") continue;
    if (raw.type === "text") {
      const text = typeof raw.text === "string" ? raw.text : "";
      if (!text) continue;
      const marks = normalizeMarks(raw.marks);
      const last = out[out.length - 1];
      if (last && last.type === "text" && stable(last.marks) === stable(marks)) {
        last.text = `${last.text}${text}`;
        continue;
      }
      out.push(marks ? { type: "text", text, marks } : { type: "text", text });
      continue;
    }
    const node: RichDocNode = { type: raw.type };
    const attrs = cleanAttrs(raw.attrs);
    if (attrs) node.attrs = attrs;
    const content = normalizeNodes(raw.content);
    if (content.length > 0) node.content = content;
    const marks = normalizeMarks(raw.marks);
    if (marks) node.marks = marks;
    out.push(node);
  }
  return out;
}

/** 任何形式的 TipTap/ProseMirror JSON → 规范快照（审阅侧栏等根上多余字段丢掉）。 */
export function normalizeRichDocJson(json: unknown): RichDocSnapshot {
  let doc: unknown = json;
  // 工程档外壳 `{ schema, data }` 与旧的 `{ doc }` 都认。
  if (isRec(doc) && doc.type !== "doc" && isRec(doc.data)) doc = doc.data;
  if (isRec(doc) && doc.type !== "doc" && isRec(doc.doc)) doc = doc.doc;
  if (!isRec(doc) || doc.type !== "doc") return { type: "doc", content: [] };
  return { type: "doc", content: normalizeNodes(doc.content) };
}

interface YXmlLike {
  nodeName?: string;
  getAttributes?: () => Rec;
  toArray?: () => unknown[];
  toDelta?: () => Array<{ insert?: unknown; attributes?: Rec }>;
}

function yMarkName(attrName: string): string {
  const match = /^(.*)--[a-zA-Z0-9+/=]{8}$/.exec(attrName);
  return match ? match[1] : attrName;
}

function yNodeToJson(node: unknown): unknown[] {
  const item = node as YXmlLike;
  if (typeof item.toDelta === "function" && typeof item.nodeName !== "string") {
    const out: unknown[] = [];
    for (const piece of item.toDelta()) {
      if (typeof piece.insert !== "string") continue;
      const marks = Object.keys(piece.attributes ?? {}).map((name) => ({
        type: yMarkName(name),
        attrs: (piece.attributes as Rec)[name],
      }));
      out.push({ type: "text", text: piece.insert, ...(marks.length > 0 ? { marks } : {}) });
    }
    return out;
  }
  if (typeof item.nodeName === "string") {
    const children = (item.toArray?.() ?? []).flatMap((child) => yNodeToJson(child));
    return [
      {
        type: item.nodeName,
        attrs: item.getAttributes?.() ?? {},
        ...(children.length > 0 ? { content: children } : {}),
      },
    ];
  }
  return [];
}

/** 协同文档 → 规范快照（直接读 `Y.XmlFragment`，不起编辑器）。`doc` 是 `Y.Doc`。 */
export function richDocFromY(doc: unknown, field = RICHDOC_COLLAB_FIELD): RichDocSnapshot {
  const fragment = (doc as { getXmlFragment(name: string): YXmlLike }).getXmlFragment(field);
  const content = (fragment.toArray?.() ?? []).flatMap((child) => yNodeToJson(child));
  return normalizeRichDocJson({ type: "doc", content });
}

/** 作品版本 JSON（AI 改的、专业模式存的、手动保存的）→ 规范快照。 */
export function richDocFromRevision(json: unknown): RichDocSnapshot {
  return normalizeRichDocJson(json);
}

/** 「从这一步接手」：还原成富文本编辑器能打开的作品 JSON（`tiptap-json@1`）。 */
export function richDocToArtifactJson(snapshot: unknown): RichDocSnapshot {
  return normalizeRichDocJson(snapshot);
}

// ── 回放：变化 ──────────────────────────────────────────────────────────────

export function richDocBlockText(node: RichDocNode): string {
  if (node.type === "text") return node.text ?? "";
  const parts = (node.content ?? []).map(richDocBlockText);
  const sep = node.type === "doc" || node.type === "bulletList" || node.type === "orderedList" ||
    node.type === "table" || node.type === "tableRow" || node.type === "listItem" ? "\n" : "";
  return parts.join(sep);
}

/**
 * 两组块的差异：按块内容做最长公共子序列，剩下的就是「这边有、那边没有」的块。
 * 块很多时（> 25 万格）退回成只裁首尾相同的部分，保证回放不卡。
 */
function blockDiff(prev: RichDocNode[], next: RichDocNode[]) {
  const a = prev.map((node) => stable(node));
  const b = next.map((node) => stable(node));
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail += 1;
  }
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const keptA = new Set<number>();
  const keptB = new Set<number>();
  if (midA.length * midB.length <= 250_000 && midA.length > 0 && midB.length > 0) {
    const width = midB.length + 1;
    const table = new Uint32Array((midA.length + 1) * width);
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        table[i * width + j] =
          midA[i] === midB[j]
            ? table[(i + 1) * width + j + 1] + 1
            : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        keptA.add(i);
        keptB.add(j);
        i += 1;
        j += 1;
      } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i += 1;
      else j += 1;
    }
  }
  const removed: number[] = [];
  const added: number[] = [];
  midA.forEach((_, i) => {
    if (!keptA.has(i)) removed.push(head + i);
  });
  midB.forEach((_, j) => {
    if (!keptB.has(j)) added.push(head + j);
  });
  return { removed, added };
}

/** 新快照里相对上一帧有变化的块下标（画法用来在左侧加作者色竖条）。 */
export function richDocChangedBlocks(prev: unknown, next: unknown): Set<number> {
  const before = normalizeRichDocJson(prev).content;
  const after = normalizeRichDocJson(next).content;
  return new Set(blockDiff(before, after).added);
}

export type RichDocTranslate = (zh: string, vars?: Record<string, string | number>) => string;

const plainTranslate: RichDocTranslate = (zh, vars) =>
  vars ? zh.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;

/** 一句话说清这一步改了什么；没有变化返回 null。`tt` 缺省返回中文原文。 */
export function describeRichDocChange(
  prev: unknown,
  next: unknown,
  tt: RichDocTranslate = plainTranslate,
): string | null {
  const before = normalizeRichDocJson(prev).content;
  const after = normalizeRichDocJson(next).content;
  const { removed: oldIndexes, added: newIndexes } = blockDiff(before, after);
  if (oldIndexes.length === 0 && newIndexes.length === 0) return null;
  const oldMid = oldIndexes.map((i) => before[i]);
  const newMid = newIndexes.map((i) => after[i]);
  const paired = Math.min(oldMid.length, newMid.length);
  const added = newMid.length - paired;
  const removed = oldMid.length - paired;
  const parts: string[] = [];
  if (added > 0) parts.push(tt("新增 {n} 段", { n: added }));
  if (removed > 0) parts.push(tt("删除 {n} 段", { n: removed }));
  if (paired > 0) {
    const touched = [...oldMid.slice(0, paired), ...newMid.slice(0, paired)];
    const heading = touched.some((node) => node.type === "heading");
    const table = touched.some((node) => node.type === "table");
    const image = touched.some((node) => node.type === "image");
    if (heading && paired === 1) parts.push(tt("改了标题"));
    else if (table && paired === 1) parts.push(tt("改了表格"));
    else if (image && paired === 1) parts.push(tt("换了图片"));
    else parts.push(tt("改了 {n} 段", { n: paired }));
  }
  return parts.reduce((a, b) => tt("{a}，{b}", { a, b }));
}

/** 图片缩略只认 http(s)、站内相对路径、位图 data URL；SVG 与 `javascript:` 一律不画。 */
export function safeRichDocImageSrc(src: unknown): string | null {
  if (typeof src !== "string") return null;
  const value = src.trim();
  if (!value || value.length > 4096) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (/^\/(?!\/)/.test(value)) return value;
  if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return value;
  return null;
}
