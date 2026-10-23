// LeoBay「用 OceanLeo 账号登录应用」的接口客户端。
// 应用把访客带到 `https://oceanleo.com/bay?bay=app-login&client_id=…&redirect_uri=…&state=…&code_challenge=…`，
// 访客同意后带着一次性授权码回到应用；应用用授权码换一份只证明「这个人是谁」的身份凭证。
// 凭证只对这一个应用有效，里面的用户编号每个应用都不同，不能用来调用平台的任何接口。
// 网关路由 `/v1/bay/app-login*`（要登录）与 `/v1/bay/pub/login/*`（公开，给应用调）。本文件是合同。

import { bayDelete, bayGet, bayPost } from "./http";
import { bayQuery } from "./directory";

export interface BayAppLoginClient {
  app_id: string;
  /** 形如 `olapp_` 加 24 位小写字母数字；没开通过时是 null。 */
  client_id: string | null;
  login_enabled: boolean;
  /** 登录完成后允许回到的地址，最多 5 个，必须是 https 且主机名等于应用的主机名。 */
  redirect_uris: string[];
  /** 应用的地址，供界面预填一条回调地址。 */
  app_url: string;
  /** 授权页的完整地址前缀（不含查询参数），给作者抄进代码里。 */
  authorize_url: string;
  token_url: string;
  jwks_url: string;
  verify_url: string;
}

/** 授权页上给访客看的内容。 */
export interface BayAppLoginPreview {
  app: { id: string; title: string; summary: string; cover_url: string | null; url_host: string; author_name: string };
  /** 应用会得到什么。固定是这三样。 */
  shares: ("sub" | "name" | "avatar")[];
  /** 这个人以前同意过，这次可以直接继续。 */
  already_granted: boolean;
}

export interface BayAppLoginRequest {
  client_id: string;
  redirect_uri: string;
  state: string;
  code_challenge: string;
  /** 只接受 S256。 */
  code_challenge_method: "S256";
  nonce?: string;
}

export interface BayAppLoginGrant {
  app_id: string;
  app_title: string;
  app_url_host: string;
  cover_url: string | null;
  first_at: string | null;
  last_at: string | null;
}

export interface BayAppLoginUsersDay {
  day: string;
  new_users: number;
  active_users: number;
}

export interface BayAppLoginUsers {
  total: number;
  new_7d: number;
  active_30d: number;
  days: BayAppLoginUsersDay[];
}

const L = "/v1/bay/app-login";
const enc = encodeURIComponent;

/** 作者：这个应用的登录接入信息。 */
export function getBayAppLoginClient(appId: string): Promise<{ client: BayAppLoginClient }> {
  return bayGet(`${L}/apps/${enc(appId)}/client`);
}
/** 作者：开 / 关登录，改回调地址。第一次开通时网关生成 client_id。 */
export function saveBayAppLoginClient(appId: string, input: { login_enabled: boolean; redirect_uris: string[] }): Promise<{ client: BayAppLoginClient }> {
  return bayPost(`${L}/apps/${enc(appId)}/client`, input);
}
/** 授权页：核对应用发来的参数，拿到要给访客看的内容。参数不对时网关回 400 和一句说明。 */
export function previewBayAppLogin(params: { client_id: string; redirect_uri: string }): Promise<BayAppLoginPreview> {
  return bayGet(`${L}/authorize/preview${bayQuery(params)}`);
}
/** 访客点「同意并继续」：网关签发一次性授权码，返回要跳回应用的完整地址。 */
export function approveBayAppLogin(input: BayAppLoginRequest): Promise<{ redirect_to: string }> {
  return bayPost(`${L}/authorize`, input);
}
/** 我授权过的应用。 */
export function listMyBayAppLoginGrants(): Promise<{ items: BayAppLoginGrant[] }> {
  return bayGet(`${L}/mine/grants`);
}
/** 撤回对一个应用的授权；之后它要再让我同意一次。 */
export function revokeBayAppLoginGrant(appId: string): Promise<{ ok: boolean }> {
  return bayDelete(`${L}/mine/grants/${enc(appId)}`);
}
/** 作者：用 OceanLeo 账号登录过这个应用的人数。 */
export function getBayAppLoginUsers(appId: string, days = 30): Promise<BayAppLoginUsers> {
  return bayGet(`${L}/apps/${enc(appId)}/users${bayQuery({ days })}`);
}
