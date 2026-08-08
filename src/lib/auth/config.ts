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
//
// ---------------------------------------------------------------------------
// 域名家族（2026-08-08，境内版落地）
// ---------------------------------------------------------------------------
// 同一份代码要同时服务 oceanleo.com（海外）与 oceanleo.cn（境内），而两边的
// 登录态必须永不串门。做法不是在这里加一个 `.cn` 分支，而是把「共享会话的
// 可注册域」从一个字面量换成 lib/domain-family.ts 里的一张写死的家族表：
// 每次判定先由请求 host 定出**至多一个**家族，再在那一行里取 cookie 域。
// 家族之间没有回落分支，所以「.com 的会话落到 .cn」在实现层面无法表达。
// 用户内容域（oceanleo.app / leoapp.cn）不属于任何家族，一律 host-only。

import {
  currentDomainProfile,
  domainProfileForHost,
  familyForHost,
} from "../domain-family";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_OCEANLEO_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_OCEANLEO_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

// 网关 origin。env 仍然优先；没给时按**当前家族**取，海外与本地开发解析出来
// 的仍然是 https://api.oceanleo.com（与本轮改动前逐字相同）。
export const GATEWAY_BASE =
  process.env.NEXT_PUBLIC_OCEANLEO_GATEWAY_URL ||
  process.env.NEXT_PUBLIC_GATEWAY_URL ||
  currentDomainProfile().gatewayOrigin;

// 跨子站 cookie 的 Domain。缺省不再是一个写死的字面量，而是**请求 host 所属
// 家族**那一行的 cookieDomain：`.com` host 得到 `.oceanleo.com`，
// `.cn` host 得到 `.oceanleo.cn`，别的 host 什么都得不到。
//
// env 覆盖是运维口子，不是信任边界的口子：它只能在**同一个家族内**改写
// （例如收窄到某个子域），指到别的家族或用户内容域一律 fail closed。
// 注意 env 存在但只有空白 = 显式关掉共享域（host-only），与改动前一致。
const COOKIE_DOMAIN_ENV = process.env.NEXT_PUBLIC_OCEANLEO_COOKIE_DOMAIN;
const COOKIE_DOMAIN_OVERRIDE = (COOKIE_DOMAIN_ENV || "").trim();
const COOKIE_DOMAIN_ENV_PRESENT = Boolean(COOKIE_DOMAIN_ENV);

/**
 * 该 host 应当拿到的 cookie Domain；拿不准一律 `undefined`（host-only）。
 *
 * 必须成立的性质（tests/auth-session-model.test.mjs 逐条锁死）：
 *   1. `.com` 家族的 host 只可能拿到 `.oceanleo.com`；
 *   2. `.cn` 家族的 host 只可能拿到 `.oceanleo.cn`；
 *   3. 两个家族之间没有任何一条互相拿到对方 cookie 域的路径；
 *   4. 用户内容域 `oceanleo.app` 与 `leoapp.cn` 都拿 host-only；
 *   5. 形似域（notoceanleo.com / evil-oceanleo.cn / oceanleo.cn.evil.com）
 *      与 localhost / 预览域一律 host-only。
 *
 * 判定入口只有 familyForHost() 一个，它对每个 host 至多给出一个家族，
 * 且没有「认不出来就当 .com」的回落 —— 那个回落正是家族串门的唯一可能来源。
 */
export function cookieDomainFor(host: string | null | undefined): string | undefined {
  const family = familyForHost(host);
  if (!family) return undefined;
  if (COOKIE_DOMAIN_ENV_PRESENT && !COOKIE_DOMAIN_OVERRIDE) return undefined;
  if (!COOKIE_DOMAIN_OVERRIDE) return domainProfileForHost(host).cookieDomain;
  // 纵深防御：env 覆盖必须落在**这个 host 自己的家族**里。指到别的家族时浏览器
  // 本就会丢弃该 cookie；指到用户内容域则是把会话送给不可信页面。两种都 fail closed。
  if (familyForHost(COOKIE_DOMAIN_OVERRIDE.replace(/^\./, "")) !== family) {
    return undefined;
  }
  return COOKIE_DOMAIN_OVERRIDE;
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
