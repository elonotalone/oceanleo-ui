# W13 state (接班文件)

更新于 2026-10-23（开工）。

## 已确认的事实

- [实测] bootstrap 通过（main-only OK）。
- [读码] 我独占：`advanced-routes/Model3DRoute.tsx`（565 行）、`media-editors/{Model3D*,model3d-*,use-model3d-*}`（含 `Model3DRouteHistory.ts`）、文案册 `src/i18n/ui/messages/editor-overhaul-copy-w13.ts`（目前空）。
- [读码] 编辑栏控件在 `media-editors/Model3DContextToolbar.tsx`（597 行，贴着 600 行闸）；保存走 `use-model3d-save.ts`。

## 正在做

- 读码：3D 路由、编辑栏、保存、主题（默认深色从哪来）。

## 下一步

- 写浏览器复现场景 `evidence/W13/scenarios/`：上传 `[W13] sample.glb`，打开，截两档，跑一遍保存协议记录现状。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w13-x THEME=light node harness/run.mjs evidence/W13/scenarios/<场景>.mjs
```
