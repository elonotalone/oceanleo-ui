"use client";

// Bay 右栏里的设置内容：和设置窗同一页（付款卡 + 收款账户）。不自带返回栏、标题、滚动（契约 §4.4 / 仲裁 #12）。
// 老深链 `?bay=settings:money` 落到这一页；`settings:vetting` / `settings:profile`（网关通知与旧书签仍会发）
// 资质核验与卖家资料已搬到「我的主页」编辑状态，这里直接转过去（vetting 滚到核验块）。
import { useEffect } from "react";
import { useUI } from "../../../i18n/ui/useUI";
import { requestMinePageEdit } from "../page/mine-page-edit";
import { replaceBay, type BayPaneProps } from "../shell/bay-state";
import { BaySettingsSection } from "./BaySettingsSection";
import { openBaySettings } from "./settings-open";
import type { BaySettingsPaneName } from "./settings-pane-store";

export function BaySettingsPane({ target }: BayPaneProps) {
  const tt = useUI();
  const pane = target.kind === "settings" ? target.pane : undefined;
  const movedToMyPage = pane === "vetting" || pane === "profile";

  useEffect(() => {
    if (!movedToMyPage) return;
    requestMinePageEdit(pane === "vetting" ? "vetting" : undefined);
    replaceBay({ kind: "mine", tab: "page" });
  }, [movedToMyPage, pane]);

  if (movedToMyPage) return <div className="px-3 py-3" data-bay-settings-pane="moved" />;
  return (
    <div className="px-3 py-3" data-bay-settings-pane="">
      <p className="mb-3">
        <button
          type="button"
          data-bay-open-in-settings=""
          onClick={() => openBaySettings(pane)}
          className="text-[13px] font-medium text-stone-800 underline underline-offset-2 hover:text-stone-950 dark:text-neutral-200"
        >
          {tt("在设置中打开")}
        </button>
      </p>
      <BaySettingsSection pane={pane as BaySettingsPaneName | undefined} />
    </div>
  );
}
