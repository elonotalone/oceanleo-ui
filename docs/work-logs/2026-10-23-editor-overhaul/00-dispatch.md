# 编辑器整改波 — 派活合同（2026-10-23）

父 agent：Claude Code（Opus 5.5）。全部子 agent：`model: "opus"`（Opus 5.5），不用 fast，不再派孙 agent。
工作目录：本目录（`oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul/`）。
共同须知与**全部红线**：`_COMMON.md`。每位 owner 的任务书：`tasks/<ID>.md`。

## 1. 操作员裁定（2026-10-23，本对话，全部明确同意，不许改判）

截图都来自 LeoDev 槽 `https://p-511af16886fbb22b5ab2367528b458ba.dev.oceanleo.com`（`oceanleo` 门户，dev 模式，热更新）。

- **D1 顶栏只剩一行。** 左：`←` ｜ 素材库 我的库 ｜ 模式页签。右：`↶ ↷` ｜ 保存状态 ｜ `···` ｜ 全屏 ｜ `×`。
  - `···` 里放：邀请一起改、生成回放、分享、收藏、下载（下载是子菜单，列出各格式）。每项带文字和图标。
  - 模式页签只出现在有两种以上页面的编辑器：PDF、表格、网站是「编辑 | 专业编辑」，游戏是「编辑 | Code」。单模式编辑器不显示页签。原来的第二行页签行整行删除。
  - 主题按钮删除。多人同改的头像串留在外面，不进菜单。
- **D2 素材库 / 我的库在每一种承载里都要打开左侧面板**，承载包括 `/library?item=`、工作台右栏、`/advanced/<featureId>`、素材目录。
  - 素材库：第一项「从本地上传」，下面列出当前编辑器能用的素材。点一下或拖进去，就插进当前文件。
  - 我的库：列出你的文件。点一下，编辑器换成那份文件；换之前先保存当前改动。
  - PDF 的素材库提供图片和签名，放进页面后成为图章。
- **D3 删掉编辑栏最左边的「编辑工具」图标**（`EditorToolsTrigger`，随选中对象变成 T、图片、页面等图标的那个），所有编辑器都删。
  - 它藏着的抽屉改成编辑栏里带文字的按钮，只在没选中任何东西时显示：演示是模板、元素、画笔、线条、便签；文档是插入、批注；图片是画笔、形状、线条、便签；其它编辑器显示各自申报的抽屉。
  - AI 抽屉不重复出现，右端的 AI 键保留。
- **D4 PDF 基础编辑整体换新。**
  - 工具：高亮（可选颜色）、下划线、删除线、打勾 ✓、打叉 ✗、加文字（点哪写哪）、签名（手写或打字，存下来下次复用）、画笔、便签批注、查找。
  - 页面整理：旋转页和删页放在左侧页面缩略图上，鼠标移上去出现按钮，拖动缩略图即可排序。
  - 删除：提取页、插空白页、合并 PDF。旧的基础版编辑栏与工具面板也一并删掉。
  - 存储：改动存成标准 PDF 批注，别的阅读器也看得到。
  - 切换：基础编辑和专业编辑用**同一个 EmbedPDF 实例**，切换只是显示或隐藏工具，没有「正在切换」，也不重新载入。
  - 全程只有一个缩放控件。
- **D5 库的类型名改成素材类别**：视频、网站、演示文稿、文档、表格、图片、PDF、音频、视频画布、3D 模型、游戏。英文同样去掉 editing。「设计画布」并入「图片」，这是 10-22 的决定。
- **D6 深色模式的分界。**
  - 跟着变深：工具栏、面板、侧栏、画布底色、弹层、菜单。
  - 保持原色：幻灯片、PDF 页面、图片、网站预览、视频画面、3D 场景。
  - 文档正文和表格格子跟着变深（像飞书文档、飞书表格），用户自己设的颜色保留。
  - 库的卡片跟随主题。
