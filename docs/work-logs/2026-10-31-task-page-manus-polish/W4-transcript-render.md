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

## 结果
（完成后追加；写明宽度常量名与取值依据）
