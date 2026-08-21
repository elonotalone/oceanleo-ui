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

/**
 * 判读一份预览件时能取回来的字节上限，也就是**观看端的能力边界**。
 *
 * 这一行是那个数的唯一事实源。产出侧的体积闸门去读它
 * （`scripts/oceanleo-website-prerender.mjs` 的 `readViewerProbeMaxBytes()`），
 * 而不是抄它：抄一次就有了两套口径，这一行哪天调了，闸门不会跟着调，于是又出现
 * 「闸上判绿、前端根本读不回来」——那正是实测见过 4.6–11.8 MB 预览件的来路。
 */
export const MAX_PROBE_BYTES = 8 * 1024 * 1024;

/**
 * `fetchMediaBlob` 超限时抛的那一句（`src/lib/media-proxy.ts` 里两处 `maxBytes`
 * 判定共用同一字面量）。它抛的是普通 `Error`，没有错误码，所以「这一件太大」与
 * 「网络抖了一下」在调用方眼里长得一模一样 —— 而这两件事该给用户的话完全相反：
 * 前者重试一百次都一样，后者重试就好。
 *
 * 认这句话是有代价的耦合，所以把它摆在明处：
 * `scripts/tests/oceanleo-website-inline-bundle.test.mjs` 有一条闸去 `media-proxy.ts`
 * 里逐字找它，那边改了措辞而这里没跟上，测试当场判红，而不是悄悄退化成「超限件照旧上屏」。
 */
export const MEDIA_OVERSIZE_ERROR_TEXT = "素材过大，无法在浏览器内存中安全处理";

/** 取字节失败的原因是不是「这一件超出了观看端能处理的体量」。 */
export function isMediaOversizeError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return message.includes(MEDIA_OVERSIZE_ERROR_TEXT);
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
 *
 * `unknown` 是「还没有证据」，不是「可以放行」：它到底能不能进 frame，由
 * `websiteViewerPlan` 按正文判读的结果定；正文也没读回来时一律不放行。
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

/**
 * 正文判读的结果。三档要分清，因为它们该给用户的话完全不同：
 * - `unread`：判读没跑成（网络抖动之类），**不是**「读到了空」；
 * - `oversize`：字节数超过 `MAX_PROBE_BYTES`，这一件**注定**判读不了，重试也一样。
 *   过去这一档被并进 `unread`，于是「声明了 text/html」的超限件照旧进 frame ——
 *   一份没人核对过的整站包直接上屏，坏成什么样就显示成什么样。
 *   `byteLength` 取 rendition 登记的字节数；登记里没有就传 **0**（表示「只知道超了，
 *   不知道超到多少」），文案会据此少说一个数，而不是编一个；
 * - `read`：正文取回来了，形状也量出来了。
 */
export type WebsiteBodyProbe =
  | { status: "unread" }
  | { status: "oversize"; byteLength: number }
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
  /**
   * 声明自己是网页、字节却不是文字：这一件的预览件在**产出时**就坏了。
   * 与 `opaque-bytes` 分开，因为出路不同 —— 那一档要先构建，这一档要重新产。
   */
  | "unreadable-bytes"
  /**
   * 字节数超出观看端能取回来核对的上限。重试不会有别的结果，出路是重产一份小的。
   * 曾经并进 `unverified`，于是超限件被当成「判读器这次没跑成」放行进 frame。
   */
  | "oversize"
  /** 媒体类型没说、正文也没读到：没有任何证据支持「它是网页」。 */
  | "unverified"
  | "no-body";

/**
 * 话是死的那几档。`oversize` 不在其中：它要报出这一件到底多大，话由
 * `oversizeNotice()` 现给。把它硬塞进下面那张表只会多出一条永远用不上的死文案。
 */
export type WebsiteStaticNoticeReason = Exclude<WebsiteViewerReason, "oversize">;

export interface WebsiteViewerPlan {
  surface: WebsiteViewerSurface;
  reason: WebsiteViewerReason;
  /**
   * 这一档要对用户说的那句话。**判读器给话，查看器不再自己编一套**——
   * 同一个判读结果在三支查看器里各写一句文案，早晚有一句与判据脱节
   * （「点开满屏乱码」那次就是判据分散在各查看器里）。
   */
  notice: string;
}

/**
 * 每一档说的都是**这一件是什么**，不是替产品的空缺道歉。
 * 判据：文案里不出现「暂时」「抱歉」「制作得较早」这类替缺陷开脱的说法。
 *
 * 这是这几句话的**唯一**产地。`WebsiteArtifactViewer.tsx` 过去自带一份逐字相同的
 * `SURFACE_COPY`，按 `reason` 查表往外摆；两处各写一份的结果是判读器新分出一档、
 * 查看器还在说旧话。现在查看器只摆 `plan.notice`，
 * `scripts/tests/oceanleo-website-inline-bundle.test.mjs` 有一条闸盯着它不许再长回去。
 */
