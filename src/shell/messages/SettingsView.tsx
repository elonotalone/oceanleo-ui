"use client";

// 浮层里的设置页：提醒设置（W03）、拉黑名单入口、隐私说明。
import { useUI } from "../../i18n/ui/useUI";
import { NotifySettingsPanel } from "./notify/NotifySettingsPanel";
import { PrivacySummary } from "./PrivacyNotice";

export function SettingsView({ onOpenBlocks, onBack }: { onOpenBlocks: () => void; onBack: () => void }) {
  const tt = useUI();
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="messages-settings">
      <div className="flex items-center gap-2 border-b border-black/10 px-3 py-2 dark:border-white/10">
        <button
          type="button"
          onClick={onBack}
          aria-label={tt("返回")}
          className="rounded-md px-2 py-1 text-sm text-black/60 hover:bg-black/5 dark:text-white/60 dark:hover:bg-white/10"
        >
          ←
        </button>
        <div className="text-sm font-semibold">{tt("消息设置")}</div>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <section>
          <div className="mb-2 text-sm font-medium">{tt("提醒")}</div>
          <NotifySettingsPanel />
        </section>
        <section>
          <div className="mb-2 text-sm font-medium">{tt("拉黑名单")}</div>
          <p className="mb-2 text-xs text-black/55 dark:text-white/55">
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
        <section>
          <div className="mb-2 text-sm font-medium">{tt("隐私说明")}</div>
          <PrivacySummary />
        </section>
      </div>
    </div>
  );
}
