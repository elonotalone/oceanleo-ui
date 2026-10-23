# W04 journal（每得到一条实测结论追加一行）

- 18:50 开工：读完 W04 任务书、_COMMON、合同；工作区 LeoBayPage.tsx 带着上一轮未提交的 view 透传改动（在我的边界里，随我的提交一起走）。
- 20:35 重派接手：上一轮没有代码入库（git status 在我边界为空；LeoBayPage view 透传已随 a08f3083 入库）。
- 20:40 基线：相关 16 份测试全绿（见 state）。
- 20:42 实测：词条 `交易`（LeoChat 筛选，en Deals）已占用 → 页签用 `"交易 "`（末尾半角空格）另起键，英文 Listings & orders；`全部类别` 不存在；`网站与软件服务` 只有 en；`详情`/`管理`/`未命名` 等已有 16 语。
- 20:44 实测：LeoBayPage.Detail 与 BayPanel 都以 formatBayParam(target) 为 key 包 BayMine → mine 地址一变就整个重挂，类别/最近列表要放模块级 store。
- 20:46 实测：ui.css 是预编译产物，新类名要先查产物（/tmp/w04-tools/hasclass.mjs）；ProjectTabNav 按钮只带 data-project-tab，不带 data-mine-tab。
- 21:15 实现落地：BayMine 三块 ProjectTabNav + 两个 BayFilterSelect + 白卡；mine-blocks / mine-view-state / MineStatement 新增；MyBoughtPane 每行金额 + 对账单；LeoBayPage PAPER_DETAILS 去 mine、dashboard、搜索提示「搜索 LeoBay」；BayDetail 标题清扫；成品文件 → 现成文件；未命名服务/作品 → 未命名。
- 21:20 实测：pnpm typecheck exit=0（开工时基线的 3 条错在 video-project-doc.ts 已被别的工程修掉）。tests/lbp-w04-mine.test.mjs 22/22 绿；bay4-mine-trade、bay-mine-category、leochat-get-help、bay2-copy 绿。
- 21:20 实测：bay3-page(2)、bay4-browse(3)、bay-apps-nav(1)、bay-lessons-nav(1) 现在红，原因是 W02 在改出售/求购（BayList / bay-links 工作区改动），不是我的改动（基线时它们全绿；失败项全是 BayViewSwitch / BAY_FEED_KINDS 的断言）。
- 21:20 实测：i18n-key-collision 有 2 条红（WORK_CHAT_MESSAGES:置顶、BAY_MESSAGES:游戏），与我的键无关。
