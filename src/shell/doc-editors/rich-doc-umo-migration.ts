/**
 * RichDoc Tiptap JSON ↔ Umo 文档迁移（W08 判据 3；R7 / `_COMMON.md` §10 第 6 条）。
 *
 * 两边都是 Tiptap JSON，**同源不是同扩展集**。本文件只走路树、列差异、产出
 * 一份新对象；**不改写入参**，也不静默把存量换成 Umo 格式。
 *
 * 产品动作只有两档：
 *   1. 只读打开 —— `openRichDocReadOnly`：原样返回，附差异清单，没有转换结果；
 *   2. 一键转换 —— `convertRichDocToUmo`：用户点了才跑，失败给一句能看懂的原因。
 *
 * 不自研文档模型（§10 第 2 条）：这里没有第二套 IR，输出仍是 Tiptap `doc`。
 */

export const UMO_DOC_FORMAT = "umo.tiptap.v1";
export const RICHDOC_TIP_TAP_SCHEMA = "tiptap-json@1";

export type MigrationKind = "umo" | "richdoc" | "empty" | "invalid";

export type MigrationDifferenceAction =
  | "keep"
  | "map"
  | "strip"
  | "drop-text"
  | "fail";

export type MigrationDifferenceSide = "shared" | "richdoc" | "umo" | "approx";

export interface MigrationDifference {
  side: MigrationDifferenceSide;
  feature: string;
  path: string;
  reason: string;
  action: MigrationDifferenceAction;
}

export interface ExtensionGap {
  feature: string;
  side: Exclude<MigrationDifferenceSide, "approx">;
  note: string;
}

/**
 * 扩展集差异台账（判据 3「同源，差异逐项列出」）。
 * 按文档走树时还会再补路径级条目；这张表是**静态清单**，给验收对照。
 */
export const RICHDOC_UMO_EXTENSION_GAPS: readonly ExtensionGap[] = [
  {
    feature: "doc / paragraph / heading / text / hardBreak",
    side: "shared",
    note: "Tiptap 核心节点，两边同名。",
  },
  {
    feature: "bold / italic / underline / strike / code / link",
    side: "shared",
    note: "StarterKit + Link，Umo 原样认。",
  },
  {
    feature: "bulletList / orderedList / listItem / blockquote / codeBlock / horizontalRule",
    side: "shared",
    note: "StarterKit 块节点。",
  },
  {
    feature: "table / tableRow / tableCell / tableHeader / image",
    side: "shared",
    note: "RichDoc 的 TableKit + Image；Umo 内置同等节点。",
  },
  {
    feature: "highlight / textStyle（color / fontFamily / fontSize）/ textAlign",
    side: "shared",
    note: "marks 与段落对齐属性两边都有。",
  },
  {
    feature: "taskList / taskItem",
    side: "shared",
    note: "Umo 有；RichDoc StarterKit 默认不注册，出现则原样保留。",
  },
  {
    feature: "richdocComment",
    side: "richdoc",
    note: "批注锚点 mark。转换时剥离；线程在 sidecar `review`，不进 Umo 正文。",
  },
  {
    feature: "richdocInsertion / richdocDeletion / richdocFormatChange",
    side: "richdoc",
    note: "修订 mark。插入留字剥 mark；删除丢那段字；格式变更只剥 mark。",
  },
  {
    feature: "review sidecar",
    side: "richdoc",
    note: "根对象兄弟字段，不是节点。转换后不带进 Umo 文档。",
  },
  {
    feature: "lineHeight / firstLineChars / hangingChars / indentLeft / indentRight / spaceBefore / spaceAfter",
    side: "richdoc",
    note: "RichDocTypography 段落 attrs。Umo schema 不认，转换时记下并丢掉，避免静默脏 attrs。",
  },
  {
    feature: "orderedList.numbering",
    side: "richdoc",
    note: "多级编号预设（公文/中文/圈号）。Umo 只认默认有序表，转换后变普通 1. 2. 3.。",
  },
  {
    feature: "image.wrap",
    side: "richdoc",
    note: "上下型/嵌入。Umo 图片没有这个 attr，转换后丢掉。",
  },
  {
    feature: "pageBreak / tableOfContents / toc",
    side: "umo",
    note: "Umo 分页与目录。回转到 RichDoc 时剥离。",
  },
  {
    feature: "callout / columns / column / bookmark / footnote",
    side: "umo",
    note: "Umo 块级扩展。回转时剥离。",
  },
  {
    feature: "mathematics / mermaid / video / audio / file / iframe / mention",
    side: "umo",
    note: "Umo 媒体与提及。回转时剥离。",
  },
];

