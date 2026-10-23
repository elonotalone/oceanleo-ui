# leobay-projects 波 · 派活合同

父 agent（Claude Opus 5.5）写，2026-10-23。操作员要求：子 agent 一律 Sonnet 5.5、max 推理、非 fast。

## 操作员要的结果（用户看得见的）

1. LeoBay、库、工作台、项目里的筛选下拉改成参考图样式（白底浅边圆角、粗体、只写当前值）。
2. LeoBay「出售 / 求购」并成一个下拉；种类名统一为 人工服务 / 现成文件 / 网站与软件服务 / 课程 / 其他，且每一类里显示的就是按这一类发布的东西。
3. 「我的」页：下划线页签（同项目页）；三块：交易（下拉选 我发布的 / 我卖出的 / 我买到的 / 我的收藏）、我的主页、数据面板；类别并成一个下拉；不铺整页白板。
4. 设置 → LeoBay：去掉卖家资料、资质审核、钱、规则与条款四个页签，只剩一页「付款卡 + 收款账户」。资质审核搬到我的主页；卖家的收入流水、对账单、导出、收款状态搬进数据面板；买家花销放到「我买到的」每一行；规则与条款搬到条款页 /legal/marketplace；「用 OceanLeo 账号登录的应用」搬到设置 → 账户。
5. 通知：海外版与境内版的 LeoChat（leo message）功能完全一样——平台通知在 LeoChat 里看得到（今天两版网页登录后都看不到）。「内容处置」（设置里误名 Content samples）变成 LeoChat 的子功能：平时不显示，出事时通过 LeoChat 里的通知进入。
6. 项目页大改：左列上为任务、下为输入框；右列整列为项目配置，顶上「动态」「计划」两张小卡片（点开看/改详情），「资产」也进项目配置；顶部与输入框周围不加白底；各种选择框改好；计划页全部接上翻译。

## Owner 总表（文件边界互不重叠；边界外一行不许改）

| ID | 内容 | 主要边界 |
|---|---|---|
| W01 | 下拉共用件改样式 + 表单下拉 MenuSelect + 库/工作台调用方 | `collection-chrome.tsx`、`bay/shell/BayFilterSelect.tsx`、`menu-select.tsx`、`Playground.tsx`、`WorkspaceMasterDetail.tsx`、`ArtifactLibrary.tsx`、`MyLibrary.tsx`、`WorkspaceLibrary.tsx`、`SiteSkillDirectory.tsx`、`OperatorConsole.tsx`、`AppDirectory.tsx`、`AppMarket.tsx` |
| W02 | LeoBay 逛：出售/求购下拉、种类新名字、每类内容对得上（含后端信息流）、素材库筛选、右侧栏 | `bay/shell/{BayList,bay-links,use-bay-data,feed-card-ui,bay-icons}.ts(x)`、`bay/asset/*`、`bay/panel/*`、`bay/apps/BayAppShelf.tsx`、`bay/lessons/BayLessonShelf.tsx`、`lib/bay/feed.ts`、后端 `app/talent/bay_feed.py` |
| W03 | LeoBay 其余文件的种类名字清扫 + 发布表单 | `bay/` 下未分给别人的全部文件（见任务书清单）、`pages/settings/sections/AutomationSettingsSection.tsx` |
| W04 | 「我的」页 | `bay/shell/{BayMine,LeoBayPage,BayDetail}.tsx`、`bay/mine/*`（除 `MyDashboardTab.tsx`） |
| W05 | 设置 → LeoBay 一页化、钱页拆分、数据面板加钱的部分、各「去设置付款/收款」入口改指 | `bay/settings/*`（除条款 5 个文件与 `BayTermsPublic.tsx`）、`bay/dashboard/*`、`bay/mine/MyDashboardTab.tsx`、`bay/apppaid/*`、`bay/orders/OrderPane.tsx`、`bay/seller/MyServicesPane.tsx`、`lib/bay/{money,payments}.ts` |
| W06 | 资质审核进我的主页、交易会话系统消息改指、应用登录授权进设置 → 账户 | `bay/page/*`、`bay/supply/ProfilePane.tsx`、`bay/seller/BayVettingSection.tsx`、`bay/deal/{deal-lines,deal-actions}.ts`、`bay/applogin/MyAppLoginGrants.tsx`、`pages/settings/account/*`、`pages/settings/settings-tabs.ts`、`lib/bay/{vetting,app-login}.ts` |
| W07 | 规则与条款搬到条款页 | `bay/settings/{BayTermsOverview,BayTermsDialog,BayTermsGate,terms-flow,terms-text,BayTermsPublic}.tsx`、`lib/bay/terms.ts`、门户 `app/legal/marketplace/page.tsx`、`app/_components/legal-shell.tsx`、`app/terms/page.tsx` |
| W08 | LeoChat 里的通知（两版一样）、铃铛去留、未读数、深链（含 cases 视图挂载） | `src/shell/messages/*`（除 `messages/cases/*`）、`src/shell/leochat/*`、`src/shell/account/{NotificationBell,SidebarAccountCluster}.tsx`、`src/api/notifications.ts` |
| W09 | 内容处置搬进 LeoChat | `src/shell/messages/cases/*`、新 `src/lib/moderation/*`、门户 `app/settings/{sections.tsx,content-cases/*}`、`app/account/content-cases/page.tsx`、`app/legal/copyright/page.tsx`、`lib/moderation/client.ts`、后端 `app/moderation/{actions,store}.py` |
| W10 | 项目页布局 | 共享 `src/shell/project-workspace.tsx`；门户 `components/project/{ProjectWorkspace,ProjectFeedTab}.tsx`、`components/ProjectConfigEditor.tsx` |
| W11 | 项目页各选择框 + 计划页翻译 + 项目列表页筛选 | 门户 `app/projects/page.tsx`、`components/project/{ProjectPlanTab,ProjectTasksTab,ProjectAssetsTab,ProjectAutomationDialog,ProjectConnectorDialog,ProjectInstructionDialog}.tsx`、`components/ShareProjectModal.tsx` |

