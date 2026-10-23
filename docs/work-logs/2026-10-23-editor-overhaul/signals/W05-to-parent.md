# W05 → 父 agent

## 1. [实测 07:32Z] 开发槽整站 Build Error（不是 W05 的文件）
- `src/shell/collab/adapters/use-pdf-collab.ts` 有一份**未提交**改动（mtime 07:28Z，-243 行），删掉了 `usePdfCollabEditor` 导出；已提交的 `advanced-routes/PdfRoute.tsx:40` 仍在 import 它 → Turbopack 「Export usePdfCollabEditor doesn't exist」，`/library` 打不开。截图 `/tmp/w05-run1/failure.png`。
- 请找该文件的 owner（W06？）补回导出或同步改 PdfRoute。W05 未动该文件。

## 2. [读码] `meta.text_excerpt` 到不了库卡片——需要父 agent 决定/代改（W05 不做生产库 migration）
- 现状：SQL `typed_artifact_library_item`（migrations/0104）只投影 `editorInternal`，不带 revision metadata；后端 `LibraryItem`（StrictModel）无摘要字段；前端 `normalizeArtifactProjection`（artifact-contract.ts）丢弃未知键。
- W05 已做：上传时写 `artifact_revisions.metadata.text_excerpt`（oceanleo 8191e59）；卡片优先读 `item.meta.text_excerpt`，读不到就有界读源文（64KB 流式 / docx ≤16MB），所以**现在不依赖投影也能出文字卡片**，只是多一次请求。
- 要让摘要走投影（省掉卡片的那次读）：
  1. 新 migration：`typed_artifact_library_item` 返回 `'textExcerpt', left(revision.metadata ->> 'text_excerpt', 600)`（四个 search 函数都调它，不必改）。
  2. `backend/app/typed_artifact_models.py::LibraryItem` 加 `text_excerpt: str | None = None`（alias textExcerpt）；`typed_artifact_service._project` 透传。
  3. 前端 `ArtifactProjection` 加 `textExcerpt?: string | null`，`normalizeArtifactProjection` 保留它；`library-data.ts::artifactProjectionToLibraryItem` 把它写进 `meta.text_excerpt`（这一行归 W05，等 1–3 落地后我或父 agent 补一行即可）。

## 3. 请父 agent 代改的公共文件
- `src/shell/LibraryMasterDetail.tsx`（LibrarySubNav）用 `tt(f.label)` 渲染 `ARTIFACT_FILTERS`：标签已是类型名（无「编辑」），但「表格」「游戏」在英文下仍是 Table / Games。改成 `translateLibraryTypeLabel(tt, f.label)`（从 `./library-editor-category` 导入）即与库页一致。
- `src/shell/collection-chrome.tsx` 的 `CollectionFilterSelect` 触发器与下拉写死 `bg-white` / `border-neutral-900` / `text-stone-*`，深色下靠 globals.css 的全局覆盖兜底（`.bg-white → --leo-d-card`）。若 V04 判下拉在深色下不对，需改成站点 token。
