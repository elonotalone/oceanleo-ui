"use client";

// 浮层里的设置页：提醒设置（W03）、拉黑名单入口、隐私说明。顶栏图标页签已经标明这是设置，这里不再重复标题和返回。
import { useUI } from "../../i18n/ui/useUI";
import { NotifySettingsPanel } from "./notify/NotifySettingsPanel";
import { PrivacySummary } from "./PrivacyNotice";

export function SettingsView({ onOpenBlocks }: { onOpenBlocks: () => void }) {
  const tt = useUI();
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-testid="messages-settings">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        <section>
          <div className="mb-2 text-[13px] font-semibold tracking-tight">{tt("提醒")}</div>
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
        <section>
          <div className="mb-2 text-[13px] font-semibold tracking-tight">{tt("隐私说明")}</div>
          <PrivacySummary />
        </section>
      </div>
    </div>
  );
}
