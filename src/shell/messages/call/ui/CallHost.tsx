"use client";

// 通话界面宿主（合同 §3.9 W07 导出；W08 在 MessagesHost 里全局挂一次，跨页面常驻）。
// - 无条件挂 W14 的 CallDiagnosticsHost（仲裁 A-7：通话检测面板要活得比菜单久，不在通话里也能开）。
// - 不是 idle 就挂 W06 的 CallServicesHost（字幕上行与订阅），并画小窗或放大视图（同一时刻只画一个：
//   同一个人的同一路画面只能绑一个 <video>）。
// - 已结束 / 出错：小窗留一句说明和关闭键；「已结束」6 秒后自己收起。
// - 听 W08 的 "oceanleo:call-dock-focus"（仲裁 A-10）：把焦点交给通话窗口。
import { useCallback, useEffect, useState } from "react";
import { CALL_DOCK_FOCUS_EVENT } from "../chat/call-entry";
import { CallDiagnosticsHost } from "../diagnostics";
import { useCall } from "../engine";
import { CallServicesHost } from "../services";
import { closeCallStage, openCallStage, requestCallWindowFocus, useCallUiState } from "./call-ui-state";
import { CallDock } from "./CallDock";
import { CallStage } from "./CallStage";
import { finalStateKey, isLivePhase } from "./layout";
import { useNarrowViewport } from "./use-viewport";

/** CallHost 不收参数：状态全部来自 W05 的 callStore 与本目录的界面小仓库。 */
export type CallHostProps = Record<string, never>;

/** 「通话已结束」在小窗里停留多久后自己收起。 */
export const ENDED_DOCK_MS = 6000;

export function CallHost(_props: CallHostProps = {}) {
  const call = useCall();
  const ui = useCallUiState();
  const narrow = useNarrowViewport();
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [focusToggle, setFocusToggle] = useState(false);
  const live = isLivePhase(call.phase);
  const finalKey = finalStateKey(call);
  const dismissed = finalKey !== null && dismissedKey === finalKey;
  const stageOpen = ui.stageOpen && live;

  // 通话不在了，下一通从小窗开始。
  useEffect(() => {
    if (!live && ui.stageOpen) closeCallStage();
  }, [live, ui.stageOpen]);

  useEffect(() => {
    if (call.phase !== "ended" || finalKey === null) return undefined;
    const timer = window.setTimeout(() => setDismissedKey(finalKey), ENDED_DOCK_MS);
    return () => window.clearTimeout(timer);
  }, [call.phase, finalKey]);

  useEffect(() => {
    const onFocusRequest = () => requestCallWindowFocus();
    window.addEventListener(CALL_DOCK_FOCUS_EVENT, onFocusRequest);
    return () => window.removeEventListener(CALL_DOCK_FOCUS_EVENT, onFocusRequest);
  }, []);

  // 小窗只在挂载那一刻读「把焦点还给放大按钮」；读完就复位（子组件的 effect 先于这里执行），
  // 免得以后小窗因为别的原因重挂时又抢一次焦点。
  useEffect(() => {
    if (focusToggle && !stageOpen) setFocusToggle(false);
  }, [focusToggle, stageOpen]);

  const expand = useCallback(() => {
    setFocusToggle(false);
    openCallStage();
  }, []);
  const collapse = useCallback(() => {
    // 缩小回小窗后焦点落在「放大」按钮上（键盘用户从哪来回哪去）。
    setFocusToggle(true);
    closeCallStage();
  }, []);
  const dismiss = useCallback(() => {
    if (finalKey !== null) setDismissedKey(finalKey);
  }, [finalKey]);

  const showWindow = call.phase !== "idle" && !dismissed;

  return (
    <>
      <CallDiagnosticsHost />
      {call.phase !== "idle" ? <CallServicesHost /> : null}
      {showWindow ? (
        stageOpen ? (
          <CallStage narrow={narrow} onCollapse={collapse} focusTick={ui.focusTick} />
        ) : (
          <CallDock narrow={narrow} onExpand={expand} onDismiss={dismiss} focusToggleOnMount={focusToggle} focusTick={ui.focusTick} />
        )
      ) : null}
    </>
  );
}
