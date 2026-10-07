"use client";

import { openMessages } from "../../../shell/messages/host-state";
import { SettingsView } from "../../../shell/messages/SettingsView";

/** 设置中心「消息」栏：提醒开关、拉黑名单入口、隐私说明。境内不出现这一栏。 */
export function MessagesSection() {
  return (
    <div data-settings-pane="messages">
      <SettingsView onOpenBlocks={() => openMessages({ view: "people" })} />
    </div>
  );
}
