# W02 → 编辑器 owner（W06 W07 W08 W09 W10 W11 W12 W13）

## 2026-10-23 09:15Z 素材库「点一下 = 插入/替换」在所有编辑器里都是灰的（D2 / _EDITOR.md §E）

- [实测] `/library?item=<[W02] sample.png>` → 素材库 → 素材详情里「插入」「替换」灰着；理由（现已改成人话）「这个编辑器还不能从素材库直接插入」。证据 `/tmp/w02r2-ins-img/image-pane-8000.png`。
- [读码] 共享闸 `workbench-material-registry.ts::workbenchMaterialActionAvailability` 对 insert/replace 要求 adapter 登记 `command`（version 1、history "editor-command"），源自架构文档 `oceanleo-typed-artifact-and-app-material-bindings.md` §5.1（Insert/Replace 走目标编辑器自己的 history，带来源 revision）。全仓没有一件编辑器登记过（`grep -rn createCommand src/shell/advanced-routes` 为空），所以点卡片、拖进画布都会被拒。W02 不放松这道闸。
- W02 已在 main 提供一行接法 `src/shell/workbench-material-command.ts`：

  ```ts
  import { withEditorHistoryCommand } from "../workbench-material-command";
  useWorkbenchMaterialAdapter(
    withEditorHistoryCommand(materialAdapter, {
      documentId: advancedRootItemId(item),      // 正在改的那份
      targetRevisionId: item.revisionId,          // 当前基线（W04 保存后前移）
      // 只有声明了 "replace" 的才要：此刻选中、要被换掉的对象
      replaceTarget: () => selected ? { targetId, slotId, geometry: { x, y, width, height } } : null,
    }),
  );
  ```

  - 执行时转给你已有的 `mutate(action, item, placement, command)`；`command.source.{artifactId,revisionId}` 是来源 revision，可记 provenance。**你的 mutate 必须走编辑器自己的撤销历史**（这是契约的意思）。
  - 基线还不知道（未存、加载中）时不登记契约，面板如实显示「还不能插入」。
  - replace 没选中时面板显示「先选中要替换的对象，再点素材」。整份替换（音频 / 3D / 表格）给 `targetId: documentId, slotId: "document"` 与舞台矩形即可。
- 回归测试样例：`tests/editor-overhaul-w02-material-command.test.mjs`。
- 自测：`evidence/W02/scenarios/insert-material.mjs "/library?item=<你的文件>" <label>`，看 `feedback` 是否为 `ok`。

各 owner 的 adapter：W06 `PdfRoute.tsx` pdf-stamps@3 · W07 `DeckRoute.tsx` deck-elements@2 · W08 `RichDocRoute.tsx` richdoc-materials@2 · W09 `ImageRoute.tsx` fabric-image-materials@3 · W10 `GridUniverStage.tsx` grid-materials@2 · W11 `VideoTimelineRoute.tsx` video-timeline-materials@2 · W12 `AudioRoute.tsx` audio-materials@2 · W13 `Model3DRoute.tsx` model3d-materials@2。
