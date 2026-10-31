# 2026-10-31 oceanbizs 首页输入框 / 任务对话 8 项修复 — 派工总表

Operator 原话要点（14:45 CST，附 4 张截图在 `/root/oceanleo-inbox/20261031T0644*Z-*.png`、`20261031T0646*Z-*.png`）：

1. 首页输入文字或上传文件后，刷新页面不丢文字、不丢文件。
2. 输入框「＋」菜单除「从本地添加文件」外，加「从资料库添加文件」（Library）。
3. 首页输入框的「切换对话」（ComputerDock 触发键）每次按上一次的选择显示，不是每次默认 Cloud。
4. 对话里删掉「读取更早的对话」按键；用户上滑到顶自动加载更早的一批，每次一批，不是整段超长对话全量重刷。
5. 上传中的文件右上角也要有 × 删除键，和上传完成的一样可点。
6. agent 每段零散句子下面都有 copy —— 错。copy 只在 agent 一轮回答的最后出现一次（参考 Manus 截图 20261031T064627Z）。
7. 左侧栏 task 名称左侧：agent 在干活时显示动态 UI（类似以前 Computers 页聊天框里的工作中动效）；不干活时不显示。只两种状态，去掉红黄绿灰点。
8. 「正在打开对话…」（Opening conversation…）毫无理由出现；「附件还没存好，请把附件重新加一次再发」：首页开新对话 + 附图，结果被缀到另一个正在跑的对话（task 8ef8fb2b-ad21-439c-b103-41c771978be9）最后并报错，新对话打不开，刷新后整页只剩这条报错。

## 分工（文件互不重叠；AgentChat.tsx 由 B、D 分区共享，见各自任务书）

| child | 任务书 | 负责 |
|---|---|---|
| A | `A-composer.md` | 1、2、5 |
| B | `B-chat-stream.md` | 4、6 |
| C | `C-sidebar-dock.md` | 3、7 |
| D | `D-session-identity.md` | 8 |

## 红线（全员）

- 先跑 `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`。
- 只在 `main` 上改；**不要 commit、不要 push、不要 bump、不要 deploy**，parent 统一集成提交。
- 一套 UI：只用宿主页面已有组件和样式（LeoComposer、AttachmentStrip、AgentChat 流、HistoryMasterDetail），不嵌入别的页面的组件，不加按钮条。见 `docs/work-logs/2026-10-30-unified-computer-task/R0-redo-contract.md`。
- 不开浏览器、不截图、不 Playwright。验证 = `pnpm typecheck` + 相关 `tests/*.test.mjs`（`node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`）。重任务走 `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- <cmd>`。
- 新增中文文案走 `tt("中文")`，并在 `src/i18n/ui/messages/` 对应 copy 文件补齐所有 locale（照现有文件格式）。
- 改了已有测试锁定的行为：改测试使其锁定新行为，不要删测试了事。为新行为至少加一条测试。
- 别人的文件不碰；必须碰时在你的任务书末尾「交接」一节写清楚，parent 处理。
- 结束时在自己的任务书末尾追加「结果」：改了哪些文件、根因（D 必写）、跑了哪些测试及结果。
