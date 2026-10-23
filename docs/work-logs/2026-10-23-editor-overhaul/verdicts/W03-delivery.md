# W03 交付 — 统一编辑栏（D9）、删「编辑工具」图标（D3）、栏不被侧栏盖住

## 用户看得到的变化
- 每个编辑器选中文字 / 图片 / 形状，看到的是同一套按钮：同样的图标、同样的标签、同样的顺序（00-dispatch §4 + 增补 A-1）。投影在外壳里对所有编辑器生效，编辑器还没改 id 也成立（别名表）。
  - 开发槽实测，演示文字栏：字体名 · 字号 · 加粗 · 斜体 · 下划线 · 删除线 · 文字色 · 高亮色 · 对齐 · 列表 · 行间距 · 超链接 · 填充色 · 描边样式；「更多」按「文字 / 形状 / 对象操作」分节放字距、清除样式、圆角、不透明度、阴影、层级、位置与尺寸、动画、锁定、复制一份、删除。
  - 开发槽实测，图片栏：替换 · 裁剪 · 水平翻转 · 垂直翻转 · 旋转 · 圆角 · 边框样式 · 不透明度 · 调色 · 层级 · 位置与尺寸 · 锁定 · 复制一份 · 删除；「更多」：显示方式、阴影效果。
- 同一条栏没有两个一样的图标：规范项各有独立字形（新画了文字色、荧光笔、行间距、字距、清除样式、替换、圆角、调色、填充、描边、层级、缩进、阴影、替代文字、显示方式、抠图、编号列表、向左旋转，以及 W12 要的 6 个音频字形）；编辑器特有控件借用规范图标或互相撞形的，自动改成文字按钮。PPT 截图里那三个「A」、两个十字箭头不再出现（字体显示字体名、字号显示数字，只剩文字色一个 A；位置只有一个）。
- 字体显示当前字体名；字号是数字输入 + 常用字号下拉；对齐、列表是下拉，栏上图标随当前值；层级是一个下拉（置于顶层 / 前移一层 / 后移一层 / 置于底层），旧的 layer-up / layer-down 由外壳合成并把命令还原成编辑器自己的 id。
- 灰掉的按钮不再出现（整条只读的协同「只能查看」除外）。
- 编辑栏最左边那个随选中对象变化的「编辑工具」圆形图标在所有编辑器里都没了（`EditorToolsTrigger` 删除）。
- 展开的编辑栏不再盖住编辑器侧栏：侧栏根元素标 `data-edit-bar-avoid`（W06 / W07 已加），栏整体移到侧栏外侧；栏太宽时容量按侧栏宽度收窄，先折进「更多」。开发槽实测演示：栏从 x=432 起，缩略图栏右缘约 422，不重叠。
- 收起成圆、拖动、停靠行为不变（相关 gesture / dock 测试全绿）。

## 文件
- 增：`src/shell/edit-bar-canon.ts`（对外入口）、`edit-bar-canon-table.ts`（规范表、别名、栏推断、顺序、图标类）、`edit-bar-canon-projection.ts`（投影、命令还原、特有控件去图标）、`selection-toolbar-canon-controls.tsx`（字号、字体名控件）、`tests/edit-bar-canon-projection.test.mjs`（新判据）。
- 改：`selection-context-types.ts`（`SelectionContext.bar`、图标表改为运行时常量 + 新字形名）、`selection-context.ts`（`bar` 透传，未知值丢弃；图标表引用同一常量，文件 584→537 行；导出清单不变）、`selection-inspector-groups.ts`（规范面板入口 id = 规范 id，`panelId` 仍 `selection-inspector-<id>`）、`SelectionToolbar.tsx`（每个编辑器走投影；删触发器与死掉的 design-canvas 分支；598→565 行）、`SelectionToolbarControl.tsx`、`SelectionToolbarSelectControl.tsx`（随值图标、`data-selection-option`）、`AdvancedEditorIcon.tsx`（新字形；svg 带 `data-icon`；不透明度不再是水滴）、`EditorToolsIcon.tsx`（删 `EditorToolsTrigger`，留 `editorToolsIconForSelection` 给收起的小圆）、`floating-toolbar-geometry.ts` / `edit-bar-dock-controller.tsx`（+10 行）/ `selection-toolbar-measure.ts`（避让）、`selection-toolbar-layout.ts` / `selection-toolbar-chrome.tsx`（「更多」分节名经 tt）、`src/i18n/ui/messages/editor-overhaul-copy-w03.ts`（30 条 × 16 语）。
- 删：`EditorToolsTrigger` 组件（随之不再调用 `registerAdvancedToolsTrigger`；`advanced-layout-context.tsx` 里的登记函数没删，W01 说已无调用方，可由父 agent 统一清）。
- 保留不用：`selection-toolbar-layout.ts` 的 `orderDesignTextControls` / `DESIGN_TEXT_CONTROL_ORDER` / `selectionControlSemantic` / `nextTextAlignment` 仍导出——同级 `design` 仓的契约测试在 import 它们。

