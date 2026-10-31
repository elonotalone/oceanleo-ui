# 2026-10-31（晚）任务页 Manus 化 + 网关换色不丢活 — 派工总表

Operator 原话（17:25 CST），附图：
- `/root/oceanleo-inbox/20261031T083951Z-粘贴图片-20261031163950.png` — Manus 侧栏：任务名无时间、字号大、悬停出气泡（完整名 + 时间）
- `/root/oceanleo-inbox/20261031T084035Z-粘贴图片-20261031164034.png` — 我们的任务页：侧栏蓝色选中、左侧竖线、标题全是 "hi"、右侧图片查看是旧样式
- `/root/oceanleo-inbox/20261031T085855Z-粘贴图片-20261031165853.png` — Manus 任务页：对话宽度、用户气泡上方 "Today 4:54 PM"、输入框高度上限
- `/root/oceanleo-inbox/20261031T085903Z-粘贴图片-20261031165901.png` — 我们的任务页：输入框太高、`Opus 5.5 · Auto-accept edits`
- `/root/oceanleo-inbox/20261031T092522Z-粘贴图片-20261031172521.png` — 我们的任务页侧栏 / 输入框

要点（逐条，全部要做）：
1. 网关换色：旧色不冻住，新请求去新色，旧色把 Leo 回合干完再停；"等对话结束"计数把 Leo 回合算进去；Leo 任务被打断后**自动继续跑**（不要用户点继续）。电脑任务对话全文存平台库 = 对，保留。
2. 左侧 My Tasks：默认不显示时间；UI 仿 Manus；任务名字号大一些；**所有任务自动总结标题**（用户自己电脑上的 + 我们云端的）；悬停任务 → 新气泡显示完整名称 + 时间；任务左侧竖线删掉；选中任务 = 对应任务灰色底（不要蓝色），"My Tasks" 标题本身不显示灰底。
3. 任务页里点上传的图片/文件 → 打开的预览是旧的、完全没做好；首页那套右侧预览是对的。任务页要和首页一样，所有文件类型都要好。
4. 对话里显示步骤的蓝色小点 → 更好看的 UI 色块，比蓝点稍大，会变色、会变形（随状态），好看高级。
5. 首页输入框"切换对话"按上一次显示（之前 v0.236.0 号称修了，operator 说没好）。例：选了 Claude Code，刷新还是 Claude Code。
6. 任务页对话文字区加宽：左右空白太大。参考 Manus 宽度；我们侧栏更窄，所以比 Manus 再宽一点点。
7. 用户气泡上方显示时间：任务里第一条用户气泡上方有时间；隔很久再输入，新气泡上方再显示；很快连着输入的不显示（ChatGPT / Manus / 微信同款）。LeoChat 消息也要。
8. 任务页输入框的最大高度太高，参考 Manus 的上限比例。
9. 对话页右上角"转发/分享"按钮一点就消失，要修好。
10. 不刷新时来回切换任务，每个任务的滚动位置记住；刷新页面 → 直接显示最底部（不要现在那种从上往下滚的效果）。
11. **极其严重**：切换任务时加载 UI 不一致、冗余：先"Loading work session"，然后看见对话，对话又消失，转圈圈，最后再显示对话。要统一成打开 OceanLeo 页面（如 Projects 页）那种加载动画，一次到位；LeoChat、LeoBay 页面现在没有这个动画，也要有。
12. 用户自己电脑的 agent：输入框里 `Opus 5.5 · Auto-accept edits` → 只显示 `Opus 5.5`；点开是几行设置（`Model  Opus 5.5`、`Reasoning effort  high`……），点某一行 → 右侧弹出卡片列表选值。Codex、Hermes、Claude Code、Cursor、OceanLeo agent 五种一致；OceanLeo agent 现在选不了快速模式等，要做好。基于现有 UI 改造。
13. oceanbizs 改完后更新到最新；历史未提交改动全部提交（范围 = 主站 oceanleo + 共享包，见 oceandino `docs/runbooks/oceanbizs-submission-scope.md`）—— parent 做。

## 分工（文件尽量不重叠）

