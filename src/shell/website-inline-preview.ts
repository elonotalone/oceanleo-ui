/**
 * 网站素材「就地预览」的判读逻辑（纯函数，无 DOM、无网络，便于断言）。
 *
 * 背景：网站 artifact 的 `full` rendition 是一份整站内联 HTML，由网关
 * `/v1/artifact-renditions/access/{token}` 下发，响应头恒带
 * `Content-Security-Policy: sandbox; default-src 'none'; …`
 * （`oceanleo/backend/app/routers/artifacts_router.py:1401`）。那条 CSP 是
 * `stored_url_policy.py:61-67` 把 `api.oceanleo.com` 放进 cookie 域白名单的**理由**：
 * rendition 永远不执行脚本。
 *
 * 于是网站素材分成两种：
 *   - **自绘型**：HTML 自带完整 DOM，样式内联（CSP 放行 `style-src 'unsafe-inline'`），
 *     直接 iframe 就能看到页面；
 *   - **脚本引导型**：`<body>` 只有空容器，页面由内联脚本按内联的 `site.json` 现画
 *     （渲染器 `oceanleo-website-inline-1` 就是这一型）。这一型在上述 CSP 下必然
 *     画出一片空白，**不是 iframe 写错了**。
 *
 * 这里只负责判读与读出页面清单；「让脚本引导型也能看到页面」需要一条允许脚本的
 * 投递通道，属于平台侧决定，见
 * `docs/work-logs/2026-08/explore-inplace-preview/signals/W3-request.md`。
 */

/** DOM 侧量出来的、与实现无关的三个数。 */
export interface WebsiteDocumentShape {
  /** `<body>` 里除 script/style/template 之外的元素个数。 */
  elementCount: number;
  /** `<body>` 的纯文本长度（去掉首尾空白）。 */
  textLength: number;
  /** `<body>` 里内联脚本的个数。 */
  scriptCount: number;
}

export type WebsitePaintMode = "self-painting" | "script-bootstrapped";

/**
 * 判据：正文既没有可见文字、也几乎没有元素，却挂着内联脚本 —— 这就是
 * 「靠脚本现画」的形状。阈值取得很松（8 个元素 / 40 字），因为自绘型站点动辄
 * 几百个节点、上千字，两者之间不存在中间地带。
 */
export function websitePaintMode(shape: WebsiteDocumentShape): WebsitePaintMode {
  const bare = shape.elementCount <= 8 && shape.textLength < 40;
  return bare && shape.scriptCount > 0 ? "script-bootstrapped" : "self-painting";
}

export interface WebsitePageEntry {
  path: string;
  title: string;
  sectionCount: number;
}

export interface WebsiteInlineOutline {
  siteName: string;
  pages: WebsitePageEntry[];
}

/** 内联 `FILES` 表的体量上限：超过就不解析，避免为了一份清单啃掉主线程。 */
const MAX_INLINE_FILES_CHARS = 4 * 1024 * 1024;

