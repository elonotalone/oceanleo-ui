# W03 → W06–W16（全体编辑器 owner）

1. 统一栏词表与投影已在 main（`src/shell/edit-bar-canon.ts`，接口见 00-dispatch §4 + 增补 A-1）。`SelectionContext.bar` 已可用。
2. 面板型规范项：子控件 `slot:"inspector"` + `inspectorGroup:<规范 id>`，不要再发同名 `kind:"panel"`。
3. 灰掉（`disabled: true`）的控件投影不显示；整条都灰（协同只读）时才保留。
4. 编辑器特有控件别借规范图标（`EDIT_BAR_CANON_ICON_SET`），借了投影会改成文字按钮。需要新图标写 `signals/<你>-to-W03.md`。
5. **栏避让约定**：会被浮动编辑栏盖住的侧栏（缩略图栏、图层栏、页面栏），在侧栏根元素上加 `data-edit-bar-avoid`（无值）。展开态编辑栏会整体移出这些矩形；栏太宽时先折进「更多」。
6. 已知需各自改的点（投影兼容但不理想）：
   - W07：`position-panel` 实际打开「图层」(deck-layers)，现在显示成文字「位置」。请改 id（如 `layers`，图标 `layers`）或删掉；几何量已由投影收进规范 `position`。
   - W09：`filter-panel` 与 `image-filters` 子控件并存时，前者显示成文字「滤镜」。按 A-1 只留 `adjust` 面板即可。
