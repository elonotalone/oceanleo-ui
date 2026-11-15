import type { JSONContent } from "@tiptap/core";
import { tiptapJsonToDocxBlob as baseDocx, type DocxExportOptions } from "./docx-export";
import { hasRichDocImageRendering, rasterizeRichDocImageSvg, richDocImageGeometry, richDocImageSvg } from "./rich-doc-image-transform";

function xmlText(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 8192) binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(binary);
}
const imageMime = (source: string) => {
  const path = source.split(/[?#]/)[0];
  return /\.jpe?g$/i.test(path) ? "image/jpeg" : /\.svg$/i.test(path) ? "image/svg+xml" : /\.gif$/i.test(path) ? "image/gif" : /\.bmp$/i.test(path) ? "image/bmp" : /\.webp$/i.test(path) ? "image/webp" : "image/png";
};

async function imageBytes(attrs: Record<string, unknown>): Promise<{ bytes: Uint8Array; mime: string }> {
  const src = String(attrs.src || "");
  const data = /^data:(image\/(?:png|jpeg|gif|bmp|webp|svg\+xml));base64,([a-z0-9+/=]+)$/i.exec(src);
  if (data) return { bytes: Uint8Array.from(atob(data[2]), (char) => char.charCodeAt(0)), mime: data[1] };
  if (!/^https?:\/\//i.test(src)) throw new Error("文档图片导出失败");
  const response = await fetch(src, { cache: "no-store" });
  if (!response.ok) throw new Error("文档图片导出失败");
  const declared = (response.headers.get("content-type")?.split(";")[0] || "").trim().toLowerCase().replace("image/jpg", "image/jpeg");
  const mime = /^image\/(?:png|jpeg|gif|bmp|webp|svg\+xml)$/.test(declared) ? declared : imageMime(src);
  return { bytes: new Uint8Array(await response.arrayBuffer()), mime };
}

/** RichDoc 专用交付补充；不改变其它文档族的 DOCX 序列化规则。 */
export async function tiptapJsonToDocxBlob(title: string, root: JSONContent, options: DocxExportOptions = {},
  rasterize: (svg: string) => Promise<Uint8Array> = rasterizeRichDocImageSvg,
): Promise<Blob> {
  const json = structuredClone(root);
  const texts: Array<{ token: string; text: string; spacing: number }> = [];
  const images: Array<{ token: string; attrs: Record<string, unknown> }> = [];
  const requiresImages = (node: JSONContent): boolean => node.type === "image" &&
    (hasRichDocImageRendering(node.attrs || {}) || String(node.attrs?.src || "").startsWith("data:image/")) || Boolean(node.content?.some(requiresImages));
  const exportImages = requiresImages(json);
  const nonce = `RICHDOC${crypto.randomUUID().replace(/-/g, "")}X`;
  const walk = (node: JSONContent) => {
    if (node.type === "text" && node.text) {
      const value = node.marks?.find((mark) => mark.type === "textStyle")?.attrs?.letterSpacing;
      if (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))) {
        const token = `${nonce}${texts.length}X`;
        texts.push({ token, text: node.text, spacing: Math.round(Math.max(-20, Math.min(100, Number(value))) * 15) });
        node.text = token;
      }
    }
    if (node.type === "image" && exportImages) {
      const token = `${nonce}IMAGE${images.length}X`;
      images.push({ token, attrs: node.attrs || {} });
      node.type = "paragraph"; node.attrs = {}; node.content = [{ type: "text", text: token }];
    }
    node.content?.forEach(walk);
  };
  walk(json);
  const blob = await baseDocx(title, json, options);
  if (!texts.length && !images.length) return blob;
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  let xml = await zip.file("word/document.xml")!.async("string");
  for (const item of texts) {
    let found = false;
    xml = xml.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
      if (!run.includes(item.token)) return run;
      found = true;
      let next = run.replace(item.token, () => xmlText(item.text));
      const spacing = `<w:spacing w:val="${item.spacing}"/>`;
      if (next.includes("</w:rPr>")) next = next.replace("</w:rPr>", `${spacing}</w:rPr>`);
      else next = next.replace(/^(<w:r(?:\s[^>]*)?>)/, `$1<w:rPr>${spacing}</w:rPr>`);
      return next;
    });
    if (!found) throw new Error("文档字距导出失败");
  }
  if (images.length) {
    const docx = await import("docx");
    const paragraphs = [];
    for (const { attrs } of images) {
      const original = await imageBytes(attrs);
      const transformed = hasRichDocImageRendering(attrs) || original.mime === "image/webp";
      const bytes = transformed
        ? await rasterize(richDocImageSvg(attrs, `data:${original.mime};base64,${base64(original.bytes)}`)) : original.bytes;
      const type = transformed ? "png" : original.mime.includes("jpeg") ? "jpg" : original.mime.includes("svg") ? "svg"
        : original.mime.includes("gif") ? "gif" : original.mime.includes("bmp") ? "bmp" : "png";
      const g = richDocImageGeometry(attrs);
      // 默认纸张正文框内等比缩放；工程中的原尺寸不变，长图不会超出页面被裁掉。
      const pageScale = Math.min(1, 560 / g.frameWidth, 760 / g.frameHeight);
      const transformation = { width: g.frameWidth * pageScale, height: g.frameHeight * pageScale };
      const fallback = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVioAAAAASUVORK5CYII="), (char) => char.charCodeAt(0));
      const image = new docx.ImageRun(type === "svg"
        ? { type, data: bytes, transformation, fallback: { type: "png", data: fallback } }
        : { type, data: bytes, transformation });
      paragraphs.push(new docx.Paragraph({ children: [image] }));
    }
    // 使用 docx 自己的 DrawingML 与媒体关系，不手写一套图片 XML。
    const pictureDoc = new docx.Document({ sections: [{ children: paragraphs }] });
    const pictureZip = await JSZip.loadAsync(await (await docx.Packer.toBlob(pictureDoc)).arrayBuffer());
    let pictureXml = await pictureZip.file("word/document.xml")!.async("string");
    let relations = await zip.file("word/_rels/document.xml.rels")!.async("string");
    const pictureRelations = await pictureZip.file("word/_rels/document.xml.rels")!.async("string");
    let relationIndex = 0;
    for (const [relation] of pictureRelations.matchAll(/<Relationship\b[^>]*\/>/g)) {
      const target = /\bTarget="([^"]+)"/.exec(relation)?.[1];
      const id = /\bId="([^"]+)"/.exec(relation)?.[1];
      if (!id || !target?.startsWith("media/") || target.includes("..")) continue;
      const name = `richdoc-${relationIndex}-${target.slice(6)}`, nextId = `rIdRichDocImage${relationIndex++}`;
      const file = pictureZip.file(`word/${target}`);
      if (!file) throw new Error("文档图片导出失败");
      zip.file(`word/media/${name}`, await file.async("uint8array"));
      pictureXml = pictureXml.replaceAll(`r:embed="${id}"`, `r:embed="${nextId}"`);
      relations = relations.replace("</Relationships>", relation.replace(`Id="${id}"`, `Id="${nextId}"`).replace(`Target="${target}"`, `Target="media/${name}"`) + "</Relationships>");
    }
    const drawings = [...pictureXml.matchAll(/<w:drawing>[\s\S]*?<\/w:drawing>/g)];
    if (drawings.length !== images.length) throw new Error("文档图片导出失败");
    for (let index = 0; index < images.length; index += 1) {
      let found = false;
      xml = xml.replace(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/g, (run) => {
        if (!run.includes(images[index].token)) return run;
        found = true;
        return `<w:r>${drawings[index][0]}</w:r>`;
      });
      if (!found) throw new Error("文档图片导出失败");
    }
    zip.file("word/_rels/document.xml.rels", relations);
    let types = await zip.file("[Content_Types].xml")!.async("string");
    const pictureTypes = await pictureZip.file("[Content_Types].xml")!.async("string");
    for (const [definition] of pictureTypes.matchAll(/<Default\b[^>]*\/>/g)) {
      const extension = /Extension="([^"]+)"/.exec(definition)?.[1];
      if (extension && !types.includes(`Extension="${extension}"`)) types = types.replace("</Types>", `${definition}</Types>`);
    }
    zip.file("[Content_Types].xml", types);
  }
  zip.file("word/document.xml", xml);
  const data = await zip.generateAsync({ type: "uint8array" });
  return new Blob([new Uint8Array(data).buffer], { type: blob.type });
}
