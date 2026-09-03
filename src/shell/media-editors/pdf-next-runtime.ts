// ============================================================================
// EmbedPDF 内核的加载策略（W06，editor-core-swap，flag=`next` 专用）
//
// 纯函数，不 import 任何 `@embedpdf/*`：它决定的是「PDFium 的 WASM 与回退字体
// 从哪儿取」，而这个决定必须在**没有浏览器、没有内核**的情况下也能被测试钉住。
//
// 为什么需要这一层（两条实测，不是洁癖）：
//
//   1. `@embedpdf/engines` 的 React 绑定里写死了
//      `defaultWasmUrl = "https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@2.15.0/dist/pdfium.wasm"`
//      （`dist/react/index.js:4`，`usePdfiumEngine` 在 `:7` 用它兜底）。
//      不显式传 `wasmUrl`，31 个租户站每次打开 PDF 都会去第三方 CDN 取 4.6 MB。
//   2. worker 引擎里 `fontFallback === null ? undefined : fontFallback ?? cdnFontConfig`
//      （`dist/lib/pdfium/web/worker-engine.js:487` 的 worker blob），而 `cdnFontConfig`
//      指向 `https://cdn.jsdelivr.net/npm/@embedpdf/fonts-sc@latest` 这类**不锁版本**的地址。
//      于是任何含中日韩文字的 PDF 都会在运行时向第三方要字体——境内站取不到，
//      且 `@latest` 意味着我们对拿到什么字节没有任何控制。
//
// 所以这里的默认值是「**拒绝**，并说清两条修法」，而不是「悄悄走 CDN」。
// 失败要有原因（`_COMMON.md` §10 第 6 条的同一条精神：不静默）。
// ============================================================================

/** 上游写死的 WASM 兜底地址。这里留一份，是为了**认得出它**并拒绝。 */
export const PDFIUM_UPSTREAM_DEFAULT_WASM_URL =
  "https://cdn.jsdelivr.net/npm/@embedpdf/pdfium@2.15.0/dist/pdfium.wasm";

/** 上游字体回退用的 CDN 前缀，同样只用来认出并拒绝。 */
export const PDFIUM_UPSTREAM_FONT_CDN_PREFIX =
  "https://cdn.jsdelivr.net/npm/@embedpdf/fonts-";

/** 本包锁定的 PDFium 版本。与 `W01-deps.md` §2.2 的 `2.15.0` 同一个数。 */
export const PDFIUM_PINNED_VERSION = "2.15.0";

/** 部署侧覆盖 WASM 地址的环境变量名。 */
export const PDFIUM_WASM_ENV_KEY = "NEXT_PUBLIC_OCEANLEO_PDFIUM_WASM_URL";

/** 部署侧提供自托管回退字体目录的环境变量名。 */
export const PDFIUM_FONT_BASE_ENV_KEY = "NEXT_PUBLIC_OCEANLEO_PDFIUM_FONT_BASE";

/** 判 URL 是否落在第三方 CDN 上。`http:` 与协议相对写法一并拦。 */
export function isVendorCdnUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  const normalized = value.startsWith("//") ? `https:${value}` : value;
  return /^https?:\/\/(?:[^/]*\.)?jsdelivr\.net\//i.test(normalized) ||
    /^https?:\/\/(?:[^/]*\.)?unpkg\.com\//i.test(normalized) ||
    /^https?:\/\/(?:[^/]*\.)?cdnjs\.cloudflare\.com\//i.test(normalized);
}

export type PdfiumWasmResolution =
  | { ok: true; wasmUrl: string; origin: "env" | "bundled" }
  | { ok: false; reason: string };

export interface PdfiumWasmInputs {
  /** `process.env[PDFIUM_WASM_ENV_KEY]`，由调用方读出来传进来（纯函数不读全局）。 */
  envUrl?: string | null;
  /**
   * 打包器发出的资源地址。叶子模块用
   * `new URL("@embedpdf/pdfium/pdfium.wasm", import.meta.url).href` 取，
   * 拿不到就传 `null`——**不要**在这里编一个地址出来。
   */
  bundledUrl?: string | null;
}

