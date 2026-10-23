# W02 state

更新：2026-10-23 21:40（第一批前端已提交）

## 已确认的事实
- 后端已提交（门户 3145092）：`_service_query` 按 listing_kind 筛，consult/help 只在人工服务；`backend/tests/test_bay_feed_listing_kind.py` 新增，154 passed（含 feed/zones/digital/posting/related）。
- 共享 UI 第一批已提交：bay-links（六值、BAY_SELL_KINDS、BAY_SELL_KIND_LABEL、bayListingKindFor）、lib/bay/feed（BayFeedListingKind 含 other）、use-bay-data（`bayFeedRequestFor` + `useBayFeed(filter, signedIn, {listingKind?, enabled?, limit?})`）、BayList（出售/求购一个下拉 + 种类下拉 + 全部站点；清除筛选只清词和站点）、新 BayFeedItemCard（FeedCard 抽出来共用）、BayAppShelf/BayLessonShelf（现有数据之后接信息流）、素材库「卖家在售」（新 BayAssetSellers.tsx，zone `sellers`，有卖家文件默认它，境内没有）、PanelBrowse、分表 lbp-w02-copy（5 条 16 语）。
- 需要父 agent 处理（全写进交卷「对父 agent 的请求」）：
  1. `bay-state.ts` 的 `normalizeFilter` 与 `readPageOffer` 白名单要加 `other`，否则求购侧选「其他」被丢回人工服务；
  2. `tests/i18n-tt-key-coverage.test.mjs` 的 `PRE_EXISTING_GAPS` 要删「全部站点」（AppMarket 早就用、没译；我补译后第 9 条判死条目；「解锁」也在该清单里，不是我的）。
- 本来就红、不归我：`bay-shell-hooks` 第 1 条（W08）、`bay-seller-panes` / `bay-seller-profile-reveal`（W05/W06 在改）、`bay-shell-static` 第 3 条（W04 的 BayMine）、`bay-shell-copy` 第 3 条里剩下的「列表」（W04 的 BayMine）、`i18n-key-collision` 的 WORK_CHAT/BAY_MESSAGES 两处、`i18n-tt-key-coverage` 第 8/10 条（别的工程的词）。
- 类型检查：我的文件 0 错误；全仓报错来自 settings / BayMine / collection-chrome（别人在改）。

## 正在做
- 第 5 步收尾：给 lbp-w02-browse 补组件级测试（BayViewSwitch / BayFeed 的 other / 货架 / 素材库「卖家在售」 / PanelBrowse / 分表）。

## 下一步
1. 补测试（见上）并跑相关全集。
2. 扫一遍我边界里还指着旧种类名的句子，判定「种类 / 非种类」并记入交卷。
3. 交卷 `verdicts/W02-delivery.md`：每一类显示什么、后端参数语义、旧地址兼容表、测试原文、父 agent 重启网关后的 HTTP 验证命令、对父 agent 的请求。
4. 提交交卷文件（共享 UI 仓）。

## 复现命令
见 _COMMON.md §2。批量跑测小工具：`/tmp/w02-tools/run-tests.sh <测试名…>`（丢了就按 §2 的 run-light 命令逐个跑）。
后端：`cd /root/projects/oceanleo/backend && .venv/bin/python -m pytest tests/test_bay_feed.py tests/test_bay_feed_zones.py tests/test_bay_feed_listing_kind.py -q`
