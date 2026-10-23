# W08 state（只靠它续接）

更新：2026-10-23 重派后第 1 轮，主体已提交（0852a111），在补译文 / 收尾 / 写交卷。

## 已确认的事实
- 上一轮只留下 `host-state.ts`（75f3baaf）；这一轮把其余全部做完：notices/* 纯模块 + 视图组件 + 三处挂载 + 未读合计 + 铃铛去留 + 分表 + 测试。
- 后端通知：`notify()` 写 `user_notifications`；读口 `GET /v1/notifications?limit=`（≤200，无游标，返回 items + unread_count）、`POST /read`（无 ids = 全部）。IM 实时通道没有通知事件 → 轮询 60 秒 + 切回标签页立即取（测试钉成与铃铛 COUNT_POLL_MS 相等）。
- 边界外仍有按域名家族分叉、挡住境内 LeoChat 整页的三处（写进交卷「请求」）：门户 `app/leochat/page.tsx`（cn → notFound）、门户 `app/_components/clone-shell.tsx:261`、共享 `src/shell/WorkspacePages.tsx:178`。LeoChat 小窗 / 深链 / 通知在境内已经和海外一样。
- 铃铛 `NotificationBell`：文件与导出保留（leodev-cn-edition、im-overlay-layout、门户 device-status-popover、公开 API 快照还引用），只从 SidebarAccountCluster 拿掉渲染。
- 全仓 tt() 闸开工前就红（别人欠的译文）。当前红的 51 条里 29 条是 `src/shell/messages/*` 的老欠账（非本波新增，在我的目录），已用我的分表补齐；其余 22 条是 editor-overhaul 一带（media-editors / advanced-routes / LeoAssistant / LibraryPdfReader / AgentChat），不是我的。闸的第 9、10 条（基线死条目）是别的工程在改的基线，不碰。
- 类型检查（提交 0852a111 后）0 个错误（基线的 3 条已被别的工程修掉）。

## 已提交
- `0852a111` 主体：notices/*、Inbox 固定通知行、MessagesHost / leochat-body / LeoChatPanel / LeoChatPage / LeoChatButton 接线、铃铛拿掉、分表 3 个 key、tests/lbp-w08-notices.test.mjs（46）+ 被打红测试的修补。

## 本轮待提交（工作区里已做完）
- `notice-links.ts`：相对路径写法换主机（`/\evil.com`、`/<tab>/evil.com`）一律当没有（fail closed），测试 + 变异验证。
- `lbp-w08-copy.ts`：LeoBay 交易事件 33 种固定标题与说明（65 句，「订单已取消」别处已有）× 16 语；LeoChat 29 句老词条 × 16 语。
- tests：交易事件译文、通知视图把固定句式翻成当前语言、29 句老词条。

## 下一步
1. 跑完相关测试批（/tmp/lbp-w08/after-2.txt）→ 提交第二批。
2. 重跑类型检查（heavy 槽，可能排队）。
3. 重跑 tt() 闸，确认我目录里的红条目清零。
4. 写 `verdicts/W08-delivery.md`（用户怎么看到通知、深链表、未读合计规则、测试原文、请求）并提交 → 结束。

## 复现命令
- 单测：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w08-notices.test.mjs`
- 批量：`bash /tmp/w08/run-tests.sh /tmp/lbp-w08/out.txt $(cat /tmp/w08/list.txt) lbp-w08-notices`
- 类型检查：`bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck`
