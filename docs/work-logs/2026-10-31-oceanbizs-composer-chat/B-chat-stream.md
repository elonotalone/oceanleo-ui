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
（完成后在此追加）
