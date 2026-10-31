# W5 — 切换任务：统一加载动画（含 LeoChat / LeoBay）、滚动位置记忆、刷新直接到底、转发按钮

先读 `00-dispatch.md` 红线。

## 负责
`src/shell/WorkspaceSession.tsx`、`TaskWorkspaceShell.tsx`、`workspace-runtime-hydration.tsx`、`workspace-session-*.ts`、`src/shell/nav-source/*`（route-boundary / route-transition.css）、`HistoryMasterDetail.tsx` 右侧详情区 + 头部（左侧列表归 W3）、`HistoryPage.tsx`、`AgentChat.tsx` 中滚动与加载状态那一段、LeoChat (`src/shell/leochat/LeoChatPage.tsx`) 与 LeoBay (`src/shell/bay/shell/LeoBayPage.tsx`) 的页面入口加载态。必要时主站 `/root/projects/oceanleo/app/history/**`。

## 要做
1. **极其严重 — 切换任务加载 UI 冗余且不一致**：现在点一个任务：先 "Loading work session…"（`加载工作会话…`），然后看见对话，对话又消失，出现转圈，最后才显示对话。不同类型任务（Leo 云端 / 电脑任务 Claude Code、Codex / Terminal）过程还不一样。
   - 先把每类任务从点击到稳定显示经过的所有加载态列出来（哪个组件、什么条件、为什么会先显示后消失——通常是两层各自 hydrate 或 key 变化导致重挂载），写进结果。
   - 改成：**一种**加载表现，一次到位，用打开 OceanLeo 页面（如 Projects 页）时那个页面级加载动画（找到它的组件/CSS，复用，不新造）。已经拿到内容后不再回退到加载态；后台刷新静默。去掉 "Loading work session…" 文案与额外转圈。
   - LeoChat、LeoBay 页面打开时现在没有这个动画，要加上同一个。
2. **滚动位置**：不刷新时在任务间来回切换，每个任务记住自己的滚动位置（内存里按 task id 存，SPA 生命周期内有效），回来时恢复，不跳动。**刷新页面**或首次打开某任务 → 直接定位在最底部，不要现在那种从上往下滚的动画（不要 smooth scroll，首帧就在底部，避免闪一下顶部）。新消息到来时：用户在底部附近才自动跟随（保持现有逻辑）。
   注意上一批 B 做了"上滑到顶自动加载更早一批"，恢复/到底逻辑不能触发误加载，也不能被它打乱位置。
3. **右上角转发/分享按钮**：点一下就消失、失灵。找根因（可能是点击触发重渲染/条件渲染/popover 被外部点击关闭等），修好：点击打开现有分享流程（找现有分享组件，`conversation_shares` 相关），能正常创建/复制分享链接。

## 验证
- 相关测试：`tests/work-session-contract.test.mjs`、`history-subnav-loading`、`history-url-contract`、`d10-*`、AgentChat 滚动相关、leochat / bay 页面相关；新测试：切换任务只出现一种加载态且不回退、滚动位置按任务恢复、首次打开直接到底（无 smooth）、LeoChat/LeoBay 有加载态、分享按钮点击后菜单/弹窗保持并可复制链接。

## 结果
（W5，2026-10-31 晚；未 commit / push / bump / deploy；不开浏览器，所以「肉眼一次到位」未实机证实）

### 加载态清单（改前，门户 `/history`，点侧栏一个任务 = `router.push('/history/<id>')` 或 `?task=`）
| # | 组件 | 条件 | 看到的样子 |
|---|---|---|---|
| 0 | 门户 `app/history/[sessionId]/loading.tsx`（`?task=` 走 `app/history/loading.tsx`） | 动态段换参数，新段 RSC 未到 | **整页**骨架（连侧栏一起换成假侧栏 + 卡片 / 列表） |
| 1 | `HistoryDetail`（HistoryMasterDetail.tsx） | `detailLoading`：读 app_session / task | 文字「加载工作会话…」 |
| 2 | `AgentChat` 云端对话流 | 首次 `getTask` 落地（`messagesTaskId`），会话归属未定（`conversationResolved=false`） | 先空白，再出**云端那份**对话 |
| 3 | `AgentChat` 原生对话（Claude Code / Codex 电脑任务） | 会话列表读回 → `selectedSession` 解析到最新 ACP 会话 → 云端流被 `hidden`，`NativeChatConversation` 新挂载、`thread.opening` | 对话消失 + `v-spinner` 转圈（`data-native-opening`） |
| 4 | 同上 | 云端存档副本到达 | 才出最终对话；且 `messages` 一变就 `scrollTo({behavior:"smooth"})`，从顶滑到底 |
| – | 本机任务（`LocalTaskDetail`） | `local.loading` | 文字「正在读取本机任务…」 |
| – | Terminal / 旧 shell 任务 | `ShellTaskView` 直接 `router.replace` 去服务器页 | 无独立加载态 |

