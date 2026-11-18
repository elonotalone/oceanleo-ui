"use client";

import { MessageSettingsFrame, CARD, CARD_TITLE, CARD_DESC, QUIET } from "./MessageSettingsFrame";

// 设置中心「消息」栏正文：提醒设置、拉黑名单和通话检测。
import { useUI } from "../../i18n/ui/useUI";
import { NotifySettingsPanel } from "./notify/NotifySettingsPanel";
import { openCallTest } from "./call/diagnostics/diagnostics-store";

export function SettingsView({ onOpenBlocks }: { onOpenBlocks: () => void }) {
  const tt = useUI();
  return (
    <MessageSettingsFrame title={tt("消息")} card={false} data-testid="messages-settings">
      <div className="space-y-5">
        <NotifySettingsPanel />
        <section className={CARD}>
          <div className={CARD_TITLE}>{tt("拉黑名单")}</div>
          <p className={CARD_DESC}>
            {tt("被你拉黑的人不能私聊你、不能拉你进群、不能给你发联系人请求。")}
          </p>
          <button
            type="button"
            onClick={onOpenBlocks}
            className={`${QUIET} mt-3`}
          >
            {tt("管理拉黑名单")}
          </button>
        </section>
        {/* 不在通话中也能打开「通话检测」（calls-v2 A-22；面板由 MessagesHost → CallHost 里常驻的 CallDiagnosticsHost 渲染）。 */}
        <section className={CARD}>
          <div className={CARD_TITLE}>{tt("通话检测")}</div>
          <p className={CARD_DESC}>{tt("检查麦克风、扬声器、摄像头和网络连接。")}</p>
          <button
            type="button"
            onClick={openCallTest}
            data-open-call-test="settings"
            className={`${QUIET} mt-3`}
          >
            {tt("打开通话检测")}
          </button>
        </section>
      </div>
    </MessageSettingsFrame>
  );
}
