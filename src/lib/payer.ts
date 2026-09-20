// ============================================================================
// @oceanleo/ui — 付费主体（这次谁付钱）的唯一取法
// ----------------------------------------------------------------------------
// PayerSelector 把人选的组织写进 localStorage；三条发送路径和所有组
// `/v1/agent/tasks` 请求体的地方只许从这里读，字段名固定 `org_id`。
// 空串 = 个人钱包（网关 `resolve_payer(user_id, requested_org_id="")`）。
// ============================================================================

/** 上次选的付费主体。存的是 `org_id`；个人钱包**不写**这个键（直接删掉）。 */
export const PAYER_LAST_KEY = "oceanleo.payer.last";

/** 个人钱包的哨兵值。空串就是网关那边的「个人」含义，不另起一套。 */
export const PERSONAL_PAYER = "";

function localStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // 隐私模式 / 第三方 cookie 被禁时 localStorage 会抛。记不住不是错误。
    return null;
  }
}

/**
 * PayerSelector 持久化的 org_id；个人钱包 = ""。只读 localStorage，SSR 下返回 ""。
 */
export function persistedPayerOrgId(): string {
  const store = localStorageOrNull();
  if (!store) return PERSONAL_PAYER;
  return store.getItem(PAYER_LAST_KEY) || PERSONAL_PAYER;
}

/**
 * 把这次选择写进 localStorage。个人钱包删键，不写空串。
 * 选择器是唯一写入方；发送路径只读。
 */
export function persistPayerOrgId(orgId: string): void {
  const store = localStorageOrNull();
  if (!store) return;
  if (orgId) store.setItem(PAYER_LAST_KEY, orgId);
  else store.removeItem(PAYER_LAST_KEY);
}

/**
 * 直接展开进请求体：`{ ...body, ...payerRequestFields() }`。恒返回 `{ org_id: string }`。
 * 显式传了（含 `""`）用显式；没传用持久化的选择。
 */
export function payerRequestFields(explicitOrgId?: string): { org_id: string } {
  const orgId =
    explicitOrgId !== undefined ? explicitOrgId : persistedPayerOrgId();
  return { org_id: orgId || PERSONAL_PAYER };
}
