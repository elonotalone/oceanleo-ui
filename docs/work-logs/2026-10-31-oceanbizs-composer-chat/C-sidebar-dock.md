# C — 左侧栏任务工作中动效（7）、「切换对话」记住上一次（3）

先读 `00-dispatch.md`（红线）。

## 负责文件
`src/shell/HistoryMasterDetail.tsx`（侧栏 / 历史列表的任务行）、`src/shell/cloud-computer/ComputerDock.tsx`、`src/lib/execution-target.ts`（若默认选择在这里）、新 helper、相关测试。不碰 LeoComposer.tsx（A）、AgentChat.tsx（B/D）。

## 7. 任务行左侧：干活时动态 UI，否则什么都不显示
- 现状：`HistoryMasterDetail.tsx` 的 `STATUS_DOT`（约 214 行）按 running/done/failed/stopped 显示黄/绿/红/灰点（774 行）。
- 改成只有两种：**在干活** → 显示动态指示（以前 Computers 页聊天框里的「工作中」动效——去 `src/shell/cloud-computer/agent-dialog/`（MessageList.tsx 等）找那个动效组件/CSS，按宿主样式复用其视觉，别 import 别的页面的整块组件；做成一个小的行内指示器，选中行（蓝底白字）时颜色也要可见）；**没在干活** → 不显示任何点（为对齐可保留同宽空位，或去掉，选看起来整齐的）。失败/停止/完成对用户不区分。
- 「在干活」的判定：`computer_run_status` / `status` ∈ running / waiting_user / active 之类（读 `src/lib/agent.ts` 与 gateway `attach_run_states` 的取值确认）；session 记录用 `record.status`。确认列表在任务运行状态变化时会刷新（静默轮询或事件）；如果运行结束后侧栏要很久才停动效，修到合理（几秒内）。
- 首页 / AppShell 侧栏「My Tasks」若是另一个组件渲染，同样改（grep `STATUS_DOT`、`rounded-full` + status）。

## 3. 首页「切换对话」按上一次显示
- 首页输入框里的 ComputerDock 触发键（`ComputerDock.tsx` 339 行 `triggerTitle`，`切换对话`）现在每次默认 Cloud。改为记住用户上一次的选择（电脑 + 程序，如 `elon · Claude Code`），下次打开首页 / 刷新后显示这个选择；选择失效（电脑删了/程序不在）才回落到 Cloud。
- 找出默认值从哪来（`execution-target.ts` 的 pin 机制？首页初始 state？），持久化到 localStorage（按用户 id 区分若容易拿到）。任务页里「已在这个任务中」的锁定行为不变——只改首页新任务的默认值。
- 注意：首页选了某电脑程序再发送，D 在修发送后串到别的任务的 bug；你只管「显示/默认值」，不要改发送路径。如果你发现默认值恢复会让首页带上一个旧的 task/session id（而不只是 computer+program），**不要**恢复 session id，只恢复 computer+program，并在结果里写明。

## 验证
`pnpm typecheck`；`tests/execution-target.test.mjs`、`tests/*history*`、`tests/*computer-dock*`（先 ls 找）；两项各加测试。

## 结果

