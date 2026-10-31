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

### W7 结果（2026-10-31 晚）

**"切换对话"真实根因（要点 5）**：v0.236.0 的记忆本身是对的（localStorage `oceanleo.dock-conversation.v1:<userId>` 写入正常，线上 oceanbizs 的 chunk 里确认有这段代码），坏在**恢复时机**：`ComputerDock` 恢复前先 `await client.listCliPrograms(computerId)` 才调用 host 的 `onConversationChange`。这个接口不是读库，是网关在用户电脑上跑一段 shell 探测（`programs.probe_command()`：逐个程序查安装 / 登录，macOS 上 Claude Code 的登录在钥匙串里、没有 `~/.claude/.credentials.json`，于是每次都跑 `timeout 15 claude auth status`；探测完 `list_programs` 还串行跑 `codex debug models` / `cursor-agent models`，各最多 20 s）。整段要几秒到几十秒，这期间 host 的 `conversation` 一直是 `undefined`，触发键显示「云端」——operator 刷新后看到的就是云端；这段时间里点了别的或直接发送，恢复也就永远不来了。测试里 `listCliPrograms` 是立即返回的桩，所以 C 批的测试全绿、真机不对。host（`home-content.tsx`）的挂载顺序、`userId` 时机、默认值都没有覆盖它，host 不用改。
修法（`ComputerDock.tsx`）：账号一拿到就把记住的「电脑 · 程序」直接交给 host（只有 computerId / computerName / program / view，**不带 session/task id**）；电脑列表、程序探测改成事后校验——电脑没了 / 程序探测明确说未安装 → 只清掉这一条记忆并回落到 OceanLeo 目标（`readExecutionTarget`）；用户在校验回来前已经自己选了别的 → 不覆盖、也不清他新的记忆；电脑改名 → 换成新名字；列表读不到 → 保留。

**要点 8 输入框高度**：新 `src/shell/composer-max-height.ts`，文字区上限 = min(宿主 maxHeight（默认 280）, max(120, 视口高 × 30%))，跟随窗口 resize；按 Manus 截图测得文字区约占视口 30%（我们的图里 280px ≈ 42%）。`LeoComposer` 把它交给 `TemplateFillArea`，任务页与首页同一个输入框，一起生效；超出照旧框内滚动。