**根因**：三层各自 hydrate、各自画加载样子——门户路由段边界（0）、HistoryDetail 自己的读（1）、AgentChat 先按云端对话渲染再解析会话归属（2→3：电脑任务的「对话出现又消失」就是云端流先露出、随后被原生会话替换），原生会话再等自己的存档（3）。每次切换 AgentChat 还按 `key=taskId` 重挂载，滚动没有记忆，首帧 scrollTop=0 再 smooth 到底。

### 改后：一种加载表现
- 新 `src/shell/task-loading-gate.tsx`：`TaskLoadingGate`（宿主读 + 下层各自 `useTaskLoadingReport(ready)` 汇总；任一未就绪 → 在内容**之上**盖页面级骨架 `RoutePageSkeleton variant="list"`，内容在下面照常挂载/布局/定位滚动；同一 key 一旦就绪即锁存，后台刷新不再回退；换 key 才可能再盖；10s 兜底）。注册走 layout effect + ref，宿主就绪与子组件挂载同一 commit 时不会闪一帧。
- `RoutePageSkeleton`（共享包 `nav-source/route-boundary.tsx`，与门户 `/projects` 的 loading 同形同原语）补 `role=status / aria-busy / label`，即复用 Projects 页那套，不新造。
- `HistoryDetail`：整个详情区包一层 gate（`hostReady` = 本选择的读已落地，含本机任务读取）；删掉「加载工作会话…」「正在读取本机任务…」文字；新增 `history-detail-cache.ts`：本页内回到看过的任务立即显示（不盖骨架），后台静默重读，只有形状变了才替换；从缓存给出的 TaskDetail 标记为 stale，AgentChat 先显示再静默 `refresh` 一次。
- `AgentChat`：上报就绪 = 无 task / 首读失败 / 首读已到且会话归属已定（或会话列表失败）；原生会话（active 时）上报「存档已到或非 opening」；原生 opening 的转圈换成同一个骨架（`data-native-opening` 保留）。
- 门户：`app/history/loading.tsx`、`app/history/[sessionId]/loading.tsx` 改成 `CloneShell` + 同一份 list 骨架（侧栏照常在，右侧与 gate 遮罩同形），段边界 → 详情遮罩视觉上是同一个东西。
- LeoChat：`LeoChatPage` 登录态未查清（pending）显示骨架；`Inbox` 首次加载的「正在加载…」一行字换成同一骨架（`data-inbox-loading` 保留）。LeoBay：`LeoBayPage` pending 帧显示骨架（grid 形）；门户新增 `app/leochat/loading.tsx`、`app/bay/loading.tsx`，并进 `route-loading-boundary` 的 HEAVY_SEGMENTS 名单。

### 滚动位置
- 新 `src/shell/task-scroll-memory.ts`：内存 Map（`task:<taskId>` / `native:<sessionId>`，SPA 生命周期，刷新即空）。
- 云端流：首份消息到达时 `useLayoutEffect` 一次性定位（`scrollTop` 直接赋值，非 smooth）：记过且当时不在底部 → 回原位、停止跟随；否则到底。定位前不做跟随滚动（不再 mount 时 smooth）。到底后 1.5s 内 ResizeObserver 托底（图片/代码块后排版仍在底部，用户上滑即放手）。滚动事件里记位置。
- 原生流：每次被切到前台时同样定位，`lastScrollTop` 同步 → 定位本身不会被当成「上滑」，不会误触发读更早一批；上滑读更早的锚点逻辑不变。新消息仍是「在底部附近才跟随」。

### 分享按钮根因
`AgentChat` 顶栏 `{!share.active && share.selectable.length > 0 && <ShareEntryButton/>}`：点一下 `share.enter()` → `share.active=true` → **按钮自己被卸载**；选段模式的操作条只在**云端对话流**的 footer 里，而电脑任务（原生会话在前）云端流是 `hidden` 的 → 用户看到的就是「按钮一点就消失、什么也没发生」。云端任务里也只是按钮消失、底部换成一条没有勾选的操作条（「复制链接」灰着）。
修：按钮常驻（选段中 `aria-pressed`、中性灰底，再点退出）；只在云端对话在前时提供，切到原生会话自动退出选段；从顶栏进入默认全选（`useShareMode.enter("all")`），「复制链接」立即可用（走原 `createShareLink` / `conversation_shares` 流程，未改）。

