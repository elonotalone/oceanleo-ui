// 通话小窗与放大视图（W07，合同 §3.9）。
// CallHost：全局挂载（W08 在 MessagesHost 里挂），不是 idle 就画小窗 CallDock，放大时画 CallStage；
//   另外无条件挂 W14 的 CallDiagnosticsHost（仲裁 A-7），并听 W08 的 "oceanleo:call-dock-focus"（仲裁 A-10）。
// CallParticipantMenu：参与者菜单（仅对我静音、举报、W09 的「请求控制电脑」）。

export { CallHost, type CallHostProps } from "./CallHost";
export { CallParticipantMenu, type CallParticipantMenuProps } from "./CallParticipantMenu";
/** 给别的模块用的界面动作（加法，不改 §3.9 已有签名）：放大、缩小、把焦点给通话窗口。 */
export { closeCallStage, openCallStage, requestCallWindowFocus } from "./call-ui-state";
