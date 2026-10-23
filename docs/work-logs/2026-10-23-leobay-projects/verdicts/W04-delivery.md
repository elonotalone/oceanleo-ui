# W04 交卷 · 「我的」页

owner：W04（重派后接手；上一轮只读完任务书，没有代码入库）。日期：2026-10-23。只改了任务书边界内的文件，没 push、没重启容器、没写库、没开浏览器。

## 一、用户现在看到的

「我的」页（`/bay?bay=mine:…`，以及右侧小窗里的 LeoBay「我的」）：

```
返回  我的                                  ← 页头行，原样
交易   我的主页   数据面板                    ← 项目页同一件 ProjectTabNav：下划线页签，直接坐在页底
────────────────────────────────────────
[我发布的 ⌄]  [全部类别 ⌄]                   ← 只在「交易」里：一行两个下拉（W01 的 BayFilterSelect），页底不铺白
┌ 白色圆角卡片 rounded-xl border border-neutral-200 bg-white ┐
│ 列表（我买到的：每行 付款金额 + 类别标签 + 查看对账单）      │
└──────────────────────────────────────────┘
```

- 页签：灰底分段胶囊（六个）→ 下划线页签（三块）：**交易**（英文 Listings & orders）/ **我的主页**（My page）/ **数据面板**（Dashboard）。
- 「交易」里第一个下拉选列表：我发布的 / 我卖出的 / 我买到的 / 我的收藏（Published / Sold / Purchases / Favorites）；第二个选类别：全部类别 / 现成文件 / 人工服务 / 网站与软件服务 / 课程 / 其他（All categories / Ready-made files / Human service / Website & software service / Lessons / Other）。类别胶囊条已删；「成品文件」改「现成文件」。按键上只写当前值，「全部」自带名词（W01 的件已按 §5.2 实现，我只传参）。列表下拉是视图切换：边框不因选了具体值加深（`defaultValue={list}`），只有类别选了具体类别才加深。
- 不再铺整页白板：`PAPER_DETAILS` 去掉 `mine`、`dashboard`。白色只剩「交易」里的列表卡片；「我的主页」「数据面板」外框不包白（里面的卡片由 W06、W05 画）。
- 「我买到的」每一行右侧显示付款金额（订单 / 课程 / 网站与软件服务 / 订阅都有，0 写「免费」，订单没定价写「面议」）；有订单（合同）的行多一个「查看对账单」，点开在该行下面展开那一单的对账单（`StatementPanel`），可关。
- 页头搜索提示：「搜素材、服务、作品、课程、需求…」→「搜索 LeoBay」。
- 退役种类名清扫（我的边界内）：详情页标题 服务详情 / 作品详情 → 详情，管理作品 → 管理，编辑作品 → 编辑；行标题回退 未命名服务 / 未命名作品 → 未命名。
- 英文大小写：`bay-shell-copy.ts` en 段 `myPublished` "published"→"Published"、`myHome` "my page"→"My page"、`dashboard` "dashboard"→"Dashboard"（只改这三处值）；逐语种核对过其余 15 语，没有同类小写问题。

## 二、三块与地址映射表

`BayMineTab` 类型与 `bay-links.ts` 没动，映射在新文件 `mine/mine-blocks.ts`，`BayMine.tsx` 用它。

| 地址 `?bay=` | 页签（块） | 「交易」里的列表 | 备注 |
|---|---|---|---|
| `mine:published` | 交易 | 我发布的 | `openMine()`（BayList.tsx，没改）就是它，默认进「交易·我发布的」 |
| `mine:sold` | 交易 | 我卖出的 | |
| `mine:bought` | 交易 | 我买到的 | |
| `mine:favorites` | 交易 | 我的收藏 | |
| `mine:page` | 我的主页 | — | 不变（W06 的 I-8：`requestMinePageEdit(); openBay({kind:"mine",tab:"page"})` 照用） |
| `mine:dashboard` | 数据面板 | — | 不变 |
| 老值 `needs/services/help` `proposals` `orders` `card` | 经 `normalizeBayMineTab` 落到 published / sold / bought / page，再按上表 | | `bay-links.ts` 没动 |
| 认不出的值 | 交易 | 我发布的 | |

