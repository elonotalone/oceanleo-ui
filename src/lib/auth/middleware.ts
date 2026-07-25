import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, cookieOptions, configured } from "./config";
import { isPrivateWorkspaceRuntime } from "./workspace-privacy";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

// Keeps the OceanLeo auth session valid on every request and re-writes the auth
// cookies scoped to .oceanleo.com so the session stays shared across all
// subdomains. Does NOT redirect — unauthenticated users may freely browse;
// login is prompted only when an AI action needs it.
//
// SESSION MODEL（2026-07-25 更正）：这里写的 cookie **不是 HttpOnly**。
// 本注释此前把它描述成「服务端下发的 httponly cookie」，那从来就不成立——共享的
// cookieOptions()（./config）没有 httpOnly，而且也不能有：@supabase/ssr 的
// createBrowserClient 必须能从 document.cookie 读同一份 session。
// 所以会话（access token + refresh token）对任何跑在 *.oceanleo.com 页面上的
// JS 都是可读的，**cookie 的 Domain 是唯一的保护**。不可信 / 用户生成内容
// 必须留在 oceanleo.com 之外（见 config.ts 顶部的 SESSION MODEL）。
//
// Same cookieOptions as the browser client (split-brain guard).
//
// PERFORMANCE (2026-06-16): this runs on EVERY navigation (Next.js routes every
// page request AND every <Link> RSC prefetch through middleware). The previous
// implementation called `supabase.auth.getUser()`, which makes a network
// round-trip to the Supabase Auth server on every single invocation — that is
// the well-known cause of slow page transitions across the *.oceanleo.com sites
// (supabase/supabase#20901, #30241). We switch to `getClaims()`, which verifies
// the JWT LOCALLY against the cached JWKS public key (no network round-trip) —
// our oceanleo Supabase signs tokens with ES256 (asymmetric), so local
// verification is fully supported. The browser-side @supabase/ssr client still
// auto-refreshes the token before it expires, so we don't lose session freshness
// by removing the per-request `getUser()` refresh here.
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!configured()) {
    return applyWorkspacePrivacyHeaders(
      applyColorSchemeHints(response),
      request,
    );
  }

  const host = request.headers.get("host");
  const opts = cookieOptions(host);

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: opts,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[], headers: Record<string, string> = {}) {
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...options, ...opts });
        });
        // @supabase/ssr 在刷新 token 时会连带下发一组 no-store 头，必须原样落到
        // response 上：带着 Set-Cookie 的响应一旦被 CDN/反代缓存，下一个访客就会
        // 拿到别人的 session。之前这个参数被整个忽略了。
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        if (Object.keys(headers).length > 0) {
          // 全家桶跑在 Vercel 上，边缘缓存另看这两个头，跟 applyWorkspacePrivacyHeaders 对齐。
          response.headers.set("CDN-Cache-Control", "private, no-store");
          response.headers.set("Vercel-CDN-Cache-Control", "private, no-store");
        }
      },
    },
  });

  // Validate the session locally (cached JWKS, no network) instead of the old
  // getUser() network call. failures are non-fatal — a logged-out visitor is a
  // normal state, not an error.
  try {
    await supabase.auth.getClaims();
  } catch {
    /* ignore — visitor may be signed out */
  }

  return applyWorkspacePrivacyHeaders(applyColorSchemeHints(response), request);
}

/**
 * 工作台会自动恢复 owner-scoped session，历史页更直接携带私有 session id；两者都
 * 不能被 CDN 缓存或搜索引擎收录。统一放在所有 OceanLeo 站都复用的 middleware，
 * 避免几十个动态 page 各自漏配 metadata。embed 视图同样属于私有运行时。
 */
export function applyWorkspacePrivacyHeaders(
  response: NextResponse,
  request: NextRequest,
): NextResponse {
  const pathname = request.nextUrl.pathname;
  const privateRuntime = isPrivateWorkspaceRuntime(
    pathname,
    request.nextUrl.searchParams.get("embed") === "1",
  );
  if (privateRuntime) {
    response.headers.set(
      "Cache-Control",
      "private, no-store, no-cache, max-age=0, must-revalidate",
    );
    response.headers.set("CDN-Cache-Control", "private, no-store");
    response.headers.set("Vercel-CDN-Cache-Control", "private, no-store");
    response.headers.set("Surrogate-Control", "no-store");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    // `/history/<sessionId>` 携带 owner-scoped 标识，不能通过外链 Referer 泄漏。
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  return response;
}

// ---------------------------------------------------------------------------
// 主题首帧防闪的服务端一半（配合 theme/server.ts 的 getThemeClass 读 CH）。
// ---------------------------------------------------------------------------
// 病根：主题 = auto（默认）时，SSR 无从得知系统偏好，只能先给 light，等首帧后
// <ThemeScript> 才用 matchMedia 校正 → 系统是暗色的用户「每次打开先闪一下亮色」。
//
// 修复：用 Client Hints 让浏览器把系统偏好带进【请求头】，SSR 首帧即可精确判定。
//   - Accept-CH: 声明本站接受 Sec-CH-Prefers-Color-Scheme 提示。
//   - Critical-CH: 标记它为「关键提示」——浏览器若本次请求还没带，会【立即重发】
//     一次并带上（而不是等下一次导航），所以【首次访问】也能拿到 → 首帧不闪。
//   - Vary: 让 CDN/浏览器缓存对不同配色方案分别缓存，避免暗色用户命中亮色缓存。
// 全家桶所有站的 middleware 都返回本函数处理过的 response，故一处声明、全站生效。
export function applyColorSchemeHints(response: NextResponse): NextResponse {
  const CH = "Sec-CH-Prefers-Color-Scheme";
  response.headers.set("Accept-CH", CH);
  response.headers.set("Critical-CH", CH);
  const vary = response.headers.get("Vary");
  response.headers.set("Vary", vary ? `${vary}, ${CH}` : CH);
  return response;
}
