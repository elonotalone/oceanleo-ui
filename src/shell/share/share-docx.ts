"use client";

// ============================================================================
// @oceanleo/ui — 选中的对话 → .docx（Generate Document）
// ----------------------------------------------------------------------------
// 对标件（操作员给的 Kimi 导出）是**模板化生成**的：有完整样式表、编号定义、页眉
// 页脚，不是 markdown 硬转。所以这里不走后端 `POST /v1/convert/office`——那条路是
// LibreOffice 的文件→文件直转，正是任务书点名不要的那种。改为在浏览器里用已在
// 依赖里的 `docx@9`（先例：`doc-editors/docx-export.ts`）直接写 OOXML：
//   - 标题层级 → Word 内置 Heading1–6 样式；
//   - 代码块   → 自定义等宽样式 + 底纹，逐行成段；
//   - 列表     → 真正的 numbering 定义（有序=十进制/小写字母/小写罗马，无序=项目符号）；
//   - 表格     → 真 <w:tbl>，首行底纹 + 全边框；
//   - 页眉页脚 → 标题 + 品牌行 + 页码域。
// ============================================================================

import type { ShareBlock, ShareInline } from "./share-blocks";
import { inlinesToPlainText } from "./share-blocks";

type DocxModule = typeof import("docx");

export interface ShareDocxMessage {
  role: "user" | "assistant";
  speaker: string;
  blocks: ShareBlock[];
}

export interface ShareDocxInput {
  title: string;
  subtitle?: string;
  brand: string;
  /** 页脚上的来源链接（有就写一行）。 */
  linkText?: string;
  messages: readonly ShareDocxMessage[];
}

const ORDERED_REFERENCE = "oceanleo-share-ordered";
const BULLET_REFERENCE = "oceanleo-share-bullet";
const CODE_STYLE = "OceanLeoShareCode";
const SPEAKER_STYLE = "OceanLeoShareSpeaker";
const QUOTE_STYLE = "OceanLeoShareQuote";
const CAPTION_STYLE = "OceanLeoShareCaption";

const BODY_FONT = "Microsoft YaHei";
const MONO_FONT = "Consolas";

function runsFrom(
  inlines: readonly ShareInline[],
  docx: DocxModule,
  base: { size?: number; color?: string; italics?: boolean } = {},
): unknown[] {
  const out: unknown[] = [];
  for (const inline of inlines) {
    if (inline.type === "math") {
      // OMML 公式对象超出本次范围：保留 TeX 原文，等宽斜体，读者一眼认得出是公式。
      out.push(
        new docx.TextRun({
          text: `$${inline.tex}$`,
          font: MONO_FONT,
          italics: true,
          size: base.size ?? 22,
          color: "3730A3",
        }),
      );
      continue;
    }
    const text = inline.text;
    if (!text) continue;
    for (const [index, piece] of text.split("\n").entries()) {
      const options: Record<string, unknown> = {
        text: piece,
        size: base.size ?? 22,
        font: inline.code ? MONO_FONT : BODY_FONT,
      };
      if (index > 0) options.break = 1;
      if (base.color) options.color = base.color;
      if (base.italics || inline.italic) options.italics = true;
      if (inline.bold) options.bold = true;
      if (inline.strike) options.strike = true;
      if (inline.code) options.shading = { fill: "F5F5F4", type: docx.ShadingType.CLEAR };
      if (inline.href) options.color = "4F46E5";
      const run = new docx.TextRun(options);
      out.push(
        inline.href && /^https?:\/\//i.test(inline.href)
          ? new docx.ExternalHyperlink({ link: inline.href, children: [run as never] })
          : run,
      );
    }
  }
  if (!out.length) out.push(new docx.TextRun({ text: "", size: base.size ?? 22 }));
  return out;
}

const HEADINGS = (docx: DocxModule) => [
  docx.HeadingLevel.HEADING_1,
  docx.HeadingLevel.HEADING_2,
  docx.HeadingLevel.HEADING_3,
  docx.HeadingLevel.HEADING_4,
  docx.HeadingLevel.HEADING_5,
  docx.HeadingLevel.HEADING_6,
];