点击行为：
- 点「交易」页签 → 换到**最近看的列表**（从主页 / 数据面板点回来记得；第一次是我发布的）；点「我的主页」→ `mine:page`；点「数据面板」→ `mine:dashboard`；点已选中的页签不动。
- 第一个下拉选列表 → `replaceBay({kind:"mine", tab:<列表>})`（走地址，可分享）；第二个下拉选类别只改视图状态，不进地址，四个列表共用。
- 状态放在模块级小仓 `mine/mine-view-state.ts`：`LeoBayPage.Detail` 与 `BayPanel` 都用 `formatBayParam(target)` 当 key 包着 BayMine，地址一变它整个重挂，本地 `useState` 会丢（类别回到全部）。小仓在重挂时保留（`useMineViewLifecycle` 卸载后延迟一拍复位，同一拍又挂上来就取消），BayMine 真正离开后复位；服务端 / 水合第一帧一律用初始值，不把上一位访客的选择带进别人的首屏。
- 右侧小窗（overlay 变体）：同样三块页签 + 两个下拉；不包卡片（小窗本身是白的），页签 `px-2`。

## 三、白底改动说明（§5.3）

| 位置 | 以前 | 现在 |
|---|---|---|
| `LeoBayPage.PAPER_DETAILS` | `publish, post-need, mine, dashboard, service-editor, app-editor, lesson-editor, bundle-editor` | 去掉 `mine`、`dashboard`；其余保留白板 |
| 「我的」「数据面板」页框 | `PAPER_FRAME_CLASS`（贴边）+ 整页 `BAY_FORM_PAPER_CLASS`（`rounded-3xl bg-white p-6`） | 普通页框 `FRAME_CLASS` + 普通详情容器，页底渐变露出来；独立的 `{kind:"dashboard"}` 目标同样不再垫白板 |
| 页签 / 下拉行 / tabpanel / BayMine 根 | 灰底胶囊容器 | 都不带 `bg-white` |
| 交易列表 | 铺在整页白板里 | 一块卡片 `mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white`（`data-bay-mine-card`），只包列表（含加载、空态、登录提示）；列表最后一行不再画下边线（`last:border-b-0`） |
| 我的主页 / 数据面板 | 在整页白板里 | 外框不包白（`[data-bay-mine-card]` 不存在，BayMine 自己的部分没有任何 `.bg-white`） |

用到的所有 Tailwind 类名都已在 `src/theme/ui.css` 产物里（逐个比对过，0 缺失），我这边**不因新类而需要重编 ui.css**（产物对 HEAD 落后是别的工程的类名，见第七节）。

## 四、「我买到的」金额与对账单

`mine/MyBoughtPane.tsx`、`mine/MineTradeList.tsx`、新 `mine/MineStatement.tsx`：
- 金额：`formatBayFen(fen, currency, locale)`（`lib/bay/money.ts`，只读引用）；locale 来自 `settings/money-ui` 的 `useBayMoneyLocale()`；订单用自带 `currency`，课程 / 买断 / 订阅单没有币种字段，用账本币种 `useLedgerCurrency()`（和原来 `formatBayFen` 的默认一致）。`data-bay-mine-amount="<行号>"`。
- 对账单：行上 `data-bay-mine-statement="<行号>"` 的「查看对账单」按钮（已有词条）；点开才 `fetchBayStatement(合同号)`（`GET /v1/talent/ledger/statement?contract_id=…`，只读），用 `StatementPanel` 画在该行下面，一次展开一张，面板自己的「关闭」或再点一次收起；取不到显示「加载失败，请稍后再试。」，列表和金额不受影响。合同号来源：订单行 = 订单 id；课程 / 网站与软件服务买断行 = `contract_id`（为空就没有按钮）；订阅行没有合同，没有按钮。

## 五、文案

