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
      const src = String(child.attrs?.src || "");
      if (!/^https?:\/\//i.test(src)) {
        output.push(new docx.TextRun({ text: String(child.attrs?.alt || "图片") }));
        continue;
      }
      try {
        const response = await fetch(src, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        const type = imageType(
          response.headers.get("content-type") || "",
          src,
        );
        const transformation = {
          width: boundedNumber(child.attrs?.width, 560, 32, 1000),
          height: boundedNumber(child.attrs?.height, 315, 24, 1000),
        };
        output.push(
          new docx.ImageRun(
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
          ),
        );
      } catch {
        output.push(
          new docx.TextRun({
            text: String(child.attrs?.alt || "图片（导出时无法读取）"),
            italics: true,
            color: "78716C",
          }),
        );
      }
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

async function blockChildren(
  nodes: TiptapNode[],
  docx: DocxModule,
  listPrefix = "",
): Promise<unknown[]> {
  const output: unknown[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (node.type === "bulletList" || node.type === "orderedList") {
      const ordered = node.type === "orderedList";
      for (let itemIndex = 0; itemIndex < (node.content || []).length; itemIndex += 1) {
        const item = node.content?.[itemIndex];
        if (!item) continue;
        output.push(
          ...(await blockChildren(
            item.content || [],
            docx,
            ordered ? `${itemIndex + 1}. ` : "• ",
          )),
        );
      }
      continue;
    }
    if (node.type === "table") {
      const rows = await Promise.all(
        (node.content || []).map(async (row) =>
          new docx.TableRow({
            children: await Promise.all(
              (row.content || []).map(async (cell) =>
                new docx.TableCell({
                  children: (await blockChildren(cell.content || [], docx)) as never[],
                }),
              ),
            ),
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
    const paragraphOptions: Record<string, unknown> = {
      children: [
        ...(listPrefix ? [new docx.TextRun({ text: listPrefix, bold: true })] : []),
        ...(await inlineChildren(node, docx)),
      ],
      spacing: { after: 120 },
    };
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
      paragraphOptions.indent = { left: 480 };
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

/** Build a real OOXML document that can be reopened by OnlyOffice and Word. */
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
