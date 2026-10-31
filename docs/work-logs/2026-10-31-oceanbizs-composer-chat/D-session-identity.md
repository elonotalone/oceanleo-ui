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

### 根因（三处，均在前端；gateway 行为正确，未改）

**A. 「附件还没存好」= 草稿线程上传附件时还没有 task session。**
首页原生对话（以及任务页里「选了程序、还没发第一句」的 pick）用的是同一个 `useNativeThread`，此时 `session=null`。
`useAgentDialogController.addAttachments` 按 `taskSessionRef.current` 决定是否带 `task_session_id`——草稿里是 `undefined`，
于是 `PUT /v1/computers/{id}/inbox` **不带** `task_session_id`：文件写进了电脑收件箱，但 `computer_task_attachments` 没有行。
按 Enter 后才建 session（`createComputerTaskSession`），首条 prompt 带着新 session id + 那些 inbox 路径发出 →
`task_sessions.attachment_metadata` 在新 session 里找不到行 → `managed_attachment_not_saved`(409) →「附件还没存好…」。
**每一次首页原生对话带附件都会这样失败**（不是偶发）。网关在广播 `user_message` 之前就拒绝，所以新任务里只落了一条 error 帧 →
「刷新后整页只剩这条报错」。旧测试 `queued first prompt…` 恰好把这个错误行为锁成了预期（草稿里上传、再用 managed-1 发）。

**B. 「新对话缀到 8ef8 末尾」= 草稿线程认领了别的页面的 `session_opened`。**
`useNativeThread` 不给 `useAgentDialog` 传 `sessionId`，所以同一台电脑上**所有**原生线程（各标签页、首页草稿、任务页）
连的是同一个网关 shell scope `(computer_id, "")`，`registry.broadcast` 把帧发给这个桶里的每个 socket。
任何一个 8ef8 视图重连（`useAgentDialogController` 第 714 行 `gen > 1 && acpSession` → `open_session`）或打开，
网关回的 `session_opened` / `transcript`（无 `ref`）会到达首页草稿；控制器对「无 ref 的 session_opened + 当前视图是草稿」
直接认领（`pendingKey = … frame.t === "session_opened" && !activeSession ? viewKeyRef.current`）→ 首页「新对话」变成了
8ef8 的对话（显示其 transcript 和正在跑的回合），排队的新气泡就出现在 8ef8 末尾。新测试在去掉修复时复现失败
（草稿 activeSession 变成别的任务的 native session）。网关侧从未把新消息写进 8ef8（见证据），这是前端显示身份串号。

**C. 「正在打开对话…」**：(1) 已有会话在云端存档还没读回来的那段时间（以及 live 未 ready 时）空态直接写「正在打开对话…」；
(2) `showArchive` 额外要求 `!dialog.busy`，忙碌（跑着的）会话在 live 回放到达前把已存对话藏起来，只剩这行字；
(3) 排队的首条 prompt 下面还有一行同样的字。附：06:40:01 的首页发起（task d617b119）期间网关 blue 上 06:20–06:42
没有任何 agent-dialog socket（见日志），排队 prompt 一直挂着「正在打开对话…」直到 45 s 失败，留下一个空任务。

### 证据
- 孪生网关日志（`ssh ws-host docker logs oceanleo-api-green / -blue`）：
  - green：`PUT /v1/computers/cc_6b9905f8aaf2/inbox?name=…20261031140700.png`（**无** task_session_id，06:07:03）。
  - blue 第 2250 行：`PUT …/inbox?name=…20261031143539.png`（**无** task_session_id，06:35:40）；对照 06:45 之后
    `…&task_session_id=cts_8cc8…` 的 PUT 都有附件行。
  - blue 13374 `POST /v1/computers/cc_…/task-sessions`（06:42:38 → 24fcbc86 / cts_fd00）→ 13443 `turn program=claude session=-`
    → 13599 `error program=claude code=invalid_argument cause=managed_attachment_not_saved`。这是 green(10-30 23:18 起)+blue
    全部日志里**唯一**一次该错误，即 operator 说的那次。
  - blue 第一条 agent-dialog WebSocket accept 在 12610 行（06:42），06:20:30–06:42 之间没有；8495 行 06:40 的 POST（d617b119）后没有 turn。
- 只读 SQL（`supabase-sql oceanleo`）：
  - `computer_task_attachments` 10-31：06:07/06:25/06:35 三张图**没有行**，但文件在 `/root/oceanleo-inbox/` 上（孤儿文件）。
  - cts_fd00（24fcbc86）帧：seq 19178 `error invalid_argument`（06:42:40，无 user_message），19189 起才是成功的「hi」。
  - cts_a442（8ef8）帧：10-31 只有两条 error（seq 18768/18769，06:21:57 `computer_reconnecting`/`node_error`，即 green→blue 切换），
    **没有**任何外来 user_message / 附件报错。
  - cts_4ceb（d617b119「elon · claude」）：06:40:01 建，`run_status=associated`，0 帧，`native_session_id` 为空。
