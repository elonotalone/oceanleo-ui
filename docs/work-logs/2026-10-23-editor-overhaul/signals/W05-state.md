# W05 state（接班文件）

## 已确认的事实
- [实测] bootstrap OK（2026-10-23）；oceanleo-ui 在 `main`，开工时工作树干净（HEAD 60b0d1dc）。暂无 `signals/*-to-W05.md`。
- [读码] Type 菜单 = `MyLibrary.tsx` 的 `LIBRARY_PAGE_TYPE_OPTIONS = LIBRARY_EDITOR_CATEGORIES`，用 `option.label`（编辑器名）→ 带「编辑」。筛选纯前端（`filterWorkspaceLibraryEntries` + `normalizeLibraryCategory`）。
- [读码] 矩阵顺序去掉 design_canvas 正好是规定顺序：视频、网站、演示文稿、文档、表格、图片、PDF、音频、视频画布、3D 模型、游戏。
- [读码] i18n 是「中文原文即 key」的平铺表，`EDITOR_OVERHAUL_MESSAGES` 最后合并（会全局覆盖）。「表格」en=Table（演示/图片编辑器的「表格」工具也用这条），「游戏」en=Games（被别册覆盖）。要得到 Spreadsheet / Game 不能改这两条 → 用带语境的 key（`素材类别：表格` / `素材类别：游戏`），zh 回显 key 时退回中文类别名。「视频画布」15 语缺译文。
- [读码] 库列表投影（SQL `typed_artifact_library_item`，0104）只带 `editorInternal`，**不带 revision metadata**；后端 `LibraryItem`（StrictModel）也没有摘要字段；前端 `normalizeArtifactProjection` 丢弃未知键。⇒ `meta.text_excerpt` 现在到不了库卡片，要 SQL migration（生产库）+ `_project` + 前端 normalizer，都不在 W05 名下 → 写信号给父 agent，不自己做 migration。
- [读码] 我的库上传走 `/v1/database/private-upload` → `typed_upload_service.register(... private_storage=True)` → `ensure_artifact`，请求摘要含 `content.metadata`；同 key 不同摘要 = `typed_artifact_idempotency_conflict`。⇒ 加 `text_excerpt` 后，改动前上传过的同一文件重传会 409，必须在 `register` 里冲突时退回不带摘要的请求。
- [读码] `typed_uploads.py` 拿不到字节（路由里有 `data`，但路由不归我）；`prepare_upload_blob` 已读两遍对象。方案：在 `register` 里经 `repository.create_storage_url` 有界回读（txt/md ≤64KB，docx ≤4MB），尽力而为，失败不影响上传。
- [读码] `useArtifactRendition(item, [])` 空数组会退回默认取景顺序，不是「不取」；文字卡片要传非 durable 的空 item 才完全不签名。
- [读码] `globals.css` 有 `html.dark .bg-white → --leo-d-card` 的全局覆盖；`ui.css` 是预编译的，只能用里面已有的工具类（用 `/tmp/w05-scripts/css-has.py` 核）。

## 已完成
- 步骤 1 D5：提交 8409d324。
- 步骤 2 D8 + 深色 token：`document-cover-excerpt.ts`（摘要规则/文字卡判定/源选择）、`document-shelf-cover.tsx`（标题首帧、无「正在读取」、meta 摘要不发请求、64KB 流式读开头、docx ≤16MB、token 配色）、`workspace-library-thumbnail.tsx`（文档项不签名不生成不挂 PNG）；测试改 3 份 + 新增 `tests/library-document-card-w05.test.mjs`；父 agent 抢救提交 6b8e9618 / 2ceab0a2 / 489fefc1。

## 正在做
- 步骤 3：backend `typed_uploads.py` 上传摘要 + pytest（向量与前端 `tests/library-document-card-w05.test.mjs` 相同）+ restart。

## 下一步
- 步骤 4：浏览器验收（harness）+ 截图。
- 步骤 5：信号（父：投影带 textExcerpt；W08：复用 textExcerptFromSource）+ 交付。

## 复现命令
- focused test：`cd /root/projects/oceanleo-ui && bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs --test tests/<file>.test.mjs`
