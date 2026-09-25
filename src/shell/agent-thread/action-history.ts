/**
 * 界面切换指令（签过名的 `ui_action`）只驱动**这一页打开以后**才到的那一步。
 * 打开一段旧对话时，里面躺着的指令都是当时的事，不能再执行一遍。
 *
 * 判据只看消息编号（服务端编号只增不减）：第一次拿到这段对话时服务端已有的最大编号
 * 就是分界线，编号不超过它的都是历史——之后再加载出来的更早的消息也一样。
 * 本页自己刚建的对话没有历史，分界线是 0。
 */
export interface ActionHistoryMark {
  taskId: string;
  lastHistoricalId: number;
}

/** 本页刚替用户建起来的对话：第一份消息里的指令也算数。 */
export function ownTaskActionMark(taskId: string): ActionHistoryMark {
  return { taskId, lastHistoricalId: 0 };
}

/** 每次拿到服务端那份消息都调一次；同一段对话只在第一次定分界线，之后原样返回。 */
export function settleActionHistory(
  mark: ActionHistoryMark | null,
  taskId: string,
  serverMessages: readonly { id: number }[],
): ActionHistoryMark {
  if (mark && mark.taskId === taskId) return mark;
  let lastHistoricalId = 0;
  for (const message of serverMessages) {
    if (message.id > lastHistoricalId) lastHistoricalId = message.id;
  }
  return { taskId, lastHistoricalId };
}

export function isLiveAction(
  mark: ActionHistoryMark | null,
  taskId: string | null | undefined,
  message: { id: number },
): boolean {
  return (
    !!mark &&
    !!taskId &&
    mark.taskId === taskId &&
    message.id > mark.lastHistoricalId
  );
}