- 截图 1（06:44:49）：blue 15892 读 sessions → 15966 WS → 15995 读 transcript；存档里已有「hi」+ 回复，但空态显示「正在打开对话…」。
  截图 2 的红条来自同一标签页模块级 presentation 缓存里首页线程留下的 live notice（openSession 恢复了该视图）。

### 修复（oceanleo-ui）
- `src/shell/cloud-computer/agent-dialog/useAgentDialogController.tsx`
  - 新选项 `bindUploadsToTaskSession`（只给 managed 线程开；Computers 页不变）：草稿里加的附件留在本标签页（`deferred`），
    session 一出现（effect on `taskSessionId`）就带 `task_session_id` 上传；session 换了，已上传的文件在新 session 下重传，
    没字节可重传的直接移除；`send` 先 `settleUploads`（有界 3 轮），且 managed prompt 只带「在本 session 下归档」的文件。
    上传逻辑抽成 `startUpload`。
  - 无 `ref` 的 `session_opened` 只有 `openActiveSession=true` 的宿主（Computers 页）才认领；自己开会话的宿主（任务对话、首页草稿）永不认领。
- `src/shell/cloud-computer/agent-dialog/types.ts`：`DialogAttachment.deferred`。
- `src/shell/native-thread/useNativeThread.ts`：开 `bindUploadsToTaskSession`；New Task（session→null）清掉上一段对话 composer 里的附件；
  deferred 附件不显示转圈；`showArchive` 去掉 `!dialog.busy`；新增 `opening`（已有会话、存档还没读回、无可显示内容）。
- `src/shell/AgentChat.tsx`（只动 native pane 的 blockedLine / empty 两处）：删掉排队时的「正在打开对话…」行；空态在
  `connecting || thread.opening` 时只显示安静的 spinner（`data-native-opening`，aria 用已有词条「正在读取…」），否则显示原提示。无新文案。
- 网关：**未改**。`tests/test_computer_task_sessions.py::test_managed_attachment_cannot_reference_other_session_or_machine_path`
  明确锁定「managed 附件不能引用别的 session 或机器路径」，所以不在网关加「从机器读回补档」的兜底（会与该合同冲突）；根因在前端已修。

### 测试
- 改：`tests/native-thread-hook.test.mjs`「queued first prompt…」——现在锁定：草稿里**不**上传；session 绑定后只上传一次且带
  `task_session_id=managed-1`，与 prompt 同一个 session。
- 新：`native-thread-hook.test.mjs`
  - 「a draft never adopts another view's session_opened…」：别的视图的 `session_opened`+`transcript`+delta 到达草稿，草稿仍是新对话、
    不显示别的任务内容；首条 prompt 无 `acp_session`、有 `ref`、`task_session_id=managed-new`，附件在 managed-new 下上传。（去掉修复时该测试失败，已验证）
  - 「composer files follow the conversation's task session…」：A 下上传 → 换到 B 重传到 B 并随 B 的 prompt 发出；New Task 清空。
  - 「an existing conversation is 'opening'…」：存档未回 `opening=true`，回来后显示存档、`opening=false`。
- 改：`tests/agent-chat-conversations.test.mjs` 两条原锁「正在打开对话…」的用例改为锁「无此行 / spinner」；新增一条「打开已有对话不显示正在打开对话…」。
- 运行：`pnpm typecheck` ✅；`native-thread-hook` 17/17、`agent-chat-conversations` 34/34、`cloud-computer-agent-dialog` 15/15、
  `acp-card-flows` 55/55、`cloud-computer-dialog-inbox` 4/4、`w1-native-attachments` 9/9、`mobile-native-attach` 25/25、
  `agent-chat-home-launch-keeps-transcript` 19/19、`agent-chat-w3-history-native` 4/4、`native-composer-controls` 9/9、
  `native-thread-gate` 5/5、`native-thread-map` 6/6、`i18n-tt-key-coverage` 10/10、`native-surface` 12/12、`no-native-dialog` 5/5、
  `conversation-dock` 19/19、`private-composer-attachments` 10/10 ✅。

### 数据（只报告，未改）
- 8ef8 / cts_a442：未被污染（没有串进来的消息或附件报错帧）；两条 06:21:57 的 reconnect error 是网关切换造成的。
- 24fcbc86 / cts_fd00：seq 19178 是失败首条 prompt 的 error 帧（原文和附件没有落库），之后的「hi」正常。
- d617b119 / cts_4ceb：06:40 首页发起留下的空任务「elon · claude」（0 帧）。
- 孤儿 inbox 文件（无附件行）：`/root/oceanleo-inbox/20261031T060702Z-…`、`…T062536Z-…`、`…T063540Z-…`。

### 交接
- 改动只在 `@oceanleo/ui`；主站 `HomeContent` 无需改代码，但要 parent 发 ui 版本 + 主站 bump 才生效。
- 待查（未证实，不在本次范围）：green→blue 切换后约 20 分钟浏览器没有任何 agent-dialog socket 重连到 blue
  （`scheduleReconnect` 在 `!active`/`!enabled` 时直接 return，隐藏线程不重连；节点离线期间也不会重拨），这会让排队 prompt 挂 45 s 后失败。
