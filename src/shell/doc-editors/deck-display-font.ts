import { loadEditorTextFonts, type EditorFontText } from "../image-editor/editor-fonts";

export function deckGenericFontFamily(family?: string): string {
  return /serif|宋体/i.test(family || "") && !/sans/i.test(family || "") ? "serif" : "sans-serif";
}

/** Use the shared Noto loader/cache; a failed download must not block a deck. */
export async function loadDeckDisplayFonts(nodes: readonly EditorFontText[], ownerDocument?: Document): Promise<boolean> {
  if (!nodes.some((node) => node.text)) return true;
  try {
    const Font = ownerDocument?.defaultView?.FontFace ?? (typeof FontFace === "undefined" ? undefined : FontFace);
    if (ownerDocument && (!ownerDocument.fonts || !Font)) return false;
    await loadEditorTextFonts(nodes.map((node) => ({
      ...node,
      fontFamily: deckDisplayFontFamily(node.fontFamily),
    })), ownerDocument && Font ? { fonts: ownerDocument.fonts, FontFace: Font } : undefined);
    return true;
  } catch {
    return false;
  }
}

/** Browser aliases only. The stored face is still used by PPTX save/export. */
export function deckDisplayFontFamily(family: string | undefined): string | undefined {
  if (!family) return family;
  let generic = "";
  const faces = family.split(",").map((part) => {
    const face = part.trim().replace(/^["']|["']$/g, "");
    const compact = face.replace(/\s+/g, "");
    const web = /^Noto(Sans|Serif)(SC|TC|JP|KR)$/i.exec(compact);
    if (web) {
      generic ||= web[1].toLowerCase() === "serif" ? "serif" : "sans-serif";
      return face;
    }
    const match = /^(?:Noto(Sans|Serif)CJK|SourceHan(Sans|Serif))(SC|CN|TC|TW|HK|JP|KR)?(?:[- ]?(?:Regular|Light|Medium|Bold|Heavy))?$/i.exec(compact);
    const chinese = /^(思源黑体|思源宋体)(?:\s*(SC|CN|TC|TW|HK|JP|KR))?$/i.exec(face);
    if (!match && !chinese) return part.trim();
    const serif = match ? (match[1] || match[2]).toLowerCase() === "serif" : chinese![1] === "思源宋体";
    const region = (match?.[3] || chinese?.[2] || "SC").toUpperCase();
    const locale = /^(?:TC|TW|HK)$/.test(region) ? "TC" : region === "JP" ? "JP" : region === "KR" ? "KR" : "SC";
    generic ||= serif ? "serif" : "sans-serif";
    return `Noto ${serif ? "Serif" : "Sans"} ${locale}`;
  });
  if (generic && !faces.includes(generic)) faces.push(generic);
  return faces.join(", ");
}
