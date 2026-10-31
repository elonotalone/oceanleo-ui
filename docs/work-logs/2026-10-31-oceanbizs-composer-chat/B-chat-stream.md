# B — 对话流：上滑自动加载更早消息（4）、copy 只在一轮最后（6）

先读 `00-dispatch.md`（红线）。

## 负责文件
`src/shell/AgentTranscriptBubble.tsx`、`src/shell/AgentProgress.tsx`、`src/lib/agent-progress.ts`、`src/shell/native-thread/useNativeThread.ts` 中**分页 / loadOlder / hasOlder** 相关部分、`src/shell/AgentChat.tsx` 中 `renderStream` 与各 pane 传入的 `top:` / `onScroll` / items 渲染部分（约 2940–3000 行 native 分支，以及 Leo/云端 pane 的同类分支）。
D 也会改 `AgentChat.tsx`（会话打开、首页 launch、`正在打开对话…` 那几行，约 2905–2965 行的 openingQueued / blockedLine / empty）以及 `useNativeThread.ts` 的会话打开/ready 逻辑。你们改同一文件的不同区域：Edit 失败就重新 Read 再改，不要整文件覆盖写。

## 4. 删掉「读取更早的对话」，上滑自动加载
- 删除 `top:` 里的按钮（native pane 约 2952 行；也检查其他 pane / FunctionAgentChat 是否有同类按钮，同样处理）。
- 滚动容器滚到接近顶部（如 scrollTop < 200px）且 `hasOlder` 且未在加载中 → 自动 `loadOlder()`，每次只取一批（看 loadOlder 当前一次取多少，确保是「一批」而不是把剩下全部拉完；如果当前实现是一次性全量重拉整段，要改成按批往前取）。
- 加载完前插消息时**保持视觉位置不跳**：记录加载前 scrollHeight，渲染后 scrollTop += 新增高度（useLayoutEffect）。
- 加载中可在顶部显示一个很小的 spinner（用宿主已有的 spinner 样式），不要文字按钮。
- 新 turn 到来时自动贴底的行为不能被破坏。
- 同时修正：把完整超长对话「完完全全刷新」的行为——如果 loadOlder 实现是重置 messages 整列表重渲染，改为 prepend。

## 6. copy 只在一轮回答最后出现一次
- 现在每段 assistant 文本气泡（AgentTranscriptBubble 的「复制 / 重做 / 分享」行）都出现。改为：一轮（一个 user 消息之后到下一个 user 消息之前）的 agent 输出只在**最后**显示一排操作，复制内容 = 这一轮所有 assistant 文本段按顺序拼接（不含工具输出/思考）。
- 正在运行中的这一轮不显示操作行，结束后才显示。
- 参考截图 `/root/oceanleo-inbox/20261031T064627Z-粘贴图片-20261031144625.png`（Manus：回答末尾一行「完成 ✓ · 复制 · 重做」）。不用照抄星级评分。
- Leo 云端 pane 和 native（Claude Code/Codex）pane 都要生效——同一套渲染。`AgentChat.tsx` 里已有 `nativeLastAssistantIdx` 之类的变量，看它们现在怎么用。

## 验证
`pnpm typecheck`；`tests/agent-chat-*.test.mjs`、`tests/*progress*.test.mjs`、`tests/*transcript*`、`tests/*native-thread*`（先 ls 找）；为两项各加测试。

## 结果

### 4. 上滑自动加载更早消息（删掉「读取更早的对话」）
- `src/shell/AgentChat.tsx`
  - native pane `top:` 的按钮删掉；只在 `thread.olderLoading` 时显示宿主已有的 `.v-spinner`（`data-native-older-loading`，`aria-label=tt("正在读取…")`，已有词条）。云端 pane / FunctionAgentChat 没有同类按钮（云端流无分页）。
  - 新增导出 `LOAD_OLDER_PX = 200`、`shouldLoadOlder(metrics, {hasOlder, loading, movingUp})`：用户**自己往上滑**到离顶 < 200px，或这一批短到撑不满可视区（无法再上滑）才读；正在读 / 没有更早的不读。只认上滑方向，免得首屏 smooth 贴底（从 scrollTop 0 起）误触发。
  - `NativeChatConversation`：`onScroll` 判方向并调 `maybeLoadOlder`；读之前记 `scrollHeight` + 首条 id，`useLayoutEffect` 在首条 id 变（批次已前插）时 `scrollTop += 新增高度`，视觉位置不跳；读完无新内容 / 15s 无响应自动释放触发锁。贴底跟随逻辑原样保留（只在 followRef 为真时 scrollTo bottom）。
  - native 滚动容器加 `style={{overflowAnchor:"none"}}`（className 保持字面量，`process-timeline` 的锁不动），避免浏览器滚动锚定与手动补偿叠加。
