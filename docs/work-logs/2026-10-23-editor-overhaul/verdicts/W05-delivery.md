# W05 交付 — 库页：类型名 = 素材类别（D5）、文档文字卡片（D8）、库卡片深色（D6 库部分）、上传时存摘要

## 用户看得到的变化

- **Type 菜单是素材类别**，没有「编辑 / editing」，没有「设计画布」：
  - zh：全部 视频 网站 演示文稿 文档 表格 图片 PDF 音频 视频画布 3D 模型 游戏
  - en：All Video Website Presentation Document Spreadsheet Image PDF Audio Video canvas 3D model Game（其它 15 语都有译文）
  - 卡片下方小字、详情角标、内嵌货架的分类下拉/胶囊用同一套名字。设计画布素材归「图片」（只改读与展示，存量行不改写）；旧 `?category=design`、`design_canvas`、`设计画布`、`canvas` 以及旧的编辑器名（「视频编辑」等）都落到对应类别。
- **文档类卡片（txt、md、docx 及所有「文档」类型）直接是文字卡片**：第一帧就是标题，开头几行随后出现；不转圈，不出「正在读取内容预览」，从不签名、不显示 preview/thumbnail 里的 PNG 整页图，也不走浏览器现生成缩略图。被编辑器保存过的文档同样如此。
  - 摘要优先读 `meta.text_excerpt`（有就不发任何请求）；没有就只读源文开头 64KB（流式，读够即断；大文件也能出摘要——旧实现超过 64KB 直接放弃）；docx 读 ≤16MB 的包取段落文字。PNG/ZIP/PDF/含 NUL 的字节不会被当文字解码；UTF-8 失败按 GB18030 读。
  - 读不到时标题照常，下面一行「暂无内容预览，打开查看素材」（读取期间这一块留空）。
- **深色**：文字卡片、库卡片全部用站点 token（`--card` / `--fg` / `--fg-2`），没有 `bg-white` / `text-stone-*`。实测 light #fff/#1c1917，dark #202020/#ececec；深色下 Type 下拉是深色。
- **上传时存摘要**（后端）：txt/md/docx 上传后，`artifact_revisions.metadata.text_excerpt` = 去 markdown 记号的前 8 行、≤600 字（docx ≤4MB 才读）。尽力而为，读失败不影响上传；改动前上传过的同一文件再传不会撞幂等冲突（自动回放旧请求）。

## 文件清单

oceanleo-ui
- 改：`src/shell/library-editor-category.ts`（类别表、design_canvas→image_editing 折叠、旧别名、`translateLibraryTypeLabel`）、`MyLibrary.tsx`、`WorkspaceLibrary.tsx`、`workspace-library-view.tsx`、`ArtifactLibrary.tsx`（`ARTIFACT_FILTERS` 用类型名、旧 `design` 筛选=图片）、`document-cover-excerpt.ts`（摘要规则、文字卡判定、源选择、二进制判别、解码）、`document-shelf-cover.tsx`、`workspace-library-thumbnail.tsx`、`src/i18n/ui/messages/editor-overhaul-copy-w05.ts`
- 测试 改：`tests/library-editor-category.test.mjs`、`tests/document-cover-runtime.test.mjs`、`tests/library-render-stability-1022.test.mjs`、`tests/library-document-open.test.mjs`；增：`tests/library-document-card-w05.test.mjs`
- 证据：`evidence/W05/scenarios/{library-cards,edit-then-card}.mjs`，截图见下
- 未改：`library-data.ts`（摘要不在投影里，见「转给别人的事」）、`advanced-features.ts`、`library-viewers.tsx`、`LibraryMediaPreview.tsx`

oceanleo（backend）
- 增：`backend/app/upload_text_excerpt.py`（规则与前端同一组向量）、`backend/tests/test_typed_upload_text_excerpt.py`
- 改：`backend/app/typed_uploads.py`（`register` 里有界回读 CAS 对象算摘要，写进 revision metadata；冲突回放）

## 提交

- oceanleo-ui：`8409d324`（D5）、`6b8e9618` / `2ceab0a2` / `489fefc1`（父 agent 两次中断时对 W05 盘上 D8 代码的抢救提交）、`39e1b95f`（D8 测试与文案收口）、`82fe295f`（信号与场景）、`313d4e9e`（浏览器证据）、`b2463fe8`（state/journal）
- oceanleo：`8191e59`（上传摘要）；`docker restart oceanleo-api` 一次（journal 有记），重启后 healthy。

## 验证（命令与结果）

focused（`agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<f>.test.mjs`）：
- library-editor-category 7/7、library-document-card-w05 4/4、document-cover-runtime 1/1、document-cover-excerpt 3/3、library-document-open 3/3、library-render-stability-1022 2/2、material-cover-rendering 12/12、media-aspect-stability 11/11、library-card-detail-action-parity 13/13、library-failure-surface 14/14、library-collection-chrome 1/1、library-stability 22/22、library-virtualization 4/4。
- cross-site-library 11/12、sidebar-v5-contract 4/5：失败的两条断言的是 `SplitWorkspace.tsx` 和 `ArtifactLibrary.tsx` 注释里的字串，**在 HEAD（W05 改动前）上同样不成立**，非本波引入。
- i18n 闸 `tests/i18n-tt-key-coverage.test.mjs`：W05 的文件 0 条缺口（另补了 MyLibrary 里存量缺译的「显示上次成功加载的作品；列表暂未刷新。」）；闸的其余红项属别的 owner 与基线簿记。
- backend：`cd backend && .venv/bin/python -m pytest -q tests/test_typed_upload_text_excerpt.py tests/test_typed_upload_closure.py tests/test_private_library_upload.py tests/test_database_upload_registration.py` → 45 passed（容器外 `python` 不存在，用 `.venv/bin/python`）。
- 类型检查 `npx tsc --noEmit -p .`（run-heavy）：只剩 3 条在 `src/shell/workflow-carrier/video-project-doc.ts`（W16 已知半成品），W05 文件 0 条。
- `oceanleo-dev-slots-fresh.sh`：1 slot，0 STALE。

