"use client";

// 全局唯一的消息浮层（每个站挂一次，在 AppShell / 门户外壳里与 SettingsModalHost 并列）。
// 境内站与未登录：什么都不渲染、不连接。
import { useEffect } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { useImEnabled } from "../../lib/im/client";
import { closeMessages, hostState, useMessagesHost } from "./host-state";
import { MessagesLayout } from "./MessagesLayout";
import { useImConnection } from "./realtime/hooks";

export function MessagesHost() {
  const tt = useUI();
  const enabled = useImEnabled();
  const state = useMessagesHost();
  const connection = useImConnection();

  useEffect(() => hostState().attach(), []);
  useEffect(() => {
    hostState().setEnabled(enabled);
  }, [enabled]);

  if (!enabled || !state.open) return null;
  const host = hostState();
  return (
    <MessagesLayout
      layout={state.layout}
      dockWidth={state.dockWidth}
      onDockWidth={(w) => host.setDockWidth(w)}
      onClose={closeMessages}
      onToggleExpand={() => host.setExpanded(!state.expanded)}
      list={
        <div className="m-auto text-sm text-black/45 dark:text-white/45">
          {connection === "open" ? tt("还没有会话") : tt("正在连接…")}
        </div>
      }
      detail={null}
      showDetail={false}
    />
  );
}
