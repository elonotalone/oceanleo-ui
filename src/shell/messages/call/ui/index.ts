// 通话小窗与放大视图（W07，合同 §3.9）。首个提交：导出名与 props 定型，组件先 return null。
// CallHost：全局挂载（W08 在 MessagesHost 里挂），phase !== "idle" 时渲染小窗 CallDock，放大时渲染 CallStage。
// CallParticipantMenu：参与者菜单（仅对我静音、举报、W09 的「请求控制电脑」）。

/** CallHost 不收参数：状态全部来自 W05 的 callStore。 */
export type CallHostProps = Record<string, never>;

export interface CallParticipantMenuProps {
  /** 被操作的参与者（CallParticipantView.participantId）。 */
  participantId: string;
  open: boolean;
  onClose(): void;
}

/** 全局通话界面宿主（桩）。 */
export function CallHost(_props: CallHostProps = {}): null {
  return null;
}

/** 参与者菜单（桩）。 */
export function CallParticipantMenu(_props: CallParticipantMenuProps): null {
  return null;
}