**要点 12 agent 设置菜单**：
- 新 `src/shell/composer-settings-menu.tsx`（一套 UI，沿用 ModelGroupPicker 紧凑药丸 / 弹层 class，中性灰选中）：药丸只显示模型名；点开每行「名称 … 当前值 ›」；点行（或 → 键）在菜单旁弹出卡片列出可选值（带一行说明），选中即切换并全部关闭；← / Esc 回到该行；右侧放不下翻到左侧，两侧都放不下交给 AnchoredPopover 上下摆；不支持的项是置灰行 + 原因。
- `native-thread/NativeModelPicker.tsx`（Codex / Claude Code / Cursor / Hermes）：改用上面的菜单，行全部来自 ACP 会话现有数据（models、config options、modes、legacy effort 型号），不写死：模型、推理强度、其它 config option、权限模式（claude/codex；cursor/hermes 叫「模式」）、快速模式（开/关；当前模型不支持时置灰写原因）。药丸不再是 `Opus 5.5 · Auto-accept edits`。
- OceanLeo（云端 Leo）：`ModelPicker.tsx` 的紧凑态（输入框里）改走同一菜单：「模型」= 全站模型组合（Lite/Pro/Max 带一句说明、自定义组合），「快速模式」开/关；底部保留「管理模型组合 →」。顶栏完整态不变。
- Leo 快速模式查清：**前端没接、网关也没有**——`CreateTaskBody` / `FollowupBody` 没有任何速度/思考强度字段，engine 也没有每任务的 reasoning 控制（只有 triage 用的 `reasoning_extra`）。补齐（网关最小改动，没碰 W1 的 agent_engine / app/agent/*）：
  - 前端 `src/lib/leo-run-options.ts`（同 payer.ts 的取法：localStorage `oceanleo.leo.fast-mode`，菜单是唯一写入方）；`src/lib/agent.ts` 的 `createTask` 与 `followUp` 请求体展开 `leoRunRequestFields()`，开 = `fast_mode: true`，关 = 不带字段（与以前逐字相同）。
  - 后端 `app/routers/agent_router.py` 的 CreateTaskBody / FollowupBody 子类加 `fast_mode: bool = False`，处理函数在 `_paying_for` 旁边 `with llm_speed.fast_mode(body.fast_mode)`；新 `app/llm_speed.py`（ContextVar，`EnginePort._spawn` 的 `asyncio.create_task` 复制上下文，整次运行继承，和 payer 同一模式）；`app/llm.py::_build_body` 在 fast 时合并 `fast_extra`：OpenRouter → `reasoning`（能关就关，否则 effort=low），DashScope/百炼混合推理模型 → `enable_thinking:false`；调用方自己给了 reasoning 参数的不动。

**改动文件**：oceanleo-ui `src/shell/cloud-computer/ComputerDock.tsx`、`src/shell/LeoComposer.tsx`（只 maxHeight 两行）、`src/shell/ModelPicker.tsx`、`src/shell/native-thread/NativeModelPicker.tsx`、新 `src/shell/composer-settings-menu.tsx`、新 `src/shell/composer-max-height.ts`、新 `src/lib/leo-run-options.ts`、`src/lib/agent.ts`（两处展开）、`src/i18n/ui/messages/computer-task-workspace-copy.ts`（5 条 × 17 locale）；测试 `tests/conversation-dock.test.mjs`（C-3 改锁新时序 + 2 条 W7）、`tests/native-composer-controls.test.mjs`（改锁行 + 卡片，+1 条 Cursor 行）、`tests/model-picker-popover-layout.test.mjs`、`tests/sko-w15-composer-slash.test.mjs`（源码锁 maxHeight 改名）、新 `tests/composer-settings-menu.test.mjs`。oceanleo backend `app/llm.py`、`app/routers/agent_router.py`、新 `app/llm_speed.py`、新 `tests/test_llm_fast_mode.py`。`home-content.tsx` 与 AgentChat.tsx 没改。

**测试**：`pnpm typecheck`（run-heavy）通过。通过：conversation-dock 21、native-composer-controls 10、composer-settings-menu 6（新）、model-picker-popover-layout 6、model-picker-portal 1、model-picker-byok 4、cloud-computer-dock 23、cloud-computer-dock-remembered-name 6、d10-computer-dock-hydration 3、execution-target 7、eas-w06-dock-and-links 4、acp-card-flows 55、i18n-tt-key-coverage 10、sko-w15-composer-slash 19、leo-assistant-and-composer-controls 4、composer-plugins-popover 4、w2-composer-input-focus 4、agent-composer-contract 7、payer-selector 12、model-capability-contract 6、composer-draft-library-cancel 11、private-composer-attachments 10。后端（宿主 `backend/.venv`；`oceanleo-api` 容器里没有 pytest）：test_llm_fast_mode 5 通过；test_bounded_context_modularity / test_ccp_w6_latency / test_azure_tripo_registry_w17 / test_byok_connections 通过。
与本改动无关的红：`app-shell-model-visibility`、`model-picker-workbench-open` 整文件跑不起来（`src/shell/messages/call/engine` 目录导入 ERR_UNSUPPORTED_DIR_IMPORT，messages/call 未改动）；`effect-tt-dependency` 报 `messages/conversation/ConversationView.tsx:223`（别人在改）；后端 `test_agent_sessions` 2 条红是 W3 在写的 `app/task_titles.py` 导入。

**未证实**：没开浏览器、没在 operator 电脑上执行探测，所以"探测要几秒到几十秒"是按探测脚本与超时推断，没实测耗时。二级卡片翻转 / 视觉只经 jsdom 与纯函数验证。Leo 快速模式只对 OpenRouter 与 DashScope/百炼混合推理模型生效；其它供应商（直连 Anthropic / OpenAI 等）请求体不变——菜单上仍可选，效果为零，要更多供应商需在 `llm_speed.fast_extra` 里加映射。

### W7 交接
- parent：oceanleo / oceanbizs 首页要升 `@oceanleo/ui` 版本才生效（host 不用改）；后端 `llm.py` / `agent_router.py` / `llm_speed.py` 随网关部署。
- W1：Leo 回合被中断后自动续跑（turn_resume）若在新的 task 里起运行，不会继承请求时的 `fast_mode` ContextVar；要保持快速模式，续跑时需从任务记录带上（本批没存库）。
- `native-thread/NativeModelPicker.tsx` 不在总表任何人名下，我改了（导出的 `nativeModelPickerFor` / `NativeModelPicker` 签名不变，新增 `nativeSettingRows`）。
