"use client";

// LeoChat 的二级视图（占详情位）：「通知」和「内容处置」。小窗、整页、右侧栏三处都挂这一个，境内外同一条代码路径。
//   - notices：平台通知列表，返回 → 聊天；
//   - cases：内容处置（W09 的 MessagesContentCases），只经通知或深链 `?im=cases[:<案件>]` 进入，返回 → 通知。
// 内容处置不出现在任何常驻导航里：平时没有入口，也不会被「上次停在哪」记住（host-state）。
import type { ReactElement } from "react";
import { MessagesContentCases } from "../cases/MessagesContentCases";
import type { MessagesView } from "../host-state";
import { NoticesView } from "./NoticesView";

export interface MessagesSubViewProps {
  view: MessagesView;
  /** `view === "cases"` 时要直接展开的那一件。 */
  caseId: string | null;
  onSelectView: (view: MessagesView) => void;
}

export function MessagesSubView({ view, caseId, onSelectView }: MessagesSubViewProps): ReactElement | null {
  if (view === "notices") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-leochat-subview="notices">
        <NoticesView onBack={() => onSelectView("inbox")} />
      </div>
    );
  }
  if (view === "cases") {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-leochat-subview="cases">
        <MessagesContentCases caseId={caseId} onBack={() => onSelectView("notices")} />
      </div>
    );
  }
  return null;
}
