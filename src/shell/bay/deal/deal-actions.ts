// 灰字行上的动作 → 去哪：订单、需求、求助在 Bay 里打开；项目群在消息窗里打开；资料与核验在设置窗的 Bay tab。

import { openMessages } from "../../messages/host-state";
import { openBaySettings } from "../settings";
import { openBay } from "../shell/bay-state";
import type { DealLineTarget } from "./deal-lines";

export function runDealLineAction(target: DealLineTarget): void {
  switch (target.kind) {
    case "order":
      openBay({ kind: "order", id: target.id });
      return;
    case "demand":
      openBay({ kind: "demand", id: target.id });
      return;
    case "help":
      openBay({ kind: "help", id: target.id });
      return;
    case "project":
      openMessages({ conversationId: target.conversationId });
      return;
    case "settings":
      openBaySettings(target.pane);
      return;
  }
}
