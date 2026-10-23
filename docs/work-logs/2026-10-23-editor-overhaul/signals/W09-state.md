# W09 state (图片 / Fabric，含原设计画布)

## 已确认的事实
- [实测] bootstrap OK；main 干净（仅 W02-state.md 未跟踪）；dispatch 提交 60b0d1dc。
- [实测] `src/shell/image-editor/.git` 是空目录（遗留物），不动。
- [待核] 控件 id 旧→新映射（tasks/W09.md 表）。

## 正在做
- 第 1 步：读码（ImageRoute.tsx、image-editor/**、design-composite-commit.ts），摸清选区控件、命令、保存路径、主题写死处。

## 下一步
- 第 2 步：浏览器跑一遍保存协议记录现状（上传 `[W09] sample.png`）。
- 第 3 步：控件改规范 id + `bar`；补齐图片组/形状组/对象组；深色。

## 复现命令
- focused test：`bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
- 浏览器：`cd docs/work-logs/2026-10-23-editor-overhaul && bash harness/mint.sh | OUT_DIR=/tmp/w09-x THEME=light node harness/run.mjs evidence/W09/scenarios/<s>.mjs`
