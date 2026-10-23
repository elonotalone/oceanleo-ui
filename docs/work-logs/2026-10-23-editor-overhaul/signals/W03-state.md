# W03 state

## 已确认的事实
- [读码] `SelectionToolbar.tsx` 598 行、`selection-context.ts` 584 行，均在行数闸（<600，`tests/advanced-canva-interactions.test.mjs`）里：只能减不能增。
- [读码] `./shell/selection-context` 与 `./shell/FloatingContextToolbar` 是 package 子路径出口，导出清单进 `public-api.snapshot.json`：这两个文件**不许增删导出**。新类型 `SelectionBar` 放 `selection-context-types.ts`（非出口），经 `SelectionContext.bar` 流出。
- [读码] 收起圆的图标由 `FloatingContextToolbar` 的 `collapsedIcon` prop 传入；壳（W02）目前没传。`editorToolsIconForSelection` 保留导出。
- [读码] `EditorToolsTrigger` 只被 `SelectionToolbar.tsx` 引用。

## 正在做
第 1 步：接口提交（`bar` 字段 + `edit-bar-canon.ts` 规范表/别名表/`canonicalSelectionControls` 签名）。

## 下一步
投影接进 SelectionToolbar；图标补齐；删 EditorToolsTrigger；栏位置避让；判据测试；浏览器截图。

## 复现命令
- 类型检查：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-heavy -- npx tsc --noEmit -p .`