- **D7 所有编辑器自动跟随网站主题**：light / dark，auto 按系统解析，特色主题按明暗归入 light 或 dark。不再有各编辑器自己的「本命默认」，也不存 localStorage，不再有切换键。
- **D8 文档类卡片**（txt、md 以及所有文档类型的项）直接显示标题和开头几行。不转圈，也不显示渲染出来的整页图。
- **D9 统一编辑栏**：文字一套、图片一套、形状一套，另有一个对象组。
  - 每个编辑器里的 id、图标、顺序完全一样（词表见 §4）。
  - 编辑器做不到的按钮直接不显示，不放灰按钮；同一条栏里不许出现两个一样的图标。
  - 覆盖：文档、演示、图片、网站、视频（文字和字幕）、PDF（加文字和批注）、表格（单元格文字）。
- **D10 视频编辑栏的每个按钮都要在画面上看得到效果**。确实做不到的就删掉，并在交付里写明删了哪些。
- **D11 保存要真的成立**，11 个编辑器逐个用真浏览器、真登录验收，判据见 §5。
- **D12 浏览器验收只用内部验收账号** `oceanleo-acl-accept@oceanleo.internal`（id `2ffeef37-102a-431b-b2c2-51c5675dba79`）。**绝不用操作员账号**：开发版网关连的就是生产库（`auth.oceanleo.com`）。
  - 注意：`/root/.cache/oceanleo-react-rebuild/dev-client-test-account.env` 里那个「测试账号」其实就是操作员本人的账号，不许用。
- **D13 清理在保存修好之后做**：先列出操作员库里的测试残留（4 个可见条目，以及没有任何现存版本在引用的隐藏中间文件），再退役。脚本由 W04 写，执行归父 agent，在 V02 判绿之后。
- **D14 完成的标准是在上面那个开发版槽上实测通过。** 不上线，不同步 oceanbizs，不 bump，不推 consumer。

## 2. Owner 名册

| ID | 负责 | 主仓 |
|---|---|---|
| W01 | 顶栏一行 + `···` 菜单 + 页签进顶栏 + 删主题键 + 主题跟随站点 | oceanleo-ui |
| W02 | 左侧面板：素材库/我的库在所有承载可见可用 + 编辑栏空态抽屉按钮（D3 落点）+ 插入/切换行为 | oceanleo-ui |
| W03 | 编辑栏统一词表与投影（D9）+ 删 `EditorToolsTrigger` + 编辑栏位置被侧栏遮挡 + 图标 | oceanleo-ui |
| W04 | 保存内核（D11）：CAS 基线、保存后基线前移、只 fork 一次、诚实状态、中间文件不再一存一个 root、清理脚本 | oceanleo-ui + oceanleo backend |
| W05 | 库页：类型名（D5）、文档卡片（D8）、库卡片深色、上传时存摘要 | oceanleo-ui + oceanleo backend |
| W06 | PDF 编辑器（D4）：基础/专业同实例、新工具、缩略图页面整理、PDF 的保存与深色 | oceanleo-ui |
| W07 | 演示（deck）：统一栏、深色、保存 | oceanleo-ui |
| W08 | 文档（RichDoc/Tiptap）：统一栏、深色（正文变深）、保存、文本文档存摘要不存 PNG | oceanleo-ui |
| W09 | 图片（Fabric，含设计画布）：统一栏、深色、保存 | oceanleo-ui |
| W10 | 表格（Univer）：普通模式单元格文字栏、深色（格子变深）、保存、专业切换保持无缝 | oceanleo-ui |
| W11 | 视频时间线：编辑栏每个按钮生效（D10）、统一文字/图片栏、深浅两档、保存 | oceanleo-ui |
| W12 | 音频：深浅两档、编辑栏、保存 | oceanleo-ui |
| W13 | 3D：深浅两档、编辑栏、保存 | oceanleo-ui |
| W14 | 网站（Puck）：点文字出统一文字栏、点图片出统一图片栏、深色、保存、专业切换无缝 | oceanleo-ui |
| W15 | 游戏：深浅两档、编辑栏、「编辑/Code」页签、保存 | oceanleo-ui |
| W16 | 视频画布（xyflow）：深浅两档、编辑栏、保存 | oceanleo-ui |
| V01 | 独立验收：外壳与库（D1 D2 D3 落点 D5 D7 D8，各承载） | 只读 + 浏览器 |
| V02 | 独立验收：保存（D11，11 个编辑器）+ W04 清理清单复核（只读） | 只读 + 浏览器 + 只读 SQL |
| V03 | 独立验收：编辑栏与按钮（D3 D4 D9 D10，逐个编辑器逐个按钮） | 只读 + 浏览器 |
| V04 | 独立验收：深浅两档视觉（D6 D7，全部编辑器 + 外壳 + 库） | 只读 + 浏览器 |

