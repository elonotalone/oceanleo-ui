# W3 — 左侧 My Tasks 仿 Manus + 所有任务自动总结标题

先读 `00-dispatch.md` 红线。看图：`/root/oceanleo-inbox/20261031T083951Z-粘贴图片-20261031163950.png`（Manus 目标样式）、`/root/oceanleo-inbox/20261031T084035Z-粘贴图片-20261031164034.png` 和 `…092522Z…`（我们现在的样子）。

## 负责
- 前端（oceanleo-ui）：`src/shell/HistoryMasterDetail.tsx` 的左侧任务列表部分（行渲染、选中态、分组头）、`src/shell/history-model.ts`、左侧导航里 "My Tasks" 可折叠分组所在的文件（自己找：`WorkspaceSession.tsx` / 主站侧栏 / `nav-source`；若在主站 `/root/projects/oceanleo/app/**`，那部分也归你）。`HistoryMasterDetail.tsx` 右侧详情区/头部/加载归 W5。
- 后端（oceanleo）：任务标题生成（`agent_tasks.title`，Leo 云端任务 + 电脑任务；电脑任务已有 `computer_task_sessions.auto_title_pending/auto_title_seed` 字段，找到现有标题链路再改）。

## 要做（前端）
1. 任务行默认**不显示时间**（现在每行第二行是 `10/31 16:24 · home-agent`，删掉这一行）。
2. 任务名字号大一些（对照 Manus 图，和我们侧栏其它主导航项同级或略小一点；单行省略号截断）。行高、内边距仿 Manus。
3. 左侧不应有竖线（现在 My Tasks 下的任务列表左边有一条竖线/缩进线），删掉。
4. 选中任务：对应任务行显示**灰色**圆角底（项目现有中性灰 token，接近 Manus 的浅灰），不要蓝底白字。悬停：更浅的灰。"My Tasks" 分组头本身**永远不显示灰底**（现在选中某个任务时 My Tasks 头是灰的）。
5. 悬停任务 → 弹出新"气泡"（浮层，仿 Manus：白底、细边、阴影、圆角），内容 = 完整任务名（可换行）+ 时间（右侧或下方，用户本地时区，今天显示时间，其他日期显示 "Oct 20" 这种短日期，按语言本地化）。气泡要贴着行右侧出现，不被侧栏裁掉（portal 到 body），悬停延迟 ~300 ms，移开即收。键盘焦点也能出现。
6. 上一批 C 加的"在干活"动效（`SessionRunningIcon` 小人，任务名左侧 12px 槽）保留，选中灰底上颜色要可见（不再是白色）。"…"更多按钮保留（悬停/选中才显示）。
7. 若任务行有图标需求：Manus 每行有类型图标；我们是否加由你判断，若加，用现有图标体系表达任务类型（云端 Leo / 电脑程序 Claude Code、Codex 等），不要引入新视觉体系。

## 要做（标题）
1. **所有任务默认自动总结标题**：用户自己电脑上的（Claude Code / Codex / Hermes / Cursor / Terminal 对话）+ 我们云端的 Leo 任务。现在一大片 "hi"、"elon · codex"、"elon · Terminal"、"https://oceanbizs.com/history?task=…"。
2. 规则建议：第一轮用户输入 + agent 回复后生成简短标题（中文对话用中文，≤ 20 字；英文 ≤ 6 词，参考 Manus "Greeting"/"如何将svg文件转换为png"）；首条输入信息量太低（如 "hi"）时，等到出现有意义的内容再生成或在后续轮次更新一次；用户手动改过名的永远不覆盖（找现有重命名字段/标志）。用现有的便宜模型调用通道（找现有标题生成或 `auto_title` 代码），走现有计费/不计费规则。
3. 已有任务：列表拉取时对可见的、未总结的任务懒补（排队、限速、只补本用户的），不要写一次性全库批处理。
4. 共享库规则：只碰本 `gateway_instance` 能处理的行（参考 `backend/app/background_workers.py` 与 `migrations/0308_gateway_instance_ownership.sql`）或按请求用户懒补（请求路径天然只碰自己的行）。迁移只加不删，不执行。