### 改了哪些文件
- `src/shell/history-model.ts`：新增 `isTaskWorking`（`task.status === "running"` 或 gateway `attach_run_states` 投影的 `computer_run_status ∈ running / waiting_user`）、`isHistoryEntryWorking`、`HISTORY_WORKING_POLL_MS = 3000`；`mergeHistoryEntries` 给在干活的行加 `working: true`（session 行看绑定它的 task：`task.session_id === session.id` 或 `session.task_id`）。不干活的行不加字段。
- `src/shell/HistoryMasterDetail.tsx`：删 `STATUS_DOT` 红黄绿灰点；任务名左侧固定 12px 槽位，在干活时放工作中动效（电脑对话列表同一个像素小人 `SessionRunningIcon`，未选中 `text-emerald-600`，选中蓝底行 `text-white`），否则空槽（标题对齐、开始/结束时不跳）。`sameHistory` 补比 working 与 `task.computer_run_status`（以前 computer_run_status 变了列表不刷新）。有工作中的行时每 3s 静默刷新，运行结束后几秒内动效停；没有时仍是原 8s 轮询。
- `src/shell/cloud-computer/agent-dialog/SessionRunningIcon.tsx`：只加可选 `toneClassName`（默认值 = 原来的 emerald 色），AcpCard 不变。
- `src/shell/cloud-computer/remembered-conversation.ts`（新）：按账号存「电脑 · 程序」对话选择 `oceanleo.dock-conversation.v1:<userId>`，只存 `{kind:"native", computerId, computerName, program, view:"chat"}`，读写都丢掉 sessionId；`resolveRememberedConversation` 按当前已接入电脑 + 程序清单判断是否失效。
- `src/shell/cloud-computer/ComputerDock.tsx`：草稿（无 `boundTarget`、有 `onConversationChange`、host 没给 `conversation`）挂载后按账号恢复一次上一次的对话选择：电脑不在 / 未接入、或程序清单显示未安装/不存在 → 清掉记忆，回落到 OceanLeo 目标（默认云端）；电脑离线不算失效（照常恢复）；列表读不到 → 不恢复也不清。用户已经点过、host 已有 conversation 时不覆盖。草稿里点「对话」写记忆；点任何 OceanLeo 行清记忆；命令行/终端不改记忆（它们一点就跳任务页，恢复它们会导致首页一加载就跳走）。任务页（bound）既不恢复也不写。dock 仍不建 session、不导航。
- 测试：`tests/conversation-dock.test.mjs`（+3 条 C-3）、`tests/history-model.test.mjs`（+2 条 C-7）、`tests/history-working-mark.test.mjs`（新，渲染级：只有在干活的行有动效、无任何彩色点、结束后 ≤4.5s 内消失、history-changed 事件后重新出现）、`tests/library-task-render-loop.test.mjs`（只给它的 `./history-model` 桩补两个新导出）。

### 默认值根因（3）
OceanLeo 执行目标本来就按账号记在 `execution-target.ts`（`oceanleo.execution-target.v1:`）。丢的是电脑程序对话（`elon · Claude Code`）：它是 host（oceanleo 仓 `app/_components/home-content.tsx` 的 `useState<Conversation|undefined>(undefined)`）的纯内存状态，dock 文档写明「No memory of its own」，刷新即回云端。修法放在共享包 dock 里：恢复时调用 host 已有的 `onConversationChange`，host 代码不用改。只恢复 computer + program，**不恢复 session/task id**。

### 测试
- `pnpm typecheck`（agent-io-guard run-heavy）：通过。
- 通过：`history-model`(14) `history-working-mark`(1) `history-leo-created-mark`(1) `history-subnav-loading`(4) `history-url-contract`(2) `conversation-dock`(19) `cloud-computer-dock`(23) `cloud-computer-dock-remembered-name`(6) `d10-computer-dock-hydration`(3) `execution-target`(7) `acp-card-flows`(55) `sko-w11-history-projects`(8) `project-history-scope`(3) `rebuild-global-history`(6) `eas-w06-dock-and-links`(4)。
- `library-task-render-loop`：失败，但在干净 HEAD worktree 上同样失败（AgentChat 桩缺 `authed` 导出，既有问题，与本改动无关）；本改动所需的 history-model 桩导出已补。

### 交接（parent）
- 首页 host 不用改，但 oceanleo / oceanbizs 需要升 `@oceanleo/ui` 版本才生效。
- 恢复后首页 host 会像用户手动选了一样预热该电脑程序的连接（`useNativeThread` enabled），这是现有选择行为，不是新的发送路径；发送路径没动（D 的范围）。
- `SessionRunningIcon.tsx` 在 agent-dialog 目录里，只加了一个带默认值的可选 prop。
