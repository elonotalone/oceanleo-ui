# W12 接班状态（音频）

更新：2026-10-23（开工）

## 已确认的事实
- [读码] 控件在 `src/shell/media-editors/AudioContextToolbar.tsx`：crop、delete、fade-duration、fade-in、fade-out、gain、apply-gain、effect-speed、eq-low/mid/high、apply-effects；除 crop/delete 外图标全是 `effects`（重复）。crop 借用了图片栏的 `crop` 图标。
- [读码] 路由 `src/shell/advanced-routes/AudioRoute.tsx`：adapter 带 `toolbox`（音轨工具）、`contextToolbar`、`persistence`、`viewport`、`directDownload`、`actions`（mp3/m4a 下载）。
- [读码] 文案册 `src/i18n/ui/messages/editor-overhaul-copy-w12.ts` 目前为空。

## 正在做
- 通读音频编辑器全部文件（AudioWorkbench / AudioWorkbenchView / use-audio-* / audio-*），以及外壳 SelectionToolbar 的图标/规范约定。

## 下一步
- 记录现状：浏览器里上传 `[W12] sample.mp3`，深浅两档截图，跑一遍保存协议现状。
- 改控件 id/图标、主题 token、保存路径。

## 复现命令
- 在 `/root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul`：
  `bash harness/mint.sh | OUT_DIR=/tmp/w12-x THEME=light node harness/run.mjs evidence/W12/scenarios/<场景>.mjs`
