// LeoBay 作品的「更新日志」与「关注」接口客户端：作者写每次更新了什么，访客关注作品，更新时收到站内通知。
// 网关路由 `/v1/bay/app-releases*`。字段名与网关出参逐字一致，本文件是合同。

import { bayDelete, bayGet, bayPatch, bayPost } from "./http";
import { bayQuery } from "./directory";
import type { BayApp } from "./apps";

export interface BayAppRelease {
  id: string;
  app_id: string;
  /** 作者自己写的版本号，可以为空。 */
  version: string;
  title: string;
  body: string;
  created_at: string | null;
}

export interface BayAppReleasePage {
  items: BayAppRelease[];
  next_offset: number | null;
  follower_count: number;
  /** 当前登录的人是否关注了这个作品；没登录是 false。 */
  viewer_following: boolean;
}

export interface BayAppReleaseInput {
  version?: string;
  title: string;
  body: string;
  /** 发布时给关注的人发一条站内通知。每个作品每 24 小时最多通知一次。 */
  notify?: boolean;
}

export interface BayFollowedApp {
  app: BayApp;
  followed_at: string | null;
  latest_release: BayAppRelease | null;
}

const R = "/v1/bay/app-releases";
const enc = encodeURIComponent;

export function listBayAppReleases(appId: string, params: { offset?: number; limit?: number } = {}, signal?: AbortSignal): Promise<BayAppReleasePage> {
  return bayGet(`${R}/apps/${enc(appId)}${bayQuery(params)}`, { anonymous: true, signal });
}
/** 作者发一条更新。`notified` = 这次真的给关注的人发了通知的人数（被限流时是 0）。 */
export function createBayAppRelease(appId: string, input: BayAppReleaseInput): Promise<{ release: BayAppRelease; notified: number }> {
  return bayPost(`${R}/apps/${enc(appId)}`, input);
}
export function updateBayAppRelease(releaseId: string, patch: { version?: string; title?: string; body?: string }): Promise<{ release: BayAppRelease }> {
  return bayPatch(`${R}/${enc(releaseId)}`, patch);
}
export function deleteBayAppRelease(releaseId: string): Promise<{ ok: boolean }> {
  return bayDelete(`${R}/${enc(releaseId)}`);
}
export function followBayApp(appId: string): Promise<{ following: boolean; follower_count: number }> {
  return bayPost(`${R}/apps/${enc(appId)}/follow`);
}
export function unfollowBayApp(appId: string): Promise<{ following: boolean; follower_count: number }> {
  return bayDelete(`${R}/apps/${enc(appId)}/follow`);
}
/** 我关注的作品，最近更新的在前。 */
export function listFollowedBayApps(): Promise<{ items: BayFollowedApp[] }> {
  return bayGet(`${R}/mine/following`);
}