## 提交（main，未 push）
db0d37d7、b3a49b42（父 agent 抢救提交我的盘上文件）、24d04be3、06edaa4d、216650ff、1deb2606、d5800fd2、d2e51d25、7d540ea4、1778c5d2、440ad717、fb09c188、e962d106、1a34d6d4，以及本交付提交。

## 验证
- 类型检查 `agent-io-guard.sh run-heavy -- npx tsc --noEmit -p .`：我的文件 0 错；全仓只剩 `workflow-carrier/video-project-doc.ts` 3 个（W16，父 agent 已知）。
- focused（`agent-io-guard.sh run-light -- node … --test tests/<f>`）：edit-bar-canon-projection 7/7（新）、advanced-editor-v8-shared-edit-bar 10/10、advanced-editor-v9-edit-bar 8/8、selection-toolbar-adaptive-layout 11/11、selection-toolbar-measure-feedback 1/1、g2-selection-toolbar-render 7/7、W5-edit-bar-command-effects 10/10、W5-edit-bar-command-dispatch 4/4、edit-bar-single-row 4/4、eas-w12-edit-bar-height 4/4、b18-edit-bar-gesture、deck-unified-edit-bar、e1-edit-bar-double-press、eas-w11-edit-bar-rearm、edit-bar-below-page-row、edit-bar-flight-grab、edit-bar-gesture-coverage、edit-bar-motion、plugin-chrome-edit-bar-late-host / portal-gate 全绿；public-api-snapshot-tracked 4/4。
- 浏览器（验收账号，开发槽，场景 `evidence/W03/scenarios/w03-edit-bar.mjs <artifactId> deck|image <tag>`）：
  - 演示 `0dac8934-…`（[W07] sample.pptx）文字框，light / dark：`evidence/W03/deck-light-text.png`、`deck-light-text-more.png`、`deck-dark-text.png`、`deck-dark-text-more.png`。duplicateIcons=[]，triggers=0，overlapsAvoid=[]。
  - 图片 `03e7bab9-…`，light / dark：`evidence/W03/image-light-image.png`、`image-light-image-more.png`、`image-dark-image.png`、`image-dark-image-more.png`。duplicateIcons=[]，triggers=0。
  - 两档下栏和「更多」都跟随站点主题，没有浅色岛。
- 开发槽新鲜度 `oceanleo-dev-slots-fresh.sh`：oceanleo dev 槽 FRESH。

