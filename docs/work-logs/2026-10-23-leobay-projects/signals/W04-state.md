# W04 state

更新：2026-10-23 21:20（主体实现与新测试已绿；余：收尾核对 + 交卷）

## 已确认的事实（实测）
- 上一轮只做到第 0 步（读任务书），没有代码改动入库；LeoBayPage.tsx 的 view 透传已随 a08f3083 入库。基线：相关 16 份测试全绿（bay2-copy、bay3-page、bay3-profile、bay4-browse、bay4-mine-trade、bay-apps-nav、bay-lessons-mine、bay-lessons-nav、bay-mine-category、bay-shell-state、bay-supply-cards、bay-supply-checkout、bay-supply-profile、bay-toolbar、leochat4-surfaces、leochat-get-help）。
- `ProjectTabNav`（project-workspace.tsx）按钮属性固定：`data-project-tab={id}`、role=tab、`aria-selected`；不能加别的属性。
- `openMine()` 在 BayList.tsx（W02 的文件）= `openBay({kind:"mine",tab:"published"})`，映射后天然进「交易·我发布的」，不用改。
- LeoBayPage.Detail 与 BayPanel 的包裹 div 都 `key={formatBayParam(target)}`：mine 的地址一变 BayMine 整个重挂，本地 state 会丢 → 类别/最近列表放进模块级小 store（mine-view-state.ts），卸载后延迟复位。
- 词典：`交易` 已被 LeoChat 筛选占用（en Deals，de Aufträge…）→ 页签用另起的词条键 `"交易 "`（末尾一个半角空格，渲染等同「交易」），en = Listings & orders；`全部类别` 不存在、`网站与软件服务` 只有 en（其余 15 语缺）→ 写进我的分表（最后再查 W02/W03 分表有没有已经定义，避免冲突）；`详情`/`管理`/`未命名`/`金额`/`查看对账单`/`加载失败，请稍后再试。`/`搜索 LeoBay` 都已有 16 语。
- 样式类必须已在 `src/theme/ui.css` 产物里（`/tmp/w04-tools/hasclass.mjs "<类名…>"` 查）；产物里没有的类不用，实在要用的写进交卷「对父 agent 的请求」。
- `tests/i18n-key-collision.test.mjs`：分表英文不得与 en.ts 基础词典同键不同义。

## 定案
- 三块 id：`trade` / `page` / `dashboard`；列表 id：published|sold|bought|favorites。地址 mine:published|sold|bought|favorites → trade + 该列表；mine:page、mine:dashboard 原样。纯映射放 `mine/mine-blocks.ts`。
- 两个下拉用 `BayFilterSelect`（label=tt("我的") / tt("类别")，allLabel=tt("全部类别")，name=mine-list / mine-category），放进 `CollectionFilterRow`。
- 白卡：`rounded-xl border border-neutral-200 bg-white overflow-hidden`，只包交易列表；主页/数据面板不包。PAPER_DETAILS 去 mine、dashboard。overlay 变体不包卡。
- MineCategoryBar.tsx 留成仅类型垫片（MineCategory、MinePaneProps），组件删除。
- 我买到的：行右侧金额 `data-bay-mine-amount`，有合同的行「查看对账单」展开 StatementPanel（fetchBayStatement + useBayMoneyLocale）。
- 退役名字：LeoBayPage 搜索提示→「搜索 LeoBay」；BayDetail 标题 服务详情/作品详情→详情、管理作品→管理、编辑作品→编辑；未命名服务/未命名作品→未命名。
- 「成品文件」→「现成文件」（PublishedCategoryTag）。

## 已完成（已入库）
- 分表 lbp-w04-copy.ts（交易 / 全部类别 / 网站与软件服务）+ bay-shell-copy en 三处大小写。
- mine-blocks.ts、mine-view-state.ts、MineStatement.tsx 新增；BayMine.tsx 重写；MineTradeList 加 amount / statementContractId；MyBoughtPane 金额 + 对账单；MineCategoryBar 变类型垫片；PublishedCategoryTag 现成文件；LeoBayPage PAPER_DETAILS / 搜索提示；BayDetail 标题。
- 测试：bay4-mine-trade、bay-mine-category、leochat-get-help 改绿；新增 tests/lbp-w04-mine.test.mjs（22 条）。

## 正在做
收尾核对：bay-shell-picker 测试标题、其他 owner 分表里有没有也定义「全部类别 / 网站与软件服务」、用到的 Tailwind 类都在 ui.css、再跑 typecheck 与相关测试、写交卷 verdicts/W04-delivery.md。

## 下一步
1. 交卷 verdicts/W04-delivery.md（三块与地址映射表、白底改动说明、测试原文、对父 agent 的请求）
2. 提交后回报

## 复现命令
cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<名字>.test.mjs
词典查询：node --experimental-strip-types /tmp/w04-tools/lookup.mjs "<中文>"（/tmp 下，丢了见 journal 说明重写：register ts-extension-loader 后 import src/i18n/ui/messages/index.ts 的 UI_MESSAGES）
