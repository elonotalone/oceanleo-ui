// leo 在会话里的网关调用与纯函数（work-chat W06，契约 §4.6、§9.9）。
// 只依赖 W08 的 `imFetch`、`ImApiError`（lib/im/client.ts）。
import { imFetch } from "./client";

/** 输入框上的付款人选择；`null` = 没选 = 个人钱包。 */
export interface LeoPayerChoice {
  kind: "personal" | "team";
  org_id: string | null;
}

export interface LeoTeamPayerOption {
  kind: "team";
  org_id: string;
  name: string;
  allowed: boolean;
}

export type LeoPayerOption = { kind: "personal" } | LeoTeamPayerOption;

export interface LeoStatus {
  enabled: boolean;
  payer_options: LeoPayerOption[];
  default_payer: "personal" | "team";
}

export const PERSONAL_CHOICE: LeoPayerChoice = Object.freeze({ kind: "personal", org_id: null });

export function fetchLeoStatus(conversationId: string): Promise<LeoStatus> {
  return imFetch<LeoStatus>(`/v1/im/leo/status?conversation_id=${encodeURIComponent(conversationId)}`);
}

export function cancelLeo(messageId: string): Promise<{ ok: boolean; status: string }> {
  return imFetch<{ ok: boolean; status: string }>("/v1/im/leo/cancel", {
    method: "POST",
    json: { message_id: messageId },
  });
}

/** 状态里的 Team 钱包选项；没有（个人会话 / 非 Team 群）返回 null。 */
export function teamOption(status: LeoStatus | null | undefined): LeoTeamPayerOption | null {
  const found = status?.payer_options?.find((option) => option.kind === "team");
  return found && found.kind === "team" ? found : null;
}

/**
 * 进入 Team 群 @leo 时的初始付款人：本会话里选过的 > 全站「这次谁付钱」记住的就是这个 Team > 后端默认 > 个人。
 * 个人钱包永远是兜底：这里绝不替人默认花公司的钱，除非他自己在别处选过这个 Team。
 */
export function initialPayerChoice(input: {
  option: LeoTeamPayerOption;
  defaultPayer?: "personal" | "team";
  remembered: string;
  chosenHere?: "personal" | "team" | null;
}): LeoPayerChoice {
  const { option, defaultPayer, remembered, chosenHere } = input;
  if (!option.allowed) return PERSONAL_CHOICE;
  const kind =
    chosenHere ?? (remembered && remembered === option.org_id ? "team" : defaultPayer ?? "personal");
  return kind === "team" ? { kind: "team", org_id: option.org_id } : PERSONAL_CHOICE;
}

/** 发消息时随请求带的字段：只有选了 Team 钱包才带 `leo_payer_org_id`。 */
export function payerRequestField(value: LeoPayerChoice | null): { leo_payer_org_id?: string } {
  return value && value.kind === "team" && value.org_id ? { leo_payer_org_id: value.org_id } : {};
}

// ---- 我是谁（只用来判断「停止」按钮该不该出现）-----------------------------------
let mePromise: Promise<string | null> | null = null;

export function fetchMyUserId(): Promise<string | null> {
  if (!mePromise) {
    mePromise = imFetch<{ profile?: { user_id?: string } }>("/v1/im/me")
      .then((me) => me?.profile?.user_id ?? null)
      .catch(() => {
        mePromise = null;
        return null;
      });
  }
  return mePromise;
}

export function resetMyUserIdForTests(): void {
  mePromise = null;
}
