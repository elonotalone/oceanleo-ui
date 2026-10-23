# W16 state（接班文件）

更新于 2026-10-23（开工后读码阶段）。

## Codex 接班

- [实测] 已交付：`verdicts/CODEX-W16.md`。代码 `dddc5330` / `601e2cfd` / `87b01644`。专项 12/12、workflow E9 1/1。
- [实测] PNG / MP4 / MP3 的完整素材面板→私有暂存→节点资产→真版本→Undo/Redo→重开媒体均通过；深色公共 fork 两次保存/刷新/离线恢复通过；最终节点和连线全按钮 61s 通过。
- [实测 SQL] 仅 1 个 active workflow root，闭包为入口+3媒体共4项、完整性 ready，每个近期版本均有1张preview。父 agent 负责全量 tsc/suite/slot freshness。
- 后文是历史断点；接班列出的 W16 缺陷已修，具体证据与限制见交付。

- [实测] 当前 v2 专项 9/9、durable-save 1/1 通过；E9 workflow 测试仍引用已删除的 embedded 变量，准备改成 sourceReady/nativeV2ReadOnlyProjection 的实际安全边界。
- [读码] 当前素材插入只记 materialRef，不把资产字节和摘要放进 assets；缩略图仅在会话中。正在补完整 private staging → assets → 闭包 → 重开缩略图链路。
- [实测] 保留并运行旧 untracked s7-material，素材面板只出现当前 workflow 卡片、无可拖入素材，父 agent 正查共享承载。运行期间网关重启，完成后再核。
- 下一步：冻结 owner 源码后跑两次保存/重开/刷新/断网重试与深浅两档，交付 CODEX-W16.md。

## 已确认的事实

- [实测] bootstrap OK（main-only）。暂无 `signals/*-to-W16.md`。
- [读码] 我独占：`src/shell/advanced-routes/VideoCanvasRoute.tsx`、`src/shell/workflow-carrier/**`、`src/i18n/ui/messages/editor-overhaul-copy-w16.ts`。
- [实测 SQL] 库里在用的 workflow 条目 96 个，`source_format` 全是 `oceanleo.video.project.v2`（另 2 个 `url`）。公共模板 41 个（platform 所有）：节点 kind 只有 `prompt/generate/timeline/delivery`，0 个 asset，1 个内部版本；边只有 `edgeId/sourceNodeId/targetNodeId`。验收账号名下还没有视频画布。
- [读码] `workflow-graph-source.ts::nativeVideoProjectGraph` 只认 12 种 v2 kind，`prompt`/`generate` 直接抛错 → 打开任何公共模板都会是「源读取失败」面板。[待核：浏览器]
- [读码] 即便投影成功，v2 投影是只读（`readOnlyNativeV2`）→ 不能拖、不能连线、「加节点」禁用、dirty 恒 false。
- [读码] `video-canvas-leave.ts::flushVideoCanvasGraph` 对 durable 条目一律返回失败（10-22 防假回执的修复，不许改回去）→ 库里条目永远存不上。真保存要走 typed revision（CAS + fork）。
- [读码] 节点样式写死 `#fff` / `#cbd5e1`，xyflow 默认浅色样式 → 深色下是浅色岛；没有小地图；顶部「加节点」是裸按钮。
- [读码] 视频站旧编辑器（`/root/projects/video/packages/gallery-editor/src/project-model.ts`）把 `prompt→script`、`generate→video` 归一；每次改动 `advanceProject` 新建内部版本。

## R2 接班（08:30Z 后）

- [实测 tsc] 半成品 `video-project-doc.ts` 3 个类型错误（`addVideoDocNode` 的 Omit 丢键）已修。
- [读码] 保存走共享内核 `saveFileToLibrary`：`file`=v2 JSON、`sourceFormat=oceanleo.video.project.v2`、`artifactRevision.artifactType=workflow`；workflow 契约只要 `full`（=source）或 `preview` 任一，preview PNG 选配。后端只校 v2 结构 + assets，节点字段自由。
- [读码] 素材资产 `url` 可以是私有暂存定位 `project-assets:u/…`（`stageArtifactBlob`）。

## 正在做

- 新建 v2 编辑面：`VideoProjectStage.tsx`（路由按 source_format 分流）+ `VideoProjectCanvas.tsx`（主题化 xyflow、自定义节点、小地图）+ 选区栏 + 「加节点」抽屉 + 真保存 + 封面 PNG。

## 下一步

- focused tests、i18n、浏览器两档截图 + §5 保存协议，交付。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w16-x THEME=light node harness/run.mjs evidence/W16/scenarios/<场景>.mjs
supabase-sql oceanleo "select v.source_format, count(*) from artifact_roots r join artifact_revisions v on v.id=r.current_revision_id where v.artifact_type='workflow' and r.retired_at is null group by 1"
```