## 验证
- 前端：相关测试（`tests/history-model.test.mjs`、`history-working-mark`、`history-*`、`sko-w11-history-projects`、`project-history-scope` 等）改成锁定新行为 + 新测试（无时间行、选中灰底类名、分组头无高亮、悬停气泡含完整名和时间、无竖线）。
- 后端：标题生成单测（低信息首句延后、手改不覆盖、电脑任务也生成）。

## 结果
（W3，2026-10-31 完成；未 commit / push / deploy，无新迁移）

### 根因
- 标题全是 "hi"：所有行的名字都是系统直接截的首句（Leo 任务 `prompt[:48]…`，电脑任务 `"<电脑> · <程序>"` 种子 → 触发器换成首条用户消息，home-agent 会话 = 客户端首句），只有「归档的 app 会话」才会调 AI 起名。而那条唯一的 AI 路径也一直失败：title 路由是推理模型（openrouter `qwen/qwen3.8-flash`），`max_tokens=60` 全被隐藏推理吃掉（实测 completion=reasoning=60、text=""）→ 全部落 `fallback`（oceanleo 库里 operator 的 home-agent 会话全是 `title_status=fallback`）。
- 侧栏蓝底/竖线/分组头灰底：行内 `style={{background: accent}}`；主站 `clone-shell.tsx` 展开区 `ml-3 border-l … pl-1`；分组头与普通导航共用 `isActive(/history)` 高亮。

### 改动
前端 oceanleo-ui
- `src/shell/HistoryMasterDetail.tsx`（仅左侧列表段）：行只剩一行任务名（删时间 / home-agent / 站点 / 花费副标题，删掉随之无用的 `fmt`/`fmtCost`/ledger）；14px 常规字重、单行截断、`py-2 leading-5`；选中 `bg-neutral-200/80 text-neutral-900`，悬停 `hover:bg-neutral-200/50`，不再有 accent 内联色；工作中小人在灰底上保持 `text-emerald-600`；左槽 `w-4 + gap-2.5` 与上方导航标签同列对齐；项目标签挪到标题同一行（中性色）；行外层换成 `HistoryRowFrame`（悬停气泡）。不加类型图标（C-7 约定「不干活时什么都不显示」）。
- 新 `src/shell/HistoryRowBubble.tsx`：悬停 300 ms / 键盘聚焦弹出，portal 到 body、贴行右侧（视口内限宽），白底细边圆角阴影，完整名可换行 + 时间；移开 / 失焦 / 滚动 / 改名中 / 菜单打开即收；`role=tooltip` + 标题按钮 `aria-describedby`。
- `src/shell/history-model.ts`：`historyEntryTimestamp`、`formatHistoryTime`（本地时区；今天 = 钟点，今年 = "Oct 20"/"10月20日"，跨年带年份；语言取 `<html lang>`）。
- `src/shell/HistoryRowActions.tsx`：选中行「…」改中性灰（原白色）。`src/shell/LocalWorkspace.tsx` `LocalTaskRows`：同样一行 + 灰底，阶段放进 title 提示。
主站 oceanleo
- `app/_components/clone-shell.tsx`：删缩进竖线；可展开分组头展开时不高亮（图标轨道里仍标当前页）。
后端 oceanleo
- `app/app_session_titles.py`：`TITLE_MAX_TOKENS=600`（根因修复）；新共享 `summarize()`（同一平台 key / `record_usage key_mode=platform`）；提示词跟随用户语言，中文 ≤20 字、英文 ≤6 词；thread 会话（home-agent / agent）改走新路径。
- 新 `app/task_titles.py`：Leo 云端任务 + 电脑任务（Claude Code/Codex/Hermes/Cursor/Terminal，均镜像在 `agent_messages`）+ thread 会话。规则：首轮有回答且用户侧有信息量才起名（"hi"/test/纯链接等待，后续轮次有内容再起）；只覆盖「仍是系统自动名」的标题（首句各种截法、电脑种子、snapshot 兜底），写入带 `eq(title, 旧值)`，改名竞态用户赢；不动 `last_activity_at`/排序。懒补：列表请求只挑本用户可见行，每类每用户 15 s 至多 3 条，按行版本（title/status/updated_at）记忆，后台任务执行；请求路径天然只碰自己的行，无全库批处理、无 gateway_instance 依赖。
- `app/agent/session_service.py`：会话列表顺带调度 thread 会话；metadata 改名写 `title_status=generated`（以前改名后的归档 pending 会话会被 AI 覆盖）。`app/agent/query_service.py` + `app/routers/agent_router.py`：`GET /tasks` 调度无会话任务（`background_tasks` 可选参数，直接调用的旧测试不受影响）。

