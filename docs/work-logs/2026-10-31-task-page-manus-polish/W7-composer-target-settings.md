# W7 — 输入框："切换对话"记住上次、高度上限仿 Manus、agent 设置菜单（五种 agent 统一）

先读 `00-dispatch.md` 红线。看图：`/root/oceanleo-inbox/20261031T085903Z-粘贴图片-20261031165901.png`（输入框太高、`Opus 5.5 · Auto-accept edits`）、Manus `…085855Z…`。

## 负责
`src/shell/LeoComposer.tsx`、`ModelPicker.tsx`、`model-picker-visibility.ts`、`src/shell/cloud-computer/ComputerDock.tsx`、`cloud-computer/remembered-conversation.ts`、`execution-target.ts`、`composer-*.ts`、`AgentChat.tsx` 中 composer 配置那一段（约 2700 行 "What the composer … needs to show and switch conversations"）、`src/i18n/ui/messages/computer-task-workspace-copy.ts` 中相关文案；主站 `/root/projects/oceanleo/app/_components/home-content.tsx`；必要时后端 Leo 模型/快速模式选项接口。

## 要做
1. **首页"切换对话"记住上次**：上一批 C（`docs/work-logs/2026-10-31-oceanbizs-composer-chat/C-sidebar-dock.md`）在共享包 dock 里加了 `remembered-conversation.ts` 并在 v0.236.0 发布、oceanbizs.com 已部署（主站 main a02b2dd0），operator 实测仍然没好：选了 Claude Code，刷新回到 Cloud。找真实根因（读首页 host 实际代码路径、挂载顺序、`userId` 何时可用、程序清单何时返回、是否被 host 默认值覆盖、恢复条件是否太严、是否只在某个分支生效等），写进结果，修好。要求：选了 Claude Code（或任一电脑程序 / 云端 Leo 某目标），刷新后显示同一个。不恢复 session/task id。加覆盖真实挂载顺序的测试（例如 userId 晚到、程序清单晚到）。
2. **任务页输入框最大高度**：参考 Manus 输入框高度上限占视口的比例（按图测），我们任务页输入框现在能长到很高（图里占了半屏）。超过上限内部滚动。首页同理检查。
3. **agent 设置菜单统一**（Codex、Hermes、Claude Code、Cursor、OceanLeo agent）：
   - 输入框右侧药丸只显示模型名（如 `Opus 5.5`），不再显示 `· Auto-accept edits`。
   - 点击 → 弹出菜单，列出该 agent 自己支持的设置行，每行左边名称、右边当前值：`Model  Opus 5.5`、`Reasoning effort  High`、`Permission mode  Auto-accept edits`、`Fast mode  Off` 等（每个 agent 只显示它真实支持的项；从现有 ACP 会话的 config options / modes / models 读，别写死）。
   - 点某一行 → 菜单右侧再弹出一张卡片列表，列出该项可选值（模型列表带简短说明），选中即切换并关闭；键盘可用；视口边缘自动翻转。
   - OceanLeo agent（云端 Leo）也用同一个菜单：模型、思考强度、**快速模式**等。现在 Leo 选不了快速模式——查清楚是前端没接、还是网关没暴露选项，补齐（网关侧最小改动；Leo 的模型/快速模式现有接口先找）。
   - 基于现有 ModelPicker / 菜单组件改造，一套 UI；不要新视觉体系。

## 验证
- 相关测试：`conversation-dock`、`cloud-computer-dock*`、`execution-target`、`model-picker*`、`leo-composer*`、`acp-card-flows` 等锁定新行为；新测试：刷新恢复（含晚到数据）、药丸只显示模型名、菜单行按 agent 能力渲染、点行出二级卡片、Leo 快速模式可选并随请求发出。

## 结果
（完成后追加；必须写"切换对话"真实根因）
