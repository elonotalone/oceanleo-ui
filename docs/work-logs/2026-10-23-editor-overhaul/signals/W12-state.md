# W12 接班状态（音频）

更新：2026-10-23 06:00Z（恢复后）

## 已确认的事实
- [读码] 控件在 `src/shell/media-editors/AudioContextToolbar.tsx`：crop、delete、fade-duration、fade-in、fade-out、gain、apply-gain、effect-speed、eq-low/mid/high、apply-effects；除 crop/delete 外图标全是 `effects`（重复）。crop 借用了图片栏的 `crop` 图标。
- [读码] 路由 `src/shell/advanced-routes/AudioRoute.tsx`：adapter 带 `toolbox`（音轨工具）、`contextToolbar`、`persistence`、`viewport`、`directDownload`、`actions`（mp3/m4a 下载）。
- [读码] 文案册 `src/i18n/ui/messages/editor-overhaul-copy-w12.ts` 目前为空。

- [读码] W03 投影（edit-bar-canon*）会滤掉 disabled 控件、把撞规范图标/重复图标的特有控件改成文字。已写 `signals/W12-to-W03.md` 要 6 个音频字形。
- [实测] 上传 `[W12] sample.mp3` → artifact `ea2e3d75-8caf-445a-aa4e-2e3c71cc1008`（验收账号）。`/library?item=` 只开预览，进编辑器要点卡片。
- [实测] 05:09–05:25Z 槽/网关超时（父 agent 已修代理池），那段浏览器失败不算。

## 正在做
- 改代码：AudioContextToolbar（规范 id、bar=object、分面板）、深浅两档（波形色板按主题、标尺、面板 token）。

## 下一步
- 记录现状：浏览器里上传 `[W12] sample.mp3`，深浅两档截图，跑一遍保存协议现状。
- 改控件 id/图标、主题 token、保存路径。

## 复现命令
- 在 `/root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul`：
  `bash harness/mint.sh | OUT_DIR=/tmp/w12-x THEME=light node harness/run.mjs evidence/W12/scenarios/<场景>.mjs`
