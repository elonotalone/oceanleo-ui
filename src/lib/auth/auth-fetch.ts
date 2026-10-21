/**
 * JWKS / getClaims 遇到 5xx 时，@supabase/auth-js 会按可重试错误在
 * AUTO_REFRESH_TICK_DURATION_MS（30 秒）里退避，中间件每个导航都卡住。
 * 那一类请求改写成 401：getClaims 当「这次验不了」处理，不重试、不 overlay。
 *
 * Token 续期绝对不能走这条路。401 会被当成 refresh token 作废，cookie 清空，
 * 人就退出登录。续期的 5xx / 网络抖动原样返回（或 503），让上游重试并保留会话。
 *
 * 浏览器路径不再套 2500ms 超时：CORS 到 auth.oceanleo.com 慢一拍就会误报 401，
 * 宿主模式早就因此去掉了超时，oceanbizs.com 网页之前漏了。
 */
import { getClientHostConfig, hostInjectedFetch } from "../../contracts/client-host-config";

const TRANSIENT_AUTH_STATUS = new Set([
  500, 501, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 528, 529, 530,
]);

function authRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return String(input);
}

/** Refresh-token POST. A fake 401 here signs the browser out. */
export function isAuthRefreshRequest(input: RequestInfo | URL): boolean {
  const url = authRequestUrl(input);
  return /\/token(?:\?|$)/i.test(url) || /grant_type=refresh_token/i.test(url);
}

function unavailableResponse(status = 401): Response {
  return new Response(
    JSON.stringify({
      error: "auth_unavailable",
      msg: "login service unavailable",
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

export function isTransientAuthStatus(status: number): boolean {
  return TRANSIENT_AUTH_STATUS.has(status);
}

function softenTransient(input: RequestInfo | URL, res: Response): Response {
  if (!isTransientAuthStatus(res.status)) return res;
  if (isAuthRefreshRequest(input)) return res;
  return unavailableResponse(401);
}

function transientFailure(input: RequestInfo | URL): Response {
  return isAuthRefreshRequest(input) ? unavailableResponse(503) : unavailableResponse(401);
}

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const doFetch = getClientHostConfig() ? (hostInjectedFetch() ?? fetch) : fetch;
  if (init?.signal?.aborted) return transientFailure(input);
  try {
    const res = await doFetch(input, init);
    return softenTransient(input, res);
  } catch {
    return transientFailure(input);
  }
}