浏览器（验收账号，LeoDev 槽，`bash harness/mint.sh | OUT_DIR=… THEME=light|dark node harness/run.mjs evidence/W05/scenarios/library-cards.mjs <upload|check> <zh|en>`）：
- 上传 `[W05] 卡片a.txt/.md/.docx` → 刷新库 ~6s 内三张都是文字卡片；采样 12 秒，0 帧出现转圈 / `<img>` / 「正在读取」，首帧 `data-cover-state=ready` 且标题在；最终 excerpt 来源 txt/md=text、docx=docx。
- Type 菜单 zh/en 逐项如上；light 与 dark 各一张。
- SQL（只读）：三份上传的当前 revision `metadata.text_excerpt` 均已写入。
- `edit-then-card.mjs`：在文档编辑器里给 `[W05] 卡片a.txt` 首行加字 → 顶栏 saved → 回库：仍是文字卡片，首行是新内容；revision 2 的 renditions 全是 text/plain，`text_excerpt` 已更新。
- 截图：`evidence/W05/light-zh-cards.png`、`dark-zh-cards.png`、`light-zh-type-menu.png`、`dark-zh-type-menu.png`、`light-en-type-menu.png`、`dark-en-type-menu.png`、`light-en-card-after-edit.png`。

## 删掉 / 改写的测试与原因

- `library-editor-category`「12 个编辑器族各选中自己」与「design/image 不同类」：设计画布并入图片（D5），改成 11 个类别、设计画布在图片下、`libraryEditorFeatureId` 仍返回真实能力；新增菜单顺序/无编辑字样、旧别名、语境翻译三条。
- `document-cover-runtime`：原断言读取中显示「正在读取内容预览」——D8 删除了这个占位；改为 pending 状态无文字、无转圈、标题首帧在；读源从 `fetchMediaBlob` 换成有界流式读，桩随之改为 `fetch`。
- `library-render-stability-1022`「主封面失败后文档兜底保持挂载」：原用例先挂 PNG 主封面——D8 要求文档永不显示 PNG；改成「文档卡片从不挂 PNG、不签名不生成、源文只读一次、结算后不重启读取」，原来的「只读一次 / 不回挂」保护保留。
- `library-document-open`：`data-document-cover` 的表达式多了 pending 态，字面断言随之更新。

## 转给别人的事

- `signals/W05-to-parent.md`：
  1. （已自愈）07:32Z 槽整站 Build Error 来自 `use-pdf-collab.ts` 的未提交改动；07:33Z owner 已修复。
  2. `meta.text_excerpt` 不在库列表投影里（SQL `typed_artifact_library_item` 只带 `editorInternal`；后端 `LibraryItem`、前端 normalizer 都丢弃它）。要省掉卡片那次读需 migration + 模型 + normalizer，步骤写在信号里；W05 不做生产库 migration。现在卡片靠有界读源文，功能不依赖它。
- `signals/W05-to-W08.md`：保存摘要请直接用 `textExcerptFromSource` / `clampExcerpt`，与上传、卡片同一规则（实测 W08 保存路径已写入 `text_excerpt`）。

## 请父 agent 代改的公共文件

- `src/shell/LibraryMasterDetail.tsx`（LibrarySubNav）：`tt(f.label)` → `translateLibraryTypeLabel(tt, f.label)`，否则那条老侧栏里「表格 / 游戏」在英文下仍是 Table / Games。
- `src/shell/collection-chrome.tsx`：筛选触发器与下拉写死 `bg-white` 等，深色下靠 globals.css 全局覆盖兜底（实测是深色）；若 V04 要求 token 化再改。
- 若采纳信号 §2：migration、`typed_artifact_models.LibraryItem`、`typed_artifact_service._project`、`artifact-contract.ts` normalizer；之后 `library-data.ts` 加一行把 `textExcerpt` 写进 `meta.text_excerpt`（归 W05，可代补）。

## 如实的剩余问题

- 验收账号里没有「当前 preview 是 PNG」的文档（W08 的保存已不再出 PNG），所以「编辑后 PNG 预览也不显示」只由单测证明，浏览器里证的是编辑保存后的真实路径。
- 「表格」「游戏」走语境 key（`素材类别：表格/游戏`）取译文；这是绕开平铺词典同形词的做法，中文站回显 key 时退回中文名。
- 站点 `--muted` 在深色卡片上的对比度约 3.96:1（库卡片下方小字沿用它）；文字卡片内部已全用 `--fg/--fg-2`（≥7:1）。这是 token 层面的事，留给 V04/父 agent 判断。
- 库里 PDF 卡片加载时仍有转圈（PDF 首页封面，不在 D8 范围）。
- typed 上传在卡片描述行显示「任务交付物」而非「用户上传」（`toEntry` 读的是 `meta.library_source`，typed 投影里没有）；存量行为，未改。
