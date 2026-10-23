// 灰字行上的动作 → 去哪：订单、需求、求助、我的主页在 LeoBay 里打开；项目群在消息窗里打开。
// 资料与核验都在「我的主页」：核验是主页编辑状态里的一块，经 mine-page-edit 的 "vetting" 入口打开并滚过去（合同 I-8）。

import { openMessages } from "../../messages/host-state";
import { requestMinePageEdit } from "../page/mine-page-edit";
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
    case "my-page":
      openBay({ kind: "mine", tab: "page" });
      return;
    case "my-vetting":
      requestMinePageEdit("vetting");
      openBay({ kind: "mine", tab: "page" });
      return;
  }
}
