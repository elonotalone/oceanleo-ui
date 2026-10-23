# W14 state（接班文件）

更新于 2026-10-23（Codex 接班）。

## Codex 当前断点

- [实测] 交付代码 `c1714249`，专项 10/10。最终浅色全协议浏览器 PASS（90s，4 次编辑对应 4 次 revision 200）；深色重开/模式切换/断网重试 PASS（35.6s）。详细证据与未覆盖项见 `verdicts/CODEX-W14.md`。
- [实测] 父 agent 修共享会话二次 CAS 409 后，网站换图保存不再停在 saving。保留原依赖闭包，替换图进私有闭包。
- [待核] 公共模板 fork-once、逐个对象/link/alt 按钮、新素材库插入与 strict 格式浏览器验收留给父集成验收；未伪报全部 D11/全按钮通过。

- 上述接班时缺陷已处理；后文 R2 状态为历史记录。

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

- [读码] R2 接班：上一任只提交了 state / W14-to-W04 / probe 场景，产品代码无改动；无 journal。W04 已回复：闭包继承（oceanleo 473f3d1）+ `stageArtifactBlob` / `artifactRevision.sourceDependencies`（1503b59b）。

## 正在做

- R2：读 website-local/** 与 WebsiteLocalRoute，开始步骤 2–4。

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