function inlineFilesTable(html: string): Record<string, unknown> | null {
  const marker = html.indexOf("var FILES = {");
  if (marker < 0 || html.length > MAX_INLINE_FILES_CHARS) return null;
  const start = html.indexOf("{", marker);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const character = html[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed: unknown = JSON.parse(html.slice(start, index + 1));
          return parsed && typeof parsed === "object"
            ? (parsed as Record<string, unknown>)
            : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 从整站内联 HTML 里读出「这份素材有哪几页」。
 *
 * 只读 `site.json` 的页面清单，**不复刻任何版式**：版面渲染的唯一事实源是素材
 * 自带的第一方运行时，这里再写一套就是孪生渲染器。
 */
export function websiteInlineOutline(html: string): WebsiteInlineOutline | null {
  const files = inlineFilesTable(html);
  const raw = files?.["site.json"];
  if (typeof raw !== "string") return null;
  let site: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    site = parsed as Record<string, unknown>;
  } catch {
    return null;
  }
  const pages = Array.isArray(site.pages) ? site.pages : [];
  const entries: WebsitePageEntry[] = [];
  for (const value of pages) {
    if (!value || typeof value !== "object") continue;
    const page = value as Record<string, unknown>;
    const path = text(page.path);
    if (!path) continue;
    entries.push({
      path,
      title: text(page.title) || path,
      sectionCount: Array.isArray(page.sections) ? page.sections.length : 0,
    });
  }
  if (entries.length === 0) return null;
  return { siteName: text(site.siteName) || text(site.title), pages: entries };
}

function normalizedMediaType(mediaType: string | undefined): string {
  return String(mediaType || "").split(";", 1)[0].trim().toLowerCase();
}

/** 该 rendition 是不是一份能当页面打开的 HTML。 */
export function isWebsitePageMediaType(mediaType: string | undefined): boolean {
  return normalizedMediaType(mediaType) === "text/html";
}

/* ───────────────────────────────────────────────────────────────────────────
 * 查看器诚实法：拿不到可安全显示的本体时，绝不把原始字节当文字摆出来。
 *
 * 这一段是纯判读，住在这里而不是各查看器里，是因为三支查看器
 * （`WebsiteArtifactViewer` / `library-viewers` / `ArtifactRendition`）要共用同一条
 * 判据；判据分散过一次的后果就是「网站详情一屏乱码」——那一屏是
 * `website_source_zip` 的字节被按 UTF-8 读出来直接进了 frame。
 * ─────────────────────────────────────────────────────────────────────────── */

/** 判读只看前 4 KB：够认出形状，且不为了判一句话去遍历整份 300 KB 的正文。 */
const TEXT_SAMPLE_CHARS = 4096;

/**
 * 允许出现在正文里的控制字符只有制表与换行；其余 C0 控制字符与 U+FFFD
 * （二进制被按 UTF-8 解码后的替换符）都是「这不是文字」的直接证据。
 */
const UNDISPLAYABLE_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g;

/** 千分之十：正常文本里一个这样的字符都不该有，留出的余量只为容忍偶发脏字符。 */
const UNDISPLAYABLE_RATIO_LIMIT = 0.01;

/**
 * 这段字符串能不能当文字摆给用户看。
 *
 * 不判「好不好看」，只判「它是不是文字」：二进制（zip / docx / pptx / 位图）被
 * 按文本读出来一定带 NUL、C0 控制字符或成片的 U+FFFD，纯文本一个都不带。
 */
export function isDisplayableText(value: string): boolean {
  if (!value) return false;
  if (value.includes("\u0000")) return false;
  const sample = value.slice(0, TEXT_SAMPLE_CHARS);
  const undisplayable = sample.match(UNDISPLAYABLE_CHARACTER)?.length ?? 0;
  return undisplayable / sample.length <= UNDISPLAYABLE_RATIO_LIMIT;
}

/** 这段文字是不是一份 HTML 文档（而不是 JSON 信封、纯文本或别的什么）。 */
export function looksLikeHtmlDocument(value: string): boolean {
  const head = value.slice(0, TEXT_SAMPLE_CHARS);
  if (/<(?:!doctype\s+html|html|head|body)[\s>]/i.test(head)) return true;
  return /^\s*</.test(head) && /<\/[a-z][\w-]*>/i.test(head);
}

export type WebsiteFrameAdmission =
  /** 一份网页，可以进受限 frame。 */
  | "page"
  /** 一张封面位图：进 frame 就是「点开还是一张图」。 */
  | "cover-image"
  /** 打包字节（zip / octet-stream / JSON 信封…）：进 frame 就是一屏乱码。 */
  | "opaque-bytes"
  /** 没有 rendition 元数据的老条目，只能靠正文本身判。 */
  | "unknown";

const FRAMEABLE_PAGE_MEDIA_TYPES: readonly string[] = [
  "text/html",
  "application/xhtml+xml",
];

/**
 * 只按 rendition 声明的媒体类型判「能不能进 frame」。
 *
 * 空媒体类型必须留成 `unknown` 而不是拒绝：老的非 durable 网站条目根本没有
 * rendition 元数据，一刀切会把它们从「本来能打开」退化成「打不开」。
 */
export function websiteFrameAdmission(
  mediaType: string | undefined,
): WebsiteFrameAdmission {
  const normalized = normalizedMediaType(mediaType);
  if (!normalized) return "unknown";
  if (normalized.startsWith("image/")) return "cover-image";
  if (FRAMEABLE_PAGE_MEDIA_TYPES.includes(normalized)) return "page";
  return "opaque-bytes";
}

/** 正文判读的结果：`unread` 表示判读没跑成（网络错、超限），不是「读到了空」。 */
export type WebsiteBodyProbe =
  | { status: "unread" }
  | { status: "read"; html: string; shape: WebsiteDocumentShape };

export type WebsiteViewerSurface =
  /** 照常在受限 iframe 里渲染。 */
  | "page"
  /** 不硬渲染：说明这一件的性质，配静态封面与出口。 */
  | "script-explainer"
  /** 拿不到任何可显示物：空状态 + 出口。 */
  | "unavailable";

export type WebsiteViewerReason =
  | "self-painting"
  | "script-bootstrapped"
  | "cover-image-only"
  | "opaque-bytes"
  | "no-body";

export interface WebsiteViewerPlan {
  surface: WebsiteViewerSurface;
  reason: WebsiteViewerReason;
}

/**
 * 三档判读的唯一出口。查看器只按这里给的 `surface` 分支，不许自己再兜一次底
 * ——「兜底时把字节当文字摆出来」就是这样长出来的。
 */
export function websiteViewerPlan(input: {
  hasUrl: boolean;
  mediaType?: string;
  body: WebsiteBodyProbe;
}): WebsiteViewerPlan {
  if (!input.hasUrl) return { surface: "unavailable", reason: "no-body" };
  const admission = websiteFrameAdmission(input.mediaType);
  if (admission === "cover-image") {
    return { surface: "unavailable", reason: "cover-image-only" };
  }
  if (admission === "opaque-bytes") {
    return { surface: "unavailable", reason: "opaque-bytes" };
  }
  if (input.body.status === "unread") {
    // 判读跑不成不构成「看不了」的证据：媒体类型已经说了它是网页，宁可把真页面
    // 放进 frame 让用户自己看，也不要因为判读器的问题就先斩后奏。
    return { surface: "page", reason: "self-painting" };
  }
  const { html, shape } = input.body;
  if (!isDisplayableText(html) || !looksLikeHtmlDocument(html)) {
    return { surface: "unavailable", reason: "opaque-bytes" };
  }
  if (websitePaintMode(shape) === "script-bootstrapped") {
    return { surface: "script-explainer", reason: "script-bootstrapped" };
  }
  return { surface: "page", reason: "self-painting" };
}

/**
 * 该 rendition 是不是封面位图。
 *
 * 详情面用它来兜底而不是「必须等于 text/html」：老的非 durable 网站条目根本没有
 * rendition 元数据（`mediaType` 是空的），一刀切会把它们从「本来能打开」退化成
 * 「打不开」。位图是唯一必须拒绝的形态——把 webp 塞进 iframe 就是「点开还是一张图」。
 */
export function isCoverImageMediaType(mediaType: string | undefined): boolean {
  return normalizedMediaType(mediaType).startsWith("image/");
}
