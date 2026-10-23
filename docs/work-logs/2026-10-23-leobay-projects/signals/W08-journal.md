# W08 journal（每得到一条实测结论追加一行）

- 开工 实测：库里 35 条通知，链接形状只有 `/bay?bay=order:<id>`（最多）、`/history?task=<id>`、`/settings/vault`；审核类 0 条。后端没有任何 IM 实时事件承载通知，轮询是唯一能证明的刷新方式（沿用铃铛 60 秒）。
- 开工 实测：改动前 `tests/im-nav-entry.test.mjs` 第 7 条已红（读不存在的 `src/shell/messages/InboxFilters.tsx`），其余相关 IM/LeoChat 测试全绿。
- 重派 实测：上一轮只留下 `host-state.ts`（视图 notices/cases、caseId、深链、cases 不被记住），已入库 75f3baaf；它把 `tests/im-host-state.test.mjs` 第 11 条（MESSAGES_VIEWS 钉成两项）与 `tests/bay-shell-hooks.test.mjs` 第 1 条打红，已改成四项。
- 重派 实测：`ImEvent` 联合里没有任何通知事件（grep 后端 app/im 也无）→ 轮询 60 秒 + `visibilitychange` 立即取一次，是唯一能证明的刷新；通知仓的轮询节奏用测试钉成与铃铛的 `COUNT_POLL_MS = 60000` 相等。
- 重派 实测：境内整页 `/leochat` 的「暂未开放」来自 `LeoChatPage` 里的 `bayEnabledHere()`（我的边界，已去掉）；但门户 `app/leochat/page.tsx`（cn → notFound）、`clone-shell.tsx:261`、共享 `WorkspacePages.tsx:178` 也在境内拦掉 LeoChat（边界外，写进交卷「请求」）。
- 重派 实测：`tests/lbp-w08-notices.test.mjs` 46 条全绿（深链解析/序列化/互逆、链接落点分类含 fail-closed、未读合计、通知仓的轮询/乐观已读/失败重取/竞态/加载更多/登出清空、执行层、通知行/通知视图/二级视图挂载、整页/右侧栏/小窗/入口角标/标题）；变异验证：把「取数期间用户标了已读就丢掉旧响应」的判断关掉，对应用例变红。
- 重派 实测：全仓 `i18n-tt-key-coverage` 闸在开工前就红 3 条（别人欠下的 ~120 条译文，含 messages 目录里的 Inbox/ConversationView/ProfileCard 等历史缺口与 W09/W05/W06 的在途文案）；我新增的 3 个 key（通知暂时打不开 / 空态说明 / 未读 {count} 条）已补齐 17 语，从报告里消失。
- 重派 实测：铃铛 `NotificationBell` 被 leodev-cn-edition（要 `portalHref(item.link)`）、im-overlay-layout（要 `if (imOn || bayOn) return null`）、门户 device-status-popover、公开 API 快照读取 → 文件与导出保留，只从 SidebarAccountCluster 拿掉渲染。
