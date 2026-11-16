/** Noto OFL families. The workflow uses these exact upstream files and stacks. */
import { EDITOR_FONT_MANIFEST } from "./editor-font-manifest";
export { EDITOR_FONT_MANIFEST };

export const EDITOR_FONT_WEIGHTS = [400, 500, 700, 900] as const;
export const NOTO_SANS_STACK = "Noto Sans, Noto Sans SC, Noto Sans TC, Noto Sans JP, Noto Sans KR, Noto Sans Arabic, Noto Sans Devanagari, Noto Sans Thai, sans-serif";
export const NOTO_SERIF_STACK = "Noto Serif, Noto Serif SC, Noto Serif TC, Noto Serif JP, Noto Serif KR, Noto Sans Arabic, Noto Serif Devanagari, Noto Serif Thai, serif";
export const EDITOR_FONT_OPTIONS = [
  { family: NOTO_SANS_STACK, label: "思源黑体", category: "推荐", preview: "清晰表达每一个想法" },
  { family: NOTO_SERIF_STACK, label: "思源宋体", category: "推荐", preview: "山海之间，自有文章" },
] as const;

export const EDITOR_FONT_LOAD_ERROR = "字体加载失败，请检查网络后重试。";
export type EditorFontText = {
  text?: string; fontFamily?: string; fontWeight?: string | number; fontStyle?: string;
  styles?: Record<string, Record<string, Partial<EditorFontText>>>;
  getObjects?: () => EditorFontText[]; objects?: EditorFontText[];
  initDimensions?: () => unknown; setCoords?: () => unknown; dirty?: boolean;
};
type FontEnvironment = { fonts: Pick<FontFaceSet, "add" | "load" | "ready">; FontFace: typeof FontFace; baseUrl?: string; timeoutMs?: number; clearFontCache?: () => void };
const installed = new WeakMap<object, Map<string, Promise<void>>>();

/** Locale-specific CJK can be chosen by placing TC/JP/KR first in a saved stack. */
export function editorFontFamilies(text: string, family: string): string[] {
  const serif = /Serif|(?:^|,)\s*serif(?:,|$)/i.test(family) && !/sans-serif/i.test(family);
  const prefix = serif ? "Noto Serif" : "Noto Sans";
  const families = new Set([prefix]);
  if (/[\u3040-\u30ff]/u.test(text)) families.add(`${prefix} JP`);
  if (/[\uac00-\ud7af\u1100-\u11ff]/u.test(text)) families.add(`${prefix} KR`);
  if (/[\u3400-\u9fff\uf900-\ufaff\u{20000}-\u{3134f}]/u.test(text)) {
    const regional = family.match(/Noto (?:Sans|Serif) (SC|TC|JP|KR)/)?.[1] || "SC";
    families.add(`${prefix} ${/[\u3040-\u30ff]/u.test(text) ? "JP" : regional}`);
  }
  if (/[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u.test(text)) families.add("Noto Sans Arabic");
  if (/[\u0900-\u097f]/u.test(text)) families.add(`${prefix} Devanagari`);
  if (/[\u0e00-\u0e7f]/u.test(text)) families.add(`${prefix} Thai`);
  return [...families];
}

export async function loadEditorTextFonts(nodes: readonly EditorFontText[], environment?: FontEnvironment): Promise<void> {
  const env = environment ?? (typeof document !== "undefined" && document.fonts && typeof FontFace !== "undefined"
    ? { fonts: document.fonts, FontFace } : undefined);
  if (!env) throw new Error(EDITOR_FONT_LOAD_ERROR);
  let cache = installed.get(env.fonts);
  if (!cache) { cache = new Map(); installed.set(env.fonts, cache); }
  const requests: { text: string; family: string; weight: string }[] = [];
  const visit = (node: EditorFontText) => {
    if (typeof node.text === "string" && node.text) {
      const weight = node.fontWeight === "bold" ? "700" : node.fontWeight === "normal" ? "400" : String(node.fontWeight || 400);
      for (const family of editorFontFamilies(node.text, node.fontFamily || NOTO_SANS_STACK)) requests.push({text: node.text, family, weight});
      for (const line of Object.values(node.styles || {})) for (const style of Object.values(line)) {
        // A styled run may use a different family/weight. Load its full text to cover every glyph.
        if (style.fontFamily || style.fontWeight) visit({ ...node, ...style, styles: undefined, objects: undefined, getObjects: undefined });
      }
    }
    for (const child of node.getObjects?.() || node.objects || []) visit(child);
  };
  nodes.forEach(visit);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(EDITOR_FONT_LOAD_ERROR)), env.timeoutMs ?? 30000);
  });
  try {
    await Promise.race([(async () => {
    for (const request of requests) {
      const spec = EDITOR_FONT_MANIFEST.fonts.find(font => font.family === request.family)!;
      const base = env.baseUrl || EDITOR_FONT_MANIFEST.cdn;
      const url = base.replace(/\/?$/, "/") + spec.path.split("/").map(encodeURIComponent).join("/");
      const key = `${spec.family}:${url}`;
      let promise = cache.get(key);
      if (!promise) {
        promise = (async () => {
          const face = new env.FontFace(spec.family, `url("${url}")`, { weight: "100 900", style: "normal", display: "block" });
          env.fonts.add(await face.load());
        })();
        cache.set(key, promise);
        promise.catch(() => cache!.delete(key));
      }
      await promise;
      const loaded = await env.fonts.load(`${request.weight} 16px "${spec.family}"`, request.text);
      if (!loaded.length) throw new Error(EDITOR_FONT_LOAD_ERROR);
    }
    await env.fonts.ready;
    })(), timedOut]);
  } catch (cause) {
    installed.delete(env.fonts);
    throw Object.assign(new Error(EDITOR_FONT_LOAD_ERROR), { cause });
  } finally { clearTimeout(timer); }
}

/** Parent integrates this around open/export, before Fabric measures or rasterizes. */
export async function withEditorFonts<T>(canvas: { getObjects(): EditorFontText[] }, render: () => Promise<T>, environment?: FontEnvironment): Promise<T> {
  const nodes = canvas.getObjects();
  await loadEditorTextFonts(nodes, environment);
  if (environment?.clearFontCache) environment.clearFontCache();
  else (await import("fabric")).cache.clearFontCache();
  const refresh = (node: EditorFontText) => {
    if (node.text) { node.initDimensions?.(); node.setCoords?.(); node.dirty = true; }
    (node.getObjects?.() || node.objects || []).forEach(refresh);
  };
  nodes.forEach(refresh);
  return render();
}
