# ED-B2 子单元契约（2026-11-16）

共同边界：只在 `/root/wt/ED-B2-oceanleo-ui`，分支 `wt/ED-B2` 工作。不 push、不改主检出、不切分支、不安装、不 build、不用浏览器。先读内核、operator-rulings 最新 Convergence 裁定，运行 bootstrap。父进程统一 commit、typecheck/API/consumer/全量验证。只运行自己相关的 focused tests（IO guard run-light），把结果发父进程。不得改 ED-B3 文件：AdvancedEditorIcon.tsx、EditBarIcon、edit-bar-surface.ts、SelectionToolbarNumberControl.tsx、SelectionToolbarSelectControl.tsx、selection-toolbar-canon-controls.tsx。

父进程拥有：advanced-editor-adapter.ts、selection-context-types.ts、selection-context.ts、selection-adapter.ts（新）、edit-bar-canon*、SelectionToolbar*（排除禁改文件）、InlineAdvancedWorkbenchShell.tsx、FloatingContextToolbar.tsx、plugin-chrome/EditBarDocumentSegment.tsx、creation-tools.ts（新）、selection-toolbar-layout.ts、collab/adapters/visual-readonly.ts、tests/editor-toolbar-profile-parity.test.mjs、公共导出/快照与最终报告。

接口固定：从 `../selection-context` 导入 `SelectionAdapterContext` / `SelectionControlInput` / `SelectionAdapter`；`SelectionAdapter = {context: SelectionAdapterContext | null; dispatch: (command: SelectionCommand) => void}`。从 `../selection-adapter` 导入 `selectionControlInputs(controls)`（去掉 canon 展示信息）和 `selectionAdapterContext(context)`（将旧 SelectionContext 转为 id-only 输入）。规范控件可只交 `{id, value, mixed, min,max,step, options,panelId,panelAction,...能力字段}`；非规范必须带 `domain: "specific"` 与展示信息。兼容转换由父进程实现。保留原 builder 作为引擎数据可兼容，尽量删除规范控件重复 label/kind/图标；不得发明不支持的能力。

`AdvancedEditorAdapter.selection` 直接交 hook 返回值；删除 contextToolbar/renderContextToolbar。`creationTools` 是 `readonly AdvancedEditorCreationTool[]`，每项 `{id, tool: CreationToolId, value?, disabled?, unavailableReason?, execute?: () => void, panelId?, panelAction?}`。`CreationToolId` 由父进程创建词表：highlight, underline, strikeout, check, cross, text, signature, ink, note, find, select, templates, elements, image, shape, line, draw, table, pages, materials, effects, layers, audio, video, model, properties, action。PDF 十个 id 保持 pdf-tool-*；execute 跟原动作等效。drawer 自动由 shell 汇入创建域，不必各路重复实现。

用户可见行为必须保留：选区修改命令和撤销、只读门禁、selection revision/epoch 校验、手势事务、打开/保存/导出链。字号/行距/字距交外壳为 px 数值，step 为 +/- px；引擎换算留 adapter。clear-format 清本引擎能清的全部行内格式，并回报差异。

## docs 单元

独占：src/shell/doc-editors/ 下 RichDocContextToolbar.tsx、DeckContextToolbar.tsx 的迁移 hook 与控件/命令相关文件；src/shell/advanced-routes/RichDocRoute.tsx、DeckRoute.tsx；src/shell/doc-editors/GridUniverStage.tsx、grid-univer/ 下选区工具条相关文件；只与上述功能相关的已有测试。不能改父进程文件或其他单元文件。

把两 ContextToolbar 改成 use-rich-doc-selection-adapter.ts / use-deck-selection-adapter.ts（保留 builder 导出需要时迁移引用），删除 UI 包装，Route 调 hook 后交 selection。Grid 直接交数据。统一文字单位（deck 字号 4–300）。统一 clear-format 含内联全部可清格式。保留复杂 RichDoc revision/epoch 与事务。自己的测试如因旧包装路径需更新可改，但不得降低断言。返回变更 file:line、focused tests、差异与风险。父进程负责 parity 新测试。

## media 单元

独占：src/shell/media-editors/ 下 AudioContextToolbar.tsx、Model3DContextToolbar.tsx、PdfSelectionBar.tsx 及其迁移 hook/纯 builder/patch/palette；src/shell/advanced-routes/AudioRoute.tsx、Model3DRoute.tsx、PdfRoute.tsx、VideoTimelineRoute.tsx；src/shell/video-editor/VideoTimelineContextToolbar.tsx 与 video-edit-bar.ts 等其直接控件命令；只与上述功能相关的已有测试。不能改其他单元或父文件。

Audio、Model3D、VideoTimeline 改 use-*-selection-adapter hook，删除 UI 包装；PDF 拆纯构建/patch 与 PdfToolPalette.tsx（palette 可有 UI，但不能另实例 SelectionToolbar），Route 交 selection 和 creationTools。PDF 十个工具必须创建域，原 identity/执行保留；PDF 字号 6–96 px；其他字号统一 px；clear-format 如支持则清全部能清的行内格式，不捏造未支持能力。回报 PDF 字体/原生批注差异。更新相关已有测试引用但不降低断言。

## image 单元

独占：src/shell/image-editor/FabricImageContextToolbar.tsx 与 fabric-image-toolbar-controls.ts、fabric-image-commands.ts 等其选区控件/命令；src/shell/advanced-routes/ImageRoute.tsx；src/shell/video-canvas/LibraryVideoCanvasSession.tsx、engine/canvas-selection-adapter.ts 及必要选区命令；只与上述功能相关的已有测试。不能改其他单元或父文件。

Fabric 改 use-fabric-image-selection-adapter.ts，删除 UI 包装，Route 交 selection；video canvas 直接交数据，去 renderContextToolbar；panel 交 shell 的同一 panel host，不再需要回调注入 toolbar。保留只读、revision/epoch 与手势事务。图像字号 6–320 px，行距/字距在 adapter 转 px，引擎值换算回去；clear-format 清所有本引擎可清内联格式。支持图片命令使用真 canon id 翻译，不假借图标/能力。更新相关已有测试引用但不降低断言。
