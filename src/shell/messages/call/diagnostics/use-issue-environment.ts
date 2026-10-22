"use client";

// 排障文案要看「在哪个浏览器 / 系统 / 是不是桌面客户端」：权限怎么打开、屏幕录制在哪放行，各家写法不同。
import { useMemo } from "react";
import { getClientHostConfig } from "../../../../contracts/client-host-config";
import { browserFamily, osFamily, type IssueEnvironment } from "./issues";

export function detectDesktopClient(): boolean {
  try {
    if (getClientHostConfig()?.platform === "desktop") return true;
  } catch {
    // 未注入宿主配置
  }
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return "__TAURI_INTERNALS__" in w || "__TAURI__" in w;
}

export function useIssueEnvironment(
  audioOnly: boolean,
  limits: { maxParticipants: number; maxVideo: number },
): IssueEnvironment {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const desktopClient = useMemo(() => detectDesktopClient(), []);
  return useMemo(
    () => ({
      browser: browserFamily(ua),
      os: osFamily(ua),
      desktopClient,
      audioOnly,
      limits: { maxParticipants: limits.maxParticipants, maxVideo: limits.maxVideo },
    }),
    [ua, desktopClient, audioOnly, limits.maxParticipants, limits.maxVideo],
  );
}
