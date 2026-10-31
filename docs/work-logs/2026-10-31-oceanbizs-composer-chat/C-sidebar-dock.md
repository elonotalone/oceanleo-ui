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
（完成后在此追加）