- 分表 `lbp-w04-copy.ts`（17 语）只新增两条：
  - `"交易 "`（**末尾一个半角空格**）= 页签名，en Listings & orders。裸「交易」已被 LeoChat 筛选占用（`im-shell-copy` 的 filterTalent，en Deals、de Aufträge、fr Commandes…，意思是谈成的单），而这一块里有「我发布的 / 我卖出的 / 我买到的 / 我的收藏」，两处中文字面相同含义不同，只能拆成两个键；末尾空格在按钮里不占位，中文界面看到的仍是「交易」。**别把它「修」成裸「交易」**（会把页签退回 LeoChat 的译法）。测试 `lbp-w04-mine` 钉了：`en["交易 "]` = Listings & orders、`en["交易"]` 仍是 Deals。
  - `全部类别`（All categories 等）。
- 复用已有词条：现成文件（bay-posting-copy）、人工服务 / 课程 / 其他 / 类别（bay-mine-copy）、列表、我的、详情、管理、编辑、未命名、查看对账单、加载失败…、关闭、正在加载…、免费、面议、搜索 LeoBay。`网站与软件服务` 的 15 语译文由 W02 的 `lbp-w02-copy.ts` 定义（我先写过一份，发现重复后删掉了，我的测试里留了一条「16 语都得有」的守卫）。
- 我的边界内全部 34 条 `tt("…")` 字面量逐条核对过，16 语都有译文。

## 六、文件清单

新增：`src/shell/bay/mine/mine-blocks.ts`、`src/shell/bay/mine/mine-view-state.ts`、`src/shell/bay/mine/MineStatement.tsx`、`tests/lbp-w04-mine.test.mjs`。

修改：
- `src/shell/bay/shell/BayMine.tsx`（重写：ProjectTabNav 三块、两个下拉、白卡、登录提示；`BayMineTabs` / `BaySignInPrompt` / `BAY_MINE_LABELS` 导出保留，`BayMineTabs` 多一个可选 `panelId`）
- `src/shell/bay/shell/LeoBayPage.tsx`（`PAPER_DETAILS`、搜索提示、头注释）
- `src/shell/bay/shell/BayDetail.tsx`（标题清扫、头注释）
- `src/shell/bay/mine/MineCategoryBar.tsx`（胶囊条删除，只剩 `MineCategory`、`MinePaneProps` 两个类型的再导出，因为 W03 的 `orders/MyOrdersPane.tsx`、W05 的 `seller/MyServicesPane.tsx` 按这个路径引用）
- `src/shell/bay/mine/MineTradeList.tsx`（行加 `amount`、`statementContractId`；最后一行无下边线）
- `src/shell/bay/mine/MyBoughtPane.tsx`、`MyPublishedPane.tsx`、`MySoldPane.tsx`、`MyFavoritesPane.tsx`、`PublishedCategoryTag.tsx`（现成文件、未命名、头注释）、`index.ts`（头注释）
- `src/i18n/ui/messages/bay-shell-copy.ts`（en 三处值）、`src/i18n/ui/messages/lbp-w04-copy.ts`
- 测试：`tests/bay4-mine-trade.test.mjs`、`tests/bay4-mine-me.test.mjs`、`tests/bay-mine-category.test.mjs`、`tests/bay-shell-picker.test.mjs`、`tests/leochat-get-help.test.mjs`（都是小范围精确替换）

提交（`git log --oneline --grep='leobay-projects(W04)'`）：`5d6ae903`（分表 + en 大小写）、`f2c1a82e`（主体实现 + 新测试）、`4fba3f41`（列表下拉边框、服务端快照、测试跟进）、`38e7c309`（最后一行边线、分表去重）、以及本交卷提交。

## 七、测试（命令与结果原文）

命令（轻活）：
```
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs
```

结果（TAP 摘要，逐文件；`# cancelled 0 / # skipped 0 / # todo 0` 省略）：

