// LeoBay「云电脑上的应用的公开网址」接口客户端。
// 带后台的应用跑在作者自己的云电脑上；平台只给它一个公开网址 `https://<名字>--live.oceanleo.app`，
// 访客的请求由网关沿云电脑已经连出来的通道送到那台机器的 127.0.0.1:<端口>。平台不代跑任何代码。
// 网关路由 `/v1/bay/app-endpoints*`。字段名与网关出参逐字一致，本文件是合同。

import { bayDelete, bayGet, bayPatch, bayPost } from "./http";

export interface BayEndpointComputer {
  id: string;
  name: string;
  /** 这台云电脑现在连着网关。 */
  online: boolean;
  /** 能用来放应用：已接入、没欠费、没停机。不能时 `blocked_reason` 是一句说明。 */
  usable: boolean;
  blocked_reason: string;
}

export interface BayAppEndpoint {
  id: string;
  computer_id: string;
  computer_name: string;
  port: number;
  slug: string;
  /** 公开网址，永远落在用户内容域。 */
  url: string;
  /** active = 对外服务；off = 作者关掉了，访客看到「这个应用暂时没有开放」。 */
  status: "active" | "off";
  /** 被哪个作品用着；还没上架成作品时是 null。 */
  app_id: string | null;
  last_ok_at: string | null;
  last_error: string | null;
  created_at: string | null;
}

export interface BayEndpointCheck {
  ok: boolean;
  /** 应用回的 HTTP 状态码；连不上时是 null。 */
  status_code: number | null;
  /** 连不上时的一句说明（例如「云电脑不在线」「这个端口上没有程序在听」）。 */
  error: string | null;
  endpoint: BayAppEndpoint;
}

const E = "/v1/bay/app-endpoints";
const enc = encodeURIComponent;

/** 我名下能选的云电脑。一台都没有时界面引导去「设置 → 我的设备」。 */
export function listBayEndpointComputers(): Promise<{ items: BayEndpointComputer[] }> {
  return bayGet(`${E}/computers`);
}
export function listMyBayAppEndpoints(): Promise<{ items: BayAppEndpoint[]; limit: number }> {
  return bayGet(`${E}/mine`);
}
/** 给云电脑上的一个端口开公开网址。`slug` 不填时网关生成；被占用时回 409。 */
export function createBayAppEndpoint(input: { computer_id: string; port: number; slug?: string }): Promise<{ endpoint: BayAppEndpoint }> {
  return bayPost(E, input);
}
/** 现在就从网关访问一次应用的首页，告诉作者通不通。 */
export function checkBayAppEndpoint(endpointId: string): Promise<BayEndpointCheck> {
  return bayPost(`${E}/${enc(endpointId)}/check`);
}
export function updateBayAppEndpoint(endpointId: string, patch: { status: "active" | "off" }): Promise<{ endpoint: BayAppEndpoint }> {
  return bayPatch(`${E}/${enc(endpointId)}`, patch);
}
/** 删除公开网址；用着它的作品自动下架。 */
export function deleteBayAppEndpoint(endpointId: string): Promise<{ ok: boolean }> {
  return bayDelete(`${E}/${enc(endpointId)}`);
}