const SHARED_NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "bulletList",
  "orderedList",
  "listItem",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "image",
  "taskList",
  "taskItem",
]);

const SHARED_MARKS = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "link",
  "highlight",
  "textStyle",
]);

const RICHDOC_REVIEW_MARKS = new Set([
  "richdocComment",
  "richdocInsertion",
  "richdocDeletion",
  "richdocFormatChange",
]);

const RICHDOC_TYPOGRAPHY_ATTRS = [
  "lineHeight",
  "firstLineChars",
  "hangingChars",
  "indentLeft",
  "indentRight",
  "spaceBefore",
  "spaceAfter",
] as const;

const UMO_ONLY_NODES = new Set([
  "pageBreak",
  "tableOfContents",
  "toc",
  "callout",
  "alert",
  "columns",
  "column",
  "bookmark",
  "footnote",
  "mathematics",
  "math",
  "mermaid",
  "video",
  "audio",
  "file",
  "iframe",
  "mention",
  "emoji",
]);

export interface UmoDocument {
  format: typeof UMO_DOC_FORMAT;
  title: string;
  content: TiptapNode;
  warnings: string[];
  differences: MigrationDifference[];
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
}

export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface InspectResult {
  kind: MigrationKind;
  title: string;
  source: unknown;
  reviewPresent: boolean;
  differences: MigrationDifference[];
  gaps: readonly ExtensionGap[];
  reason: string;
}

export interface ReadOnlyOpenResult {
  ok: boolean;
  mode: "readonly";
  kind: MigrationKind;
  source: unknown;
  differences: MigrationDifference[];
  canConvert: boolean;
  reason: string;
}

export type ConvertFailureCode =
  | "invalid-json"
  | "not-a-document"
  | "empty-after-convert"
  | "already-converted"
  | "strict-blocker";

export interface ConvertSuccess {
  ok: true;
  document: UmoDocument;
  alreadyConverted: boolean;
}

export interface ConvertFailure {
  ok: false;
  code: ConvertFailureCode;
  reason: string;
  differences: MigrationDifference[];
}

export type ConvertResult = ConvertSuccess | ConvertFailure;

export interface ReverseConvertSuccess {
  ok: true;
  schema: typeof RICHDOC_TIP_TAP_SCHEMA;
  version: 1;
  data: TiptapNode;
  warnings: string[];
  differences: MigrationDifference[];
}

export type ReverseConvertResult = ReverseConvertSuccess | ConvertFailure;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function nodeType(value: unknown): string {
  return isPlainObject(value) && typeof value.type === "string"
    ? value.type
    : "";
}

function unwrapSource(input: unknown): {
  kind: MigrationKind;
  node: unknown;
  review: unknown;
  title: string;
  reason: string;
} {
  if (input == null) {
    return {
      kind: "empty",
      node: { type: "doc", content: [{ type: "paragraph" }] },
      review: undefined,
      title: "",
      reason: "",
    };
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) {
      return unwrapSource(null);
    }
    try {
      return unwrapSource(JSON.parse(trimmed) as unknown);
    } catch {
      return {
        kind: "invalid",
        node: input,
        review: undefined,
        title: "",
        reason: "这份内容不是 JSON，无法当作文档打开。",
      };
    }
  }
  if (!isPlainObject(input)) {
    return {
      kind: "invalid",
      node: input,
      review: undefined,
      title: "",
      reason: "这份内容不是一份文档对象。",
    };
  }
  if (input.format === UMO_DOC_FORMAT) {
    const content = input.content;
    if (nodeType(content) !== "doc") {
      return {
        kind: "invalid",
        node: input,
        review: undefined,
        title: String(input.title || ""),
        reason: "Umo 文档缺少 type=doc 的正文。",
      };
    }
    return {
      kind: "umo",
      node: content,
      review: undefined,
      title: String(input.title || ""),
      reason: "",
    };
  }
  if (
    input.schema === RICHDOC_TIP_TAP_SCHEMA &&
    input.data !== undefined
  ) {
    const inner = unwrapSource(input.data);
    return {
      ...inner,
      title: inner.title || String(input.title || ""),
    };
  }
  if (input.type === "doc") {
    const review = input.review;
    const { review: _ignored, ...node } = input;
    void _ignored;
    return {
      kind: "richdoc",
      node,
      review,
      title: String(input.title || ""),
      reason: "",
    };
  }
  return {
    kind: "invalid",
    node: input,
    review: undefined,
    title: String(input.title || ""),
    reason: "根节点不是 Tiptap 的 doc，也不是 Umo 包装格式。",
  };
}

