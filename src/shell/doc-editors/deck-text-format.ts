/**
 * 演示文字框的「整框」文字格式：删除线、高亮、列表、超链接（2026-10-23 编辑器整改 D9）。
 *
 * 演示的文字框存的是一整段纯文本，格式作用于整框（与粗体、斜体同一层），
 * 所以这里只有纯函数：画布、缩略图、放映共用 `deckTextDecoration` /
 * `deckTextListLines`，PPTX 导出共用 `deckPptxTextRuns`，载入共用 `deckSafeLink`。
 */

export type DeckTextList = "none" | "bullet" | "ordered";

export interface DeckTextFormat {
  underline?: boolean;
  strike?: boolean;
  list?: DeckTextList;
  link?: string;
  highlight?: string;
}

export function deckTextList(value: unknown): DeckTextList {
  return value === "bullet" || value === "ordered" ? value : "none";
}

/**
 * 只认 http(s) 与 mailto，其余（javascript:、data:、相对地址）一律不存。
 * 没写协议的网址（`example.com/a`）补成 https。
 */
export function deckSafeLink(value: unknown): string {
  const raw = (typeof value === "string" ? value : "").trim().slice(0, 2_000);
  if (!raw || /\s/.test(raw)) return "";
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw)
    ? raw
    : /^[\w-]+(\.[\w-]+)+([/?#:]|$)/.test(raw)
      ? `https://${raw}`
      : "";
  if (!candidate) return "";
  try {
    const url = new URL(candidate);
    if (url.protocol === "mailto:") return url.pathname ? candidate : "";
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.hostname ? url.toString() : "";
  } catch {
    return "";
  }
}

/** CSS `text-decoration-line`：下划线、删除线可以叠加；有链接时也画下划线。 */
export function deckTextDecoration(format: DeckTextFormat): string {
  const lines = [
    format.underline || format.link ? "underline" : "",
    format.strike ? "line-through" : "",
  ].filter(Boolean);
  return lines.length ? lines.join(" ") : "none";
}

export interface DeckTextListLine {
  text: string;
  /** 行首记号（「•」或「3.」）；空行与不成列表时为空串。 */
  marker: string;
}

/** 列表按行出记号：空行不编号，编号跳过空行连续计数。 */
export function deckTextListLines(
  text: string,
  list: DeckTextList | undefined,
): DeckTextListLine[] {
  const kind = deckTextList(list);
  let ordinal = 0;
  return text.split("\n").map((line) => {
    if (kind === "none" || !line.trim()) return { text: line, marker: "" };
    ordinal += 1;
    return { text: line, marker: kind === "bullet" ? "•" : `${ordinal}.` };
  });
}

function pptxHex(value: string | undefined): string | undefined {
  const match = /^#?([0-9a-f]{6})$/i.exec((value || "").trim());
  if (match) return match[1].toUpperCase();
  const short = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec((value || "").trim());
  return short
    ? `${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toUpperCase()
    : undefined;
}

export interface DeckPptxTextRun {
  text: string;
  options: Record<string, unknown>;
}

/**
 * pptxgenjs 的文字段：删除线、高亮、超链接挂在每一段上；列表时一行一段
 * （`breakLine`），记号用 PowerPoint 自己的项目符号 / 自动编号，不写进文字。
 */
export function deckPptxTextRuns(
  text: string,
  format: DeckTextFormat,
): DeckPptxTextRun[] {
  const highlight = pptxHex(format.highlight);
  const link = deckSafeLink(format.link);
  const runOptions: Record<string, unknown> = {
    ...(format.strike ? { strike: "sngStrike" } : {}),
    ...(highlight ? { highlight } : {}),
    ...(link ? { hyperlink: { url: link } } : {}),
  };
  const list = deckTextList(format.list);
  if (list === "none") return [{ text, options: runOptions }];
  const lines = text.split("\n");
  return lines.map((line, index) => ({
    text: line,
    options: {
      ...runOptions,
      ...(line.trim()
        ? { bullet: list === "ordered" ? { type: "number" } : true }
        : {}),
      ...(index < lines.length - 1 ? { breakLine: true } : {}),
    },
  }));
}