```
【一】我的边界与直接引用我文件的测试（逐条原文，仅主要 7 份；其余只留摘要）
--- tests/lbp-w04-mine.test.mjs
ok 1 - 地址映射表：published|sold|bought|favorites 都落在「交易」并选中对应列表；page、dashboard 原样；认不出的当 published
ok 2 - bay-links 与 BayMineTab 类型不动：六个地址值照旧能解析（老值也落到新位置）
ok 3 - 视图状态仓：没变化不通知；复位回到「我发布的」与「全部」
ok 4 - 页签是项目页同一件下划线 ProjectTabNav：三块，交易 / 我的主页 / 数据面板；不是灰底胶囊，也不再有六个页签
ok 5 - 交易里一行两个下拉：第一个选 我发布的 / 我卖出的 / 我买到的 / 我的收藏，第二个选类别；胶囊条已删
ok 6 - 类别在四个列表之间保持，从主页点回「交易」回到最近看的列表；BayMine 真正离开后才复位
ok 7 - 地址兼容：mine:published|sold|bought|favorites 打开「交易」并选中对应列表；mine:page、mine:dashboard 不变
ok 8 - 点页签换地址：交易 → 最近的列表，我的主页 → page，数据面板 → dashboard；点已选中的不动
ok 9 - 不铺整页白板：根、页签、tabpanel、下拉行都不带 bg-white；白色只在列表这一块圆角卡片上；主页和数据面板外框不铺白
ok 10 - 右侧小窗（overlay）同样三块两下拉；不包卡片、不用整行 mt
ok 11 - 没登录：页签还在，下面是登录提示，没有下拉
ok 12 - BayMineTabs 单独用：onSelect 收到的是地址值（交易 → 最近的列表）
ok 13 - LeoBayPage：「我的」和「数据面板」页不垫整页白板，发帖和编辑页的白板照旧
ok 14 - LeoBayPage：页头搜索提示不列种类名（搜索 LeoBay）
ok 15 - BayDetail：标题不再用退役的种类名（服务详情 / 作品详情 / 管理作品 / 编辑作品）
ok 16 - 我买到的：每一行都显示付款金额（订单 / 课程 / 网站与软件服务 / 订阅），0 写免费
ok 17 - 我买到的：有订单（合同）的行才有「查看对账单」；点开按合同号取对账单，用 StatementPanel 画，可关
ok 18 - 我买到的：对账单取不到时在这一行下面说「加载失败」，列表和金额不受影响
ok 19 - 我买到的：类别筛选只留这一类，金额照样显示
ok 20 - 文案：页签「交易 」（末尾一个空格）英文 Listings & orders，不动 LeoChat 筛选的「交易」（Deals）
ok 21 - 文案：英文页签与下拉选项首字母大写（Published / Sold / Purchases / Favorites / My page / Dashboard）
ok 22 - 退役名字清扫：我的页相关源码里的可见文案不再用「成品文件 / 未命名服务 / 未命名作品」
# tests 22 # pass 22 # fail 0
--- tests/bay4-mine-trade.test.mjs
ok 1 - 我发布的：一张统一列表，没有需求、没有分区标题，每行右边标类别，没有页内发布按钮
ok 2 - 我发布的：类别条筛到作品时只留作品
ok 3 - 我卖出的：报价和卖家订单在同一张清单；没有概况、没有分段标题、没有买卖切换
ok 4 - 我卖出的：课程购买行留下，对应的 talent 合同不重复出现
ok 5 - 我买到的：只出买家订单；行上没有联系卖家和去评价；空态没有去逛逛
ok 6 - MyOrdersPane 不传 fixedRole 时买卖切换仍在
ok 7 - 我发布的：每一行都能删除，先二次确认，再调对应的删除接口
ok 8 - 我发布的：服务端不让删时，原因显示在这一行下面，行还在
ok 9 - 我卖出的：只有已了结的订单能删，删的是「从我的列表移除」，不碰订单本身
ok 10 - 我卖出的 / 我买到的：已移除的行不再出现
# tests 10 # pass 10 # fail 0
--- tests/bay4-mine-me.test.mjs
ok 1 - 收藏纯函数：标题、副标题、打开目标
ok 2 - 我的收藏：一张清单，行右边标类别；点行打开对应目标
ok 3 - 我的收藏：空状态没有招生句，也没有取消收藏键
# tests 3 # pass 3 # fail 0
--- tests/bay-mine-category.test.mjs
ok 1 - 选中全部时每一类都留；否则只留这一类
ok 2 - listing_kind 映射到五类；不认识的算人工服务
ok 3 - 收藏：服务按 listing_kind；卖家和需求算其他
ok 4 - 类别：五类的顺序与名字是现成文件、人工服务、网站与软件服务、课程、其他；胶囊条已删，文件里只剩类型
ok 5 - BayMine：交易里一行两个下拉（列表 + 类别），主页与数据面板不分类；页签是项目页那件下划线 ProjectTabNav
ok 6 - 四个页面都走同一张清单并按类别筛选
ok 7 - 课程和作品购买对应的 talent 合同不进统一清单
ok 8 - 发布页的交付方式多了「其他」，并且其他走服务的定价与条款
# tests 8 # pass 8 # fail 0
--- tests/bay-shell-picker.test.mjs
ok 1 - LeoBay 页挂了 LibraryWorkPickerHost
ok 2 - BayPage 转给 LeoBayPage
ok 3 - LeoBay 详情页不再套带描边的白底悬浮板
ok 4 - 发帖、编辑垫白底圆角板；「我的」「数据面板」不垫整页白板（白色只给分隔区域的卡片）
ok 5 - 发帖白板跟页一起滚：板上没有滚动条，下滑盖住返回和标题
ok 6 - 发帖白板贴着页的上下边，页框不再上下留白；编辑页和发帖同一块板，不另铺白底
ok 7 - 截止时间是自己的日历面板（日期 + 时分秒 + 时区），不是原生日期框
# tests 7 # pass 7 # fail 0
--- tests/leochat-get-help.test.mjs
ok 1 - 标题、分类、价格、向谁展示一次看见，没有更多选项
ok 2 - 所有人走 demands；指定某人没选好友不发
ok 3 - PostNeedPane 与 CallHumanPane 都有找人帮忙表单；从「发布 → 需求」进来标题是发布，叫真人仍是找人帮忙
ok 4 - BayMineTabs 三块：交易 / 我的主页 / 数据面板（下划线页签）；四个列表不再是页签，认不出的值落在交易
# tests 4 # pass 4 # fail 0
--- tests/bay2-copy.test.mjs
ok 1 - 常量表：16 语齐全、占位符不丢、非中日韩不含汉字
ok 2 - 新加进外壳 / 卖家分表的键：中文站 key 等于值
# tests 2 # pass 2 # fail 0
--- tests/bay3-page.test.mjs: # tests 16 # pass 16 # fail 0
--- tests/bay4-browse.test.mjs: # tests 9 # pass 9 # fail 0
--- tests/bay5-panel.test.mjs: # tests 9 # pass 9 # fail 0
--- tests/bay-toolbar.test.mjs: # tests 6 # pass 6 # fail 0
--- tests/bay-shell-state.test.mjs: # tests 16 # pass 16 # fail 0
--- tests/bay-apps-nav.test.mjs: # tests 6 # pass 6 # fail 0
--- tests/bay-lessons-mine.test.mjs: # tests 4 # pass 4 # fail 0
--- tests/bay-lessons-nav.test.mjs: # tests 5 # pass 5 # fail 0
--- tests/bay-supply-cards.test.mjs: # tests 7 # pass 7 # fail 0
--- tests/bay-supply-profile.test.mjs: # tests 6 # pass 6 # fail 0
--- tests/bay3-profile.test.mjs: # tests 15 # pass 15 # fail 0
--- tests/leochat4-surfaces.test.mjs: # tests 9 # pass 9 # fail 0
--- tests/collection-chrome.test.mjs: # tests 9 # pass 9 # fail 0
--- tests/lbp-w01-filter-select.test.mjs: # tests 26 # pass 26 # fail 0

【二】会编进 BayMine 的链上的其他测试（经 BaySignInPrompt 等引用，或与词典 / 样式产物有关；只列摘要）
tests/bay-app-endpoint.test.mjs: # tests 11 # pass 11 # fail 0 
tests/bay-app-feedback.test.mjs: # tests 7 # pass 7 # fail 0 
tests/bay-app-releases.test.mjs: # tests 7 # pass 7 # fail 0 
tests/bay-apps-editor.test.mjs: # tests 10 # pass 10 # fail 0 
tests/bay-apps-mine.test.mjs: # tests 5 # pass 5 # fail 0 
tests/bay-artifact-deep-link.test.mjs: # tests 4 # pass 4 # fail 0 
tests/bay-asset-browse.test.mjs: # tests 15 # pass 15 # fail 0 
tests/bay-dashboard.test.mjs: # tests 5 # pass 5 # fail 0 
tests/bay-lessons-bought.test.mjs: # tests 1 # pass 1 # fail 0 
tests/bay-lessons-editor.test.mjs: # tests 10 # pass 10 # fail 0 
tests/bay-loading-effect-locale.test.mjs: # tests 52 # pass 52 # fail 0 
tests/bay-seller-profile-reveal.test.mjs: # tests 2 # pass 2 # fail 0 
tests/bay-template-shelf.test.mjs: # tests 8 # pass 8 # fail 0 
tests/d4-r7-saved-editor-reentry.test.mjs: # tests 4 # pass 4 # fail 0 
tests/e2-result-canvas-stability.test.mjs: # tests 1 # pass 0 # fail 1 
tests/library-task-render-loop.test.mjs: # tests 7 # pass 7 # fail 0 
tests/plugin-module-hosting.test.mjs: # tests 2 # pass 1 # fail 1 
tests/result-canvas-deeplink-priority.test.mjs: # tests 6 # pass 6 # fail 0 
tests/result-canvas-slot-keepalive.test.mjs: # tests 1 # pass 1 # fail 0 
tests/result-canvas-workbench-open.test.mjs: # tests 4 # pass 4 # fail 0 
tests/workspace-home-cards.test.mjs: # tests 8 # pass 8 # fail 0 
tests/lbp-w03-kind-names.test.mjs: # tests 8 # pass 8 # fail 0 
tests/lbp-w05-settings-dashboard.test.mjs: # tests 33 # pass 33 # fail 0 
tests/lbp-w06-verification-grants.test.mjs: # tests 30 # pass 30 # fail 0 
tests/lbp-w08-notices.test.mjs: # tests 49 # pass 49 # fail 0 
tests/bay-supply-checkout.test.mjs: # tests 10 # pass 10 # fail 0 
tests/i18n-key-collision.test.mjs: # tests 4 # pass 2 # fail 2 
tests/i18n-tt-key-coverage.test.mjs: # tests 10 # pass 7 # fail 3 
tests/share-i18n-coverage.test.mjs: # tests 7 # pass 6 # fail 1 
tests/hit-target-budget.test.mjs: # tests 10 # pass 8 # fail 2 
tests/theme-artifact-in-sync.test.mjs: # tests 3 # pass 2 # fail 1
```