## 改写的旧测试（只测已删行为的，逐条）
- v8「shared edit bar opens host tools…」→ 改为断言没有触发器、规范标签 / 图标 / 顺序、More 对话框语义（原断言触发器存在、编辑器自写标签生效）。
- v8「More 面板：动作之后关…」：fixture 从 text-color / duplicate（现为规范主栏项、不再进 More）换成两个特有控件，判据不变。
- v9「Design text controls…」：原断言 `<EditorToolsTrigger` 排在控件前 → 断言触发器不存在。
- v9「Design alignment is one five-step click cycle」→「对齐是下拉、栏上图标随值」（D9 裁定对齐为下拉；原断言禁止 listbox）。
- v9 适配器清单：`PdfContextToolbar.tsx`（W06 按 D4 删除）换成 `PdfSelectionBar.tsx`。
- adaptive-layout 网格用例：期望标签「粗体 / 文字」→ 规范「加粗 / 文字色」。
- W5 字号步进器 → 数字输入 + 常用字号下拉；W5 两个图片「更多」用例：旋转 / 锁定 / 复制 / 删除现为主栏规范项（栏上或「更多」都找），layer-up 改测规范层级下拉。
- g2：补齐过期桩（`IconButton`、`resolveEditBarDrawers`——这份测试此前整份加载失败，没人发现）；折叠回差用例原写死 10-22 删钉选键之前的阈值，改为先量真实折叠线再判回差；「host:website」占位选区随 10-22 删掉的子站宿主一起作废。
- edit-bar-dock-console：桩补齐 W02 新导出。

## 转给别人的事（已写信号）
- `signals/W03-to-editors.md`：给 W06–W16 的约定（规范 id、A-1 面板写法、灰按钮不出、`data-edit-bar-avoid`）。W07：`position-panel` 实际开「图层」，现显示成文字「位置」，请改名或删。W09：`filter-panel` 与 `adjust` 面板并存时前者显示成文字「滤镜」。
- `signals/W03-to-W09.md`：A-1 已落。`signals/W03-to-W12.md`：6 个音频字形已落。
- `signals/W03-to-W02.md`：建议壳给 `FloatingContextToolbar` 传 `collapsedIcon={editorToolsIconForSelection(kind)}`（收起小圆目前显示通用图标）；`edit-bar-dock-console` 第 9 例断言 `use-inline-advanced-panels.tsx` 有 2 处 `showWorkspaceDetail({`，W02 改结构后为 0。

## 请父 agent 代改的公共文件
- 无新增公共出口（`edit-bar-canon` 只在仓内用；`./shell/selection-context`、`./shell/FloatingContextToolbar` 导出清单未变）。
- `public-api.snapshot.json` 目前过期，原因全部是 W01 的 plugin-theme 导出变化（`pluginThemeStorageKey` / `PluginThemeToggle` / `setPluginTheme` 去掉、`readSiteThemeMode` 新增）。我误跑过一次 `--write`，已用 HEAD 内容原样还原，未提交。
- `tests/i18n-tt-key-coverage.test.mjs` 现红 3 例，全部来自别人的文件（PDF / Inbox / 网格等新 key 与基线条目）；W03 的文件没有缺口，也没删任何 `tt("…")` 调用点。

## 如实的剩余问题
- 这些红不在我的文件里：advanced-canva-interactions #3（W09 删了 `filter-panel`、W01 删了 `PluginPageRow`）、editor-repair-acceptance-edit-bar #5（W09 的命令分发现在读 `editor.layers`，测试假编辑器没有）、advanced-editor-v7 #2 / #5（W09 改 id、W01 顶栏）、plugin-chrome-edit-bar-page-gate、advanced-workbench 两例（W01/W02/W04 源码断言）、hit-target-budget 两例（pages / bay 等文件）。
- 投影不把编辑器自己放进属性分组（`slot:"inspector"`）的控件拉成顶层（与 A-1 同理）。所以编辑器没改之前，演示的字号这类项若还在旧分组里，就仍在面板里，入口若借了规范图标会显示成文字——要上栏得编辑器按 §4 改成顶层控件（演示 W07 已改，实测字号已在栏上）。
- 视频、PDF、表格、网站、音频、3D、游戏、视频画布的栏我没在浏览器里逐个看，按任务书由各编辑器 owner 和 V03 验；投影对它们同样生效（同一组件）。
- `edit-bar-dock-controller.tsx::readPluginChromeRowsBottom` 的 page-row 分支在 W01 删第二行后永远落空，无害，未删。
