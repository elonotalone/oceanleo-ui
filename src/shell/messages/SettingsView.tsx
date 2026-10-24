"use client";

// 设置中心「消息」栏正文：提醒设置、拉黑名单和通话检测。
import { useUI } from "../../i18n/ui/useUI";
import { NotifySettingsPanel } from "./notify/NotifySettingsPanel";
import { openCallTest } from "./call/diagnostics/diagnostics-store";

export function SettingsView({ onOpenBlocks }: { onOpenBlocks: () => void }) {
  const tt = useUI();
  return (
    <div className="space-y-8" data-testid="messages-settings">
      <section>
        <NotifySettingsPanel />
      </section>
      <section>
        <div className="mb-2 text-[13px] font-semibold tracking-tight">{tt("拉黑名单")}</div>
        <p className="mb-2 text-[12px] text-black/45 dark:text-white/45">
          {tt("被你拉黑的人不能私聊你、不能拉你进群、不能给你发联系人请求。")}
        </p>
        <button
          type="button"
          onClick={onOpenBlocks}
          className="rounded-md bg-black/5 px-3 py-1.5 text-sm hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
        >
          {tt("管理拉黑名单")}
        </button>
      </section>
      {/* 不在通话中也能打开「通话检测」（calls-v2 A-22；面板由 MessagesHost → CallHost 里常驻的 CallDiagnosticsHost 渲染）。 */}
      <section>
        <div className="mb-2 text-[13px] font-semibold tracking-tight">{tt("通话检测")}</div>
        <p className="mb-2 text-[12px] text-black/45 dark:text-white/45">{tt("检查麦克风、扬声器、摄像头和网络连接。")}</p>
        <button
          type="button"
          onClick={openCallTest}
          data-open-call-test="settings"
          className="rounded-md bg-black/5 px-3 py-1.5 text-sm hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
        >
          {tt("打开通话检测")}
        </button>
      </section>
    </div>
  );
}
