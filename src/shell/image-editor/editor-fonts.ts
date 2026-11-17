/** Noto OFL families, from the same pinned TTFs as material-text-layers. */
import { editorFontFamily } from "./editor-font-family";
import { editorFontSpec, type EditorFontSpec } from "./editor-font-registry";
import { EDITOR_FONT_MANIFEST } from "./editor-font-manifest";
import { resolvePublicFontAsset } from "../../lib/asset-delivery";
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
  initDimensions?: () => unknown; setCoords?: () => unknown; triggerLayout?: () => void; dirty?: boolean;
};
export type FontEnvironment = { fonts: Pick<FontFaceSet, "add" | "load" | "ready">; FontFace: typeof FontFace; baseUrl?: string; timeoutMs?: number; clearFontCache?: () => void };
const installed = new WeakMap<object, Map<string, Promise<void>>>();
type Subset = { path: string; unicodeRange: string };
const rangeCache = new WeakMap<Subset, number[][]>();
const supports = (subset: Subset, point: number) => {
  let ranges = rangeCache.get(subset);
  if (!ranges) {
    ranges = subset.unicodeRange.split(",").map(part => {
      const [first, last] = part.trim().replace(/^U\+/i, "").split("-").map(n => parseInt(n, 16));
      return [first, last ?? first];
    });
    rangeCache.set(subset, ranges);
  }
  return ranges.some(([a, b]) => point >= a && point <= b);
};

/** Additional script families for generic/legacy stacks. Explicit regional order wins. */
export function editorFontFamilies(text: string, family: string): string[] {
  const first = editorFontFamily(family).split(",")[0];
  const serif = /serif/i.test(first) && !/sans/i.test(first);
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

function textNodes(nodes: readonly EditorFontText[]): EditorFontText[] {
  const result: EditorFontText[] = [];
  const visit = (node: EditorFontText) => {
    if (node.text) {
      result.push(node);
      for (const line of Object.values(node.styles || {})) for (const style of Object.values(line)) {
        if (style.fontFamily || style.fontWeight) result.push({ ...node, ...style, styles: undefined });
      }
    }
    (node.getObjects?.() || node.objects || []).forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}
async function bounded<T>(work: Promise<T>, timeout: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(EDITOR_FONT_LOAD_ERROR)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

/** Only matching unicode ranges are fetched. Failed/timed-out faces remain retryable. */
export async function loadEditorTextFonts(nodes: readonly EditorFontText[], environment?: FontEnvironment): Promise<void> {
  const texts = textNodes(nodes);
  if (!texts.length) return;
  const env = environment ?? (typeof document !== "undefined" && document.fonts && typeof FontFace !== "undefined"
    ? { fonts: document.fonts, FontFace } : undefined);
  if (!env) throw new Error(EDITOR_FONT_LOAD_ERROR);
  const timeout = env.timeoutMs ?? 8000;
  const cache = installed.get(env.fonts) ?? new Map<string, Promise<void>>();
  installed.set(env.fonts, cache);
  let cancelled = false;
  const requests = new Map<string, { family: string; text: string; weight: string; style: string; spec: EditorFontSpec; subsets: Map<string, Subset> }>();
  for (const node of texts) {
    const text = node.text!;
    const family = node.fontFamily || NOTO_SANS_STACK;
    const weight = node.fontWeight === "bold" ? "700" : node.fontWeight === "normal" ? "400" : String(node.fontWeight || 400);
    const style = node.fontStyle === "italic" || node.fontStyle === "oblique" ? "italic" : "normal";
    const names = [...new Set([...family.split(",").map(n => n.trim().replace(/["']/g, "")), ...editorFontFamilies(text, family)])];
    const specs = names.flatMap(name => {
      const spec = editorFontSpec(name, Number(weight), style);
      return spec ? [{ ...spec, family: name }] : [];
    });
    // Follow CSS fallback order, including Latin glyphs in SC/TC/JP/KR-first documents.
    for (const character of text) {
      const point = character.codePointAt(0)!;
      for (const spec of specs) {
        const subset = spec.subsets.find(s => supports(s, point));
        if (!subset) continue;
        const key = `${spec.family}:${weight}:${style}`;
        let request = requests.get(key);
        if (!request) { request = { family: spec.family, weight, text, style, spec, subsets: new Map() }; requests.set(key, request); }
        request.subsets.set(subset.path, subset);
        break;
      }
    }
  }
  try {
    await bounded(Promise.all([...requests.values()].map(async request => {
      await Promise.all([...request.subsets.values()].map(async subset => {
        const url = env.baseUrl
          ? env.baseUrl.replace(/\/?$/, "/") + subset.path
          : resolvePublicFontAsset(`${request.spec.prefix}/${subset.path}`);
        const key = `${request.family}:${url}`;
        let promise = cache.get(key);
        if (!promise) {
          promise = (async () => {
            const spec = request.spec;
            // The global mirror is populated separately. Fall back to the owned
            // source until a version is mirrored, and during CDN outages.
            const sources = env.baseUrl ? [url] : [...new Set([url, resolvePublicFontAsset(`${request.spec.prefix}/${subset.path}`, "cn")])];
            const face = new env.FontFace(request.family, sources.map(source => `url("${source}") format("woff2")`).join(", "), {
              weight: spec.weightRange, unicodeRange: subset.unicodeRange,
              style: spec.style, display: "swap",
            });
            // A timed-out download must not install a late face with stale Fabric metrics.
            const loadedFace = await bounded(face.load(), timeout);
            if (cancelled) throw new Error(EDITOR_FONT_LOAD_ERROR);
            env.fonts.add(loadedFace);
          })();
          cache.set(key, promise);
          promise.catch(() => { if (cache.get(key) === promise) cache.delete(key); });
        }
        await promise;
      }));
      const loaded = await env.fonts.load(`${request.style === "normal" ? "" : request.style + " "}${request.weight} 16px "${request.family}"`, request.text);
      if (!loaded.length) throw new Error(EDITOR_FONT_LOAD_ERROR);
    })), timeout);
  } catch (cause) {
    cancelled = true;
    throw Object.assign(new Error(EDITOR_FONT_LOAD_ERROR), { cause });
  }
}

/** Open/save must continue with CSS generic fallback if the network/font API fails. */
export async function prepareEditorFonts(nodes: readonly EditorFontText[], clearFontCache?: () => void, environment?: FontEnvironment): Promise<void> {
  if (!textNodes(nodes).length) return;
  try { await loadEditorTextFonts(nodes, environment); } catch { /* Preserve saved family intent; CSS supplies generic fallback. */ }
  if (clearFontCache) clearFontCache();
  else if (environment?.clearFontCache) environment.clearFontCache();
  else (await import("fabric")).cache.clearFontCache();
}

/** Remeasure before rasterizing; walk groups as well as individual text objects. */
export async function withEditorFonts<T>(canvas: { getObjects(): EditorFontText[] }, render: () => Promise<T>, environment?: FontEnvironment): Promise<T> {
  const nodes = canvas.getObjects();
  await prepareEditorFonts(nodes, undefined, environment);
  refreshEditorFontMetrics(nodes);
  return render();
}

export function refreshEditorFontMetrics(nodes: EditorFontText[]): void {
  const refresh = (node: EditorFontText) => {
    if (node.text) { node.initDimensions?.(); node.setCoords?.(); node.dirty = true; }
    const children = node.getObjects?.() || node.objects || [];
    children.forEach(refresh);
    if (children.length) { node.triggerLayout?.(); node.setCoords?.(); }
    // Fabric caches groups separately from their text children.
    node.dirty = true;
  };
  nodes.forEach(refresh);
}