Agent id 名册：`signals/roster.md`（父 agent 派发后填写）。

## 3. 文件所有权（一个文件只有一位 owner；不在表里的共享文件 = 父 agent）

路径都相对 `oceanleo-ui/src/shell/`，另有注明的除外。**测试**：主要测你那些文件的测试归你；跨编辑器清单类测试归表中注明者。

- **W01**：`AdvancedWorkspaceActionBar.tsx`、`InlineAdvancedWorkbenchHeader.tsx`、`plugin-chrome/{PluginGlobalRow,PluginPageRow,plugin-pages,plugin-page-store,plugin-mode,plugin-mode-store,PluginChromeFrame,PluginChromeStatus,types,tokens}.ts(x)`、`editor-item-social-chrome.tsx`、`workspace-download-icon-button.ts`、`collab/CollabActionSlot.tsx`、`collab/CollabActionSlotInner.tsx`、`collab/CollabInviteButton.tsx`、`replay/work/GenerateReplayButton.tsx`、`plugin-theme.tsx`、`advanced-workbench-chrome.ts`。测试：global-row / page-row / save-menu / plugin-theme / plugin-mode / social-chrome 类。
- **W02**：`InlineAdvancedWorkbenchShell.tsx`、`AdvancedWorkbenchShell.tsx`、`use-inline-advanced-panels.tsx`、`inline-advanced-shell-parts.tsx`、`inline-advanced-shell-helpers.ts`、`inline-advanced-workbench-drop.ts`、`inline-editor-mine-panel.tsx`、`inline-editor-mine-activate.ts`、`InlineEditorMaterialPanel.tsx`、`workbench-material-provider.tsx`、`workbench-material-registry.ts`、`material-library-standalone.tsx`、`SplitWorkspace.tsx`、`plugin-chrome/EditBarDocumentSegment.tsx`、`use-inline-workbench-leave.ts`。`MyLibrary.tsx` 里「打开项 / 详情承载」那部分若要改：先在 `signals/W02-to-W05.md` 说明，由 W05 落（`MyLibrary.tsx` 归 W05）。
- **W03**：`SelectionToolbar.tsx`、`SelectionToolbarControl.tsx`、`SelectionToolbarButtonControl.tsx`、`SelectionToolbarNumberControl.tsx`、`SelectionToolbarSelectControl.tsx`、`selection-toolbar-*.ts(x)`、`useSelectionToolbarMeasure.ts`、`selection-context.ts`、`selection-context-types.ts`、`selection-inspector-*.ts(x)`、`SelectionInspectorPanel.tsx`、`selection-transactions.ts`、`selection-command-transaction.ts`、`EditorToolsIcon.tsx`、`AdvancedEditorIcon.tsx`、`FloatingContextToolbar.tsx`、`floating-toolbar-geometry.ts`、`edit-bar-*.ts(x)`、`EditBarDockControls.tsx`、`EditBarDockHost.tsx`、`EditBarAgentIcon.tsx`、`PluginChromeEditBarGestureLayer.tsx`、`plugin-chrome/{use-plugin-chrome-layout,use-plugin-chrome-panels,PluginChromeEditBarButton}.ts(x)`、`advanced-layout-context.tsx`、`SelectionAnimationGallery.tsx`。新建 `edit-bar-canon.ts`。测试：edit-bar / selection-toolbar / shared-edit-bar / gesture 类，以及新的「全编辑器不重复图标」判据。
- **W04**：`doc-editors/{doc-io,artifact-save-contract,editor-preview-raster}.ts`、`artifact-client.ts`、`advanced-session.ts`、`advanced-session-context.tsx`、`advanced-background-saver.ts`、`use-advanced-autosave.ts`、`use-advanced-recovery.ts`、`advanced-recovery-store.ts`、`advanced-draft-gates.ts`、`advanced-editor-adapter.ts`（只加持久化相关字段）。backend：`app/routers/artifacts_router.py` 的 `save_revision` / `fork_artifact` 与其调用的 commit / fork 服务、`app/editor_private_staging.py`，以及相应测试。清理脚本：`backend/scripts/editor_overhaul_cleanup_20261023.py`（只做 dry-run 与 retire；执行归父）。
- **W05**：`library-editor-category.ts`、`document-shelf-cover.tsx`、`document-cover-excerpt.ts`、`workspace-library-thumbnail.tsx`、`workspace-library-view.tsx`、`MyLibrary.tsx`、`WorkspaceLibrary.tsx`、`ArtifactLibrary.tsx`、`library-viewers.tsx`、`LibraryMediaPreview.tsx`、`library-data.ts`（只加读取摘要字段）、`advanced-features.ts`。backend：`app/typed_uploads.py`（上传时算摘要）及其测试。
- **W06**：`advanced-routes/PdfRoute.tsx`、`advanced-routes/mode-switch-gate.tsx`（PDF 是唯一用户）、`media-editors/{Pdf*,pdf-*,use-pdf-*}`、`media-editors/pdf-form/`、`doc-editors/doc-family-commands.ts` 里**仅** PDF 那一段——不许改那个文件：新建 `media-editors/pdf-command-surface.ts`，把 PdfRoute 切过去，旧函数留给父 agent 清理。
- **W07**：`advanced-routes/DeckRoute.tsx`、`doc-editors/{Deck*,deck-*,use-deck-*}`、`doc-editors/pptx-deck-import.ts`。
- **W08**：`advanced-routes/RichDocRoute.tsx`、`doc-editors/{RichDoc*,rich-doc-*,use-rich-doc-editor,docx-export}.ts(x)`、`doc-editors/richdoc-review/`、`doc-editors/office-*.ts`。
- **W09**：`advanced-routes/ImageRoute.tsx`、`image-editor/**`、`design-composite-commit.ts`。
- **W10**：`advanced-routes/GridRoute.tsx`、`doc-editors/{GridUniverStage,GridWorkbookExport}.tsx`、`doc-editors/grid-*.ts`、`doc-editors/grid-univer/**`、`doc-editors/grid-format/**`。
- **W11**：`advanced-routes/VideoTimelineRoute.tsx`、`video-editor/**`。
- **W12**：`advanced-routes/AudioRoute.tsx`、`media-editors/{Audio*,audio-*,use-audio-*}`。
- **W13**：`advanced-routes/Model3DRoute.tsx`、`media-editors/{Model3D*,model3d-*,use-model3d-*}`（含 `media-editors/Model3DRouteHistory.ts`）。
- **W14**：`advanced-routes/WebsiteLocalRoute.tsx`、`website-local/**`。
- **W15**：`advanced-routes/GameRoute.tsx`、`game-editor/**`。
- **W16**：`advanced-routes/VideoCanvasRoute.tsx`、`workflow-carrier/**`。
- **i18n**：每位 W 只改自己那一册 `src/i18n/ui/messages/editor-overhaul-copy-<id>.ts`；聚合册与 `index.ts`、`load.ts` 归父 agent，已登记好。
- **父 agent 独占**：`package.json`、锁文件、公共出口 `src/index.ts` / `src/shell/index.ts` / `plugin-chrome/index.ts`、`src/architecture/public-api.snapshot.json`、`src/i18n/ui/messages/` 下除各自那一册以外的全部文件、oceandino 仓（规范文档、规则包、代码地图、`tests/plugin-chrome-adoption.test.mjs`）。
- **别的工程正在改、本波谁都不许碰**：`src/client-ui/**`、`AppShell.tsx`（W07 宿主模式）；`calls/`、`messages/`、`leochat/`、`src/lib/im/**`（calls-v2）。oceanleo 仓里别人未提交的 `package.json`、`pnpm-lock.yaml`、`.github/workflows/oceanleo-cn-frontend.yml`、`backend/scripts/retire_operator_examples_20261021.py`。

