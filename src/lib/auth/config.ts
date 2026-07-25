// OceanLeo shared identity — single source of cookie/SSO configuration.
//
// CRITICAL: browser client, server client, AND middleware must all use the
// SAME cookieOptions, or sessions split-brain (one path sets a cookie scoped
// to .oceanleo.com, another sets a host-only cookie, and they fight). This
// module is that single source. See
// docs/architecture/oceanleo-cross-subdomain-sso.md (oceandino repo).
//
// ---------------------------------------------------------------------------
// SESSION MODEL — 读完再改（2026-07-25 如实修订）
// ---------------------------------------------------------------------------
// 本会话 cookie **不是 HttpOnly，也不可能是**。`@supabase/ssr` 的
// createBrowserClient 通过 `document.cookie` 读写 session（见 client.ts），
// 上游 DEFAULT_COOKIE_OPTIONS 里就明写着 `httpOnly: false`。因此：
//
//   任何跑在 *.oceanleo.com 页面上的 JS 都能读到完整会话 —— access token
//   **和 refresh token**（refresh token 意味着可长期续期的持久身份）。
//
// 结论：**cookie 的 Domain 是唯一的保护边界**。`.oceanleo.com` 之下的每一个
// 页面都等同于对会话完全可信的第一方代码。用户生成内容 / 不可信内容绝不能
// 挂在 *.oceanleo.com 上（它属于 oceanleo.app —— 另一个可注册域，浏览器天然
// 不会把本 cookie 发过去、也不允许它读）。
//
// 不要「为了更安全」在这里把 httpOnly 打开：那会让浏览器客户端读不到
// session，31 个站一起变成登不上的状态，而不是变安全。
// 本模型由 tests/auth-session-model.test.mjs 锁死。

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_OCEANLEO_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_OCEANLEO_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  "https://api.oceanleo.com";

// The parent domain that all *.oceanleo.com subdomains share. Setting the auth
// cookie's Domain to this makes one login on ANY subdomain visible to ALL of
// them — the whole point of the OceanLeo "全家桶" SSO.
// 注意：留空并**不会**得到 host-only —— 空值会回落到默认 `.oceanleo.com`。
// localhost / 预览域之所以是 host-only，靠的是 cookieDomainFor() 的 host 判定。
const RAW_COOKIE_DOMAIN = (
  process.env.NEXT_PUBLIC_OCEANLEO_COOKIE_DOMAIN || ".oceanleo.com"
).trim();

// 共享会话的唯一可注册域（eTLD+1）。写死是刻意的：它是信任边界，不是可调参数。
// 尤其不得改成 / 扩展到 `oceanleo.app` —— 那是用户生成内容域，把它纳入共享
// cookie 域等于把全家桶身份直接交给不可信页面。
const SSO_REGISTRABLE_DOMAIN = "oceanleo.com";

function isUnderSsoDomain(host: string): boolean {
  return host === SSO_REGISTRABLE_DOMAIN || host.endsWith(`.${SSO_REGISTRABLE_DOMAIN}`);
}

// Only apply a cross-subdomain Domain on real oceanleo.com hosts. On localhost
// / vercel preview hosts we must NOT send Domain=.oceanleo.com (the browser
// would silently drop the cookie), so we fall back to host-only there.
//
// 判定必须是「等于 oceanleo.com 或以 .oceanleo.com 结尾」——不能用裸
// `endsWith("oceanleo.com")`，那会把 `notoceanleo.com` / `evil-oceanleo.com`
// 这类不同注册域也算进来。任何拿不准的 host 一律 fail closed 到 host-only。
export function cookieDomainFor(host: string | null | undefined): string | undefined {
  const h = (host || "").split(":")[0].toLowerCase().replace(/\.$/, "");
  if (!RAW_COOKIE_DOMAIN) return undefined;
  // localhost、*.vercel.app、*.oceanleo.app（用户内容域）与各种形似域：host-only。
  if (!isUnderSsoDomain(h)) return undefined;
  // 纵深防御：env 覆盖也必须落在同一个可注册域内。指到别的域时浏览器本就会丢弃
  // 该 cookie；而指到用户内容域则是把会话送给不可信页面。两种都 fail closed。
  const parent = RAW_COOKIE_DOMAIN.replace(/^\./, "").toLowerCase();
  if (!isUnderSsoDomain(parent)) return undefined;
  return RAW_COOKIE_DOMAIN;
}

// Shared cookie options. `domain` is filled in per-request from the Host header
// (server/middleware) or window.location.host (browser).
export function cookieOptions(host: string | null | undefined) {
  const domain = cookieDomainFor(host);
  return {
    ...(domain ? { domain } : {}),
    path: "/",
    // `lax` 而不是 `strict`：strict 会让「从站外顶层导航回来的第一跳」不带
    // cookie —— 微信扫码登录回跳（gateway /v1/auth/wechat/callback）、邮件
    // 确认链接、外链进站都会显示成未登录。跨 *.oceanleo.com 子域属同站，
    // 与 SSO 无关，所以 strict 只有代价没有收益。
    sameSite: "lax" as const,
    secure: true,
    // 显式写出、不是漏写：见文件顶部 SESSION MODEL。浏览器客户端必须能从
    // document.cookie 读到它，改成 true 会直接让全家桶登不上。
    httpOnly: false,
  };
}

export function configured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