类型检查：
```
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck
[agent-io-guard] running: pnpm typecheck
$ tsc --noEmit
exit=0
（0 条错误；开工时基线的 3 条 video-project-doc.ts 错误已被别的工程修掉。）
```

没有算我头上的红灯（同仓别的工程在改，已确认与我的键 / 文件无关）：
- `tests/i18n-tt-key-coverage.test.mjs` 第 8、9、10 条红：缺口全在 messages/Inbox、LeoAssistant、AgentChat、视频时间轴等别的文件；第 9 条点名的是 `全部站点`、`解锁`（别的 owner 补了译文，基线表要删）。核对过：本波我边界内的 34 条 tt 字面量 0 缺口。
- `tests/i18n-key-collision.test.mjs` 2 条红：`WORK_CHAT_MESSAGES:置顶`、`BAY_MESSAGES:游戏`，与我的键无关。
- `tests/share-i18n-coverage.test.mjs` 1 条红：`AgentChat` 的两条文案。
- `tests/hit-target-budget.test.mjs` 2 条红：全仓 145 处 > 预算 98，我的文件不在名单里。
- `tests/e2-result-canvas-stability.test.mjs`（整份没跑起来：别的工程的 Toast 桩缺 `runAfterOverlayExit` 导出）、`tests/plugin-module-hosting.test.mjs` 第 1 条（右栏窗口标题条断言）：都是工作台 / 编辑器那一侧的红灯，和 BayMine 无关。
- `tests/theme-artifact-in-sync.test.mjs` 第 3 条：`ui.css` 比 HEAD 源码少 56 条规则、多 12 条死规则，全是别的工程新增 / 删掉的类名（`h-[96px]`、`max-w-[60rem]`、`awb-*` 等）；少的规则里没有我用的类（我的类逐个核对过都在产物里），需要父 agent 在收尾时统一重编。
- `tests/bay-supply-checkout.test.mjs` 第 9 条在 W03 改 CheckoutPane 文案（服务→商品）的窗口里红过一次，最后一次跑已 10/10 绿。