| child | 任务书 | 负责要点 | 主要文件（独占） |
|---|---|---|---|
| W1 | `W1-leo-durable-turns.md` | 1（Leo 侧 + 网关 drain 开关） | oceanleo `backend/app/agent_engine.py`、`app/agent/*`、`app/main.py` health 段、`app/cloud_computer/acp/drain_health.py`、新迁移 |
| W2 | `W2-handoff-deploy-acp.md` | 1（部署脚本 + 电脑任务附着/状态/镜像） | oceandino `scripts/deploy-image-bluegreen.sh` 等、`deploy/ws-host/oceanleo-api.conf`；oceanleo `backend/app/cloud_computer/**`（除 drain_health.py） |
| W3 | `W3-sidebar-titles.md` | 2 | oceanleo-ui `src/shell/HistoryMasterDetail.tsx` 侧栏列表部分、`history-model.ts`、侧栏 My Tasks 分组所在文件；oceanleo 后端标题生成 |
| W4 | `W4-transcript-render.md` | 4、6、7 | `agent-conversation-layout.ts`、`AgentTranscriptBubble.tsx`、`AgentProgress.tsx`、AgentChat 消息渲染段、`leochat/` 消息列表 |
| W5 | `W5-task-switch-loading.md` | 9、10、11 | `WorkspaceSession.tsx`、`TaskWorkspaceShell.tsx`、`nav-source/*`、HistoryMasterDetail 详情区/头部、AgentChat 滚动/加载段、LeoChat/LeoBay 页面入口 |
| W6 | `W6-task-file-preview.md` | 3 | `task-file-workspace.tsx`、`SplitWorkspace.tsx`、`LibraryMediaPreview.tsx`、AgentChat 附件点击段 |
| W7 | `W7-composer-target-settings.md` | 5、8、12 | `LeoComposer.tsx`、`ModelPicker.tsx`、`cloud-computer/ComputerDock.tsx`、`remembered-conversation.ts`、`execution-target.ts`；oceanleo 主站 `app/_components/home-content.tsx` |

`AgentChat.tsx`（3541 行）多人共用：每人只改自己那一段，逻辑尽量放到新文件；编辑前重读，Edit 报"文件已变"就重读再改，绝不整文件覆盖。`HistoryMasterDetail.tsx`：W3 = 左侧列表；W5 = 右侧详情/头部/加载。

## 红线（全员）

- 先跑 `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`。
- 只在 `main` 上改；**不要 commit、不要 push、不要 bump、不要 deploy、不要执行迁移**。parent 统一集成提交。
- 同一工作树里另有一个活着的会话（ba97f6b4，做 oceanleo-app 原生开发预览）。别碰 `oceanleo-app`；看到不是你改的文件变化，不要 checkout/reset/stash/覆盖。
- 一套 UI：只用宿主页面已有组件和样式（LeoComposer、AgentChat 流、HistoryMasterDetail、SplitWorkspace），不嵌入别的页面的组件，不加按钮条。见 `docs/work-logs/2026-10-30-unified-computer-task/R0-redo-contract.md`。颜色：选中/悬停一律中性灰（项目现有 zinc/neutral token），不要新蓝色。
- 不开浏览器、不截图、不 Playwright。验证 = `pnpm typecheck` + 相关测试（只跑你改动相关的，不跑全量）：
  `node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`；
  后端 `docker exec -w /app oceanleo-api python -m pytest -q tests/<file>.py`（宿主 Python 缺依赖；开发网关容器 `oceanleo-api` 把 `/root/projects/oceanleo/backend` 挂在 `/app`。只读跑测试，不要重启这个容器）。重任务走 `bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- <cmd>`。
- 新增中文文案走 `tt("中文")`，在 `src/i18n/ui/messages/` 对应 copy 文件补齐所有 locale（照现有格式）。
- 改了已有测试锁定的行为：改测试锁定新行为，不要删测试。新行为至少一条测试。
- 别人的文件不碰；必须碰时在你的任务书末尾「交接」写清楚。
- 结束时在自己的任务书末尾追加「结果」：改了哪些文件、根因、跑了哪些测试及结果、未证实的点。最终回复给 parent 用 15 行以内的摘要 + 任务书路径。
