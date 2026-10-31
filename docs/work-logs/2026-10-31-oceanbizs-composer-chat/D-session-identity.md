# D — 会话身份：「正在打开对话…」、首页新对话串进别的任务 + 「附件还没存好」（8）

先读 `00-dispatch.md`（红线）。这是最严重的一项：**必须找到根因并修掉**，不能只改文案或隐藏报错。

## 现象（operator 原话整理）
1. 有时显示「正在打开对话…」（截图 `/root/oceanleo-inbox/20261031T064450Z-粘贴图片-20261031144449.png`：task 24fcbc86-ae57-4df3-a345-5602a69e70ce，`computerSession=cts_fd0082dd41974332919fb436617cbc93`，elon · Claude Code，模型选择器 Loading…）。operator：这完全没有理由显示。
2. 同一任务稍后（截图 `20261031T064550Z`）：顶部红条「附件还没存好，请把附件重新加一次再发」，下面 user「hi」+ agent 回复。
3. 最严重：首页开新对话 + 附了图片 → 这条新消息被缀到 `https://oceanbizs.com/history?task=8ef8fb2b-ad21-439c-b103-41c771978be9`（另一个正在正常运行的 Claude Code 对话，`computerSession=cts_a442bce0cb864aa598a19b0b8d3ec66a`）的最后并显示报错；原对话不受影响，但新对话打不开；刷新后页面只剩这条报错。有时明明附了图片，整段话发不出去。

## 线索
- 报错来源：gateway `oceanleo/backend/app/cloud_computer/task_sessions.py::attachment_metadata`（按 `session_id` 查 `computer_task_attachments`，用 native_path 匹配 prompt 里的 files；没匹配 → `managed_attachment_not_saved` 409）。调用点 `agent_dialog.py` ~598（prompt 处理时 `task_session_id` + files）。附件写入：`cloud_computer_bridge_router.py::put_inbox`（`/v1/computers/{id}/inbox?task_session_id=`），按传入的 task_session_id 存行。
- 所以「附件存在 session X，prompt 却以 session Y 发出」就会报这个。结合「新对话缀到另一个任务」，高度怀疑首页发送时用了**陈旧的 task / computerSession 身份**（上一个打开过的任务的 session），或附件上传时用的 session 与最终发送的 session 不一致（首页先上传、后建 session；或 nativeLaunch 复用）。
- 前端链：`src/shell/AgentChat.tsx`（`NativeChatConversation`、`nativeLaunch`、`hostLaunch`、`startNative`、`submit`，约 2880–2960）、`src/shell/native-thread/useNativeThread.ts`（会话打开 / ready / queue / pending / 263 行注释说「已存云端 transcript 代替空的正在打开对话…」）、`src/lib/computer-task-api.ts`、首页发起逻辑（grep `nativeLaunch`、`computerSession`、`task_session_id`、`createTaskSession` 找首页 → 任务页的 handoff，可能在 `HomeIntro.tsx` / `src/shell/home*` / `SplitWorkspace` / `TaskWorkspaceShell`）、附件上传 `src/lib/cloud-computer-api.ts`（inbox PUT）与 `src/shell/composer-upload.ts`。
- 数据：`supabase-sql` 可查共享库（oceanleo 项目；先 `supabase-sql --help`）。表 `computer_task_sessions`（id cts_…, task_id, computer_id, program, native_session_id, run_status…）、`computer_task_attachments`（session_id, native_path）、`computer_task_frames`、`agent_tasks`。operator user_id = `3296855f-5acd-49bc-bba0-629bad087cda`。查 10-31 06:00–07:00 UTC 前后：task 8ef8fb2b / 24fcbc86 的 session 行，附件行落在哪个 session，frames 里报错帧属于哪个 session，有没有新建但空的 task。用数据坐实根因。只读查询，不改数据。
- twin gateway 日志：`ssh ws-host 'docker logs --since 6h oceanleo-api-blue'`（容器约 06:50 UTC 才起，更早的已没了；只作参考）。
- 「刷新后页面变成这条报错」：说明报错被持久化为该任务 frames/消息或 pending-unsent 存到 localStorage 并在刷新后被当成该页唯一内容。找到并修：失败的首条 prompt 必须留在它自己的新任务里（可重试），绝不能写进别的任务。

## 要做到
1. 首页新对话（含附件，含选 Claude Code/Codex 电脑程序）**永远**落在新建的任务 + 新建的 task session 上；附件上传与 prompt 用同一个 session id；绝不复用别的任务的 session。加测试锁住。
2. 「附件还没存好」只在附件真的丢了时才出现；正常附图发送必须成功。如果根因有一部分在 gateway（例如 native_path 匹配因路径规范化/竞态失败，或 attachment 行还没 commit 时 prompt 已到），在 `oceanleo` 后端修，并补 `backend/tests` 测试（`cd /root/projects/oceanleo/backend && python -m pytest tests/<file> -q`，走 run-light/run-heavy）。
3. 「正在打开对话…」不再出现：打开已有任务时直接显示已存的云端对话（cloud-saved transcript），后台再连 live；新任务首条 prompt 排队时显示用户气泡本身就够，不需要这行字。找出截图 1 为何卡在空白 + 正在打开（可能 transcript 拉取等 live 连接、或 session ready 卡住），修根因。
4. 已被污染的数据（8ef8fb2b 末尾那条串进来的消息 / 报错帧）：**只报告，不改数据**，写进结果，parent 决定。

## 与他人边界
- B 改 AgentChat.tsx 的 `top:` 加载更早 / renderStream items / copy；你改会话打开、submit/startNative/nativeLaunch、empty/blockedLine 那几行。Edit 失败就重新 Read，别整文件覆盖。
- A 在 composer-upload.ts 做草稿持久化；你若必须改 composer-upload.ts 的上传 session 绑定，先在本文件「交接」写清楚，并尽量把改动放在调用方（AgentChat / 首页发起逻辑）。
- C 只改 ComputerDock 的默认显示值。

## 验证
`pnpm typecheck`；`tests/agent-chat-conversations.test.mjs`、`tests/*native-thread*`、`tests/*native-task*`（先 ls）；gateway 改动跑对应 pytest。

## 结果（必须含：根因、证据（SQL/日志）、改动文件、测试）
（完成后在此追加）
