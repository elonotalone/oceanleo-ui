// Pure source text shared by server translation tables and task runtime.
/**
 * What the user reads when a task aimed at a paired computer is refused, or
 * its receipt is lost. Chinese source text: every surface renders it through
 * `tt`, and `i18n/ui/messages/local-agent-copy.ts` translates every entry into
 * all 17 locales (typecheck fails when a locale misses one). `agent.ts` keeps
 * the upper-cased wire code in `error` for other callers, so a local-agent
 * code must never reach the screen without passing through this table.
 *
 * The switch name and the page name quote the desktop app's own labels
 * (`oceanleo-app` tray + security page), so the user can find them.
 */
export const LOCAL_AGENT_COPY = {
  localExecDisabled: "所选电脑没有开启本机执行，任务没有开始，也没有转到云端。请在那台电脑的 OceanLeo「设备与授权」里打开「允许云端下发本机任务」后重新发送，或把执行位置改成云端。",
  localAgentUnavailable: "所选电脑上的 OceanLeo 本地 AI 还没有就绪，任务没有开始，也没有转到云端。请在那台电脑上打开并登录 OceanLeo，半分钟后重新发送，或把执行位置改成云端。",
  deviceOffline: "所选电脑离线或没有登录，任务没有开始，也没有转到云端。请在那台电脑上打开并登录 OceanLeo 后重新发送，或把执行位置改成云端。",
  deviceNotFound: "找不到所选电脑，它可能已被移除或撤销连接。请在「我的设备」核对后重新选择执行位置。",
  invalidTarget: "所选执行位置无效，任务没有开始。请重新选择执行位置后再发送。",
  modeUnsupported: "这种任务模式不能交给电脑执行，任务没有开始。请改用云端，或换成普通任务后重新发送。",
  targetMismatch: "这项任务已经绑定另一台电脑。要换执行位置，请新建任务。",
  stillRunning: "这项任务还没有结束。请等它结束，或先停止它，再继续发送。",
  attachmentsUnsupported: "交给电脑的任务暂不支持附件，任务没有开始。请先把文件放进那台电脑已授权的文件夹，再在任务里写明文件位置。",
  payloadTooLarge: "任务内容太长，电脑无法接收，任务没有开始。请缩短后重新发送。",
  payloadInvalid: "任务内容无法交给电脑，任务没有开始。请修改后重新发送。",
  serviceUnavailable: "电脑任务服务暂时不可用，任务没有开始，也没有转到云端。请稍后重新发送。",
  quotaUnfinished: "你的电脑上未完成的任务已达到上限，这项任务没有开始。请等它们结束或先停止，再重新发送。",
  taskNotFound: "找不到这项任务，它可能已被删除。请刷新页面后再试。",
  unknownRefusal: "任务没有开始，也没有转到云端。请稍后重新发送，或把执行位置改成云端。",
  dispatchUnconfirmed: "没有收到电脑的回执：这项任务可能已经交给电脑。下面显示的是它的实际状态；确认它没有开始之前，请不要再次发送。",
  receiptLost: "没有收到电脑的回执：任务可能已经交给电脑。请先到「我的任务」核对，确认它没有开始，再重新发送。",
  localExecOff: "本机执行未开启",
  localExecOffHint: "这台电脑没有开启本机执行，交给它的任务不会运行。请在这台电脑的 OceanLeo「设备与授权」里打开「允许云端下发本机任务」，或改用云端。",
  // History (C11-FW): deleting a computer task whose stop the computer has not confirmed yet.
  deleteStopPending: "这项任务还在电脑上运行，已请求电脑停止。电脑确认停止后，请再删除一次。",
} as const;
export type LocalAgentCopyKey = keyof typeof LOCAL_AGENT_COPY;

/**
 * Everything the web says about the cloud assistant using the user's computer
 * (device-link protocol `oceanleo-app/docs/react-client-rebuild/device-link/protocol.md`
 * §12–§13; texts from the bridge doc §17.9, which wins where the two differ).
 * Chinese source text rendered through `tt`; `i18n/ui/messages/cloud-agent-copy.ts`
 * translates every entry into the 16 other locales (typecheck fails on a gap).
 *
 * - `health*` are the fixed texts the gateway stores in `device_status`
 *   notices (no clock times, so a stored notice never goes stale); `live*`
 *   are the task-page templates filled with the viewer's own clock.
 * - `refused*` adapt the §17.9 reason texts to a refused create: a task that
 *   was refused must say it did not start and did not move to the cloud.
 * - The switch name quotes the desktop app's own label (`device_link/surfaces.rs`).
 */