### 测试
- 前端：新 `tests/history-sidebar-manus.test.mjs`（5：无时间行/无来源/14px 单行截断、选中灰底无 accent、悬停 300 ms 气泡含完整名+时间且 portal 到 body、键盘聚焦、`formatHistoryTime`）；改锁新行为：`history-working-mark`（槽 `w-4`）、`history-subnav-loading`（本机阶段进 title、无 accent）、`sko-w11-history-projects`（任何行都不再显示 home-agent）、`history-leo-created-mark`（按 `data-history-title` 找标题）。全部通过；另 `history-model` 14/14、`project-history-scope` 3/3、`architecture-convergence`、`i18n-tt-key-coverage` 通过。主站 `tests/portal-sidebar-scroll.test.mjs` 新增 1 条（分组头不高亮、无竖线）3/3。
- `pnpm typecheck`（run-heavy）：我的文件无错；仅剩 `src/shell/native-thread/NativeModelPicker.tsx:175`（W7 区域）。
- 后端（容器 `python -m unittest`，容器里没装 pytest）：新 `tests/test_task_titles.py` 14/14（低信息延后、改名不覆盖、改名竞态、电脑任务种子/首句都起名、他人行不碰、活跃 home-agent 会话起名且不改排序、归档纯问候会话落 fallback 不调模型、fallback 会话重起名但改过名的不动、metadata 改名即定稿、懒挑限流/记忆）；`test_agent_sessions`、`test_aux_routes`、`test_session_output_gate`、`test_project_work_privacy` 等 154 条中仅 `test_task_created_by_leo` 2 条失败——断言 shell 行出现在列表，而 `query_service` 早已过滤 `mode='shell'`，与本改动无关（本改动只在过滤之后加调度）。`test_bay_shared_task_read` 在 unittest 下导入失败（依赖 pytest rootdir），同样与本改动无关。

### 交接 / 未证实
- W5 的 `task-loading-gate` → `nav-source/route-boundary` 从 `../../ui` 引 `SkeletonCard/SkeletonLine`，把所有用 `"../ui"` 桩编译 `HistoryMasterDetail.tsx` 的测试打哑。我在自己负责的 5 份测试桩里补了这两个导出；`tests/c11-fw-cloud-agent-polish.test.mjs` 的 3 处 `"../ui"` 桩还没补（临时副本补上后 15/15 通过）——W5 / parent 补一下。
- `effect-tt-dependency` 红在 `messages/conversation/ConversationView.tsx:223`（非 W3）。
- 未在浏览器里看过（红线）。字号取 14px 常规字重（任务书要求「大一些」，导航是 13px）；若 operator 觉得比导航大，改成 13px 只需改 `HistoryRowFrame` 的 `text-[14px]`。
- 真实模型只探测过一次（证实 60 token 空输出、600 token 输出 `{"title":"SVG转PNG方法"}`）；上线后标题由列表懒补，已有任务在用户打开侧栏后陆续更新（每 15 s 最多 3 条）。其它用 light 路由且 max_tokens 很小的后台活（如 `im/call_minutes.py`、`bay_apps/assistant.py`）可能同样被推理吃掉，未查。
- `HistoryDetail` 头部标题（W5 区域）是否随列表刷新更新未核。
