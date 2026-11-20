// Tasks and sub tasks for people (task rooms wave 2026-11-20, contract §2.3).
export { RoomView, RoomView as TaskRoomView, type RoomViewProps, type RoomViewProps as TaskRoomViewProps } from "./RoomView";
export { TaskCardView, openTaskChildAnywhere, type TaskCardViewProps } from "./TaskCardView";
export { SummonDialog, newSummonDraft, type SummonDialogProps, type SummonDraft } from "./SummonDialog";
export { SpinOffDialog, type SpinOffDialogProps } from "./SpinOffDialog";
export { useTaskRoom, readTaskRoom, patchTaskRoomChild, type TaskRoomState } from "./useTaskRoom";
export { openTaskChild, taskChildHref, OPEN_TASK_CHILD_EVENT, type OpenTaskChildDetail } from "./open-child";
export { filterExtraMentions, type ComposerExtraMention, type ComposerExtras } from "./composer-extras";
export {
  taskCardStatus,
  canOpenChild,
  sendableSubTasks,
  readableSubTasks,
  subTaskLabel,
  summonSelection,
  handoffTitles,
  type TaskCardStatus,
} from "./room-model";