function tableFrom(
  block: Extract<ShareBlock, { type: "table" }>,
  docx: DocxModule,
): unknown {
  const columnCount = Math.max(
    block.header.length,
    ...block.rows.map((row) => row.length),
    1,
  );
  const border = {
    style: docx.BorderStyle.SINGLE,
    size: 4,
    color: "D6D3D1",
  };
  const cell = (
    inlines: ShareInline[] | undefined,
    header: boolean,
  ): unknown =>
    new docx.TableCell({
      shading: header
        ? { fill: "F5F5F4", type: docx.ShadingType.CLEAR }
        : undefined,
      margins: { top: 60, bottom: 60, left: 100, right: 100 },
      children: [
        new docx.Paragraph({
          spacing: { before: 0, after: 0 },
          children: runsFrom(
            (inlines || []).map((inline) =>
              header && inline.type === "text"
                ? { ...inline, bold: true }
                : inline,
            ),
            docx,
            { size: 20 },
          ) as never[],
        }),
      ],
    });
  const row = (cells: ShareInline[][], header: boolean) =>
    new docx.TableRow({
      tableHeader: header,
      children: Array.from({ length: columnCount }, (_, index) =>
        cell(cells[index], header),
      ) as never[],
    });
  return new docx.Table({
    width: { size: 100, type: docx.WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [
      row(block.header, true),
      ...block.rows.map((cells) => row(cells, false)),
    ] as never[],
  });
}

async function imageParagraph(
  block: Extract<ShareBlock, { type: "image" }>,
  docx: DocxModule,
): Promise<unknown> {
  if (!/^https?:\/\//i.test(block.src)) {
    return new docx.Paragraph({
      style: CAPTION_STYLE,
      children: [new docx.TextRun({ text: block.alt || block.src })] as never[],
    });
  }
  try {
    const response = await fetch(block.src, { cache: "force-cache" });
    if (!response.ok) throw new Error(String(response.status));
    const bytes = new Uint8Array(await response.arrayBuffer());
    const hint = `${response.headers.get("content-type") || ""} ${block.src}`.toLowerCase();
    const type = hint.includes("jpeg") || hint.includes(".jpg")
      ? ("jpg" as const)
      : hint.includes("gif")
        ? ("gif" as const)
        : ("png" as const);
    return new docx.Paragraph({
      alignment: docx.AlignmentType.CENTER,
      spacing: { before: 120, after: 120 },
      children: [
        new docx.ImageRun({
          data: bytes,
          type,
          transformation: { width: 560, height: 340 },
        }),
      ] as never[],
    });
  } catch {
    return new docx.Paragraph({
      style: CAPTION_STYLE,
      children: [
        new docx.TextRun({ text: block.alt || block.src, italics: true }),
      ] as never[],
    });
  }
}

async function blockToDocx(
  block: ShareBlock,
  docx: DocxModule,
): Promise<unknown[]> {
  switch (block.type) {
    case "heading":
      return [
        new docx.Paragraph({
          heading: HEADINGS(docx)[Math.min(5, block.level - 1)],
          spacing: { before: 200, after: 120 },
          children: runsFrom(block.inlines, docx, {
            size: 32 - block.level * 2,
          }) as never[],
        }),
      ];
    case "paragraph":
      return [
        new docx.Paragraph({
          spacing: { after: 120, line: 320 },
          children: runsFrom(block.inlines, docx) as never[],
        }),
      ];
    case "quote":
      return [
        new docx.Paragraph({
          style: QUOTE_STYLE,
          children: runsFrom(block.inlines, docx, { italics: true }) as never[],
        }),
      ];
    case "list":
      return block.items.map(
        (item) =>
          new docx.Paragraph({
            numbering: {
              reference: item.ordered ? ORDERED_REFERENCE : BULLET_REFERENCE,
              level: Math.min(3, item.depth),
            },
            spacing: { after: 60 },
            children: runsFrom(item.inlines, docx) as never[],
          }),
      );
    case "code":
      return block.lines.map(
        (line) =>
          new docx.Paragraph({
            style: CODE_STYLE,
            children: [
              new docx.TextRun({
                text: line || " ",
                font: MONO_FONT,
                size: 18,
              }),
            ] as never[],
          }),
      );
    case "table":
      return [
        tableFrom(block, docx),
        new docx.Paragraph({ text: "", spacing: { after: 120 } }),
      ];
    case "math":
      return [
        new docx.Paragraph({
          alignment: docx.AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
          children: [
            new docx.TextRun({
              text: `$${block.tex}$`,
              font: MONO_FONT,
              italics: true,
              color: "3730A3",
            }),
          ] as never[],
        }),
      ];
    case "image":
      return [await imageParagraph(block, docx)];
    case "rule":
      return [
        new docx.Paragraph({
          spacing: { before: 120, after: 120 },
          border: {
            bottom: {
              color: "D6D3D1",
              style: docx.BorderStyle.SINGLE,
              size: 6,
              space: 6,
            },
          },
        }),
      ];
    default:
      return [];
  }
}

function documentStyles(docx: DocxModule) {
  return {
    default: {
      document: {
        run: { font: BODY_FONT, size: 22, color: "1C1917" },
        paragraph: { spacing: { line: 320 } },
      },
    },
    paragraphStyles: [
      {
        id: SPEAKER_STYLE,
        name: "OceanLeo Speaker",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 18, bold: true, color: "78716C" },
        paragraph: { spacing: { before: 240, after: 60 } },
      },
      {
        id: CODE_STYLE,
        name: "OceanLeo Code",
        basedOn: "Normal",
        next: CODE_STYLE,
        run: { font: MONO_FONT, size: 18, color: "292524" },
        paragraph: {
          spacing: { before: 0, after: 0, line: 260 },
          shading: { fill: "F5F5F4", type: docx.ShadingType.CLEAR },
          indent: { left: 220 },
        },
      },
      {
        id: QUOTE_STYLE,
        name: "OceanLeo Quote",
        basedOn: "Normal",
        next: "Normal",
        run: { italics: true, color: "57534E" },
        paragraph: {
          indent: { left: 440 },
          spacing: { before: 80, after: 120 },
          border: {
            left: {
              color: "D6D3D1",
              style: docx.BorderStyle.SINGLE,
              size: 12,
              space: 12,
            },
          },
        },
      },
      {
        id: CAPTION_STYLE,
        name: "OceanLeo Caption",
        basedOn: "Normal",
        next: "Normal",
        run: { size: 18, color: "A8A29E", italics: true },
        paragraph: { spacing: { after: 120 } },
      },
    ],
  };
}