/**
 * 决定 PDFium 的 WASM 从哪儿加载。
 *
 * 优先级：**部署侧环境变量 > 打包器发出的自托管资源 > 拒绝**。
 * 任何一档只要落在第三方 CDN 上就当场拒绝——包括部署侧自己填的那个，
 * 「配置里写了」不改变「31 个站的用户在向第三方发请求」这件事。
 */
export function resolvePdfiumWasmUrl(
  inputs: PdfiumWasmInputs = {},
): PdfiumWasmResolution {
  const env = (inputs.envUrl || "").trim();
  if (env) {
    if (isVendorCdnUrl(env)) {
      return {
        ok: false,
        reason: `${PDFIUM_WASM_ENV_KEY} 指向第三方 CDN（${env}）。PDFium 的 WASM 必须自托管：把 node_modules/@embedpdf/pdfium/dist/pdfium.wasm 复制到本站静态目录，再把这个变量指过去。`,
      };
    }
    return { ok: true, wasmUrl: env, origin: "env" };
  }
  const bundled = (inputs.bundledUrl || "").trim();
  if (bundled) {
    if (isVendorCdnUrl(bundled)) {
      return {
        ok: false,
        reason: `打包器给出的 PDFium 资源地址落在第三方 CDN 上（${bundled}）。`,
      };
    }
    return { ok: true, wasmUrl: bundled, origin: "bundled" };
  }
  return {
    ok: false,
    reason: `没有可用的 PDFium WASM 地址。两条修法二选一：① 让打包器发出 @embedpdf/pdfium@${PDFIUM_PINNED_VERSION} 的 pdfium.wasm 资源；② 把该文件放到本站静态目录并设 ${PDFIUM_WASM_ENV_KEY}。不接受回落到 ${PDFIUM_UPSTREAM_DEFAULT_WASM_URL}。`,
  };
}

/** PDFium 认得的回退字体分组，与上游 `@embedpdf/fonts-*` 包名同名。 */
export const PDFIUM_FONT_GROUPS = [
  "latin",
  "sc",
  "tc",
  "jp",
  "kr",
  "arabic",
  "hebrew",
] as const;

export type PdfiumFontGroup = (typeof PDFIUM_FONT_GROUPS)[number];

/**
 * 回退字体策略。
 *
 * 没有配自托管目录时返回 `null`——**这不是「忘了配」，是显式关掉**：
 * `fontFallback: null` 是上游唯一能让 worker 不去 jsDelivr 的取值
 * （`fontFallback ?? cdnFontConfig` 只有 `null` 走得掉，`undefined` 走不掉）。
 * 代价写在返回值的 `note` 里，由调用方原样呈现给用户：缺字的 PDF 会显示豆腐块，
 * 而不是偷偷去第三方要字体。
 */
export function resolvePdfiumFontFallback(
  fontBaseUrl?: string | null,
): { fonts: Record<string, string>; baseUrl: string } | null {
  const base = (fontBaseUrl || "").trim();
  if (!base || isVendorCdnUrl(base)) return null;
  const baseUrl = base.endsWith("/") ? base : `${base}/`;
  const fonts: Record<string, string> = {};
  for (const group of PDFIUM_FONT_GROUPS) {
    fonts[group] = `${baseUrl}${group}.ttf`;
  }
  return { fonts, baseUrl };
}

/**
 * 即用查看器（L3 专业模式）的外部请求策略。
 *
 * snippet 的 `fonts.ui` 默认会往 **Google Fonts** 插一条 `<link>` 取 Open Sans，
 * `fonts.signature` 默认再取四款手写体（`@embedpdf/snippet/dist/components/app.d.ts`
 * 的 `SnippetFontsConfig` 注释原文）。两者都接受 `null` = 跳过外部请求、回落到
 * 系统字体栈。专业模式是同一份文档、同一个用户，没有理由比普通模式多向外发请求。
 */
export const PDF_VIEWER_NO_EXTERNAL_FONTS = {
  ui: null,
  signature: null,
} as const;
