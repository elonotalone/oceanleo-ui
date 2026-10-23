# W01 state（实现 owner：下拉共用件 + MenuSelect + 库/工作台调用方）

更新：2026-10-23 21:28（第一批已落：共用件 + MenuSelect + 调用方 + 分表 + 测试 23 条，准备提交；typecheck 在排队）

## 已确认的事实

- 上一轮只做到读码设计，**一行代码都没落**。重派开工时 HEAD = 5e581e20，边界内文件工作树全干净
  （上午 collection-items 改版已由父 agent 以 a08f3083 入库，不再有「别人的半成品」问题，临时索引法作废）。
- 基线（改动前，HEAD）实测：
  - 相关既有测试全绿：collection-chrome(9) library-collection-chrome(1) bay-toolbar(6) bay-menu-select(2) workspace-desk-piles(5)
    workspace-page-header(7) bay-asset-browse(15) bay-apps-editor(10) bay-lessons-editor(10) library-document-open(3)
    library-shared-split-runtime(6) library-stability(22)。
  - 基线已红（不是我造成，别碰）：typed-artifact-contract #13 #16（collection-items 迁移后断言过时）、
    W3-r3-library-receiver-collab-triggers（module-bench 循环依赖，整份不执行）。
  - 文案闸 tests/i18n-tt-key-coverage.test.mjs 基线 3 条红（#8 新文案缺口、#9 解锁已译未摘、#10 死登记 184>3），
    属别的工程。其中 #8 里**我边界内**的 5 条缺口：collection-chrome.tsx 的 排序方式 / 切换排序方向 /
    正在加载完整列表以排序… / 默认顺序，AppDirectory.tsx 的 板块 —— 这一轮顺手补进我的分表。
  - 产物闸 theme-artifact-in-sync 基线红（少 22 多 6，editor-overhaul 的 awb 类）；我的判据 = 不新增缺失规则、不新增死规则。
    只用产物里已有的类（/tmp/w01-tools/classcheck.mjs 查）。
- 全仓 CollectionFilterSelect / BayFilterSelect 调用方清单（我边界内）：AppDirectory(3 处) AppMarket(2) ArtifactLibrary MyLibrary
  WorkspaceLibrary Playground(2: 分区 + prompt 类型) WorkspaceMasterDetail(分区)。Bay 里的调用方归 W02/W04。
- 词典：全部类型(All types)、全部分类(All categories)、应用(Apps)、网站(Website)、提示词(Prompt)、智能体(Agent) 已有；
  全部场景 / 全部站点 / 全部类别 / 板块 / agent / app / prompt 没有。「全部站点」在文案闸 PRE_EXISTING_GAPS 里（死登记），
  一旦有人给它补译文，闸 #9 会要求从基线摘掉——写进交卷「给父 agent 的请求」。
- 门户项目页里的模态框 z-index 在 80–2147483100 之间：筛选菜单与 MenuSelect 菜单要用 inline 的超大 zIndex，否则躲在模态框后面。

## 已完成（第一批，提交 1）

1. collection-chrome.tsx：导出 COLLECTION_FILTER_TRIGGER_CLASS / collectionFilterTriggerClass / COLLECTION_FILTER_MENU_CLASS /
   collectionFilterOptionClass / CollectionFilterCheck / CollectionFilterTriggerFace / collectionFilterState / collectionMenuPlace；
   CollectionFilterSelect 只写当前值、aria-label、defaultValue、菜单勾、zIndex 2147483500。
2. BayFilterSelect.tsx 引用同一份；保留 disabled/hint/data-view。
3. menu-select.tsx 正式实现（隐藏原生 select、portal 清单、键盘、打字跳转、Esc 只关清单）。
4. 调用方：ArtifactLibrary / MyLibrary / WorkspaceLibrary / Playground(2) / WorkspaceMasterDetail / AppDirectory / AppMarket。
   OperatorConsole / SiteSkillDirectory 不用改（吃 AppDirectory 的新默认值）。
5. 分表 lbp-w01-copy.ts：全部场景 / 板块 / 全部板块 / agent / 排序方式 / 切换排序方向 / 默认顺序 / 正在加载完整列表以排序…
6. tests/lbp-w01-filter-select.test.mjs 23 条。

## 正在做的这一步

提交第一批；等 typecheck（排队中，输出在 /tmp/w01-typecheck-1.txt）。

## 下一步（顺序）

- 变异检查：临时撤掉 Esc 的 stopPropagation / 勾 / defaultValue，确认测试会红（防空断言），之后恢复。
- 文案闸与产物闸差分（对比基线 /tmp/w01-gate-baseline.txt、/tmp/w01-artifact-baseline.txt）。
- 门户 typecheck 看 MenuSelect / CollectionFilterSelect 的新 props 是否与门户调用兼容（W11 在改）。
- 写交卷 verdicts/W01-delivery.md 并提交。

## 复现命令

```bash
cd /root/projects/oceanleo-ui
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w01-filter-select.test.mjs
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck
node --experimental-strip-types /tmp/w01-tools/dict.mjs "全部类型"      # 词典查询（/tmp 下，丢了可重写：register ts-extension-loader 后 import UI_MESSAGES）
node /tmp/w01-tools/classcheck.mjs "类名 类名"                            # 查类名是否在 HEAD 的 ui.css 产物里
```