function numbering(docx: DocxModule) {
  const indent = (level: number) => ({
    paragraph: {
      indent: { left: 420 + level * 420, hanging: 300 },
    },
  });
  return {
    config: [
      {
        reference: ORDERED_REFERENCE,
        levels: [
          { level: 0, format: docx.LevelFormat.DECIMAL, text: "%1.", alignment: docx.AlignmentType.START, style: indent(0) },
          { level: 1, format: docx.LevelFormat.LOWER_LETTER, text: "%2)", alignment: docx.AlignmentType.START, style: indent(1) },
          { level: 2, format: docx.LevelFormat.LOWER_ROMAN, text: "%3.", alignment: docx.AlignmentType.START, style: indent(2) },
          { level: 3, format: docx.LevelFormat.DECIMAL, text: "%4.", alignment: docx.AlignmentType.START, style: indent(3) },
        ],
      },
      {
        reference: BULLET_REFERENCE,
        levels: [
          { level: 0, format: docx.LevelFormat.BULLET, text: "•", alignment: docx.AlignmentType.START, style: indent(0) },
          { level: 1, format: docx.LevelFormat.BULLET, text: "◦", alignment: docx.AlignmentType.START, style: indent(1) },
          { level: 2, format: docx.LevelFormat.BULLET, text: "▪", alignment: docx.AlignmentType.START, style: indent(2) },
          { level: 3, format: docx.LevelFormat.BULLET, text: "·", alignment: docx.AlignmentType.START, style: indent(3) },
        ],
      },
    ],
  };
}

