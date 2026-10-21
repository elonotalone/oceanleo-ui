import { unzipSync } from "fflate";

const MAX_XML_BYTES = 2 * 1024 * 1024;

function decodeXmlText(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (!entity.startsWith("#")) return named[entity.toLowerCase()] || "";
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

function textRuns(xml: string): string {
  return Array.from(xml.matchAll(/<(?:[\w]+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:[\w]+:)?t>/g), (match) => decodeXmlText(match[1])).join("");
}

/** Plain text only. Never mount Office XML/HTML, resolve entities, or load external links. */
export function extractDocumentCoverExcerpt(bytes: ArrayBuffer | Uint8Array): string {
  try {
    const parts = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), {
      filter: (part) => part.originalSize <= MAX_XML_BYTES && /^(word\/document\.xml|ppt\/slides\/slide1\.xml|xl\/(sharedStrings\.xml|worksheets\/sheet1\.xml))$/.test(part.name),
    });
    const read = (path: string) => parts[path] ? new TextDecoder().decode(parts[path]) : "";
    const document = read("word/document.xml") || read("ppt/slides/slide1.xml");
    if (document) {
      return document.split(/<\/(?:w|a):p>/).map(textRuns).map((line) => line.trim()).filter(Boolean).slice(0, 8).join("\n").slice(0, 1200);
    }
    const strings = Array.from(read("xl/sharedStrings.xml").matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g), (match) => textRuns(match[1]));
    const sheet = read("xl/worksheets/sheet1.xml");
    return Array.from(sheet.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)).slice(0, 8).map((row) =>
      Array.from(row[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)).slice(0, 6).map((cell) => {
        const value = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(cell[2])?.[1] || "";
        if (/\bt=["']s["']/.test(cell[1])) return strings[Number(value)] || "";
        return textRuns(cell[2]) || decodeXmlText(value);
      }).join(" · "),
    ).filter(Boolean).join("\n").slice(0, 1200);
  } catch {
    return "";
  }
}