HTTP：开发预览 `https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com/bay?bay=mine:published` 返回 200、页面带 `data-bay-page="pending"`（首屏占位），页面里没有编译错误字样；未登录，列表本身没法在不开浏览器的前提下看。

## 八、没做完的 / 限制

- 没开浏览器、没截图（本任务未批准）：视觉只做到「类名逐个对产物 + jsdom 真渲染断言结构 / 类名 / 点击行为」。建议 V01 在开发预览里用测试账号点一遍：三块页签、两个下拉、白卡、我买到的金额与对账单。
- 小窗（`BayPanel`）里 BayMine 仍按 `key={formatBayParam(current)}` 重挂；小仓保证类别 / 最近列表不丢，键盘切页签后焦点会回到页面（原来就是这样）。
- 订阅行没有合同号，所以没有「查看对账单」（订阅每期的买断行有，且已在列表里）。

## 九、对别的 owner 的接口说明

- I-5：用的是 `ProjectTabNav`（`src/shell/project-workspace.tsx`）本件，没改它；W10 只要保持导出名与 props 不变（按钮属性 `data-project-tab`、`role=tab`、`aria-selected`、`tabId/panelId`）。我的测试依赖这几个属性。
- I-6：用了 `settings/money-ui` 的 `StatementPanel`、`useBayMoneyLocale` 和 `lib/bay/money` 的 `fetchBayStatement`、`formatBayFen`，只读；W05 改内部时请保持这四个的导出名与 props，以及 `StatementPanel` 根上的 `data-bay-statement="<合同号>"`（我的测试用它找面板）。
- I-8：`mine:page` 照旧；W06 的「编辑状态下核验区可见」不受影响。
- 给 W03 / W05：`mine/MineCategoryBar.tsx` 现在只导出类型 `MineCategory`、`MinePaneProps`；组件 `MineCategoryBar` 已删，不要再引用。
- 给 W01：我传给 `BayFilterSelect` 的是 `name="mine-list"` / `"mine-category"`、`label`（列表 / 类别，只作 aria）、`value`、`defaultValue`（仅列表下拉）、`allLabel`（仅类别下拉）、`options`、`onChange`；测试依赖 `data-bay-filter`、`data-bay-filter-menu`、`data-value`、`role=option`、按键文字只含当前值、选了具体值时 `border-neutral-900`。