/** 选中的对话 → 一个能被 Word / WPS / Pages 正常打开的 .docx。 */
export async function shareMessagesToDocxBlob(
  input: ShareDocxInput,
): Promise<Blob> {
  const docx = await import("docx");
  const children: unknown[] = [
    new docx.Paragraph({
      heading: docx.HeadingLevel.TITLE,
      spacing: { after: 80 },
      children: [
        new docx.TextRun({ text: input.title || input.brand, bold: true, size: 44 }),
      ] as never[],
    }),
  ];
  if (input.subtitle) {
    children.push(
      new docx.Paragraph({
        style: CAPTION_STYLE,
        children: [new docx.TextRun({ text: input.subtitle })] as never[],
      }),
    );
  }
  for (const message of input.messages) {
    children.push(
      new docx.Paragraph({
        style: SPEAKER_STYLE,
        children: [new docx.TextRun({ text: message.speaker })] as never[],
      }),
    );
    for (const block of message.blocks) {
      children.push(...(await blockToDocx(block, docx)));
    }
  }

  const document = new docx.Document({
    creator: "OceanLeo",
    title: input.title || input.brand,
    description: input.brand,
    styles: documentStyles(docx) as never,
    numbering: numbering(docx) as never,
    sections: [
      {
        properties: {},
        headers: {
          default: new docx.Header({
            children: [
              new docx.Paragraph({
                style: CAPTION_STYLE,
                alignment: docx.AlignmentType.RIGHT,
                children: [
                  new docx.TextRun({ text: input.title || input.brand }),
                ] as never[],
              }),
            ] as never[],
          }),
        },
        footers: {
          default: new docx.Footer({
            children: [
              new docx.Paragraph({
                style: CAPTION_STYLE,
                alignment: docx.AlignmentType.CENTER,
                children: [
                  new docx.TextRun({ text: `${input.brand}    ` }),
                  new docx.TextRun({ children: [docx.PageNumber.CURRENT] }),
                  new docx.TextRun({ text: " / " }),
                  new docx.TextRun({ children: [docx.PageNumber.TOTAL_PAGES] }),
                ] as never[],
              }),
              ...(input.linkText
                ? [
                    new docx.Paragraph({
                      style: CAPTION_STYLE,
                      alignment: docx.AlignmentType.CENTER,
                      children: [
                        new docx.TextRun({ text: input.linkText }),
                      ] as never[],
                    }),
                  ]
                : []),
            ] as never[],
          }),
        },
        children: children as never[],
      },
    ],
  });
  return docx.Packer.toBlob(document);
}

/** 触发下载。 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 纯文本预览，供测试与「导出前看看有什么」使用。 */
export function shareDocxOutline(input: ShareDocxInput): string[] {
  const out: string[] = [`TITLE ${input.title}`];
  for (const message of input.messages) {
    out.push(`SPEAKER ${message.speaker}`);
    for (const block of message.blocks) {
      switch (block.type) {
        case "heading":
          out.push(`H${block.level} ${inlinesToPlainText(block.inlines)}`);
          break;
        case "code":
          out.push(`CODE(${block.lang}) ${block.lines.length}`);
          break;
        case "list":
          out.push(
            `LIST(${block.ordered ? "ordered" : "bullet"}) ${block.items.length}`,
          );
          break;
        case "table":
          out.push(`TABLE ${block.header.length}x${block.rows.length}`);
          break;
        case "math":
          out.push(`MATH ${block.tex}`);
          break;
        default:
          out.push(`${block.type.toUpperCase()}`);
      }
    }
  }
  return out;
}
