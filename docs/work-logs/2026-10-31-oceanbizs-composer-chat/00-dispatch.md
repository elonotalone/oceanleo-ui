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

## Parent 集成（2026-10-31）

- A/B/C/D 均完成；D 首轮被中断但代码与结果已落盘，parent 核对后收口（未重派）。
- 补：首页电脑对话（Claude Code/Codex）附件在 session 建好前只在本标签页，A 的草稿存不了 → 新增 `src/shell/native-draft-files.ts`（IndexedDB 存 File，刷新后交回 `thread.onAttachFiles`；删 tile 跟着删；首条 prompt 发出即清）。`libraryAttachmentFile`：电脑对话里「从资料库添加文件」读一次原件，作为文件进那台电脑的 inbox。
- 主站 `oceanleo/app/_components/home-content.tsx`：`draftKey="home"`、`onAddAttachments`（云端=引用；电脑对话=下载后进 inbox）、`useNativeDraftFiles`、上传中删除 → abort。
- 任务页 `AgentChat.tsx` 两个 LeoComposer：`draftKey=task:<id>` + `onAddAttachments`。
- 删除已无用词条 `olderMessages`。
- 验证：两仓 `pnpm typecheck` 通过；相关测试 400/400 + `native-draft-files` 3/3；未跑全量（operator 规则：只跑改动相关测试）。LeoDev oceanleo slot FRESH(dev)。
- 未证实、未改：D 观察到 06:20–06:42 孪生网关切换后约 20 分钟无 agent-dialog 连接；前端重连逻辑（1s→30s 退避）检查无缺陷。

## 同步 oceanbizs（operator：「推到oceanbizs.com线上」）

- `@oceanleo/ui` v0.236.0（69079553，tag 已推）；`oceanleo-ui-bump.sh v0.235.0 v0.236.0 --only oceanleo` OK。
- 主站 `main` 推到 d35e9662（含本批 ea3bd935 + pin；连带推了此前未推的 2f0181f9 / 3656e8ac 两个后端提交 → 触发孪生网关镜像）。
- Vercel `oceanleo` dpl_FiDd3bN2XNrhRvkmamVCHMT6SeZT；CN frontend image 构建失败（前两次推送同样失败，既有问题，非本批；不切广州机）。
