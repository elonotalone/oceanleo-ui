"use client";

// ============================================================================
// @oceanleo/ui — 操作台草稿自动保存/恢复（单一事实源，doctrine 2026-07-09）
// ----------------------------------------------------------------------------
// 操作员拍板（2026-07-09）：**默认自动恢复上次草稿**。用户在一个成品 app 的操作台里
// 填的东西（主题/参数/大纲/成稿/右栏当前标签…）不能一退出就没了；重新进入这个 app
// 要能直接恢复到上次的状态，而不是空白。这【推翻】了旧宗旨「进 app 空操作台」
// （docs/architecture/oceanleo-template-fill-and-thumb-catalog.md 决策 D）。
//
// 一份「草稿」= 某个成品 app 操作台的完整 state 快照（不透明 JSON blob，由站点定义
// 形状；本模块只负责存取，不理解内容）。粒度 = 每 (site_id, app_id) 一份【覆盖式】
// （重进就是上次那份；更早的版本靠历史记录/工作流承载，不在这里保留多份）。
//
// 存储：登录用户 → Supabase `agent_console_drafts`（owner-only RLS，跨 *.oceanleo.com
// 打通，与 agent_artifacts / agent_workflows 同库同项目）；未登录 → localStorage 降级。
// 数据形态两边一致，登录后自动走云端。
//
// 与 `workflows.ts` 的区别：workflow = 用户【手动】「保存工作流」的输入快照，进右栏
// 「导航·我的」供【复用】（可存多条、跨会话挑）；console-draft = 【自动】保存的「上次
// 干到哪」的续编草稿，每 app 一份、进入即恢复。两者互补，不冲突。
// ============================================================================

import { browserClient } from "./auth/client";

/** 一份操作台草稿。`state` 是站点定义的不透明快照。 */
export interface ConsoleDraft {
  site_id: string;
  app_id: string;
  /** 操作台完整 state 快照（站点自定义形状；本模块只存取）。 */
  state: Record<string, unknown>;
  updated_at: string;
}

const LS_KEY = "oceanleo_console_drafts_v1";

type LsMap = Record<string, ConsoleDraft>; // key = `${site}:${app}`

function lsKey(siteId: string, appId: string): string {
  return `${siteId}:${appId}`;
}

function lsAll(): LsMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_KEY);
    const obj = raw ? (JSON.parse(raw) as unknown) : {};
    return obj && typeof obj === "object" ? (obj as LsMap) : {};
  } catch {
    return {};
  }
}

function lsWrite(all: LsMap): void {
  if (typeof window === "undefined") return;
  try {
    // 上限保护：草稿是小 JSON，但防意外膨胀——超 120 份时丢最旧的。
    const entries = Object.entries(all);
    if (entries.length > 120) {
      entries.sort((a, b) => (a[1].updated_at < b[1].updated_at ? 1 : -1));
      all = Object.fromEntries(entries.slice(0, 120)) as LsMap;
    }
    localStorage.setItem(LS_KEY, JSON.stringify(all));
  } catch {
    /* quota / disabled — 静默 */
  }
}

async function sessionUserId(): Promise<string | null> {
  const c = browserClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data.session?.user?.id ?? null;
}

/**
 * 读取某 app 的操作台草稿。无草稿返回 null。
 * 登录 → Supabase；未登录/云端异常 → localStorage 兜底。
 */
export async function loadConsoleDraft(
  siteId: string,
  appId: string,
): Promise<ConsoleDraft | null> {
  const site = (siteId || "").trim();
  const app = (appId || "").trim();
  if (!site || !app) return null;
  const c = browserClient();
  const uid = c ? await sessionUserId() : null;
  if (c && uid) {
    try {
      const { data, error } = await c
        .from("agent_console_drafts")
        .select("site_id, app_id, state, updated_at")
        .eq("site_id", site)
        .eq("app_id", app)
        .limit(1)
        .maybeSingle();
      if (!error && data) return data as ConsoleDraft;
      if (!error && !data) {
        // 云端确实没有 → 再看本地是否有（登录前存的），有就返回（并顺带上云）。
        const local = lsAll()[lsKey(site, app)];
        if (local) {
          void saveConsoleDraft(site, app, local.state); // 迁移上云（尽力而为）
          return local;
        }
        return null;
      }
      // error（如表未就绪）→ 降级本地。
    } catch {
      /* 降级本地 */
    }
  }
  return lsAll()[lsKey(site, app)] ?? null;
}

/**
 * 保存/覆盖某 app 的操作台草稿。state 为空对象时等价于清空（见 clearConsoleDraft）。
 * 登录 → upsert 到 Supabase；未登录/云端异常 → localStorage。
 */
export async function saveConsoleDraft(
  siteId: string,
  appId: string,
  state: Record<string, unknown>,
): Promise<void> {
  const site = (siteId || "").trim();
  const app = (appId || "").trim();
  if (!site || !app) return;
  const now = new Date().toISOString();
  const c = browserClient();
  const uid = c ? await sessionUserId() : null;
  if (c && uid) {
    try {
      const { error } = await c
        .from("agent_console_drafts")
        .upsert(
          { user_id: uid, site_id: site, app_id: app, state, updated_at: now },
          { onConflict: "user_id,site_id,app_id" },
        );
      if (!error) return; // 云端写成功即可（不再重复写本地，避免双写不一致）。
      // error → 降级本地。
    } catch {
      /* 降级本地 */
    }
  }
  const all = lsAll();
  all[lsKey(site, app)] = { site_id: site, app_id: app, state, updated_at: now };
  lsWrite(all);
}

/** 清空某 app 的操作台草稿（「重新开始」按钮调用）。 */
export async function clearConsoleDraft(siteId: string, appId: string): Promise<void> {
  const site = (siteId || "").trim();
  const app = (appId || "").trim();
  if (!site || !app) return;
  const c = browserClient();
  const uid = c ? await sessionUserId() : null;
  if (c && uid) {
    try {
      await c
        .from("agent_console_drafts")
        .delete()
        .eq("site_id", site)
        .eq("app_id", app);
    } catch {
      /* 忽略 */
    }
  }
  const all = lsAll();
  delete all[lsKey(site, app)];
  lsWrite(all);
}