function collectGaps(
  node: unknown,
  path: string,
  direction: "to-umo" | "to-richdoc",
  differences: MigrationDifference[],
): void {
  if (!isPlainObject(node) || typeof node.type !== "string") return;
  const type = node.type;
  if (direction === "to-umo" && UMO_ONLY_NODES.has(type)) {
    return;
  }
  if (direction === "to-umo" && !SHARED_NODES.has(type) && !UMO_ONLY_NODES.has(type)) {
    differences.push({
      side: "richdoc",
      feature: type,
      path,
      reason: `节点「${type}」Umo 不认识，转换时会丢掉。`,
      action: "strip",
    });
  }
  if (direction === "to-richdoc" && UMO_ONLY_NODES.has(type)) {
    differences.push({
      side: "umo",
      feature: type,
      path,
      reason: `节点「${type}」是 Umo 扩展，回转到旧核时会丢掉。`,
      action: "strip",
    });
  }
  const attrs = isPlainObject(node.attrs) ? node.attrs : undefined;
  if (attrs && direction === "to-umo") {
    for (const key of RICHDOC_TYPOGRAPHY_ATTRS) {
      if (attrs[key] != null && attrs[key] !== "") {
        differences.push({
          side: "approx",
          feature: key,
          path: `${path}.attrs.${key}`,
          reason: `排版属性「${key}」Umo 正文模型不保存，转换后这段会按默认段式显示。`,
          action: "strip",
        });
      }
    }
    if (type === "orderedList" && attrs.numbering != null && attrs.numbering !== "") {
      differences.push({
        side: "approx",
        feature: "orderedList.numbering",
        path: `${path}.attrs.numbering`,
        reason: `多级编号预设「${String(attrs.numbering)}」会变成普通有序表。`,
        action: "map",
      });
    }
    if (type === "image" && attrs.wrap != null && attrs.wrap !== "") {
      differences.push({
        side: "approx",
        feature: "image.wrap",
        path: `${path}.attrs.wrap`,
        reason: "图片环绕方式 Umo 不保存，转换后按默认嵌入。",
        action: "strip",
      });
    }
  }
  const marks = Array.isArray(node.marks) ? node.marks : [];
  marks.forEach((mark, index) => {
    if (!isPlainObject(mark) || typeof mark.type !== "string") return;
    const markPath = `${path}.marks[${index}]`;
    if (direction === "to-umo" && RICHDOC_REVIEW_MARKS.has(mark.type)) {
      const action: MigrationDifferenceAction =
        mark.type === "richdocDeletion" ? "drop-text" : "strip";
      differences.push({
        side: "richdoc",
        feature: mark.type,
        path: markPath,
        reason:
          mark.type === "richdocDeletion"
            ? "这段字标了「删除」修订，转换后不会出现在 Umo 正文里。"
            : mark.type === "richdocComment"
              ? "批注锚点会从正文揭掉；批注正文在 sidecar，不会写进 Umo。"
              : "修订标记会揭掉，文字按当前可见状态留下。",
        action,
      });
      return;
    }
    if (
      direction === "to-umo" &&
      !SHARED_MARKS.has(mark.type) &&
      !RICHDOC_REVIEW_MARKS.has(mark.type)
    ) {
      differences.push({
        side: "richdoc",
        feature: mark.type,
        path: markPath,
        reason: `标记「${mark.type}」Umo 不认识，转换时会揭掉。`,
        action: "strip",
      });
    }
  });
  const content = Array.isArray(node.content) ? node.content : [];
  content.forEach((child, index) => {
    collectGaps(child, `${path}.content[${index}]`, direction, differences);
  });
}

function hasDeletionMark(marks: unknown): boolean {
  return (
    Array.isArray(marks) &&
    marks.some(
      (mark) => isPlainObject(mark) && mark.type === "richdocDeletion",
    )
  );
}

function mapMarks(
  marks: unknown,
  _path: string,
): TiptapMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const next: TiptapMark[] = [];
  for (const mark of marks) {
    if (!isPlainObject(mark) || typeof mark.type !== "string") continue;
    if (RICHDOC_REVIEW_MARKS.has(mark.type)) continue;
    if (!SHARED_MARKS.has(mark.type)) continue;
    const mapped: TiptapMark = { type: mark.type };
    if (isPlainObject(mark.attrs)) mapped.attrs = { ...mark.attrs };
    next.push(mapped);
  }
  return next.length > 0 ? next : undefined;
}

