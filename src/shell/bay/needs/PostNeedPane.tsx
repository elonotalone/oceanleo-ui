"use client";

// 发需求窗格。表单本身在 DemandEditor：类目按站预选（门户为空必须自己选）、
// 可从「我的库」附作品、提交前先过买家条款。这里只包一层，不自带返回栏/标题栏。

import { useUI } from "../../../i18n/ui/useUI";
import { openBay, requireBayLogin, useBaySignedIn, type BayPaneProps } from "../shell/bay-state";
import { DemandEditor } from "./DemandEditor";
import { LoginPrompt, PaneBody } from "./need-ui";

export function PostNeedPane({ target, siteKey }: BayPaneProps) {
  if (target.kind !== "post-need") return null;
  return <PostNeedBody siteKey={siteKey} presetCategory={target.category} />;
}

function PostNeedBody({ siteKey, presetCategory }: { siteKey: string; presetCategory?: string }) {
  const tt = useUI();
  const signedIn = useBaySignedIn();
  return (
    <PaneBody pane="post-need">
      {!signedIn ? <LoginPrompt message={tt("登录后才能发需求。")} /> : null}
      <DemandEditor
        siteKey={siteKey}
        presetCategory={presetCategory}
        onDone={(demandId) => {
          if (!demandId) return;
          if (!requireBayLogin()) return;
          openBay({ kind: "demand", id: demandId });
        }}
      />
    </PaneBody>
  );
}
