# W4 — 对话正文：加宽、用户气泡上方时间（含 LeoChat）、步骤色块

先读 `00-dispatch.md` 红线。看图：Manus `/root/oceanleo-inbox/20261031T085855Z-粘贴图片-20261031165853.png`；我们 `…084035Z…`、`…085903Z…`、`…092522Z…`。

## 负责
`src/shell/agent-conversation-layout.ts`、`AgentTranscriptBubble.tsx`、`AgentProgress.tsx`、`agent-thread/*`（只读或必要的渲染辅助）、`AgentChat.tsx` 中消息列表渲染那一段、`src/shell/leochat/` 的消息列表渲染。输入框（LeoComposer）归 W7；滚动/加载归 W5；附件点击归 W6。

## 要做
1. **加宽对话文字区**：现在任务页正文左右空白太大。测出 Manus 图里正文列宽与可用区域的比例（图是 2877px 宽的原图缩放，按比例算），我们侧栏更窄，正文列再宽一点点。输入框容器与正文同宽（W7 不改宽度，宽度常量由你统一，写在 layout 文件里；告诉 W7/parent 常量名）。电脑任务与 Leo 任务同宽；右侧预览打开时按比例收窄、不出横向滚动条。
2. **用户气泡上方时间**（Manus "Today 4:54 PM" 居中小灰字）：
   - 任务里第一条用户消息上方显示时间。
   - 与上一条用户消息间隔超过阈值（建议 5 分钟，仿微信）的新用户消息上方再显示；很快连着发的不显示。
   - 格式：今天 = "Today 4:54 PM" / "今天 16:54"；昨天 = "昨天 …"；一周内 = 星期 + 时间；更早 = 日期 + 时间。按语言本地化（`tt`）。
   - 写成一个纯函数（例如 `chat-time-separators.ts`：输入消息列表 → 哪些位置插分隔），任务页（Leo + 电脑任务）和 **LeoChat 消息**共用同一个函数和同一个分隔组件样式。
3. **步骤指示**：对话里显示步骤的蓝色小圆点 → 好看高级的 UI 色块：比蓝点稍大；随状态变色、变形（例如进行中 = 柔和渐变/呼吸的圆角方块或旋转的小几何形，完成 = 中性深色对勾形/实心块，失败 = 暖色，等待用户 = 另一种形状），状态切换有平滑过渡（CSS transition / keyframes，尊重 `prefers-reduced-motion`）。不要蓝色，配色融入现有中性体系。Leo 与电脑任务的时间线用同一个指示组件（见 oceanleo-ui `docs/work-logs/2026-10-30-task-chat-overhaul/` 的统一时间线约定，一套 UI）。

## 验证
- `pnpm typecheck`；改动相关测试（`tests/agent-chat-*`、`agent-progress*`、`agent-transcript*`、leochat 消息相关、layout 相关）锁定新行为；新测试：时间分隔纯函数（首条、间隔阈值、连发不显示、跨天）、LeoChat 也插分隔、步骤指示各状态类名/形状、宽度常量。

## 结果（W4，2026-10-31）

### 1. 宽度 —— 常量 `AGENT_CONVERSATION_MAX_WIDTH_CLASS = "max-w-[52rem]"`（`AGENT_CONVERSATION_MAX_WIDTH_REM = 52`），在 `src/shell/agent-conversation-layout.ts`
- 依据：Manus 图 2877px 原图、约 2.25 设备像素/CSS px。Manus 正文列与输入框 ≈1198 显示 px ≈ 768 CSS px（48rem），主区 ≈970 CSS px → 79%。我们旧值 `max-w-2xl` = 42rem = 672px，主区 ≈1010 CSS px → 66%（左右空白太大的根因）。我们侧栏更窄，取 52rem = 832px ≈ 82%，比 Manus 略宽。
- AgentChat 里正文列（`data-agent-stream-column`）、输入框外壳（`pane.footer`）、终端视图底部 ConversationBar 三处统一用这个常量；Leo 与电脑任务同一个 `renderStream`，所以同宽。列是 `w-full min-w-0` + 上限，右侧预览打开时随左栏收窄，`overflow-x-hidden` 不出横向滚动条。**W7 / parent：输入框宽度不要另写，直接用这个常量。**
- `src/theme/ui.css`（预编译产物）未重新生成：`max-w-[52rem]` 与新 CSS 类要等 parent 发版前跑 `pnpm build:css`（站点经 globals.css 的 `@source` 自编时已能扫到）。

