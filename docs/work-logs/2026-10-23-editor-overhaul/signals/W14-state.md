# W14 state（接班文件）

更新于 2026-10-23 05:40Z。

## 已确认的事实

- [实测] bootstrap 通过；oceanleo-ui 在 `main`。暂无 `signals/*-to-W14.md`。
- [读码] 我独占：`src/shell/advanced-routes/WebsiteLocalRoute.tsx`、`src/shell/website-local/**`，文案册 `src/i18n/ui/messages/editor-overhaul-copy-w14.ts`。
- [读码] website-source@1 schema `additionalProperties:false` 逐层成立（前端 `website-source-schema.ts` 与规格 §3）。区块只有 heading/subheading/body/decorative/background/items[]/actions[]；**没有任何逐元素的字号、颜色、对齐、粗体字段**。`body` 与 `items[].text` 允许「受限 Markdown」。字体/文字色/圆角只在 `theme`（全站）。
- [读码] Puck 0.23：`data` 只在挂载时读一次（appStore 只建一次），外部改动必须 `dispatch({type:"setData"})` 或重挂载；`overrides.puck` 包住两张脸，可挂桥接组件。
- [读码] 网站 flush 只返回 `{ok:true,item}`（`meta.websiteSource` 内联），外壳 `recordSavedItem` 只写工作区会话快照，**不提交 artifact 版本**。
- [实测 SQL] 全库 453 个网站后续版本 `metadata.wire_schema` 全为空、依赖都不止入口：浏览器网站编辑器从未经 `createArtifactRevision` 提交过版本。
- [读码] 后端 `typed_artifact_wire.adapt_deployed_revision` 给网站建的 `source_manifest` 只含入口 JSON（不带父版本的 images/*.webp 等依赖）→ 一旦经它提交，图片脱离闭包。属 W04（save_revision 调用链）。
- [读码] 后端有 `GET /v1/artifacts/{id}/revisions/{rev}/source-dependencies/{path}` 签发依赖文件地址；前端没有客户端。
- [读码] 编辑器预览把图片画成「图片 cover」文字；区块用宿主 `--accent/--surface` 与宿主前景色，深色站点下网站预览会跟着变深（违反 D6）。

## 正在做

- 步骤 1：浏览器复现现状（打开平台网站模板 `6b16c807-…`，点文字/图片，看编辑栏、深浅色、保存）。

## 下一步

- 写 `signals/W14-to-W04.md`（网站提交丢依赖闭包）。
- 步骤 2：预览保真（网站自己的主题色、真图片）+ 点选映射（字段级）+ Puck 桥接。
- 步骤 3：contextToolbar（规范 id）+ 命令写回 props。
- 步骤 4：保存真提交（fork 一次 + CAS 版本）+ 封面 PNG。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w14-x THEME=light node harness/run.mjs evidence/W14/scenarios/<场景>.mjs
```
