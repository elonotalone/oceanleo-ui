# W08 journal（每得到一条实测结论追加一行）

- 开工 实测：库里 35 条通知，链接形状只有 `/bay?bay=order:<id>`（最多）、`/history?task=<id>`、`/settings/vault`；审核类 0 条。后端没有任何 IM 实时事件承载通知，轮询是唯一能证明的刷新方式（沿用铃铛 60 秒）。
- 开工 实测：改动前 `tests/im-nav-entry.test.mjs` 第 7 条已红（读不存在的 `src/shell/messages/InboxFilters.tsx`），其余相关 IM/LeoChat 测试全绿。
- 重派 实测：上一轮只留下 `host-state.ts`（视图 notices/cases、caseId、深链、cases 不被记住），已入库 75f3baaf；它把 `tests/im-host-state.test.mjs` 第 11 条（MESSAGES_VIEWS 钉成两项）与 `tests/bay-shell-hooks.test.mjs` 第 1 条打红，已改成四项。
- 重派 实测：`ImEvent` 联合里没有任何通知事件（grep 后端 app/im 也无）→ 轮询 60 秒 + `visibilitychange` 立即取一次，是唯一能证明的刷新；通知仓的轮询节奏用测试钉成与铃铛的 `COUNT_POLL_MS = 60000` 相等。
- 重派 实测：境内整页 `/leochat` 的「暂未开放」来自 `LeoChatPage` 里的 `bayEnabledHere()`（我的边界，已去掉）；但门户 `app/leochat/page.tsx`（cn → notFound）、`clone-shell.tsx:261`、共享 `WorkspacePages.tsx:178` 也在境内拦掉 LeoChat（边界外，写进交卷「请求」）。
- 重派 实测：`tests/lbp-w08-notices.test.mjs` 46 条全绿（深链解析/序列化/互逆、链接落点分类含 fail-closed、未读合计、通知仓的轮询/乐观已读/失败重取/竞态/加载更多/登出清空、执行层、通知行/通知视图/二级视图挂载、整页/右侧栏/小窗/入口角标/标题）；变异验证：把「取数期间用户标了已读就丢掉旧响应」的判断关掉，对应用例变红。
- 重派 实测：全仓 `i18n-tt-key-coverage` 闸在开工前就红 3 条（别人欠下的 ~120 条译文，含 messages 目录里的 Inbox/ConversationView/ProfileCard 等历史缺口与 W09/W05/W06 的在途文案）；我新增的 3 个 key（通知暂时打不开 / 空态说明 / 未读 {count} 条）已补齐 17 语，从报告里消失。
- 重派 实测：铃铛 `NotificationBell` 被 leodev-cn-edition（要 `portalHref(item.link)`）、im-overlay-layout（要 `if (imOn || bayOn) return null`）、门户 device-status-popover、公开 API 快照读取 → 文件与导出保留，只从 SidebarAccountCluster 拿掉渲染。
- 重派 实测：`new URL("/\\evil.com/x", base)` 与 `"/\t/evil.com"` 会被 URL 解析器吃成换了主机的 `//evil.com`；通知链接分类器对相对路径加了「主机不许变」的判断（fail closed），测试里钉住，并做过变异验证（拿掉判断，用例变红）。
- 重派 实测：库里 35 条通知几乎全是 LeoBay 交易事件的固定句式（后端 `TALENT_NOTIFICATION_EVENTS` 33 种）；服务端只写中文，海外用户读到的是中文。通知视图 / 收件箱通知行把标题与说明过 `tt()`，分表补了这 33 种（65 句，「订单已取消」别处已有）的 16 语译文；含用户内容的动态句子（如「「hi」没有完成」）不在词典里，原样显示。
- 重派 实测：全仓 tt() 闸红的 51 条里 29 条是 `src/shell/messages/*` 的老欠账（Inbox 右键菜单、多选与转发、联系人名片、群信息，非本波新增），在我的目录里，已补 16 语；其余 22 条在 editor-overhaul 的目录，不是我的。
