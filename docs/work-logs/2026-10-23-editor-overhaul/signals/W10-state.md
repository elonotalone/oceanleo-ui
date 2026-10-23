# W10 state（表格 / Univer）

更新：2026-10-23 开工

## 已确认的事实

- [实测] bootstrap 通过；仓在 `main`，工作区干净（只有别人的未跟踪 state 文件）。
- [读码] `GridRoute.tsx` → `doc-editors/GridUniverStage.tsx`（1,373 行）；同一个 Univer 实例切 chrome（`grid-univer/stage-plan.ts` + `chrome.ts`）。
- [读码] 现有编辑栏控件来自 `grid-univer/facade-commands.ts` 的 `GRID_UNIVER_COMMANDS`（L1/L2 有 run 的才进栏）：`bold`、`align`、`color`、`background`、`type`、`decimals`、`merge-cells`、`split-cells`、行列、排序、筛选、条件格式、数据验证。没有字体/字号/斜体/下划线/删除线。
- [读码] 编辑栏值不跟随选区：`gridUniverSelectionContext` 写死 `bold=false`、`align=left`、`color=#292524`、`background=#ffffff`。
- [读码] W03 的 `bar` 字段与 `edit-bar-canon.ts` 尚未落地。

## 正在做

- 摸底：Univer 深色主题能力、facade range 的读样式 API、SelectionToolbar 控件渲染方式、相关测试。

## 下一步

1. 新模块 `grid-univer/text-bar.ts`：统一文字栏（规范 id + 选区值回读）。
2. 新模块：深色主题接线。
3. 保存协议浏览器实测。

## 复现命令

- focused test：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
