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
（完成后追加；必须写加载态清单与根因、分享按钮根因）