function mapAttrs(
  type: string,
  attrs: unknown,
): Record<string, unknown> | undefined {
  if (!isPlainObject(attrs)) return undefined;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if ((RICHDOC_TYPOGRAPHY_ATTRS as readonly string[]).includes(key)) continue;
    if (type === "orderedList" && key === "numbering") continue;
    if (type === "image" && key === "wrap") continue;
    if (value !== undefined) next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function convertNode(
  node: unknown,
  path: string,
  direction: "to-umo" | "to-richdoc",
): TiptapNode | null {
  if (!isPlainObject(node) || typeof node.type !== "string") return null;
  const type = node.type;
  if (direction === "to-umo") {
    if (!SHARED_NODES.has(type)) return null;
    if (type === "text" && hasDeletionMark(node.marks)) return null;
  }
  if (direction === "to-richdoc" && UMO_ONLY_NODES.has(type)) return null;
  if (direction === "to-richdoc" && !SHARED_NODES.has(type)) return null;

  const mapped: TiptapNode = { type };
  if (typeof node.text === "string") mapped.text = node.text;
  const attrs = mapAttrs(type, node.attrs);
  if (attrs) mapped.attrs = attrs;
  const marks = mapMarks(node.marks, path);
  if (marks) mapped.marks = marks;
  if (Array.isArray(node.content)) {
    const children: TiptapNode[] = [];
    node.content.forEach((child, index) => {
      const converted = convertNode(
        child,
        `${path}.content[${index}]`,
        direction,
      );
      if (converted) children.push(converted);
    });
    if (children.length > 0) mapped.content = children;
  }
  return mapped;
}

function hasVisibleText(node: TiptapNode | null): boolean {
  if (!node) return false;
  if (typeof node.text === "string" && node.text.length > 0) return true;
  if (node.type === "image" || node.type === "horizontalRule") return true;
  if (node.type === "hardBreak") return true;
  return Boolean(node.content?.some((child) => hasVisibleText(child)));
}

function ensureDoc(node: TiptapNode | null): TiptapNode {
  if (node && node.type === "doc") {
    if (!node.content || node.content.length === 0) {
      return { type: "doc", content: [{ type: "paragraph" }] };
    }
    return node;
  }
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function inspectRichDocDocument(input: unknown): InspectResult {
  const unwrapped = unwrapSource(input);
  if (unwrapped.kind === "invalid") {
    return {
      kind: "invalid",
      title: unwrapped.title,
      source: unwrapped.node,
      reviewPresent: false,
      differences: [],
      gaps: RICHDOC_UMO_EXTENSION_GAPS,
      reason: unwrapped.reason,
    };
  }
  const differences: MigrationDifference[] = [];
  if (unwrapped.review != null) {
    differences.push({
      side: "richdoc",
      feature: "review sidecar",
      path: "review",
      reason: "批注线程与修订开关在 sidecar 里，不会写进 Umo 正文。",
      action: "strip",
    });
  }
  collectGaps(
    unwrapped.node,
    "$",
    unwrapped.kind === "umo" ? "to-richdoc" : "to-umo",
    differences,
  );
  return {
    kind: unwrapped.kind,
    title: unwrapped.title,
    source: unwrapped.node,
    reviewPresent: unwrapped.review != null,
    differences,
    gaps: RICHDOC_UMO_EXTENSION_GAPS,
    reason: unwrapped.reason,
  };
}

/**
 * 存量只读打开。返回的 `source` 是入参的深拷贝，**没有转换结果**。
 * 调用方把这份 JSON 送给 Umo 时必须带 `readOnly: true`，不得当可编辑稿用。
 */
export function openRichDocReadOnly(input: unknown): ReadOnlyOpenResult {
  const inspect = inspectRichDocDocument(input);
  if (inspect.kind === "invalid") {
    return {
      ok: false,
      mode: "readonly",
      kind: "invalid",
      source: null,
      differences: [],
      canConvert: false,
      reason: inspect.reason || "这份文档打不开。",
    };
  }
  return {
    ok: true,
    mode: "readonly",
    kind: inspect.kind,
    source: cloneJson(inspect.source),
    differences: inspect.differences,
    canConvert: inspect.kind === "richdoc" || inspect.kind === "empty",
    reason:
      inspect.kind === "umo"
        ? "已经是 Umo 文档，只读打开不会改写。"
        : inspect.kind === "empty"
          ? "空文档，只读打开。"
          : "存量按只读打开，原文一个字节都没改。要点「一键转换」才会生成 Umo 副本。",
  };
}

export function convertRichDocToUmo(
  input: unknown,
  options: { title?: string; strict?: boolean } = {},
): ConvertResult {
  const inspect = inspectRichDocDocument(input);
  if (inspect.kind === "invalid") {
    return {
      ok: false,
      code: "not-a-document",
      reason: inspect.reason || "这份内容不是一份能转换的文档。",
      differences: [],
    };
  }
  if (inspect.kind === "umo") {
    const existing = isPlainObject(input) && input.format === UMO_DOC_FORMAT
      ? (cloneJson(input) as unknown as UmoDocument)
      : {
          format: UMO_DOC_FORMAT,
          title: options.title || inspect.title,
          content: cloneJson(inspect.source) as TiptapNode,
          warnings: [],
          differences: inspect.differences,
        };
    if (options.strict) {
      return {
        ok: false,
        code: "already-converted",
        reason: "这份已经是 Umo 文档，一键转换不会再改写它。",
        differences: inspect.differences,
      };
    }
    return {
      ok: true,
      alreadyConverted: true,
      document: {
        format: UMO_DOC_FORMAT,
        title: existing.title || options.title || inspect.title,
        content: existing.content,
        warnings: existing.warnings || [],
        differences: inspect.differences,
      },
    };
  }
  if (options.strict && inspect.differences.some((item) => item.action === "fail")) {
    const blocker = inspect.differences.find((item) => item.action === "fail");
    return {
      ok: false,
      code: "strict-blocker",
      reason: blocker?.reason || "严格模式下存在无法转换的节点。",
      differences: inspect.differences,
    };
  }
  const converted = convertNode(inspect.source, "$", "to-umo");
  const doc = ensureDoc(converted);
  if (!hasVisibleText(doc) && hasVisibleText(inspect.source as TiptapNode)) {
    return {
      ok: false,
      code: "empty-after-convert",
      reason:
        "转换后正文被清空：原文档只剩 Umo 不认识的节点，没有可留下的文字或图片。",
      differences: inspect.differences,
    };
  }
  const warnings = inspect.differences.map(
    (item) => `${item.feature}：${item.reason}`,
  );
  return {
    ok: true,
    alreadyConverted: false,
    document: {
      format: UMO_DOC_FORMAT,
      title: options.title || inspect.title,
      content: doc,
      warnings,
      differences: inspect.differences,
    },
  };
}

export function convertUmoToRichDoc(
  input: unknown,
  options: { strict?: boolean } = {},
): ReverseConvertResult {
  const inspect = inspectRichDocDocument(input);
  if (inspect.kind === "invalid") {
    return {
      ok: false,
      code: "not-a-document",
      reason: inspect.reason || "这份内容不是一份能回转的文档。",
      differences: [],
    };
  }
  const source =
    inspect.kind === "umo" || inspect.kind === "richdoc" || inspect.kind === "empty"
      ? inspect.source
      : null;
  if (!source) {
    return {
      ok: false,
      code: "not-a-document",
      reason: "没有可回转的 Tiptap 正文。",
      differences: inspect.differences,
    };
  }
  const differences: MigrationDifference[] = [];
  collectGaps(source, "$", "to-richdoc", differences);
  if (options.strict && differences.some((item) => item.action === "strip")) {
    return {
      ok: false,
      code: "strict-blocker",
      reason: "严格模式下 Umo 扩展节点不会被丢掉，请先在 Umo 里改成旧核认的结构。",
      differences,
    };
  }
  const converted = convertNode(source, "$", "to-richdoc");
  const doc = ensureDoc(converted);
  if (!hasVisibleText(doc) && hasVisibleText(source as TiptapNode)) {
    return {
      ok: false,
      code: "empty-after-convert",
      reason: "回转后正文被清空：原文档只剩旧核不认识的 Umo 节点。",
      differences,
    };
  }
  return {
    ok: true,
    schema: RICHDOC_TIP_TAP_SCHEMA,
    version: 1,
    data: doc,
    warnings: differences.map((item) => `${item.feature}：${item.reason}`),
    differences,
  };
}

/** 给宿主判断：这份工程档要不要先挡在只读门后面。 */
export function needsOneClickConvert(input: unknown): boolean {
  const inspect = inspectRichDocDocument(input);
  return inspect.kind === "richdoc" && inspect.differences.length > 0;
}
