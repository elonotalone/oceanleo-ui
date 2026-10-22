"use client";

// 「通话检测」入口（放进麦克风小箭头菜单；设置里也可以放）与全局宿主（A-7：W07 在 CallHost 里无条件挂一次）。
// 菜单项只负责打开；面板由宿主渲染，所以菜单关掉、不在通话中都不影响面板。没有宿主时菜单项自己兜底渲染。
import { useEffect, useSyncExternalStore } from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { FloatingMenuItem } from "../../../../ui/menu/FloatingMenu";
import { CallTestPanel } from "./CallTestPanel";
import { callTestStore, closeCallTest, openCallTest, registerCallTestHost } from "./diagnostics-store";
import { IconCallCheck } from "./icons";

export interface CallTestMenuItemProps {
  /** 选中后调用（比如关掉所在的菜单）。 */
  onSelect?(): void;
}

function useCallTestState() {
  return useSyncExternalStore(callTestStore.subscribe, callTestStore.getSnapshot, callTestStore.getSnapshot);
}

export function CallTestMenuItem({ onSelect }: CallTestMenuItemProps = {}) {
  const tt = useUI();
  const state = useCallTestState();
  return (
    <>
      <FloatingMenuItem
        icon={<IconCallCheck size={16} />}
        label={tt("通话检测")}
        description={tt("麦克风、扬声器、摄像头和网络")}
        onSelect={() => {
          openCallTest();
          onSelect?.();
        }}
      />
      {state.hosts === 0 ? <CallTestPanel open={state.open} onClose={closeCallTest} /> : null}
    </>
  );
}

export function CallDiagnosticsHost() {
  const state = useCallTestState();
  useEffect(() => registerCallTestHost(), []);
  return <CallTestPanel open={state.open} onClose={closeCallTest} />;
}
