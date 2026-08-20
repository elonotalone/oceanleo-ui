"use client";

// ============================================================================
// @oceanleo/ui — 长图里的公式：KaTeX → 位图
// ----------------------------------------------------------------------------
// 画布画不了 KaTeX 的 DOM，所以先把每条公式渲染进一个离屏节点量尺寸，再连同
// **只用到的那几套 KaTeX 字体**一起塞进 SVG 的 foreignObject 光栅化成一张图。
// 字体必须内联成 data URI：作为 `<img>` 加载的 SVG 不会去取外部资源，不内联就会
// 掉成衬线体。
//
// 安全：KaTeX 的 `trust:false` 输出本身不含脚本与事件属性，这里再过一道 DOMPurify
// 才落到 DOM 上——用户输入永远不会以原样 HTML 的身份进入页面（合同 R7 / UC-4）。
// 任何一步失败都返回「量不出来」，排版层会退回等宽文本画公式，绝不崩。
// ============================================================================

import { KATEX_OPTIONS, loadKatex } from "./katex-runtime";
import type { ShareBlock, ShareInline } from "./share-blocks";

export interface ShareMathItem {
  tex: string;
  display: boolean;
}

export interface ShareMathAssets {
  /** 供排版层同步测量；null = 这台机器画不了公式。 */
  size(tex: string, display: boolean): { width: number; height: number } | null;
  /** 供画笔同步取图。 */
  image(tex: string, display: boolean): CanvasImageSource | null;
  /** 有几条公式最终没能光栅化。 */
  readonly failures: number;
}

const EMPTY_ASSETS: ShareMathAssets = {
  size: () => null,
  image: () => null,
  failures: 0,
};

function keyOf(tex: string, display: boolean): string {
  return `${display ? "d" : "i"}:${tex}`;
}

// ---------------------------------------------------------------------------
// 样式表采集（含字体内联）
// ---------------------------------------------------------------------------

const fontCache = new Map<string, string>();

async function inlineFontUrl(url: string): Promise<string | null> {
  const cached = fontCache.get(url);
  if (cached) return cached;
  try {
    const response = await fetch(url, { cache: "force-cache" });
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of buffer) binary += String.fromCharCode(byte);
    const encoded = `data:font/woff2;base64,${btoa(binary)}`;
    fontCache.set(url, encoded);
    return encoded;
  } catch {
    return null;
  }
}

function readRules(sheet: CSSStyleSheet): CSSRule[] {
  try {
    return Array.from(sheet.cssRules || []);
  } catch {
    // 跨源样式表读不到 cssRules，跳过即可。
    return [];
  }
}

async function collectKatexCss(families: ReadonlySet<string>): Promise<string> {
  if (typeof document === "undefined") return "";
  const chunks: string[] = [];
  const faces: CSSFontFaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    for (const rule of readRules(sheet as CSSStyleSheet)) {
      const text = rule.cssText || "";
      if (rule.type === 5 /* CSSRule.FONT_FACE_RULE */) {
        const family = /font-family:\s*"?([^";]+)"?/.exec(text)?.[1]?.trim();
        if (family && families.has(family)) faces.push(rule as CSSFontFaceRule);
        continue;
      }
      if (text.includes(".katex")) chunks.push(text);
    }
  }
  if (!chunks.length) return "";
  const inlined: string[] = [];
  for (const face of faces) {
    const text = face.cssText || "";
    const url = /url\(["']?([^"')]+\.woff2)["']?\)/.exec(text)?.[1];
    if (!url) continue;
    const absolute = new URL(url, document.baseURI).href;
    const data = await inlineFontUrl(absolute);
    if (!data) continue;
    inlined.push(
      text.replace(/src:[^;]+;/, `src:url(${data}) format("woff2");`),
    );
  }
  return [...inlined, ...chunks].join("\n");
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

type PurifyModule = {
  sanitize: (
    value: string,
    options: { RETURN_DOM_FRAGMENT: true },
  ) => DocumentFragment;
};

/**
 * KaTeX 的输出**永远不以 HTML 字符串的身份**进入页面：DOMPurify 直接交出已消毒的
 * DOM 片段，我们 appendChild 它。全链路没有 `innerHTML` / `dangerouslySetInnerHTML`
 * 这类注入面（UC-4）。DOMPurify 拿不到就干脆不渲染公式，退回等宽兜底。
 */