## 4. 统一编辑栏词表（D9 的接口；W03 实现投影，W06–W16 按它出控件）

选区上下文多一个字段 `bar?: "text" | "image" | "shape" | "object"`（W03 在 `selection-context-types.ts` 加；在它落地之前，编辑器先只改 id，W03 也会按 `kind` 推断）。编辑器给出**规范 id**，图标、标签、顺序由外壳统一出（投影）。编辑器自己写的 icon/label 对规范 id 无效。

**文字组**（顺序即显示顺序）：
`font-family`（下拉，显示字体名）· `font-size`（数字 + 下拉）· `bold` · `italic` · `underline` · `strike` · `text-color`（色板）· `highlight`（色板，文字底色）· `align`（下拉 left/center/right/justify，图标随当前值）· `list`（下拉 none/bullet/ordered）· `line-height`（下拉/数字）· `link`
更多：`letter-spacing` · `case` · `vertical-text` · `indent-increase` · `indent-decrease` · `clear-format`

**图片组**：`replace`（打开素材库/上传）· `crop` · `flip-x` · `flip-y` · `rotate`（顺时针 90°）· `radius` · `border`（面板：颜色+粗细）· `opacity` · `adjust`（面板：亮度/对比/饱和/滤镜）
更多：`alt` · `image-fit` · `remove-background`（仅已有能力时）

