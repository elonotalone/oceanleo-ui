# W02 state (接班文件)

更新于 2026-10-23（开工）。

## 已确认的事实

- [实测] bootstrap 通过（main-only OK）。
- [读码] 我独占的文件（00-dispatch §3）：`InlineAdvancedWorkbenchShell.tsx`(598 行) `AdvancedWorkbenchShell.tsx` `use-inline-advanced-panels.tsx` `inline-advanced-shell-parts.tsx` `inline-advanced-shell-helpers.ts` `inline-advanced-workbench-drop.ts` `inline-editor-mine-panel.tsx` `inline-editor-mine-activate.ts` `InlineEditorMaterialPanel.tsx` `workbench-material-provider.tsx` `workbench-material-registry.ts` `material-library-standalone.tsx` `SplitWorkspace.tsx`(1026 行，旧大文件，不许再明显变大) `plugin-chrome/EditBarDocumentSegment.tsx` `use-inline-workbench-leave.ts`，文案册 `src/i18n/ui/messages/editor-overhaul-copy-w02.ts`。

## 正在做

- 读码：左侧面板的打开路径（openLibraryPanel → workspacePane / openDrawer / openTransientPanel）。

## 下一步

- 写浏览器复现场景 `evidence/W02/scenarios/`，在库页面 / `/advanced/<featureId>` 复现素材库、我的库点了没反应。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w02-x THEME=light node harness/run.mjs evidence/W02/scenarios/<场景>.mjs
```
