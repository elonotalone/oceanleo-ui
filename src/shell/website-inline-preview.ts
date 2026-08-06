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

/** 该 rendition 是不是一份能当页面打开的 HTML。 */
export function isWebsitePageMediaType(mediaType: string | undefined): boolean {
  return String(mediaType || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase() === "text/html";
}
