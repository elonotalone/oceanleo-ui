// oceanleo.sandbox-origin.v1 —— 不可信内容渲染面的信任边界（单一事实源）
//
// 信任边界按「可注册域名（eTLD+1）」划分，不按路径也不按域名后缀的字面包含：
//   * 第一方：oceanleo.com 与其第一方子域（站点、编辑器、API）。
//   * 不可信：oceanleo.app 全域（用户生成站点/游戏/预览），以及仍残留在
//     .oceanleo.com 下的预览/沙箱子域（迁移期）。
// 会话 cookie 的 Domain=.oceanleo.com 且对同域 JS 可读，因此把 allow-same-origin
// 授予任何跑用户代码的域 = 直接交出全家桶身份。origin 校验只能证明「消息来自
// 该域」；那个域上跑的就是用户代码时，origin 合法 ≠ 消息可信。
//
// 本模块刻意零依赖：iframe 渲染面（含以 data: URL 编译加载的模块）都要能引它。

export const SANDBOX_ORIGIN_CONTRACT = "oceanleo.sandbox-origin.v1";

/** 用户生成内容的独立可注册域。永远不得视为第一方。 */
export const UNTRUSTED_CONTENT_REGISTRABLE_DOMAINS = ["oceanleo.app"] as const;

/**
 * 迁移期仍位于 .oceanleo.com 下的用户内容/预览子域。`website.oceanleo.com`
 * 本身是第一方站点编辑器；被排除的是它下面的 `p<port>-<32hex>` 预览主机。
 */
const UNTRUSTED_CONTENT_HOST_SUFFIXES = [
  ".website.oceanleo.com",
  ".preview.oceanleo.com",
  ".sandbox.oceanleo.com",
  ".usercontent.oceanleo.com",
] as const;

const UNTRUSTED_CONTENT_HOSTS = new Set([
  "preview.oceanleo.com",
  "sandbox.oceanleo.com",
  "usercontent.oceanleo.com",
]);

export function isUntrustedContentHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (UNTRUSTED_CONTENT_HOSTS.has(host)) return true;
  if (
    UNTRUSTED_CONTENT_REGISTRABLE_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`),
    )
  ) {
    return true;
  }
  return UNTRUSTED_CONTENT_HOST_SUFFIXES.some((suffix) =>
    host.endsWith(suffix),
  );
}

export function isUntrustedContentUrl(value: string): boolean {
  try {
    return isUntrustedContentHostname(new URL(value).hostname);
  } catch {
    // 解析不了的地址一律按不可信处理（fail closed）。
    return true;
  }
}

/**
 * 协议嵌入编辑器的写死白名单，与 `workbench-routes.ts` 的 `route.base` 字面量
 * 一一对应。只有命中本表的 base 才允许 allow-same-origin 沙箱；任何用户可控
 * URL 接进这条路径时会自动降级为不可信沙箱并拒绝加载。
 */
export const TRUSTED_EMBED_EDITOR_BASES = [
  "https://website.oceanleo.com/embed/site-editor",
  "https://design.oceanleo.com/embed/editor",
  "https://video.oceanleo.com/canvas-board",
] as const;

const TRUSTED_EMBED_EDITOR_BASE_SET = new Set<string>(
  TRUSTED_EMBED_EDITOR_BASES,
);

function normalizedEmbedBase(base: string): string {
  try {
    const url = new URL(base);
    if (url.search || url.hash || url.username || url.password) return "";
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

export function isTrustedEmbedEditorBase(base: string): boolean {
  const normalized = normalizedEmbedBase(base);
  return Boolean(normalized) && TRUSTED_EMBED_EDITOR_BASE_SET.has(normalized);
}

/** 允许作为 postMessage targetOrigin / event.origin 的编辑器 origin。 */
export const TRUSTED_EMBED_EDITOR_ORIGINS = [
  ...new Set(TRUSTED_EMBED_EDITOR_BASES.map((base) => new URL(base).origin)),
];

/** 不可信来源：给脚本，但绝不给同源。 */
export const UNTRUSTED_FRAME_SANDBOX =
  "allow-scripts allow-forms allow-popups allow-downloads";

/** 只读封面 frame：不需要表单/弹窗/下载。 */
export const COVER_FRAME_SANDBOX = "allow-scripts";

/**
 * PDF frame 的沙箱豁免标记。Chromium 的内建 PDF 查看器是插件式实现，
 * **任何** sandbox 属性（包括 `allow-scripts allow-same-origin`）都会让 PDF
 * 完全不渲染（crbug 413851）。因此 PDF frame 只能不加 sandbox，靠三件事兜底：
 *   1. src 恒为第一方签发的 rendition 地址，不接受用户可控 URL；
 *   2. `referrerPolicy="no-referrer"`，签名地址不经 Referer 外泄；
 *   3. PDF 是跨源文档，同源策略本身即阻止它触碰宿主 DOM 与 cookie。
 * 加沙箱前必须先换掉渲染方式（pdf.js 之类的纯 HTML 渲染器）。
 */
export const PDF_FRAME_SANDBOX_EXEMPTION = "sandbox-exempt: pdf-plugin";

/** 白名单协议编辑器：第一方代码，需要同源以完成 round-trip 保存。 */
export const TRUSTED_EMBED_EDITOR_SANDBOX =
  "allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals";

/** 第一方交互式产物（video_workflow HTML）。 */
export const TRUSTED_INTERACTIVE_VIEWER_SANDBOX =
  "allow-scripts allow-forms allow-popups allow-downloads allow-same-origin";

export function sandboxTokens(sandbox: string): Set<string> {
  return new Set(sandbox.toLowerCase().split(/\s+/).filter(Boolean));
}

/** allow-scripts + allow-same-origin 同时出现 = 沙箱失效。 */
export function sandboxGrantsScriptedSameOrigin(sandbox: string): boolean {
  const tokens = sandboxTokens(sandbox);
  return tokens.has("allow-scripts") && tokens.has("allow-same-origin");
}

export function embedEditorFrameSandbox(editorBase: string): string {
  return isTrustedEmbedEditorBase(editorBase)
    ? TRUSTED_EMBED_EDITOR_SANDBOX
    : UNTRUSTED_FRAME_SANDBOX;
}

export function webViewerFrameSandbox(trustedInteractive: boolean): string {
  return trustedInteractive
    ? TRUSTED_INTERACTIVE_VIEWER_SANDBOX
    : UNTRUSTED_FRAME_SANDBOX;
}

/**
 * 第一方交互式产物地址：必须是 https 的第一方 oceanleo.com 主机，且不得是
 * 预览/UGC 主机。域名后缀本身不构成信任依据。
 */
export function isTrustedInteractiveViewerUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (parsed.username || parsed.password) return false;
    if (parsed.protocol !== "https:" || parsed.port) return false;
    if (isUntrustedContentHostname(host)) return false;
    return host === "oceanleo.com" || host.endsWith(".oceanleo.com");
  } catch {
    return false;
  }
}
