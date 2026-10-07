"use client";

// 「叫真人」窗格。表单是同一张「找人帮忙」（尽快接手）。这里只包一层，不自带返回栏。

import { type BayPaneProps } from "../shell/bay-state";
import { GetHelpForm } from "./GetHelpForm";
import { PaneBody } from "./need-ui";

export function CallHumanPane({ target, siteKey }: BayPaneProps) {
  if (target.kind !== "call-human") return null;
  return (
    <PaneBody pane="call-human">
      <GetHelpForm siteKey={siteKey} presetCategory={target.category} defaultMode="open" />
    </PaneBody>
  );
}
