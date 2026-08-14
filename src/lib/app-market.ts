"use client";

// ============================================================================
// @oceanleo/ui — 应用市场客户端（跨站成品 app 的单一事实源）
// ----------------------------------------------------------------------------
// 网关（oceanleo/backend/app/routers/app_catalog_router.py）：
//   GET    /v1/apps?site_id=&scene=&q=&limit=&offset=  → { items, total }（公开，
//          带 token 时逐条标注 installed）
//   GET    /v1/apps/scenes                             → { items: [{scene,count}] }
//   GET    /v1/apps/mine                               → { items }（需登录）
//   POST   /v1/apps/mine       { app_id }              → 装到「我的」（需登录）
//   DELETE /v1/apps/mine/{app_id}                      → 从「我的」卸掉（需登录）
//
// 写法照 ./agent.ts 的 listAgents / authed（同一 GATEWAY_BASE、同一 token 取法），
// 但返回形状不同：本模块**成功返回数据、失败抛异常**，因为调用方（AppMarket、
// W04 的 MyAppsRail）要的是「装/卸失败就回滚 + 给一句人话」，异常比 result 对象
// 更难被忽略。
//
// 未登录的两种处理是分开的：
//   - 列表 / 场景 / 搜索：照常可用（不带 Authorization），用户没登录也能逛市场；
//   - 我的 / 装 / 卸：抛出 `name === "MarketAuthError"` 的 Error，调用方据此引导
//     登录，而不是弹一个 HTTP 401。
// ============================================================================

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

export type MarketApp = {
  app_id: string; site_id: string; app_key: string; name: string;
  tagline: string; icon: string; category: string; scenes: string[];
  site_url: string; open_path: string; sort_order: number; installed: boolean;
};

/** 未登录时抛出的 Error 的 name。调用方用它区分「要引导登录」和「真出错了」。 */
const AUTH_ERROR_NAME = "MarketAuthError";

function authError(): Error {
  const err = new Error("未登录");
  err.name = AUTH_ERROR_NAME;
  return err;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 后端字段缺失时不让 UI 崩：每个字段都收敛到接口 C 声明的类型。 */
function toMarketApp(raw: unknown): MarketApp {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const scenes = Array.isArray(row.scenes)
    ? row.scenes.map((s) => text(s)).filter(Boolean)
    : [];
  const sortOrder = Number(row.sort_order);
  return {
    app_id: text(row.app_id),
    site_id: text(row.site_id),
    app_key: text(row.app_key),
    name: text(row.name),
    tagline: text(row.tagline),
    icon: text(row.icon),
    category: text(row.category),
    scenes,
    site_url: text(row.site_url),
    open_path: text(row.open_path),
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    installed: Boolean(row.installed),
  };
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    const data = await res.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function request(
  path: string,
  init: RequestInit,
  token: string | null,
): Promise<Record<string, unknown>> {
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
    });
  } catch {
    throw new Error("网络错误：连不上应用市场");
  }
  const data = await readJson(res);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw authError();
    const detail = text(data.detail) || text(data.error);
    throw new Error(detail || `应用市场暂时不可用（HTTP ${res.status}）`);
  }
  return data;
}

/** 需要登录的请求：没 token 直接抛 MarketAuthError，不白跑一趟网络。 */
async function authedRequest(
  path: string,
  init: RequestInit = {},
): Promise<Record<string, unknown>> {
  const token = await accessToken();
  if (!token) throw authError();
  return request(path, init, token);
}

/** 公开市场列表。签出状态照常可用；带 token 时后端逐条标注 `installed`。 */
export async function listMarketApps(opts?: {
  siteId?: string; scene?: string; q?: string; limit?: number; offset?: number;
}): Promise<{ items: MarketApp[]; total: number }> {
  const params = new URLSearchParams();
  const siteId = (opts?.siteId || "").trim();
  const scene = (opts?.scene || "").trim();
  const q = (opts?.q || "").trim();
  if (siteId) params.set("site_id", siteId);
  if (scene) params.set("scene", scene);
  if (q) params.set("q", q);
  if (typeof opts?.limit === "number") params.set("limit", String(opts.limit));
  if (typeof opts?.offset === "number") params.set("offset", String(opts.offset));
  const query = params.toString();
  const token = await accessToken().catch(() => null);
  const data = await request(`/v1/apps${query ? `?${query}` : ""}`, {}, token);
  const items = Array.isArray(data.items) ? data.items.map(toMarketApp) : [];
  const total = Number(data.total);
  return { items, total: Number.isFinite(total) ? total : items.length };
}

/** 场景标签 + 每个场景的 app 数量。公开。 */
export async function listMarketScenes(): Promise<{ scene: string; count: number }[]> {
  const token = await accessToken().catch(() => null);
  const data = await request("/v1/apps/scenes", {}, token);
  if (!Array.isArray(data.items)) return [];
  return data.items
    .map((raw) => {
      const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const count = Number(row.count);
      return { scene: text(row.scene), count: Number.isFinite(count) ? count : 0 };
    })
    .filter((row) => Boolean(row.scene));
}

/** 「我的」里已装的 app。未登录抛 MarketAuthError。 */
export async function listMyApps(): Promise<MarketApp[]> {
  const data = await authedRequest("/v1/apps/mine");
  if (!Array.isArray(data.items)) return [];
  // 「我的」里的条目按定义就是装过的；后端漏标时不让 UI 显示成「未装」。
  return data.items.map((raw) => ({ ...toMarketApp(raw), installed: true }));
}

export async function installApp(appId: string): Promise<void> {
  await authedRequest("/v1/apps/mine", {
    method: "POST",
    body: JSON.stringify({ app_id: appId }),
  });
}

export async function uninstallApp(appId: string): Promise<void> {
  await authedRequest(`/v1/apps/mine/${encodeURIComponent(appId)}`, {
    method: "DELETE",
  });
}
