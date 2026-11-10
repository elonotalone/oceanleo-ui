// leo 在会话里的网关调用与纯函数（work-chat W06，契约 §4.6、§9.9）。
// 只依赖 W08 的 `imFetch`、`ImApiError`（lib/im/client.ts）。
import { imFetch } from "./client";
import { persistedPayerOrgId } from "../payer";

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

export function fetchLeoStatus(conversationId: string): Promise<LeoStatus> {
  return imFetch<LeoStatus>(`/v1/im/leo/status?conversation_id=${encodeURIComponent(conversationId)}`);
}

export function cancelLeo(messageId: string): Promise<{ ok: boolean; status: string }> {
  return imFetch<{ ok: boolean; status: string }>("/v1/im/leo/cancel", {
    method: "POST",
    json: { message_id: messageId },
  });
}

/** Read the account identity for every Leo send; composers never choose a wallet. */
export function payerRequestField(): { leo_payer_org_id?: string } {
  const orgId = persistedPayerOrgId();
  return orgId ? { leo_payer_org_id: orgId } : {};
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
