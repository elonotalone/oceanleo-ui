# W08 journal（每得到一条实测结论追加一行）

- 开工 实测：库里 35 条通知，链接形状只有 `/bay?bay=order:<id>`（最多）、`/history?task=<id>`、`/settings/vault`；审核类 0 条。后端没有任何 IM 实时事件承载通知，轮询是唯一能证明的刷新方式（沿用铃铛 60 秒）。
- 开工 实测：改动前 `tests/im-nav-entry.test.mjs` 第 7 条已红（读不存在的 `src/shell/messages/InboxFilters.tsx`），其余相关 IM/LeoChat 测试全绿。
