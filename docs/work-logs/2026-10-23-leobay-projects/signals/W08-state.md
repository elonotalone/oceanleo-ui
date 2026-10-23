# W08 state（只靠它续接）

更新：2026-10-23 开工（第 0 步：读完任务书 / _COMMON / 合同，盘点代码）

## 已确认的事实
- 起点：共享 UI `ea9a000a`，分支 main；W08 分表 `src/i18n/ui/messages/lbp-w08-copy.ts` 是空表（已注册）。
- 后端通知：`notify()` 写 `user_notifications`；读接口 `GET /v1/notifications?limit=`（无分页游标，limit ≤ 200）、`/unread-count`、`POST /read`（无 ids = 全部）。没有任何 IM 实时事件承载通知 → 新通知到达靠轮询（沿用铃铛的 60 秒节奏 + 切回标签页立即取一次）。
- 库里通知链接形状（只读 SQL）：`/bay?bay=order:<id>`、`/history?task=<id>`、`/settings/vault`；代码里还有 `/bay?bay=conversation|app-thread|app|demand|help|mine:*|settings:*`、`/projects/<id>`、`/schedules`、`/settings/team`、`/billing…`、审核类 `https://oceanleo.com|cn/account/content-cases`（W09 会改成 `/leochat?im=cases`）。
- `LeoChatPage` 的 `useAvailability()` 用 `bayEnabledHere()`（cn=off）→ 境内整页 `/leochat` 显示「暂未开放」，与「两版一样」冲突；`WorkspacePages.tsx:178` 的侧栏 LeoChat 导航项同样按 `bayEnabledHere()` 过滤（不在我的边界）。
- 铃铛 `NotificationBell` 是公开导出（`shell/account/index.ts` → `shell/index.ts`，公开 API 快照里有），且被 `tests/{bay-shell-hooks,leodev-cn-edition,tpp-w5-account-parity,im-overlay-layout}`、门户 `tests/device-status-popover` 读源码 → 文件与导出保留，只是不再渲染。
- 基线（改动前）：im-host-state 25/25、im-inbox 13/13、im-nav-entry 6/7（第 7 条读不存在的 `InboxFilters.tsx`，改动前就红）、leochat3 12/12、leochat4 9/9、leochat-toolbar 3/3 …（完整基线在 /tmp/w08/baseline.txt）。

## 正在做
- 第 1 步：host-state 视图模型（notices / cases、caseId、深链解析与序列化）+ 纯模块 `messages/notices/*`（链接分类、未读合计、通知仓与轮询）。

## 下一步
2. 通知仓 hooks + 收件箱「通知」行 + `NoticesView` + 三处挂载（小窗 MessagesHost / 整页与右侧栏 leochat-body / Panel）
3. 未读合计接入 LeoChatButton、标签页标题、标签徽标
4. 铃铛从 SidebarAccountCluster 拿掉；LeoChatPage 去掉 bayEnabledHere 分叉
5. 文案 lbp-w08-copy.ts（17 语）+ 文案闸
6. 测试：改绿被打红的 + 新增 tests/lbp-w08-notices.test.mjs
7. typecheck（不新增错误）→ 交卷 verdicts/W08-delivery.md

## 复现命令
- 单测：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs`
- 类型检查：`bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`（基线 3 条错在 video-project-doc.ts）
