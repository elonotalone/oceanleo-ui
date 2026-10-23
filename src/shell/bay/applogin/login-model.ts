// 授权页地址参数与回调地址表单的纯校验。地址里的参数全部不可信。
import type { BayAppLoginRequest } from "../../../lib/bay/app-login";

export const CLIENT_ID_RE = /^olapp_[a-z0-9]{24}$/;
export const CODE_CHALLENGE_RE = /^[A-Za-z0-9_-]{43,128}$/;
export const MAX_STATE = 512;
export const MAX_NONCE = 128;
export const MAX_REDIRECT_URIS = 5;
export const MAX_REDIRECT_URI_LEN = 512;

export type LoginRequestRead =
  | { ok: true; request: BayAppLoginRequest }
  | { ok: false };

function paramsOf(search: string): URLSearchParams {
  const text = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(text);
}

function first(params: URLSearchParams, name: string): string {
  return (params.get(name) ?? "").trim();
}

export function readLoginRequest(search: string): LoginRequestRead {
  const params = paramsOf(search);
  const client_id = first(params, "client_id");
  const redirect_uri = first(params, "redirect_uri");
  const state = first(params, "state");
  const code_challenge = first(params, "code_challenge");
  const code_challenge_method = first(params, "code_challenge_method");
  const nonce = first(params, "nonce");

  if (!CLIENT_ID_RE.test(client_id)) return { ok: false };
  let parsed: URL;
  try {
    parsed = new URL(redirect_uri);
  } catch {
    return { ok: false };
  }
  if (parsed.protocol !== "https:") return { ok: false };
  if (!state || state.length > MAX_STATE) return { ok: false };
  if (!CODE_CHALLENGE_RE.test(code_challenge)) return { ok: false };
  if (code_challenge_method !== "S256") return { ok: false };
  if (nonce.length > MAX_NONCE) return { ok: false };

  const request: BayAppLoginRequest = {
    client_id,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method: "S256",
  };
  if (nonce) request.nonce = nonce;
  return { ok: true, request };
}

function urlPort(url: URL): string {
  if (url.port) return url.port;
  if (url.protocol === "https:") return "443";
  if (url.protocol === "http:") return "80";
  return "";
}

/** 跳转目标必须与登记的回调地址同协议、主机、端口、路径；查询参数可以多 code / state。 */
export function sameRedirectTarget(redirectTo: string, redirectUri: string): boolean {
  try {
    const next = new URL(redirectTo);
    const registered = new URL(redirectUri);
    return (
      next.protocol === registered.protocol &&
      next.hostname.toLowerCase() === registered.hostname.toLowerCase() &&
      urlPort(next) === urlPort(registered) &&
      next.pathname === registered.pathname
    );
  } catch {
    return false;
  }
}

export function appHostFromUrl(appUrl: string): string {
  try {
    return new URL(appUrl.trim()).hostname;
  } catch {
    return "";
  }
}

/** 第一次打开且列表为空时：网站或软件的地址去掉末尾斜杠再加 `/`。 */
export function defaultRedirectUri(appUrl: string): string {
  const trimmed = appUrl.trim().replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
}

export function seedRedirectUris(appUrl: string, existing: string[]): string[] {
  if (existing.length > 0) return [...existing];
  const seeded = defaultRedirectUri(appUrl);
  return seeded ? [seeded] : [];
}

export function redirectUriProblem(uri: string, appHost: string): string | null {
  const value = uri.trim();
  if (!value) return "请填写回调地址";
  if (value.length > MAX_REDIRECT_URI_LEN) return "回调地址不能超过 512 个字符";
  if (value.includes("#")) return "回调地址不能带 # 片段";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "回调地址无效";
  }
  if (parsed.protocol !== "https:") return "回调地址必须是 https 开头";
  if (parsed.hash) return "回调地址不能带 # 片段";
  if (appHost && parsed.hostname.toLowerCase() !== appHost.toLowerCase()) {
    return "回调地址的主机名必须和上架的网址一致";
  }
  return null;
}

export function redirectUrisProblem(uris: string[], appHost: string, loginEnabled: boolean): string | null {
  const cleaned = uris.map((item) => item.trim()).filter(Boolean);
  if (uris.length > MAX_REDIRECT_URIS || cleaned.length > MAX_REDIRECT_URIS) return "最多 5 个回调地址";
  if (loginEnabled && cleaned.length === 0) return "开通登录至少要有一个回调地址";
  for (const uri of uris) {
    const problem = redirectUriProblem(uri, appHost);
    if (problem) return problem;
  }
  return null;
}

export function sdkScriptUrl(tokenUrl: string): string {
  return tokenUrl.replace(/\/token\/?$/, "/sdk.js");
}

export function loginSampleCode(clientId: string, redirectUri: string, sdkUrl: string): string {
  const id = JSON.stringify(clientId);
  const uri = JSON.stringify(redirectUri);
  const src = JSON.stringify(sdkUrl);
  return [
    `<script src=${src}></script>`,
    "<script>",
    "OceanLeoLogin.start({",
    `  clientId: ${id},`,
    `  redirectUri: ${uri}`,
    "});",
    "</script>",
    "",
    "<!-- callback page -->",
    `<script src=${src}></script>`,
    "<script>",
    "OceanLeoLogin.finish({",
    `  clientId: ${id},`,
    `  redirectUri: ${uri}`,
    "}).then(function (result) {",
    "  console.log(result.idToken, result.claims);",
    "});",
    "</script>",
  ].join("\n");
}

export function redirectHost(redirectUri: string): string {
  try {
    return new URL(redirectUri).hostname;
  } catch {
    return "";
  }
}