### 2. 用户气泡上方时间 —— `src/shell/chat-time-separators.ts` + `src/shell/ChatTimeSeparator.tsx`
- 纯函数 `chatTimeSeparators(items, {timeOf, isAnchor, gapMs})`：首个有时间的锚点出时间；与上一个锚点间隔 > `CHAT_TIME_GAP_MS`（5 分钟）或跨本地日再出；连发不出；无时间的条目不出也不重置。
- 任务页：`agentMessageTimeSeparators(messages)`（锚点 = 用户消息；刚发出、还没落库时间的最新一条用户气泡按"现在"算，避免分隔晚一拍跳出来；没时间的电脑任务存档不瞎标）。AgentChat 云端流与 native 流各一行 `timeAbove={…get(item.index)}`，`AgentTranscriptBubble` 新 prop `timeAbove` 在气泡上方渲染分隔。
- LeoChat：`conversation-store.buildRows` 的 `"day"` 行换成 `"time"` 行（同一纯函数，锚点 = 所有消息），`MessageList` 删掉 DayDivider，改用同一个 `ChatTimeSeparator`。
- 文案：`formatChatTime` 全部用 Intl（RelativeTimeFormat 出 Today/今天/昨天，weekday、短日期、跨年带年），17 种语言天然覆盖，所以**没有新增 tt 文案**；24 小时制语言出 "09:05"，12 小时制出 "4:54 PM"。
- 电脑任务的时间：`agent-dialog/types.ts` 用户消息加可选 `at`；`reduce.ts` 本地发送打 `Date.now()`，`user_message` 帧若带 `ts/at/created_at` 就读；`map-dialog.ts` 透传为 `created_at`。

### 3. 步骤色块 —— `src/shell/AgentStepMark.tsx` + `globals.css` 的 `.leo-step-mark` 段
- 替换 AgentProgress 汇总行的强调色蓝点 / 转圈：12px 方框，`data-step-state` = running（中性渐变圆角方块，慢转 + 变圆）、waiting（空心环呼吸）、done（深石色圆角块 + 白勾）、failed（玫红菱形）、stopped（浅灰小圆点）；宽高 / 圆角 / 旋转 / 颜色走 `--leo-dur-5` 过渡，循环走 `--leo-loop-halo` / `--leo-loop-pulse-dot`；reduced-motion 下 running 只做透明度呼吸，不变形。
- 同一文件里的工具行"运行中/等待"、计划 ☰ 不再用 accent 色（改中性 stone）；`accent` prop 保留兼容但不再上色。Leo 与电脑任务共用 AgentProgress，所以是同一个指示组件。

### 改动文件
新增：`src/shell/chat-time-separators.ts`、`src/shell/ChatTimeSeparator.tsx`、`src/shell/AgentStepMark.tsx`、`tests/w4-transcript-render.test.mjs`。
修改：`src/shell/agent-conversation-layout.ts`、`src/shell/AgentChat.tsx`（只动 import、渲染段宽度 + `timeAbove` 两行 + 两处 separators 计算、终端底栏宽度、一行注释）、`src/shell/AgentTranscriptBubble.tsx`、`src/shell/AgentProgress.tsx`、`src/theme/globals.css`（新增一段）、`src/shell/messages/conversation/{conversation-store.ts,MessageList.tsx}`、`src/shell/cloud-computer/agent-dialog/{types.ts,reduce.ts}`、`src/shell/native-thread/map-dialog.ts`、`tests/process-timeline.test.mjs`、`tests/im-conversation-store.test.mjs`（day → time，加 5 分钟间隔一条）。

### 测试
- 新 `w4-transcript-render` 13/13；`process-timeline` 9/9、`native-thread-map` 6/6、`cloud-computer-agent-dialog` 15/15、`w1-native-attachments` 9/9、`agent-progress-contract` 17/17、`agent-chat-conversations` 34/34、`agent-chat-w3-history-native` 4/4、`agent-chat-streaming` 15/15、`agent-chat-single-header` 6/6、`agent-chat-home-launch-keeps-transcript` 19/19、`agent-chat-search-highlight` 12/12、`leochat4-surfaces` 9/9、`leochat3-window` 12/12、`W4-conversation-anchor` 5/5。
- 既有红（HEAD 上就红，非本次）：`im-conversation-store` 整份跑不起来（import 了源码里不存在的 `applyReactionLocal`）；临时去掉那个 import 跑：我改的 buildRows 三条全绿，另外 3 条（表情 / 线程 store）红，与 buildRows 无关。`motion-tokens` 第 8 条红在 `leo-rail-tip-in var(--leo-dur-3, 160ms)`（globals.css:310，HEAD 已有）。
- `pnpm typecheck`：我的改动无错；当前唯一报错 `src/shell/native-thread/NativeModelPicker.tsx(175,7)` 属 W7 进行中的文件。

### 未证实 / 交接
- 未开浏览器，未看真实观感（色块动效、52rem 实际占比）——等 operator 实机看。
- **交接 W2（后端）**：电脑任务存档帧 `safe_frame` 没有时间，刷新后从存档 / replay 读回的电脑任务对话不会出时间分隔（只有本页刚发的有）。如要补：`task_sessions.safe_frame` 对 `user_message` 加 `ts`（ISO），前端已读 `frame.ts`。
- `ui.css` 需 parent 重建（见上）。
