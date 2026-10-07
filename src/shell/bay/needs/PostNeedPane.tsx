"use client";

// 发需求窗格。表单是「找人帮忙」（公开征集）。这里只包一层，不自带返回栏/标题栏。

import { type BayPaneProps } from "../shell/bay-state";
import { GetHelpForm } from "./GetHelpForm";
import { PaneBody } from "./need-ui";

export function PostNeedPane({ target, siteKey }: BayPaneProps) {
  if (target.kind !== "post-need") return null;
  return (
    <PaneBody pane="post-need">
      <GetHelpForm siteKey={siteKey} presetCategory={target.category} defaultMode="public" />
    </PaneBody>
  );
}
