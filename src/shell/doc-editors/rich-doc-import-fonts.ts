/** Carry delivered font intent through Mammoth's semantic DOCX import. */
import { DELIVERED_EDITOR_FONT_FAMILIES } from "../image-editor/editor-font-registry";
import { editorFontFamily } from "../image-editor/editor-font-family";

const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
type WordNode = { type?: string; styleId?: string; styleName?: string; font?: string; children?: WordNode[] };

export async function docxFontImport(bytes: ArrayBuffer): Promise<{
  styleMap: string[]; transformDocument: (root: WordNode) => WordNode; apply: (html: string) => string;
}> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file("word/styles.xml")?.async("string");
  const styles = new Map<string, { font?: string; basedOn?: string }>();
  let defaultFont: string | undefined;
  let defaultParagraph: string | undefined;
  const family = (node: Element | null | undefined) => {
    const fonts = node?.getElementsByTagNameNS(NS, "rFonts")[0];
    return fonts?.getAttributeNS(NS, "ascii") || fonts?.getAttributeNS(NS, "eastAsia") || undefined;
  };
  if (xml) {
    const document = new DOMParser().parseFromString(xml, "application/xml");
    defaultFont = family(document.getElementsByTagNameNS(NS, "docDefaults")[0]);
    for (const node of Array.from(document.getElementsByTagNameNS(NS, "style"))) {
      const id = node.getAttributeNS(NS, "styleId");
      if (!id) continue;
      styles.set(id, { font: family(node), basedOn: node.getElementsByTagNameNS(NS, "basedOn")[0]?.getAttributeNS(NS, "val") || undefined });
      if (node.getAttributeNS(NS, "type") === "paragraph" && node.getAttributeNS(NS, "default") === "1") defaultParagraph = id;
    }
  }
  const resolve = (id: string | undefined, seen = new Set<string>()): string | undefined => {
    if (!id || seen.has(id)) return undefined;
    seen.add(id);
    const style = styles.get(id);
    return style?.font || resolve(style?.basedOn, seen);
  };
  const names = DELIVERED_EDITOR_FONT_FAMILIES;
  const exact = (name: string | undefined) => name && names.find(font => font.toLowerCase() === editorFontFamily(name).toLowerCase());
  return {
    styleMap: names.map((_, i) => `r[style-name='OceanLeoFont${i}'] => span.oleo-import-font-${i}`),
    transformDocument: root => {
      const visit = (node: WordNode, inherited: string | undefined): WordNode => {
        const base = node.type === "paragraph" ? resolve(node.styleId || defaultParagraph) || inherited : inherited;
        const font = node.type === "run" ? exact(node.font || resolve(node.styleId) || base) : undefined;
        return { ...node, ...(font ? { styleName: `OceanLeoFont${names.indexOf(font)}` } : {}),
          ...(node.children ? { children: node.children.map(child => visit(child, base)) } : {}) };
      };
      return visit(root, defaultFont);
    },
    apply: html => {
      const document = new DOMParser().parseFromString(html, "text/html");
      document.querySelectorAll("span[class]").forEach(span => {
        const match = /^oleo-import-font-(\d+)$/.exec(span.className);
        const font = match && names[Number(match[1])];
        if (font) { (span as HTMLElement).style.fontFamily = font; span.removeAttribute("class"); }
      });
      return document.body.innerHTML;
    },
  };
}