export const WEBSITE_VIEWER_COPY: Record<WebsiteStaticNoticeReason, string> = {
  "self-painting": "",
  "script-bootstrapped":
    "这是一份要在浏览器里跑起来才成型的网站：页面结构由它自带的脚本在打开时现画。素材预览通道按平台隔离规则不执行脚本，所以这里给出它的封面与页面清单。",
  "cover-image-only":
    "这一件在素材库里只存了一张封面图，没有随附可打开的页面文件。",
  "opaque-bytes":
    "这一件存的是打包后的网站源码，不是可以直接打开的网页；要看到页面需要先把它构建出来。",
  "unreadable-bytes":
    "这份预览件声明自己是网页，但取回来的字节不是文字（其中含二进制内容），说明这一件的预览件在产出时就坏了。预览通道不会把这些字节当文字摆上屏幕；这一件需要重新产一份预览件，在那之前，下载与编辑这两条出口照常可用。",
  unverified:
    "这一件在素材库里没有登记文件类型，内容也没能读回来核对；在确认它是一份能直接打开的网页之前，预览通道不会把它的内容放上屏幕。",
  "no-body": "这一件在素材库里没有可打开的文件。",
};

/**
 * 超限那一档的话要**说清楚是这一件太大**，而不是含糊地说"读不回来"：
 * 用户按重试一百次结果都一样，出路只有让这一件重新产一份小的。
 *
 * `byteLength` 是 rendition 在线上登记的字节数；登记里没有这一项时传 0，
 * 那时只说「超出上限」，**不编一个数**——取字节这一步是在拿到内容之前就被挡下的，
 * 查看器手里本来就没有精确体积。
 */
function oversizeNotice(byteLength: number): string {
  const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)} MB`;
  const scale =
    byteLength > MAX_PROBE_BYTES
      ? `这份预览件有 ${mb(byteLength)}，超出`
      : "这份预览件超出";
  return (
    `${scale}预览通道能读回来核对的上限 ${mb(MAX_PROBE_BYTES)}，`
    + "所以它的内容没有经过核对，预览通道不会把它放上屏幕。这一件需要重新产一份更小的预览件；"
    + "在那之前，下载与编辑这两条出口照常可用。"
  );
}

/**
 * 判读结果与它要说的那句话在同一处成对给出。分开写过一次，结果就是新增一档时
 * 只加了 `reason`、忘了配文案，用户拿到一个空白说明面。
 */
function plan(
  surface: WebsiteViewerSurface,
  reason: WebsiteStaticNoticeReason,
): WebsiteViewerPlan {
  return { surface, reason, notice: WEBSITE_VIEWER_COPY[reason] };
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
  if (!input.hasUrl) return plan("unavailable", "no-body");
  const admission = websiteFrameAdmission(input.mediaType);
  if (admission === "cover-image") {
    return plan("unavailable", "cover-image-only");
  }
  if (admission === "opaque-bytes") {
    return plan("unavailable", "opaque-bytes");
  }
  if (input.body.status === "oversize") {
    // 与 `unread` 分开处理：`unread` 是「判读器这次没跑成」，值得把真页面放进
    // frame；超限是「这一件本身超出了观看端的能力」，重试不会有别的结果，
    // 把未经核对的整站包放上屏就是拿一屏乱码赌一把。
    return {
      surface: "unavailable",
      reason: "oversize",
      notice: oversizeNotice(input.body.byteLength),
    };
  }
  if (input.body.status === "unread") {
    // 判读跑不成时，唯一还站得住的证据是媒体类型自己声明过 `text/html`：那种情况
    // 宁可把真页面放进 frame，也不要因为判读器的问题就先斩后奏。
    //
    // `unknown`（老的非 durable 条目根本没有 rendition 元数据）什么都没声明过，
    // 正文又没读回来 —— 两头都没有证据却放行，就是拿一屏乱码赌一把。判读读不回来
    // 不是小概率：`MAX_PROBE_BYTES` 是 8 MB，超限的整站包会让取字节直接抛错。
    return admission === "page"
      ? plan("page", "self-painting")
      : plan("unavailable", "unverified");
  }
  const { html, shape } = input.body;
  if (!isDisplayableText(html)) {
    return plan("unavailable", "unreadable-bytes");
  }
  if (!looksLikeHtmlDocument(html)) {
    return plan("unavailable", "opaque-bytes");
  }
  if (websitePaintMode(shape) === "script-bootstrapped") {
    return plan("script-explainer", "script-bootstrapped");
  }
  return plan("page", "self-painting");
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