- `src/shell/native-thread/useNativeThread.ts`（仅分页段）
  - `NativeThread` 增 `olderLoading`（archive: `archiveLoading`；live: `dialog.historyLoading`）。
  - 根因（「整段超长对话完全刷新」）：离线 / 云端存档路径 loadOlder 把 older frames 拼进 `archive.frames` 后**整段重新 reduce**，dialog id 是随机生成的 → 所有 AgentMessage id 全变 → 全部气泡重挂载。改为：较早批次单独 reduce 后存进 `olderArchive.dialog` 并 **prepend**，最新一批的 dialog 不再重算，屏上消息 id 不变。加 `olderInFlight` ref，滚动事件连发时只读一批。live 路径本来就是 connector `load_history before=offset` 一批一批前插（`mergeMessageLists`），未改。
- `src/lib/agent-progress.ts`：`buildAgentRenderItems` 的 key 原来含下标（`message-${id}-${index}` / `progress-${id}-${segmentStart}`），前插一批时所有 key 变 → 全量重挂载。改为按 id（重复 id 回落 `@index` 保唯一）。

### 6. copy 只在一轮最后出现一次
- `src/lib/agent-progress.ts`：新增 `agentTurnActionTargets(items, running)` → `Map<renderItemKey, copyText>`。一轮 = 两条 user 消息之间；只给这一轮**最后一段说给用户的话**（answer text / speech 行 / report，非空）一个操作行；复制文本 = 这一轮所有这类话按序 `\n\n` 拼接（不含工具输出、思考、interim）。正在跑的这一轮不给。
- `src/shell/AgentTranscriptBubble.tsx`：新 prop `turnCopyText?: string | null`（string = 显示一排并复制这串；null = 不显示；不传 = 旧的单条行为，保留给其他宿主 / 旧测试）。一轮一排时这排常显（Manus 式回答末尾一行），不再 hover 才出现；根节点带 `data-agent-turn-actions`。
- `AgentChat.tsx` 云端 pane（`running || presentation.working`）与 native pane（`nativePresentation.working || thread.running`）都传 `turnCopyText`；`FunctionAgentChat.tsx` 同样接上（同一套渲染）。
- 注意：cn 家族的 AIGC 角标长在这排操作里，现在也是一轮一个（标在整轮回答末尾）。

### 测试
- `pnpm typecheck` 绿。
- `node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/agent-chat-*.test.mjs tests/agent-progress-contract.test.mjs tests/process-timeline.test.mjs tests/native-thread-*.test.mjs tests/aigc-label.test.mjs tests/share-select-mode.test.mjs tests/agent-composer-contract.test.mjs tests/W4-conversation-anchor.test.mjs tests/editor-repair-acceptance-chat-layout.test.mjs tests/agent-action-history-live.test.mjs tests/approval-card.test.mjs tests/d15-ppt-session-schema.test.mjs tests/right-tab-no-task.test.mjs tests/e8-session-noop-write.test.mjs` → 237/237 绿。
- 新增：`agent-progress-contract`（一轮一排 + 拼接内容 + 跑着不显示；前插 key 不变）；`share-select-mode`（null 无操作、string 常显并复制整轮、streaming 不显示）；`agent-chat-conversations`（`shouldLoadOlder` 规则；native 无按钮、撑不满读一批、spinner、overflowAnchor；native 两轮两排复制且挂在最后一段下）；`native-thread-hook`（连调两次只读一批、前插后屏上 id 不变、olderLoading）。
- 测试桩补 `agentTurnActionTargets` 导出：`W4-conversation-anchor`、`editor-repair-acceptance-chat-layout`、`d15-ppt-session-schema`、`right-tab-no-task`、`e8-session-noop-write`、`workbench-toolbar-rendered`。

### 交接（parent）
- 范围外、非 B 引起的红：`workbench-toolbar-rendered`（`resolveEditBarDrawers` 桩缺导出，改动前就红）；`i18n-tt-key-coverage`「已添加」应从 PRE_EXISTING_GAPS 删（他人新增词条）；`i18n-key-collision` 若干分表冲突；`ccp-w3-message-list` notice `text-amber-700`（MessageList，B 未碰）。
- `src/i18n/ui/messages/computer-task-workspace-copy.ts` 的 `olderMessages: "读取更早的对话"` 现在没有调用方，留着无害，parent 可顺手删。
- Computers 页旧 `agent-dialog/MessageList.tsx` 里的「向上滑动查看更早的对话」不在本页范围，未动。
