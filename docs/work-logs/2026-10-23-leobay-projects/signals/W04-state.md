# W04 state

更新：2026-10-23 18:50（开工，读完任务书/共同须知/合同）

## 已确认的事实
- 工作区带着上一轮 bay-library-dashboard 波未提交的改动：`LeoBayPage.tsx` 里有 `view` 属性透传（BayAssetLibrary / BayAppShelf / BayLessonShelf）与删掉 `listShelves` 两处旧改；文件在我的边界里，提交时会连带提交。`src/shell/collection-items.tsx`（未跟踪）不归我。
- `BayMineTabs` 只在 BayMine.tsx 内部用；`BaySignInPrompt` 被多处引用（不许删）；`MineCategory` 类型被 `seller/MyServicesPane.tsx`（W05）与 `orders/MyOrdersPane.tsx`（W03）从 `mine/MineCategoryBar` 引用 → 删胶囊条组件后文件要留成只含类型的垫片。
- “交易”这个词条已被 LeoChat 筛选占用（en: Deals），不能在我的分表里重定义；第一块页签要用另起的词条键。
- `ProjectTabNav` 在 `src/shell/project-workspace.tsx`，props: tabs / activeId / onChange / ariaLabel / className / tabClassName。
- `BayFilterSelect` props: label / value / options / onChange / allLabel? / searchable? / accent? / name（W01 在改外观，我只传参）。
- 「我买到的」数据：BayOrder(total_fen,currency,id=合同id)、BayLessonPurchase / BayAppPurchase(price_fen, contract_id)、BayAppSubscription(price_fen，无合同)。

## 正在做
- 第 0 步：基线测试（哪些相关测试开工前就红）

## 下一步
1. 词条 + 分表（lbp-w04-copy.ts）+ bay-shell-copy en 三处大小写
2. mine-category.ts：类别新名字；新 MineFilterRow（两个下拉）；MineCategoryBar 变类型垫片
3. BayMine.tsx 重写（ProjectTabNav 三块 + 地址映射 + 两下拉 + 白卡）
4. LeoBayPage.tsx：PAPER_DETAILS、搜索提示；BayDetail.tsx 标题
5. MyBoughtPane 金额 + 对账单
6. 测试：改绿被打红的 + 新增 tests/lbp-w04-mine.test.mjs
7. 交卷 verdicts/W04-delivery.md

## 复现命令
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs
