"use client";

// ============================================================================
// @oceanleo/ui — 在线心跳（admin 网站管理「在线人数」曲线的数据源）
// ----------------------------------------------------------------------------
// AppShell 挂载时启动：登录用户每 60s 向网关 POST /v1/presence/heartbeat
// (带 site_id)。网关落 site_presence 表，「近 5 分钟有心跳 = 在线」，并由
// 网关后台任务每 5 分钟把各站在线人数快照进 site_online_snapshots 供
// oceandino /admin 画历史折线。
//
// 设计约束：
//   - 未登录：静默不发（accessToken() 为 null 直接跳过，不打扰访客）。
//   - 页签隐藏（document.hidden）时暂停——挂机不算在线。
//   - 失败静默：心跳绝不能影响业务页面。
// ============================================================================

import { useEffect } from "react";

import { accessToken } from "./auth/client";
import { GATEWAY_BASE } from "./auth/config";

const INTERVAL_MS = 60_000;

async function ping(siteId: string): Promise<void> {
  try {
    const token = await accessToken();
    if (!token) return;
    await fetch(`${GATEWAY_BASE}/v1/presence/heartbeat`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ site_id: siteId }),
      cache: "no-store",
      keepalive: true,
    });
  } catch {
    /* 心跳失败静默 */
  }
}

/** 每 60s 发一次在线心跳；页签隐藏时暂停，重新可见立即补发一次。 */
export function usePresenceHeartbeat(siteId: string): void {
  useEffect(() => {
    if (!siteId || siteId === "default") return;
    let stopped = false;

    const beat = () => {
      if (stopped || document.hidden) return;
      void ping(siteId);
    };

    beat(); // 挂载立即一次
    const timer = setInterval(beat, INTERVAL_MS);
    const onVisible = () => {
      if (!document.hidden) beat();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [siteId]);
}
