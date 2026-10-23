// 内容处置的网关客户端：带登录的请求走共享 UI 现成的 `authed`（同 `lib/bay/http.ts`）。
// 2026-10-23 leobay-projects 波 W09：取代门户 `lib/moderation/client.ts` 里的 `listMyCases / submitCounterNotice / submitAppeal`
// （那三个随旧面板删除；权利通知表单用的 `submitRightsNotice / getNoticeStatus` 仍留在门户）。

import { authed } from "../agent";
import {
  MODERATION_PATH,
  normalizeCase,
  normalizeCases,
  type AppealBody,
  type CounterNoticeBody,
  type OwnerCase,
} from "./case-model";

export class ModerationApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ModerationApiError";
    this.status = status;
  }
}

export type ModerationFailure = "unauthorized" | "not_found" | "invalid" | "network" | "other";

/** 错误归类；界面按类别选文案，不把网关的原话或 `HTTP 4xx` 亮给用户。 */
export function classifyModerationError(error: unknown): ModerationFailure {
  const status = (error as { status?: unknown } | null)?.status;
  if (status === 401) return "unauthorized";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "invalid";
  if (status === 0) return "network";
  return "other";
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const result = await authed<unknown>(path, init);
  if (!result.ok) throw new ModerationApiError(result.error || "请求失败", result.status ?? 0);
  return result.data;
}

function casePath(caseId: string, action: "counter-notice" | "appeal"): string {
  return `${MODERATION_PATH}/cases/${encodeURIComponent(caseId)}/${action}`;
}

/** 针对本人内容的全部案件（新的在前）。未登录 / 登录过期 → `ModerationApiError`（status 401）。 */
export async function listMyCases(): Promise<OwnerCase[]> {
  return normalizeCases(await call(`${MODERATION_PATH}/my-cases`));
}

/** 提交反通知。成功返回更新后的案件（status 已是 awaiting_counter）；响应里认不出案件时给 null，调用方照常重新取列表。 */
export async function submitCounterNotice(caseId: string, body: CounterNoticeBody): Promise<OwnerCase | null> {
  return normalizeCase(await call(casePath(caseId, "counter-notice"), { method: "POST", body: JSON.stringify(body) }));
}

/** 提交申诉。成功返回更新后的案件。 */
export async function submitAppeal(caseId: string, body: AppealBody): Promise<OwnerCase | null> {
  return normalizeCase(await call(casePath(caseId, "appeal"), { method: "POST", body: JSON.stringify(body) }));
}
