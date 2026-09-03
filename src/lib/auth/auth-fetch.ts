/**
 * 登录服务不可用时，@supabase/auth-js 会把 502/503/504 当成可重试错误，
 * 在 AUTO_REFRESH_TICK_DURATION_MS（30 秒）里指数退避。中间件每个请求都
 * 走 getClaims()（要拉 JWKS），于是整页卡半分钟；浏览器侧再 console.error
 * 一次 AuthRetryableFetchError，Next 16 的 dev overlay 把它当成整页故障。
 *
 * 登录挂了不该挡住打开页面。5xx / 超时改写成 401：supabase-js 当「未登录」
 * 处理，不重试、不 overlay。access token 若还在有效期内，上游会保留会话
 * （_callRefreshToken 的 proactive-preserve）；只有 token 已经过期才会清掉。
 *
 * 没选的路：只跳过陈列馆的 middleware（Image 工作台照样红字）；伪造 200
 * 会话（会写成登录成功）。
 */
export const AUTH_FETCH_TIMEOUT_MS = 2500;

const TRANSIENT_AUTH_STATUS = new Set([
  500, 501, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530,
]);

function unavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      error: "auth_unavailable",
      msg: "login service unavailable",
    }),
    {
      status: 401,
      headers: { "content-type": "application/json" },
    },
  );
}

export function isTransientAuthStatus(status: number): boolean {
  return TRANSIENT_AUTH_STATUS.has(status);
}

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const ac = new AbortController();
  const parent = init?.signal;
  if (parent?.aborted) return unavailableResponse();
  const onParentAbort = () => ac.abort();
  parent?.addEventListener("abort", onParentAbort, { once: true });
  const timer = setTimeout(() => ac.abort(), AUTH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(input, { ...init, signal: ac.signal });
    if (isTransientAuthStatus(res.status)) return unavailableResponse();
    return res;
  } catch {
    return unavailableResponse();
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}