## 十、对父 agent 的请求

1. 我用的 Tailwind 类都已在 `ui.css` 产物里（不因我而需要重编）；产物本身比 HEAD 源码落后（见上，别的工程的类名），收尾时请统一 `pnpm build:css`。
2. 门户帮助文章还在讲旧结构（不在我的边界）：`/root/projects/oceanleo/content/help/bay/what-is-bay.md:40`「「我的」五块：我发布的 / 我卖出的 / 我买到的 / 我的收藏 / 个人卡片。」和 `my-homepage.md:10`「从 **我的 → 个人卡片** 进」，以及钉着前一句的 `tests/bay-portal-help.test.mjs:178`。应改成「交易（我发布的 / 我卖出的 / 我买到的 / 我的收藏）/ 我的主页 / 数据面板」。
3. `src/shell/bay/shell/bay-links.ts`（W02 的文件）里 `BAY_MINE_UI_TABS` 现在没人用，头注释「我的六块标签」也过时，可由 W02 或你顺手删；`BAY_MINE_TABS` 与 `normalizeBayMineTab` 照用。
4. `src/i18n/ui/messages/bay-mine-copy.ts` 里「成品文件」的 17 语译文成了死词条（文件不在我的边界）；不删也无害。
5. 收尾时请你统一跑 `i18n-tt-key-coverage` 并清理它的 `PRE_EXISTING_GAPS` 死条目（`全部站点`、`解锁` 已补译），那不是我的文件。
