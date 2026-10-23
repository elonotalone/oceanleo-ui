# W08 state（只靠它续接）

更新：2026-10-23 重派后第 1 轮（读完任务书 / _COMMON / 合同 / 上一轮留下的 host-state.ts，盘点完代码，开始写）

## 已确认的事实
- 起点：共享 UI 工作区干净（只有别的工程的 use-advanced-autosave.ts 等未提交，不碰）。上一轮只留下 `host-state.ts`（视图 notices/cases、caseId、深链解析与序列化、isSubView/tabOfView、cases 不被记住），已入库 `75f3baaf`。它把 `tests/im-host-state.test.mjs` 第 11 条（MESSAGES_VIEWS 钉成两项）打红 → 要改成四项。
- 后端通知：`notify()` 写 `user_notifications`；读接口 `GET /v1/notifications?limit=`（limit ≤ 200，无游标，返回 items + unread_count）、`/unread-count`、`POST /read`（无 ids = 全部）。IM 实时通道里没有任何通知事件 → 新通知到达只能轮询（沿用铃铛的 60 秒 + 切回标签页立即取一次）。
- 库里通知链接形状：`/bay?bay=order:<id>`、`/history?task=<id>`、`/settings/vault`；代码里还有 `/bay?bay=conversation|app-thread|app|demand|help|mine:*|settings:*|app-manage:*`、`/projects/<id>`、`/projects/<id>/join`、`/schedules`、`/settings/team?org=`、`/computers`、`/billing…`、审核类 `https://oceanleo.com|cn/account/content-cases`（W09 会改成 `/leochat?im=cases`）。
- `LeoChatPage` 的 `useAvailability()` 用 `bayEnabledHere()`（cn=off）→ 境内整页显示「暂未开放」，与「两版一样」冲突 → 我去掉这处分叉。边界外仍有分叉（只能报给父 agent）：门户 `app/leochat/page.tsx`（cn → notFound）、门户 `app/_components/clone-shell.tsx:261`、共享 `WorkspacePages.tsx:178`（侧栏 LeoChat 入口 cn 隐藏）。
- 铃铛 `NotificationBell` 是公开导出（shell/account/index.ts，公开 API 快照里有），多个测试读它的源码（leodev-cn-edition 要求 `portalHref(item.link)`；im-overlay-layout 要求 `if (imOn || bayOn) return null`；门户 device-status-popover 读它）→ 文件与导出保留，只从 SidebarAccountCluster 拿掉；`tests/bay-shell-hooks.test.mjs` 第 34 条要翻转。
- `LeoChatTabs` 的 `active` 类型只认 inbox|people → 调用方改传 `tabOfView(state.view)`。
- `tests/im-nav-entry.test.mjs` 第 7 条改动前就红（读不存在的 `InboxFilters.tsx`）→ 顺手改绿。
- `tests/leochat4-surfaces.test.mjs` 断言「境内 unavailable」→ 要改成境内也 ready。
- 基线（改动前）：im-host-state 25/25、im-inbox 13/13、im-nav-entry 6/7、leochat3 12/12、leochat4 9/9、leochat-toolbar 3/3 …（完整基线 /tmp/w08/baseline.txt；测试脚本 /tmp/w08/run-tests.sh <out> <名字…>）。

## 设计（已定）
- 视图：`notices` / `cases` 是二级视图，占右侧详情位；标签仍停在「聊天」；cases 平时不出现，只经通知或深链进入。
- 新目录 `src/shell/messages/notices/`：`notice-links.ts`（链接落点分类，纯）、`notice-unread.ts`（未读合计 + 预览，纯）、`notice-store.ts`（可注入依赖的通知仓 + 60 秒轮询 + 乐观已读）、`use-notices.ts`（React 钩子）、`open-notice.ts`（点一条：标已读 + 落点）、`NoticesView.tsx`（列表）、`InboxNoticesRow.tsx`（收件箱最上方固定行）。
- 挂载：小窗 `MessagesHost`、整页/右侧栏 `leochat-body`、右侧栏 `LeoChatPanel`（返回键）；`cases` 视图挂 `MessagesContentCases({ caseId, onBack })`。
- 未读合计：LeoChatButton 角标、标签页标题、「聊天」标签徽标 = IM 未读 + 通知未读。
- 铃铛：从 SidebarAccountCluster 拿掉，文件与导出保留（不渲染）。

## 正在做
- 第 1 步：纯模块 notices/*（链接分类、未读合计、通知仓）+ 对应的新测试。

## 下一步
2. 视图组件（NoticesView / InboxNoticesRow）+ Inbox 挂行 + 三处挂载（MessagesHost / leochat-body / Panel）
3. 未读合计接入 LeoChatButton、标题徽标、标签徽标
4. 铃铛拿掉；LeoChatPage 去分叉
5. 文案 lbp-w08-copy.ts（17 语）+ 文案闸
6. 测试：改绿被打红的 + 新增 tests/lbp-w08-notices.test.mjs
7. typecheck（不新增错误）→ 交卷 verdicts/W08-delivery.md

## 复现命令
- 单测：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs`
- 批量：`bash /tmp/w08/run-tests.sh /tmp/lbp-w08/out.txt im-host-state im-inbox …`
- 类型检查：`bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`（基线 3 条错在 video-project-doc.ts）
