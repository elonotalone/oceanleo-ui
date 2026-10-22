// 远程控制网页端出口（合同 §3.9，签名不许改）。
//  - CallControlLayer（props { participantId, videoEl }）：共享屏幕格上的交互转发层（控制方）。
//  - ControlRequestMenuItem（props { participantId }）：参与者菜单里的「请求控制电脑」。
//  - CallControlBanner：所有参会者看到的「谁在控制谁」提示条 + 各自的停止按钮。
//  - CallControlHost：全局挂载，处理被控方请求、提示、桌面桥调用。
//  - controlApi：用户端接口（§3.8：请求/取消/拒绝/停止/查询；批准只走设备端）。
export { CallControlLayer, type CallControlLayerProps } from "./CallControlLayer";
export { ControlRequestMenuItem, type ControlRequestMenuItemProps } from "./ControlRequestMenuItem";
export { CallControlBanner } from "./CallControlBanner";
export { CallControlHost } from "./CallControlHost";
export { controlApi, type ControlApi, type ControlDeclineReason, type ControlSessionResponse } from "./control-api";
