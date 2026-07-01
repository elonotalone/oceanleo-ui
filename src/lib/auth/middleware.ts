import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, cookieOptions, configured } from "./config";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

// Keeps the OceanLeo auth session valid on every request and re-writes the auth
// cookies (httponly, server-set) scoped to .oceanleo.com so the session stays
// shared across all subdomains. Does NOT redirect — unauthenticated users may
// freely browse; login is prompted only when an AI action needs it.
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
  if (!configured()) return applyColorSchemeHints(response);

  const host = request.headers.get("host");
  const opts = cookieOptions(host);

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: opts,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...options, ...opts });
        });
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

  applyColorSchemeHints(response);
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
