# W16 state（接班文件）

更新于 2026-10-23（开工后读码阶段）。

## 已确认的事实

- [实测] bootstrap OK（main-only）。暂无 `signals/*-to-W16.md`。
- [读码] 我独占：`src/shell/advanced-routes/VideoCanvasRoute.tsx`、`src/shell/workflow-carrier/**`、`src/i18n/ui/messages/editor-overhaul-copy-w16.ts`。
- [实测 SQL] 库里在用的 workflow 条目 96 个，`source_format` 全是 `oceanleo.video.project.v2`（另 2 个 `url`）。公共模板 41 个（platform 所有）：节点 kind 只有 `prompt/generate/timeline/delivery`，0 个 asset，1 个内部版本；边只有 `edgeId/sourceNodeId/targetNodeId`。验收账号名下还没有视频画布。
- [读码] `workflow-graph-source.ts::nativeVideoProjectGraph` 只认 12 种 v2 kind，`prompt`/`generate` 直接抛错 → 打开任何公共模板都会是「源读取失败」面板。[待核：浏览器]
- [读码] 即便投影成功，v2 投影是只读（`readOnlyNativeV2`）→ 不能拖、不能连线、「加节点」禁用、dirty 恒 false。
- [读码] `video-canvas-leave.ts::flushVideoCanvasGraph` 对 durable 条目一律返回失败（10-22 防假回执的修复，不许改回去）→ 库里条目永远存不上。真保存要走 typed revision（CAS + fork）。
- [读码] 节点样式写死 `#fff` / `#cbd5e1`，xyflow 默认浅色样式 → 深色下是浅色岛；没有小地图；顶部「加节点」是裸按钮。
- [读码] 视频站旧编辑器（`/root/projects/video/packages/gallery-editor/src/project-model.ts`）把 `prompt→script`、`generate→video` 归一；每次改动 `advanceProject` 新建内部版本。

## 正在做

- 读码：外壳接口（选区上下文 / 编辑栏投影 / drawers / material adapter / 主题 / 保存内核 fork 路径）。

## 下一步

- R0 浏览器基线：验收账号从公共模板打开视频画布，记录现状（两档截图 + 保存）。
- 然后改：v2 原生可编辑模型 + 真保存 + 统一栏 + 两档主题。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w16-x THEME=light node harness/run.mjs evidence/W16/scenarios/<场景>.mjs
supabase-sql oceanleo "select v.source_format, count(*) from artifact_roots r join artifact_revisions v on v.id=r.current_revision_id where v.artifact_type='workflow' and r.retired_at is null group by 1"
```
