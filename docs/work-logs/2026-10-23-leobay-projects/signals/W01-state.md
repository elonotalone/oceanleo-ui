# W01 state（实现 owner：下拉共用件 + MenuSelect + 库/工作台调用方）

更新：2026-10-23 18:45（开工，读完三份文档与相关源码，尚未改代码）

## 已确认的事实

- 开工时 HEAD = ea9a000a（父 agent 派活提交）。bootstrap 已跑，main-only OK。
- 边界内三个文件**带别人的未提交改动**（不是 _COMMON §3 列出的那批，是同一个下午 16:0x 的「collection-items」改版：
  `ArtifactLibrary.tsx`、`Playground.tsx`、`WorkspaceLibrary.tsx`，另有未跟踪的 `src/shell/collection-items.tsx`、
  `tests/collection-items.test.mjs`、`tests/bay-collection-views.test.mjs`）。
  直接 `git commit -- <这三个文件>` 会把别人的半成品一并提交，且 HEAD 会 import 一个未入库的模块。
  处理办法：改这三个文件前先把原样拷到 /tmp/w01-pre/，改完用 diff 取出**只含我改的 hunk** 的补丁，
  用临时索引（GIT_INDEX_FILE）套在 HEAD 版本上提交；工作树里别人的 hunk 原样不动。
- 其余边界文件（collection-chrome.tsx、BayFilterSelect.tsx、menu-select.tsx、WorkspaceMasterDetail.tsx、MyLibrary.tsx、
  SiteSkillDirectory.tsx、OperatorConsole.tsx）工作树是干净的，可直接 `git commit -m … -- <路径>`。
- 样式类要在 `src/theme/ui.css` 产物里（Tailwind 预编译，`tests/theme-artifact-in-sync` 判 HEAD）。ui.css 不在我边界、且被别人改着；
  新类要尽量用产物里已有的，实在要新类的列进交卷「给父 agent 的请求」（需重编 ui.css）。
- 词典：`全部类型`(All types) 已存在；`全部类别`、`全部站点` 不存在（别的 owner 会定义，我不用）。
  `应用`=Apps、`网站`=Website、`提示词`=Prompt 已存在；`agent` 拉丁原文不存在。
- 现有测试里钉了这些属性，改外观时必须保留：`data-collection-filter`、`data-collection-filter-menu`、`data-bay-filter`、
  `data-bay-filter-menu`、`data-value`、`data-view`、`data-highlight`、`role=option`。

## 正在做的这一步

读码与设计完成后开始实现：先 collection-chrome.tsx（触发键 class 常量 + CollectionFilterSelect），再 BayFilterSelect。

## 下一步（顺序）

1. collection-chrome.tsx：导出触发键/菜单 class 常量，CollectionFilterSelect 只显示当前值 + aria-label + defaultValue + 菜单选中项前加勾。
2. BayFilterSelect.tsx：引用同一份常量，加 defaultValue，外观一致。
3. menu-select.tsx：正式实现（portal 菜单、键盘、原生 select 同步）。
4. 调用方传参：ArtifactLibrary / MyLibrary / WorkspaceLibrary（allLabel=全部类型）、Playground / WorkspaceMasterDetail（分区值翻译）、OperatorConsole（sceneAllLabel/groupAllLabel）、Playground prompt 区「类型」。
5. 词典 lbp-w01-copy.ts（17 语种）。
6. 测试 tests/lbp-w01-filter-select.test.mjs；跑相关既有测试并小改被打红的断言。
7. typecheck（对比基线 3 条错）、i18n 闸、交卷 verdicts/W01-delivery.md。

## 复现命令

```bash
cd /root/projects/oceanleo-ui
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/lbp-w01-filter-select.test.mjs
bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- pnpm typecheck
node --experimental-strip-types /tmp/w01-tools/dict.mjs "全部类型"   # 词典查询小工具（/tmp 下，丢了可重写）
```
