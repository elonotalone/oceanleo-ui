# W02 journal

- 18:45 开工。工作区带着上一轮 bay-library-dashboard 波未提交的 collection-items 重构，压在我的边界文件上（BayList/BayAppShelf/BayLessonShelf/BayAssetCard/BayAssetLibrary）；HEAD 的 src/shell/index.ts 已导出未跟踪的 src/shell/collection-items.tsx。
- 20:50 重派后接手。上一轮除读码外没有改动；工作区对我的边界是干净的。
- 21:05 实测：库里 talent_services.listing_kind 是 NOT NULL 默认 'service'（0273 已允许 other）；现存 2 条草稿（other、service）。
- 21:10 后端：`_service_query` 按 listing_kind 筛（service 含空值，其余等值）；`feed()` 带非 service 种类时同时去掉 help 与 consult。新测试 backend/tests/test_bay_feed_listing_kind.py；`pytest test_bay_feed*.py test_bay_digital_listing.py test_bay_posting.py test_bay_related.py` 154 passed。门户提交 3145092。
- 21:20 实测：`bay-state.ts`（不归我）的 `normalizeFilter` 与 `readPageOffer` 白名单写死 service/asset/app/lesson，求购侧选「其他」会被丢掉 → 写进交卷「对父 agent 的请求」（两行）。
- 21:25 实测：`PRE_EXISTING_GAPS` 里有「全部站点」（AppMarket 早就在用、一直没译）；我补译后 i18n-tt-key-coverage 第 9 条要求从基线表里删掉它 → 测试文件不许我改，写进交卷请求。
- 21:30 实测：`bay-shell-copy` 第 3 条只认 bay-copy.ts / 基础词典，不认各 owner 的 lbp 分表 → 在该测试里把 11 张 lbp 分表并进查找（小范围精确改）；剩下的「列表」是 W04 的 BayMine.tsx。
- 21:35 前端第一批：bay-links（other、五个名字、种类→发布种类）、lib/bay/feed、use-bay-data（两侧传 listing_kind，enabled/limit/listingKind 选项）、BayList（出售/求购下拉）、新 BayFeedItemCard、两个货架接 listing_kind、素材库「卖家在售」（新 BayAssetSellers）、PanelBrowse、分表。tsc 在我的文件上 0 错误（别人的 settings / BayMine / collection-chrome 在改，有它们自己的错）。
- 21:55 实测：真库（只读，用后端自己的 .env 在临时进程里跑 `bay_feed.feed`）对 supply/needs/all × 六种 listing_kind 全部 200 无报错（库里没有已发布行，所以都是空列表——过滤语法被真 PostgREST 接受）。开发网关当前 HTTP 也是空列表，等父重启后可对同一组命令复验。
- 22:00 实测：对 bay-state.ts 的临时副本（用后即删）加上「other」两处白名单后，求购 offer=other 的筛选与地址 `?kind=request&offer=other` 都能保住 → 交卷请求的两行补丁够用；仓里留了一条 `todo` 测试（现在 not ok # TODO，补丁落地后自动变绿）。
- 22:05 现成文件「我上传的」没登录提示改成「登录后查看你上传的这一类文件。」（来源改名后跟着改，进了我的分表）。lbp-w02-browse 44 条 + 1 条 todo；相关测试全集（见交卷）全绿，只剩别人的红。