每位另有自己的分表 `src/i18n/ui/messages/lbp-w<NN>-copy.ts`，以及与自己源文件对应的测试文件。

## 接口（父 agent 定，owner 不得单方面改）

- **I-1** `MenuSelect`（`src/shell/menu-select.tsx`，已从 `@oceanleo/ui/shell` 导出）：props 以父放的占位文件为准。W01 换实现；W11 使用。
- **I-2** `CollectionFilterSelect` / `BayFilterSelect` 的 props 不减不改名（可加可选项）。W01 改外观；其余 owner 只改传参。
- **I-3** `MessagesContentCases({ caseId?, onBack? })`（`src/shell/messages/cases/MessagesContentCases.tsx`）：W09 实现；W08 在 LeoChat 的 `cases` 视图里挂载。
- **I-4** LeoChat 深链：`?im=notices` 打开通知列表；`?im=cases` 打开内容处置，`?im=cases:<caseId>` 直接展开一件。门户上的规范地址是 `/leochat?im=cases`。W08 实现解析；W09 让后端通知链接、旧地址 `/account/content-cases`、`/settings/content-cases` 都落到这里。
- **I-5** `ProjectTabNav`（`src/shell/project-workspace.tsx`）导出名与 props 不变；W04 用它画「我的」页签，W10 不得破坏它。
- **I-6** `settings/money-ui.tsx` 里 `StatementPanel`、`LedgerList`、`MoneyStat`、`MonthlyBars`、`useBayMoneyLocale` 的导出名与 props 不变（W05 可改内部）；W04 在「我买到的」用 `StatementPanel` + `useBayMoneyLocale`。
- **I-7** `openBaySettings(pane?)` 保留签名；任何 pane 都打开新的单页（W05）。
- **I-8** 打开资质核验：`requestMinePageEdit(); openBay({ kind: "mine", tab: "page" })`；W06 保证编辑状态下核验区可见并自动滚到它（若需区分，W06 在 `page/mine-page-edit.ts` 加可选参数，保持旧调用可用）。
- **I-9** `BayTermsPublic`（已从 `@oceanleo/ui/shell` 导出）：W07 实现，门户 `/legal/marketplace` 使用。
- **I-10** 后端信息流 `GET /v1/talent/bay/feed` 的 `listing_kind` 参数在出售（supply）侧也生效（W02）。

## 验收（父 agent 亲自跑，不采信自述）

每位交卷后：边界路径 `git status --porcelain` 为空、`git log` 有提交；共享 UI 与门户 typecheck 不新增错误；该 owner 列出的测试在父 shell 里跑绿；`tests/i18n-tt-key-coverage.test.mjs` 绿。全部交卷后父 agent 重启开发网关、跑 `oceanleo-dev-slots-fresh.sh`，再派独立验收 V01。

## 禁区（全体）

见 `_COMMON.md` §3、§5.4。另：境内外行为不得分叉（通知、LeoChat 两版一致）。