export const CLOUD_AGENT_COPY = {
  scopeFiles: "仅文件（不截图或操作界面）",
  scopeGui: "允许截图和操作界面",
  scopeNewTask: "此任务权限已固定；要改变权限请创建新任务",

  // Target picker: one entry per computer (protocol §12.4).
  cloudUntil: "云端助手可用至 {time}",
  cloudAvailable: "云端助手可用",
  needsYou: "需要你在电脑前确认",
  cloudHint: "任务由 OceanLeo 云端助手使用这台电脑完成：思考在云端，每一步操作都在这台电脑上执行，你不在电脑前也能继续。",
  needsYouHint: "任务会由这台电脑上的本机 AI 执行，操作需要你在电脑前确认。要在离开电脑时也能继续，请在那台电脑的 OceanLeo 里打开「允许云端助手使用这台电脑」。",
  aiBusy: "这台电脑上还有一个 AI 操作没结束，请稍等。",
  // `POST /v1/agent/tasks` with `driver:"cloud"` refused (protocol §12.5).
  refusedDisabled: "这台电脑还没有允许云端助手，任务没有开始，也没有改到云端。请在那台电脑的 OceanLeo 里打开「允许云端助手使用这台电脑」后重新发送，或重新选择执行位置。",
  refusedExpired: "电脑上允许云端助手的时间已到，任务没有开始，也没有改到云端。请在那台电脑上续期后重新发送，或重新选择执行位置。",
  refusedBusy: "这台电脑上还有一个 AI 任务没结束，这项任务没有开始。请等它结束或先停止它，再重新发送。",
  refusedCleanup: "电脑上有一个中断的命令还没确认清理干净，任务没有开始。请在电脑上处理后重新发送。",
  refusedScope: "这项任务需要的权限超出了你在电脑上允许云端助手的范围，任务没有开始。请在电脑上调整后重新发送，或重新选择执行位置。",
  refusedUnavailable: "这台电脑现在不能使用云端助手，任务没有开始，也没有改到云端。请稍后重新发送，或重新选择执行位置。",
  dispatchFailed: "任务没有成功交给所选电脑，任务没有开始，也没有转到云端。请重新发送。",
  // Task page block for a cloud-assistant run.
  statusRunning: "云端助手正在使用你的电脑",
  statusConnecting: "正在连接你的电脑…",
  statusPaused: "任务已暂停；继续后 AI 会先重新查看屏幕。",
  subtitle: "由 OceanLeo 云端助手执行：思考在云端，每一步操作都在你的电脑上完成。关闭此页面不会停止任务。",
  ownerAi: "AI 正在操作",
  takeOver: "接管电脑",
  handBack: "交还给 AI",
  screenAlt: "电脑屏幕的最新画面",
  screenCaption: "最新画面 {time} · 只在服务器内存里，只有你能看到",
  // Health (bridge §17.9): the fixed notice texts, then the live-line templates.
  healthOk: "电脑已恢复，AI 会先重新查看屏幕再继续。",
  healthOffline: "你的电脑没有回应，可能已离线或休眠。",
  healthAsleep: "你的电脑已休眠，醒来后任务继续。",
  healthLocked: "电脑已锁屏，图形操作暂停；命令仍在运行。",
  healthHung: "你的电脑卡住了：当前这一步一直没有完成。",
  healthSignedOut: "你的电脑上已退出 OceanLeo 账号，任务已暂停。",
  healthCleanup: "电脑上有一个中断的命令还没确认清理干净；在电脑上处理后才能继续运行命令。",
  healthEnvelope: "电脑上允许云端助手的时间已到，需要在电脑上续期。",
  healthConfirm: "这一步需要你在电脑前确认。",
  healthHuman: "你正在控制电脑，AI 已暂停；点「交还给 AI」继续。",
  healthOther: "你的电脑暂时不能执行操作，AI 正在等待。",
  liveOffline: "你的电脑 {duration}没有回应，可能已离线或休眠 · 上次联系 {time}",
  liveAsleep: "你的电脑已休眠 · 上次联系 {time}",
  liveHung: "你的电脑卡住了：这一步已经 {duration}没有完成",
  // Remote desktop opened from the task page (接管电脑).
  bannerAi: "AI 正在操作这台电脑；你一操作，AI 就会停手。",
  bannerResuming: "正在交还给 AI，它会先重新查看屏幕。",
  yourComputer: "你的电脑",
  // C11-FW. The `local_exec_disabled` notice kind (C11 contract §3; `paused` and
  // `ai_busy` reuse statusPaused / aiBusy), and the last contact under a notice.
  healthLocalExec: "电脑上的本机执行已关闭，任务在等待；在电脑上打开「允许云端下发本机任务」后继续。",
  noticeLastContact: "上次联系 {time}",
  // Remote desktop opened from 我的设备 on a session without a task to hand
  // back to (developer sessions): no 交还给 AI there, so no instruction to click it.
  bannerHuman: "你正在控制电脑，AI 已暂停。",
  // Consent for 接管电脑 and the remote desktop (C11 contract §2). The option is
  // the desktop app's own label in the envelope window (E, device_link/surfaces.rs).
  waitConsent: "等待电脑前有人同意这次远程控制…",
  takeOverAsk: "接管需要电脑前有人同意。",
  takeOverAskHint: "要在不在电脑前时也能直接接管，请在那台电脑的「允许云端助手使用这台电脑」里打开「授权期间允许我从手机/网页直接查看和接管这台电脑」。",
  // The remote desktop restored without a click (reload, back/forward): it asks
  // nothing of the computer until 连接 is clicked (W, 2026-10-27).
  remoteIdle: "尚未连接。点「连接」向这台电脑发出远程控制请求。",
} as const;
export type CloudAgentCopyKey = keyof typeof CLOUD_AGENT_COPY;