async function sanitizeToFragment(
  html: string,
): Promise<DocumentFragment | null> {
  try {
    const module = await import("dompurify");
    const purify =
      (module as { default?: PurifyModule }).default ??
      (module as unknown as PurifyModule);
    if (typeof purify?.sanitize !== "function") return null;
    return purify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
  } catch {
    return null;
  }
}

function rasterize(
  html: string,
  css: string,
  width: number,
  height: number,
): Promise<HTMLImageElement | null> {
  // html 来自 XMLSerializer，已经是良构 XHTML；css 用 CDATA 包住，免得里面的
  // `>` / `&` 把 SVG 的 XML 解析弄崩。
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0;padding:0;color:#1c1917">` +
    `<style><![CDATA[${css}]]></style>${html}</div>` +
    `</foreignObject></svg>`;
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "sync";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });
}

/**
 * 预渲染一批公式。画笔是同步的，所以必须在排版之前把所有公式都变成图。
 * 返回的 assets 同时供排版测量与画笔取图，两边看到的尺寸永远一致。
 */
export async function prepareShareMath(
  items: readonly ShareMathItem[],
): Promise<ShareMathAssets> {
  if (typeof document === "undefined" || !items.length) return EMPTY_ASSETS;
  const katex = await loadKatex();
  if (!katex) return EMPTY_ASSETS;

  const unique = new Map<string, ShareMathItem>();
  for (const item of items) {
    const tex = String(item.tex || "").trim();
    if (tex) unique.set(keyOf(tex, item.display), { ...item, tex });
  }
  if (!unique.size) return EMPTY_ASSETS;

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;";
  document.body.appendChild(host);

  const rendered = new Map<
    string,
    { html: string; width: number; height: number }
  >();
  const families = new Set<string>();
  try {
    for (const [key, item] of unique) {
      let html = "";
      try {
        html = katex.renderToString(item.tex, {
          ...KATEX_OPTIONS,
          displayMode: item.display,
        });
      } catch {
        continue;
      }
      const fragment = await sanitizeToFragment(html);
      if (!fragment) continue;
      const node = document.createElement("span");
      node.style.display = "inline-block";
      node.appendChild(fragment);
      host.appendChild(node);
      const box = node.getBoundingClientRect();
      const width = Math.ceil(box.width) + 4;
      const height = Math.ceil(box.height) + 4;
      if (width > 4 && height > 4) {
        // 序列化回来的是良构 XHTML，正好是 foreignObject 需要的形态。
        rendered.set(key, {
          html: new XMLSerializer().serializeToString(node),
          width,
          height,
        });
        for (const element of Array.from(node.querySelectorAll("*"))) {
          const family = getComputedStyle(element).fontFamily || "";
          for (const candidate of family.split(",")) {
            const name = candidate.trim().replace(/^["']|["']$/g, "");
            if (name.startsWith("KaTeX")) families.add(name);
          }
        }
      }
      node.remove();
    }
  } finally {
    host.remove();
  }
  if (!rendered.size) return EMPTY_ASSETS;

  const css = await collectKatexCss(families);
  if (!css) return EMPTY_ASSETS;

  const images = new Map<string, HTMLImageElement>();
  let failures = 0;
  for (const [key, entry] of rendered) {
    const image = await rasterize(entry.html, css, entry.width, entry.height);
    if (image) images.set(key, image);
    else failures += 1;
  }

  return {
    size(tex, display) {
      const entry = rendered.get(keyOf(tex.trim(), display));
      if (!entry || !images.has(keyOf(tex.trim(), display))) return null;
      return { width: entry.width, height: entry.height };
    },
    image(tex, display) {
      return images.get(keyOf(tex.trim(), display)) || null;
    },
    failures,
  };
}

/** 从块 IR 里收集所有要预渲染的公式。 */
export function collectMathItems(
  blocks: readonly ShareBlock[],
): ShareMathItem[] {
  const out: ShareMathItem[] = [];
  const scan = (inlines?: readonly ShareInline[]) => {
    for (const inline of inlines || []) {
      if (inline.type === "math" && inline.tex) {
        out.push({ tex: inline.tex, display: false });
      }
    }
  };
  for (const block of blocks) {
    switch (block.type) {
      case "math":
        out.push({ tex: block.tex, display: true });
        break;
      case "heading":
      case "paragraph":
      case "quote":
        scan(block.inlines);
        break;
      case "list":
        for (const item of block.items) scan(item.inlines);
        break;
      case "table":
        for (const cell of block.header) scan(cell);
        for (const row of block.rows) for (const cell of row) scan(cell);
        break;
      default:
        break;
    }
  }
  return out;
}
