# W02 state

更新：2026-10-23 21:15（交卷文件已写，等共享 UI / 门户类型检查跑完回填 §7）

## 已确认的事实
- 后端已提交（门户 3145092）：`_service_query` 按 listing_kind 筛，consult/help 只在人工服务；`backend/tests/test_bay_feed_listing_kind.py` 新增，154 passed（含 feed/zones/digital/posting/related）。
- 共享 UI 第一批已提交：bay-links（六值、BAY_SELL_KINDS、BAY_SELL_KIND_LABEL、bayListingKindFor）、lib/bay/feed（BayFeedListingKind 含 other）、use-bay-data（`bayFeedRequestFor` + `useBayFeed(filter, signedIn, {listingKind?, enabled?, limit?})`）、BayList（出售/求购一个下拉 + 种类下拉 + 全部站点；清除筛选只清词和站点）、新 BayFeedItemCard（FeedCard 抽出来共用）、BayAppShelf/BayLessonShelf（现有数据之后接信息流）、素材库「卖家在售」（新 BayAssetSellers.tsx，zone `sellers`，有卖家文件默认它，境内没有）、PanelBrowse、分表 lbp-w02-copy（6 条 16 语）。
- 需要父 agent 处理（全写进交卷「对父 agent 的请求」）：
  1. （已由父 agent 做完：9a31e864，7ba00bc0 把 todo 测试转正）`bay-state.ts` 的 `normalizeFilter` 与 `readPageOffer` 白名单加 `other`；
  2. `tests/i18n-tt-key-coverage.test.mjs` 的 `PRE_EXISTING_GAPS` 要删「全部站点」（AppMarket 早就用、没译；我补译后第 9 条判死条目；「解锁」也在该清单里，不是我的）。
- 本来就红、不归我：`bay-shell-hooks` 第 1 条（W08）、`bay-seller-panes` / `bay-seller-profile-reveal`（W05/W06 在改）、`bay-shell-static` 第 3 条（W04 的 BayMine）、`bay-shell-copy` 第 3 条里剩下的「列表」（W04 的 BayMine）、`i18n-key-collision` 的 WORK_CHAT/BAY_MESSAGES 两处、`i18n-tt-key-coverage` 第 8/10 条（别的工程的词）。
- 类型检查：我的文件 0 错误；全仓报错来自 settings / BayMine / collection-chrome（别人在改）。

## 正在做
- 无。交卷已提交，两个 typecheck 都跑完并写进交卷 §7（共享 UI 0 错误；门户 4 条是依赖副本版本不一致，与 Bay 无关）。

## 下一步
1. 回报：两个仓各自最后一个提交号。

## 已完成
- 后端、前端主体、组件级测试（lbp-w02-browse 46 条全绿）、分表、旧种类名清扫与「非种类保留」清单、交卷文件初稿。

## 复现命令
见 _COMMON.md §2。批量跑测小工具：`/tmp/w02-tools/run-tests.sh <测试名…>`（丢了就按 §2 的 run-light 命令逐个跑）。
后端：`cd /root/projects/oceanleo/backend && .venv/bin/python -m pytest tests/test_bay_feed.py tests/test_bay_feed_zones.py tests/test_bay_feed_listing_kind.py -q`
