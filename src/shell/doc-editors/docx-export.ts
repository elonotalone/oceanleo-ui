import {
  RICHDOC_NUMBERING_PRESETS,
  richDocDocxCellProperties,
  richDocDocxParagraphProperties,
  richDocDocxRowProperties,
  richDocListMarker,
  type RichDocNumberingPreset,
} from "./rich-doc-model";
import {
  commentAnchorMarkName,
  type DocxCommentEntry,
} from "./richdoc-review/review-export";

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: TiptapNode[];
}

type DocxModule = typeof import("docx");

export interface DocxExportOptions {
  /**
   * 由 `buildDocxCommentPayload(doc, sidecar)` 备好的批注载荷（审阅层出，
   * 见 `richdoc-review/review-export.ts`）。**不给就是不带批注导出**，
   * 与接线前的行为一字不差——批注是加法，不改既有导出的任何字节。
   */
  comments?: readonly DocxCommentEntry[];
}

/** 正文里认锚点的 mark 名（`richdocComment`），不硬编码字符串。 */
const COMMENT_MARK = commentAnchorMarkName();

/**
 * `commentId`（sidecar 的字符串 id）→ docx 要的数字 id。
 * 只收载荷里真有的那些：`buildDocxCommentPayload` 已经把已解决与孤儿筛掉了，
 * 正文里那些批注的锚点 mark 还在，但它们不该在 docx 里开出一段没有主人的范围。
 */
function commentIdIndex(
  entries: readonly DocxCommentEntry[],
): ReadonlyMap<string, number> {
  return new Map(entries.map((entry) => [entry.commentId, entry.id]));
}

/**
 * 正文里还留着锚点的批注 id。
 *
 * **为什么要先扫一遍**：`applyRevisionExportChoice()` 摘审阅 mark 时，
 * `RICHDOC_REVIEW_MARKS` 里**包含** `richdocComment`（`review-marks.ts:36`），
 * 也就是说用户一旦选了「接受全部/拒绝全部/保留标记」，导出的这份 JSON 上
 * 批注锚点已经没了。此时若照样把批注写进 `comments` 部件，docx 里就会出现
 * 一批没有任何 `CommentRangeStart` 的批注——Word 直接判文件损坏。
 * 所以入选判据是「锚点在这份**要导出的**正文里」，不是「sidecar 里有」。
 */
function anchoredCommentIds(root: TiptapNode): ReadonlySet<string> {
  const found = new Set<string>();
  const walk = (node: TiptapNode) => {
    for (const mark of node.marks || []) {
      if (mark.type !== COMMENT_MARK) continue;
      const id = String(mark.attrs?.commentId || "");
      if (id) found.add(id);
    }
    for (const child of node.content || []) walk(child);
  };
  walk(root);
  return found;
}

/** 这个文本节点盖着哪几条**进了导出的**批注。 */
function commentIdsOn(
  node: TiptapNode,
  index: ReadonlyMap<string, number>,
): number[] {
  if (!index.size) return [];
  const ids: number[] = [];
  for (const mark of node.marks || []) {
    if (mark.type !== COMMENT_MARK) continue;
    const id = index.get(String(mark.attrs?.commentId || ""));
    if (id !== undefined) ids.push(id);
  }
  return ids;
}

const TRANSPARENT_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
  0, 0, 0, 1, 8, 4, 0, 0, 0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84,
  120, 218, 99, 252, 255, 31, 0, 3, 3, 2, 0, 238, 254, 245, 191, 0, 0, 0, 0,
  73, 69, 78, 68, 174, 66, 96, 130,
]);

function boundedNumber(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(maximum, Math.max(minimum, parsed))
    : fallback;
}

function imageType(contentType: string, url: string) {
  const hint = `${contentType} ${url}`.toLowerCase();
  if (hint.includes("jpeg") || hint.includes(".jpg")) return "jpg" as const;
  if (hint.includes("gif") || hint.includes(".gif")) return "gif" as const;
  if (hint.includes("bmp") || hint.includes(".bmp")) return "bmp" as const;
  if (hint.includes("svg") || hint.includes(".svg")) return "svg" as const;
  return "png" as const;
}

/**
 * 图片节点 → 一个 docx run。**行内图与块级图共用这一份**：`inline` 一旦打开，
 * 同一个 `image` 节点既可能挂在段落里，也可能独占一层，两条路必须给出同样的
 * 字节，否则用户换一次环绕方式导出结果就变了。
 */
