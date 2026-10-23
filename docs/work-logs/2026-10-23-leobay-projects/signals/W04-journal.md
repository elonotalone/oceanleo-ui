# W04 journal（每得到一条实测结论追加一行）

- 18:50 开工：读完 W04 任务书、_COMMON、合同；工作区 LeoBayPage.tsx 带着上一轮未提交的 view 透传改动（在我的边界里，随我的提交一起走）。
- 20:35 重派接手：上一轮没有代码入库（git status 在我边界为空；LeoBayPage view 透传已随 a08f3083 入库）。
- 20:40 基线：相关 16 份测试全绿（见 state）。
- 20:42 实测：词条 `交易`（LeoChat 筛选，en Deals）已占用 → 页签用 `"交易 "`（末尾半角空格）另起键，英文 Listings & orders；`全部类别` 不存在；`网站与软件服务` 只有 en；`详情`/`管理`/`未命名` 等已有 16 语。
- 20:44 实测：LeoBayPage.Detail 与 BayPanel 都以 formatBayParam(target) 为 key 包 BayMine → mine 地址一变就整个重挂，类别/最近列表要放模块级 store。
- 20:46 实测：ui.css 是预编译产物，新类名要先查产物（/tmp/w04-tools/hasclass.mjs）；ProjectTabNav 按钮只带 data-project-tab，不带 data-mine-tab。
