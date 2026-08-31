import {
  RICHDOC_NUMBERING_PRESETS,
  richDocDocxCellProperties,
  richDocDocxParagraphProperties,
  richDocDocxRowProperties,
  richDocListMarker,
  type RichDocNumberingPreset,
} from "./rich-doc-model";

interface TiptapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
  content?: TiptapNode[];
}

type DocxModule = typeof import("docx");

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
): Promise<unknown[]> {
  const output: unknown[] = [];
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
      output.push(...(await inlineChildren(child, docx)));
      continue;
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
                  children: (await blockChildren(cell.content || [], docx)) as never[],
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
        ...(await inlineChildren(node, docx)),
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
): Promise<Blob> {
  const docx = await import("docx");
  const children = await blockChildren(root.content || [], docx);
  const document = new docx.Document({
    creator: "OceanLeo",
    title,
    description: "Created in OceanLeo Advanced Workbench",
    sections: [
      {
        properties: {},
        children: children as never[],
      },
    ],
  });
  return docx.Packer.toBlob(document);
}