async function imageRun(
  node: TiptapNode,
  docx: DocxModule,
): Promise<unknown> {
  const src = String(node.attrs?.src || "");
  if (!/^https?:\/\//i.test(src)) {
    return new docx.TextRun({ text: String(node.attrs?.alt || "图片") });
  }
  try {
    const response = await fetch(src, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const type = imageType(response.headers.get("content-type") || "", src);
    const transformation = {
      width: boundedNumber(node.attrs?.width, 560, 32, 1000),
      height: boundedNumber(node.attrs?.height, 315, 24, 1000),
    };
    return new docx.ImageRun(
      type === "svg"
        ? {
            data: bytes,
            type,
            transformation,
            fallback: {
              data: TRANSPARENT_PNG,
              type: "png",
            },
          }
        : { data: bytes, type, transformation },
    );
  } catch {
    return new docx.TextRun({
      text: String(node.attrs?.alt || "图片（导出时无法读取）"),
      italics: true,
      color: "78716C",
    });
  }
}

async function inlineChildren(
  node: TiptapNode,
  docx: DocxModule,
  commentIds: ReadonlyMap<string, number>,
): Promise<unknown[]> {
  const output: unknown[] = [];
  // 相邻文本节点盖着同一条批注时只开一段范围，不是每个 run 各开一段：
  // Word 会把后者显示成一串重复的批注气泡。
  let openIds: number[] = [];
  const closeRanges = (keep: readonly number[]) => {
    for (const id of openIds) {
      if (keep.includes(id)) continue;
      output.push(new docx.CommentRangeEnd(id));
      // `commentReference` 按 OOXML 要待在一个 run 里，不能裸挂在段落上。
      output.push(
        new docx.TextRun({ children: [new docx.CommentReference(id)] }),
      );
    }
    openIds = openIds.filter((id) => keep.includes(id));
  };
  for (const child of node.content || []) {
    if (child.type === "hardBreak") {
      output.push(new docx.TextRun({ break: 1 }));
      continue;
    }
    if (child.type === "image") {
      output.push(await imageRun(child, docx));
      continue;
    }
    if (child.type !== "text") {
      output.push(...(await inlineChildren(child, docx, commentIds)));
      continue;
    }
    const ids = commentIdsOn(child, commentIds);
    closeRanges(ids);
    for (const id of ids) {
      if (openIds.includes(id)) continue;
      output.push(new docx.CommentRangeStart(id));
      openIds.push(id);
    }
    const style: Record<string, unknown> = { text: child.text || "" };
    let href = "";
    for (const mark of child.marks || []) {
      if (mark.type === "bold") style.bold = true;
      else if (mark.type === "italic") style.italics = true;
      else if (mark.type === "underline") style.underline = {};
      else if (mark.type === "strike") style.strike = true;
      else if (mark.type === "code") style.font = "Consolas";
      else if (mark.type === "highlight") {
        const color = String(mark.attrs?.color || "FFFF00").replace("#", "");
        if (/^[0-9a-f]{6}$/i.test(color)) style.highlight = color;
      } else if (mark.type === "textStyle") {
        const color = String(mark.attrs?.color || "").replace("#", "");
        if (/^[0-9a-f]{6}$/i.test(color)) style.color = color;
      } else if (mark.type === "link") {
        const value = String(mark.attrs?.href || "");
        if (/^https?:\/\//i.test(value)) href = value;
      }
    }
    const run = new docx.TextRun(style);
    output.push(
      href
        ? new docx.ExternalHyperlink({ link: href, children: [run] })
        : run,
    );
  }
  // 段落结束时还开着的范围必须在这里收口：`CommentRangeStart` 没有配对的
  // `CommentRangeEnd`，Word 会判整份文档损坏。
  closeRanges([]);
  return output;
}

const NUMBERING_PRESET_VALUES = new Set<string>(
  RICHDOC_NUMBERING_PRESETS.map((preset) => preset.value),
);

function numberingPresetOf(value: unknown): RichDocNumberingPreset {
  const raw = String(value ?? "");
  return NUMBERING_PRESET_VALUES.has(raw)
    ? (raw as RichDocNumberingPreset)
    : "decimal";
}

/**
 * `listLevel` 是「外面套了几层列表」。它有两个用途：给多级编号挑这一级的
 * 记号（`一、`→`（一）`→`1.`），以及让每级左缩进递进一个字符宽。
 */
async function blockChildren(
  nodes: TiptapNode[],
  docx: DocxModule,
  commentIds: ReadonlyMap<string, number>,
  listPrefix = "",
  listLevel = 0,
  inheritedPreset: RichDocNumberingPreset | null = null,
): Promise<unknown[]> {
  const output: unknown[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.type === "bulletList" || node.type === "orderedList") {
      const ordered = node.type === "orderedList";
      // 编号格式**沿嵌套向下继承**。只有最外层那个 `ol` 带 `data-numbering`
      // （用户是在最外层选的「公文」），不继承的话第二级就会退回 `1.`——
      // 屏幕上是「（一）」导出后是「1.」，正是「做出来但导出丢失」那类失败。
      const preset =
        node.attrs?.numbering != null
          ? numberingPresetOf(node.attrs.numbering)
          : (inheritedPreset ?? "decimal");
      for (let itemIndex = 0; itemIndex < (node.content || []).length; itemIndex += 1) {
        const item = node.content?.[itemIndex];
        if (!item) continue;
        output.push(
          ...(await blockChildren(
            item.content || [],
            docx,
            commentIds,
            ordered
              ? `${richDocListMarker(preset, listLevel, itemIndex + 1)} `
              : "• ",
            listLevel + 1,
            preset,
          )),
        );
      }
      continue;
    }
    if (node.type === "table") {
      const rows = await Promise.all(
        (node.content || []).map(async (row, rowIndex) =>
          new docx.TableRow({
            children: await Promise.all(
              (row.content || []).map(async (cell) =>
                new docx.TableCell({
                  children: (await blockChildren(
                    cell.content || [],
                    docx,
                    commentIds,
                  )) as never[],
                  ...richDocDocxCellProperties(cell.attrs),
                }),
              ),
            ),
            ...richDocDocxRowProperties(row, rowIndex === 0),
          }),
        ),
      );
      output.push(
        new docx.Table({
          rows,
          width: { size: 100, type: docx.WidthType.PERCENTAGE },
        }),
      );
      continue;
    }
    if (node.type === "image") {
      // 块级图。**这条分支以前不存在**，图片会掉进下面的段落分支，而
      // `inlineChildren` 只遍历 `node.content`——图片节点没有 content，
      // 导出结果是一个空段落，整张图在 docx 里凭空消失。
      // `Image.configure({ inline: false })` 当前就是这一档，也就是说
      // **富文档里每一张图导出都丢**。「上下型（独占一行）」的 OOXML 表达
      // 正是图片独占一个段落，所以这条分支同时把 P5 的环绕语义落到位。
      output.push(
        new docx.Paragraph({
          children: [await imageRun(node, docx)] as never[],
          spacing: { after: 120 },
        }),
      );
      continue;
    }
    if (node.type === "horizontalRule") {
      output.push(
        new docx.Paragraph({
          border: {
            bottom: {
              color: "A8A29E",
              style: docx.BorderStyle.SINGLE,
              size: 6,
              space: 6,
            },
          },
        }),
      );
      continue;
    }
    // 用户设的排版属性优先于这里的默认值；没设的分支不会出现在 typography 里，
    // 所以 spread 顺序保证「没设过 = 保持旧行为」。
    const typography = richDocDocxParagraphProperties(node.attrs, listLevel);
    const paragraphOptions: Record<string, unknown> = {
      children: [
        ...(listPrefix ? [new docx.TextRun({ text: listPrefix, bold: true })] : []),
        ...(await inlineChildren(node, docx, commentIds)),
      ],
      spacing: { after: 120, ...typography.spacing },
    };
    if (typography.indent) paragraphOptions.indent = { ...typography.indent };
    if (node.type === "heading") {
      const level = boundedNumber(node.attrs?.level, 1, 1, 6);
      paragraphOptions.heading = [
        docx.HeadingLevel.HEADING_1,
        docx.HeadingLevel.HEADING_2,
        docx.HeadingLevel.HEADING_3,
        docx.HeadingLevel.HEADING_4,
        docx.HeadingLevel.HEADING_5,
        docx.HeadingLevel.HEADING_6,
      ][level - 1];
    }
    if (node.type === "blockquote") {
      // 引用块的 480 缇是叠加在用户左缩进之上的，不是覆盖掉它。
      paragraphOptions.indent = {
        ...typography.indent,
        left: 480 + (typography.indent?.left ?? 0),
      };
      paragraphOptions.border = {
        left: {
          color: "A8A29E",
          style: docx.BorderStyle.SINGLE,
          size: 12,
          space: 12,
        },
      };
    }
    if (node.type === "codeBlock") {
      paragraphOptions.shading = {
        fill: "F5F5F4",
        type: docx.ShadingType.CLEAR,
      };
    }
    const align = String(node.attrs?.textAlign || "");
    if (align === "center") paragraphOptions.alignment = docx.AlignmentType.CENTER;
    else if (align === "right") paragraphOptions.alignment = docx.AlignmentType.RIGHT;
    else if (align === "justify") paragraphOptions.alignment = docx.AlignmentType.JUSTIFIED;
    output.push(new docx.Paragraph(paragraphOptions));
    listPrefix = "";
  }
  return output;
}

/** Build a real OOXML document that can be reopened by standard DOCX readers. */
export async function tiptapJsonToDocxBlob(
  title: string,
  root: TiptapNode,
  options: DocxExportOptions = {},
): Promise<Blob> {
  const docx = await import("docx");
  const anchored = anchoredCommentIds(root);
  const entries = (options.comments || []).filter((entry) =>
    anchored.has(entry.commentId),
  );
  const children = await blockChildren(
    root.content || [],
    docx,
    commentIdIndex(entries),
  );
  const document = new docx.Document({
    creator: "OceanLeo",
    title,
    description: "Created in OceanLeo Advanced Workbench",
    // `docx@9.7.1` 的 `comments.children` 吃的是 **`ICommentOptions` 纯对象**，
    // 不是 `new Comment(...)` 实例（`dist/index.d.ts:1022`）。传实例过不了类型。
    ...(entries.length
      ? {
          comments: {
            children: entries.map((entry) => ({
              id: entry.id,
              author: entry.author,
              initials: entry.initials,
              date: new Date(entry.date),
              children: entry.paragraphs.map(
                (text) => new docx.Paragraph(text),
              ),
            })),
          },
        }
      : {}),
    sections: [
      {
        properties: {},
        children: children as never[],
      },
    ],
  });
  return docx.Packer.toBlob(document);
}
