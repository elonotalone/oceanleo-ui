/**
 * JWKS / getClaims 遇到 5xx 时，@supabase/auth-js 会按可重试错误在
 * AUTO_REFRESH_TICK_DURATION_MS（30 秒）里退避，中间件每个导航都卡住。
 * 只有 JWKS 改写成 401：getClaims 当「这次验不了」处理，不重试、不 overlay。
 *
 * /user 和 token 续期绝对不能走这条路。401 会被当成会话作废，cookie 清空，
 * 人就退出登录。那两条的 5xx / 网络抖动原样返回（或 503）。
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

/** GET /auth/v1/user. supabase-js treats 401 here as SIGNED_OUT. */
export function isAuthUserRequest(input: RequestInfo | URL): boolean {
  return /\/auth\/v1\/user(?:\?|$)/i.test(authRequestUrl(input));
}

/** Cached JWKS. 401 here only fails this getClaims tick. */
export function isAuthJwksRequest(input: RequestInfo | URL): boolean {
  return /\/\.well-known\/jwks\.json(?:\?|$)/i.test(authRequestUrl(input));
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
  // GoTrue can answer a refresh with 401 while another first-party origin is
  // rotating the same shared refresh token.  Passing that response through
  // makes auth-js treat a recoverable race as a revoked session and clear the
  // Domain=.oceanbizs.com cookie for every subsite.  A real invalid refresh
  // token is returned as 400/invalid_grant, so keep that explicit revocation
  // path intact and soften only this refresh-specific 401.
  if (isAuthRefreshRequest(input) && res.status === 401) {
    return unavailableResponse(503);
  }
  if (!isTransientAuthStatus(res.status)) return res;
  if (isAuthJwksRequest(input)) return unavailableResponse(401);
  return res;
}

function transientFailure(input: RequestInfo | URL): Response {
  return isAuthJwksRequest(input) ? unavailableResponse(401) : unavailableResponse(503);
}

export async function authFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  boundCallback = false,
): Promise<Response> {
  const doFetch = getClientHostConfig() ? (hostInjectedFetch() ?? fetch) : fetch;
  // A one-time callback must finish before another login can start. Race the
  // transport as well as aborting it: injected fetch implementations may ignore
  // AbortSignal, and a late response must never reach SDK session persistence.
  if (boundCallback && /\/token\?[^#]*grant_type=pkce(?:&|$)/i.test(authRequestUrl(input))) {
    if (init?.signal?.aborted) return unavailableResponse(408);
    const controller = new AbortController();
    const abort = () => controller.abort();
    init?.signal?.addEventListener("abort", abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async () => {
          const response = await doFetch(input, { ...init, signal: controller.signal });
          // Include body consumption: fetch may return headers while the body
          // never completes. SDK must never see that late body after timeout.
          return new Response(await response.arrayBuffer(), {
            status: response.status, statusText: response.statusText, headers: response.headers,
          });
        })(),
        new Promise<Response>((resolve) => {
          controller.signal.addEventListener("abort", () => resolve(unavailableResponse(408)), { once: true });
        }),
        new Promise<Response>((resolve) => {
          timer = setTimeout(() => {
            controller.abort();
            // A terminal callback failure must not enter the SDK refresh retry loop.
            resolve(unavailableResponse(408));
          }, 10_000);
        }),
      ]);
    } catch {
      return unavailableResponse(408);
    } finally {
      if (timer) clearTimeout(timer);
      init?.signal?.removeEventListener("abort", abort);
    }
  }
  if (init?.signal?.aborted) return transientFailure(input);
  try {
    const res = await doFetch(input, init);
    return softenTransient(input, res);
  } catch {
    return transientFailure(input);
  }
}
