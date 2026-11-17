import { loadEditorTextFonts, NOTO_SANS_STACK, type EditorFontText, type FontEnvironment } from "../image-editor/editor-fonts";

type TextNode = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[]; content?: TextNode[] };

/** Inspect the actual document, including table cells and inherited block styles. */
export function richDocFontTexts(root: TextNode): EditorFontText[] {
  const texts: EditorFontText[] = [];
  const visit = (node: TextNode, inherited: EditorFontText) => {
    const style = { ...inherited };
    if (typeof node.attrs?.fontFamily === "string") style.fontFamily = node.attrs.fontFamily;
    if (/^heading$/.test(node.type || "")) style.fontWeight = 700;
    for (const mark of node.marks || []) {
      if (mark.type === "bold") style.fontWeight = 700;
      if (mark.type === "italic") style.fontStyle = "italic";
      if (mark.type === "textStyle" && typeof mark.attrs?.fontFamily === "string") style.fontFamily = mark.attrs.fontFamily;
    }
    if (node.text) texts.push({ ...style, text: node.text });
    node.content?.forEach(child => visit(child, style));
  };
  visit(root, { fontFamily: NOTO_SANS_STACK, fontWeight: 400 });
  return texts;
}

export async function loadRichDocFonts(root: TextNode, environment?: FontEnvironment): Promise<void> {
  await loadEditorTextFonts(richDocFontTexts(root), environment);
}

/** Transaction events include imports, collaboration and emitUpdate:false restores. */
export function followRichDocFonts(editor: {
  getJSON(): TextNode;
  on(event: "transaction", callback: () => void): unknown;
  off(event: "transaction", callback: () => void): unknown;
}, load: (root: TextNode) => Promise<void> = loadRichDocFonts): () => void {
  let active = true;
  let queued = false;
  const refresh = () => {
    if (queued || !active) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (active) void load(editor.getJSON()).catch(() => { /* Retry on the next transaction. */ });
    });
  };
  editor.on("transaction", refresh);
  refresh();
  return () => { active = false; editor.off("transaction", refresh); };
}