**形状组**：`fill`（色板）· `stroke`（面板：颜色+粗细+虚线）· `radius` · `opacity`
更多：`shadow`

**对象组**（可移动对象都有，排在类型组之后）：`arrange`（下拉：置顶/上移/下移/置底）· `position`（面板：x/y/宽/高/角度）· `animation`（仅演示/视频）· `lock` · `duplicate` · `delete`

规则：
- 文本框这类「既是文字又有外框」的选区：文字组 → 形状组里适用的项 → 对象组。
- 编辑器特有控件（视频时间、表格行列、批注回复……）排在对象组之后或进「更多」，**不许借用规范 id 的图标**。
- 别名（W03 投影兼容旧 id，编辑器仍应改成规范 id）：`color→text-color`（文字上下文）、`linethrough→strike`、`font-panel→font-family`、`flip-horizontal→flip-x`、`flip-vertical→flip-y`、`rotate-right→rotate`、`layer-up/layer-down→arrange`。
- 做不到就不出这个 id；不出灰按钮。
- W03 写判据：任一编辑器、任一选区，可见按钮两两图标不同；规范 id 的顺序与本表一致。

## 5. 保存判据（D11；W04 修内核，各编辑器 owner 验自己那件，V02 独立判）

真浏览器、真登录（验收账号）、LeoDev 槽：
1. 打开一件**自己库里**的文件 → 改一处 → 顶栏到「已保存」→ 再改一处 → 到「已保存」→ 关闭 → 重新打开：**两处都在**；刷新整页后也都在。
2. 库卡片随之更新（标题、缩略图或文字摘要）。
3. 从**素材库/公共素材**打开 → 第一次改动只在我的库生成**一份**副本，编辑器和地址栏切到那份副本；之后的保存都进这一份，不再新增条目。
4. 断网（`context.setOffline(true)`）改动 → 显示「保存失败」并可重试；恢复网络、点重试后变成「已保存」。**任何时候不许在服务器没确认前显示「已保存」**。
5. 每次保存都要成为服务器上的新版本。数据库核对（只读、只查验收账号）：保存次数 = 新增 revision 数；不新增多余的库条目。

已知根因（父 agent [读码+实测]，W04 先复现再修）：
- 操作员 10-23 03:29Z 编辑 PDF `a3b9385f…`，3 次上传只有第 1 次成了 revision 3，后两次上传（隐藏 `-Edited` root）没有成为新版本。10-22 13:46–13:48Z 也是一样。
- `advanced-session.ts::advancedSavedItem` 只把 `id` 换成新 versionId，`revisionId` 仍是旧的；`doc-io.ts::savedIdentity` 读的就是 `item.revisionId`，于是第 2 次保存拿旧版本当 CAS 基线 → 冲突 → 失败。
- 同时每次保存都新建隐藏 root：操作员库里已有 1,431 个 `editorInternal` root。