### 改动文件
共享包：`src/shell/task-loading-gate.tsx`（新）、`task-scroll-memory.ts`（新）、`history-detail-cache.ts`（新）、`nav-source/route-boundary.tsx`、`HistoryMasterDetail.tsx`（仅 HistoryDetail 段 + import）、`AgentChat.tsx`（import、首读/seed、粘底滚动段、就绪上报、顶栏分享键、原生 opening 态、NativeChatConversation 滚动段）、`share/useShareMode.ts`、`share/ShareActionBar.tsx`、`leochat/LeoChatPage.tsx`、`bay/shell/LeoBayPage.tsx`、`messages/Inbox.tsx`。
测试：新 `tests/w5-task-switch-loading.test.mjs`（8 条：gate 覆盖/同 commit 不闪/锁存不回退/换 key 再盖、真 AgentChat 在 gate 下首读前被盖、首次打开到底且无 smooth、回来恢复上滑位置、缓存 stale 标记、分享键常驻+全选+复制链接可用、源码无「加载工作会话」）；`bay3-page`、`leochat4-surfaces` 各加 1 条 pending 骨架；`call-chat-inbox` 改锁新行为（骨架 + aria-label）；`call-chat-inbox` / `lbp-w08-notices` 的 `../../ui` 桩补 `SkeletonCard/SkeletonLine`；`i18n-tt-key-coverage` 基线删掉已无调用点的「加载工作会话…」。
门户：`app/history/loading.tsx`、`app/history/[sessionId]/loading.tsx`、新 `app/leochat/loading.tsx`、新 `app/bay/loading.tsx`、`tests/route-loading-boundary.test.mjs`（名单加 `app/bay`、`app/leochat`）。

### 验证
- `pnpm typecheck`（oceanleo-ui，run-heavy）通过；门户 `pnpm typecheck` 通过（pnpm 11 先跑了一次依赖校验，`node_modules/@oceanleo/ui` 仍软链工作树，未变）。
- 通过：w5-task-switch-loading 8/8、work-session-contract 10、history-subnav-loading 4、history-url-contract 2、d10-computer-dock-hydration 3、d10-leo-entry-hydration 2、sko-w11-history-projects 8、history-sidebar-manus 5、history-leo-created-mark 1、history-working-mark 1、agent-chat-single-header 6、agent-chat-conversations 34、agent-chat-streaming 15、agent-chat-w3-history-native 4、agent-chat-home-launch-keeps-transcript 19、agent-action-history-live 6、share-select-mode 13、call-chat-inbox 全过、lbp-w08-notices 52、leochat4-surfaces 10、bay3-page 17。
- 既有红（HEAD 干净 worktree 上同样红，非本次）：`library-task-render-loop`（桩缺 `authed`）、`one-task-library-agent-acceptance` 7 条（`AuthDialog` 导入 `desktopBrowserLoginAvailable`）、门户 `route-loading-boundary` 2 条（`app/api|billing|cost` 缺 loading/error）。`i18n-tt-key-coverage` #8 红 = W7 的 `少思考，回复更快` / `权限模式` 缺译文。

### 未证实
- 没开浏览器：Next 在 `/history/<a>`→`/history/<b>` 时确实先出 `[sessionId]/loading.tsx`、以及 CloneShell 在 loading 与 page 之间各挂一次时侧栏是否有可见闪动，均未实机看；如侧栏仍闪，下一步是让侧栏切换不换路由段（pushState 或共享 layout），那属 W3 的列表/门户 shell。
- 子站 `renderWorkspace`（iframe / 站点 runtime）内部自己的加载样子不在 gate 管辖内。
- 原生会话 display:none 再显示时浏览器是否保留 scrollTop 未实测（已按「每次切到前台重新定位」处理）。

### 交接
- 门户 `app/history/*/loading.tsx` 现在 import `CloneShell`（W3 正在改 `clone-shell.tsx`，只用了 `CloneShell({activePath, children})` 签名）。
- `messages/Inbox.tsx` 首次加载态（LeoChat 列表）由我改成骨架；`share/*` 两个文件由我改（`enter("all")`、`ShareEntryButton active`）。
- `HistoryMasterDetail.tsx` 只动了 HistoryDetail 函数与顶部 import；`AgentChat.tsx` 只动了上面列的段落。
