"use client";

// 通话界面宿主（合同 §3.9 W07 导出；W08 在 MessagesHost 里全局挂一次，跨页面常驻）。
// - 无条件挂 W14 的 CallDiagnosticsHost（仲裁 A-7：通话检测面板要活得比菜单久，不在通话里也能开）。
// - 不是 idle 就挂 W06 的 CallServicesHost（字幕上行与订阅），并画小窗或放大视图（同一时刻只画一个）。
// - 画面元素走 <video> 池（video-pool.ts）：小窗 ↔ 放大视图切换不解绑再绑；人离开、通话不在了才解绑（A-34 / D3）。
// - 已结束 / 出错：小窗留一句说明和关闭键；「已结束」从进入那一刻起 6 秒后自己收起，期间重复的状态事件不重置计时（A-34 / D2）。
// - 听 W08 的 "oceanleo:call-dock-focus"（仲裁 A-10）：把焦点交给通话窗口。
import { useCallback, useEffect, useMemo, useState } from "react";
import { CALL_DOCK_FOCUS_EVENT } from "../chat/call-entry";
import { CallDiagnosticsHost } from "../diagnostics";
import { useCall } from "../engine";
import { CallServicesHost } from "../services";
import { closeCallStage, openCallStage, requestCallWindowFocus, useCallUiState } from "./call-ui-state";
import { CallDock } from "./CallDock";
import { CallStage } from "./CallStage";
import { NO_FINAL_EPISODE, isLivePhase, nextFinalEpisode, type FinalEpisode } from "./layout";
import { useNarrowViewport } from "./use-viewport";
import { releaseAllVideos, releaseVideos } from "./video-pool";

/** CallHost 不收参数：状态全部来自 W05 的 callStore 与本目录的界面小仓库。 */
export type CallHostProps = Record<string, never>;

/** 「通话已结束」在小窗里停留多久后自己收起（与引擎 ended → idle 的 6 秒对齐）。 */
export const ENDED_DOCK_MS = 6000;

export function CallHost(_props: CallHostProps = {}) {
  const call = useCall();
  const ui = useCallUiState();
  const narrow = useNarrowViewport();
  const [focusToggle, setFocusToggle] = useState(false);
  const live = isLivePhase(call.phase);
  const stageOpen = ui.stageOpen && live;

  // 结束态按「段」认（layout.ts nextFinalEpisode）：同一段里状态事件再多，段号不变。
  // 用「渲染时由上一次的值推下一次」的写法（React 文档的 storing information from previous renders），纯函数、可重入。
  const [episode, setEpisode] = useState<FinalEpisode>(NO_FINAL_EPISODE);
  const current = nextFinalEpisode(episode, call);
  if (current !== episode) setEpisode(current);
  const [dismissedEpisode, setDismissedEpisode] = useState<number | null>(null);
  const dismissed = current.kind !== null && dismissedEpisode === current.id;

  // 通话不在了，下一通从小窗开始。
  useEffect(() => {
    if (!live && ui.stageOpen) closeCallStage();
  }, [live, ui.stageOpen]);

  // 「已结束」一段只起一次 6 秒计时：依赖只有段号，重复的状态事件不会重置它（A-34 / D2）。
  useEffect(() => {
    if (current.kind !== "ended") return undefined;
    const id = current.id;
    const timer = setTimeout(() => setDismissedEpisode(id), ENDED_DOCK_MS);
    return () => clearTimeout(timer);
  }, [current.kind, current.id]);

  // 画面元素的去留：在场的人留着（换格子不解绑），离开的人解绑；通话不在了全部解绑。
  const presentKey = useMemo(
    () => call.participants.map((participant) => participant.participantId).sort().join("\n"),
    [call.participants],
  );
  useEffect(() => {
    if (!live) {
      releaseAllVideos();
      return;
    }
    const present = new Set(presentKey ? presentKey.split("\n") : []);
    releaseVideos((participantId) => present.has(participantId));
  }, [live, presentKey]);

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
    if (current.kind !== null) setDismissedEpisode(current.id);
  }, [current.kind, current.id]);

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