## 6. 跨 owner 接口

- **保存状态永远显示**（W01）：有 `persistence` 的编辑器，顶栏的保存状态槽恒在，不再因 `recovery.ready === false` 隐藏（PDF 截图里云朵消失就是这个原因）。
- **保存基线**（W04）：保存成功后编辑器下一次保存的基线必须是新 revision。W04 修 `advancedSavedItem`，并在 doc-io 加「本标签页自己提交过的 head」兜底重试。编辑器 owner 若发现自己路由另有一条老基线的路径，就在自己文件里改。
- **摘要字段**（W04 + W05 + W08）：`meta.text_excerpt`（≤600 字，去 markdown 记号的前几行）。
  - W04 给 `SaveToLibraryInput.artifactRevision.metadata?: Record<string, unknown>` 透传到 commit 的 `content.metadata`。
  - W08 在文本类文档保存时填它，并且 txt/md 不再生成 PNG 预览。
  - W05 在上传时由后端填它；卡片优先读它，读不到再取源文本（≤64KB），全程不转圈，标题先出。
- **抽屉按钮**（W02 + W03）：W03 删 `EditorToolsTrigger`；W02 把 `adapter.drawers`（AI 除外）做成编辑栏空态里带文字的按钮（`EditBarDocumentSegment` 路径）。W01 同时删掉 `InlineAdvancedWorkbenchHeader` 里的工具面板注册（`toolsPanel` / `openTools` / `useAdvancedToolsLauncherRegistration`）。
- **主题**（W01）：`usePluginTheme(pluginId)` 的接口不变，`theme` 改为跟随站点外观；`PluginThemeToggle` 删除。编辑器 owner 只管自己那件在两档下都对。
- **素材插入**（W02 + 编辑器 owner）：外壳负责面板显示和点击/拖放的分发；能接什么、插在哪，由各编辑器的 material adapter 决定（在编辑器 owner 的路由文件里）。W06 的 PDF adapter 改成接图片/签名，作为图章插入。
- **库里打开编辑器的承载**（W02 ↔ W05）：`MyLibrary.tsx` 归 W05。W02 判定需要改承载时写 `signals/W02-to-W05.md`，W05 落实后回写。

## 7. 证据与节奏

- 每位 owner 维护 `signals/<ID>-state.md`（大步骤开始**之前**更新）和 `signals/<ID>-journal.md`（每条实测结论追加一行），**随做随提交**。
- 交付写 `verdicts/<ID>-delivery.md` 并提交；验收写 `verdicts/<ID>-verdict.md`。
- 转给别人的事写 `signals/<发起者>-to-<接收者>.md`（追加），提交。
- 截图、日志放 `evidence/<ID>/`（大文件不提交，只提交清单与少量关键 png，单个 ≤300KB）。

## 8. IO 预算自检

- 全树扫描指令：0 条。共同须知里只有单仓、单目录的限定搜索。
- 重活：类型检查 `npx tsc --noEmit -p .` 约 55 秒，走 `agent-io-guard.sh run-heavy`，单槽排队。每位 owner 只在里程碑时跑；全量测试只由父 agent 跑。
- 浏览器：每个场景跑完即关，不常驻；同一时刻一位 owner 最多一个 Chromium。

## 9. 派发词（父 agent 照抄）

> 你是 `<ID>`。先跑 `bash /opt/cursor-workspaces/oceandino/scripts/agent-bootstrap.sh`。完整读 `/root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul/_COMMON.md`、`00-dispatch.md`、`tasks/<ID>.md`，然后按它们干活。红线在 `_COMMON.md` §2，违反即本份活作废。立刻开工，不要静默等待。做完写 `verdicts/<ID>-delivery.md`（验收位写 `-verdict.md`）并限定路径提交，不 push；最后回一段简短总结和交付文件路径。
