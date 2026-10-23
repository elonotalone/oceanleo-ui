# W08 state（文档 RichDoc / Tiptap）

更新：2026-10-23 08:3xZ，R2 接班（第 2 轮）

## 已确认的事实

- [实测] 统一栏改写、docx 高亮/字号/字体、深色正文、text_excerpt 走 `artifactRevision.metadata`、保存失败原因不再吞、md/docx 写出模块预加载，均已在 main（0ec30af1 17787181 ec64925f eafced1a 998b856b）。
- [实测 浏览器 15:55 本地] docx `2e894b64…`：两次保存 → 已保存，关掉重开、整页刷新两处都在；断网 → error「网络不通」，恢复后重试 → saved。
- [实测 浏览器 15:50] md `c3e0c65b…`：1–3 步通过；断网重试失败（turndown chunk 断网时没加载）→ 998b856b 已预加载，**待复测**。
- [实测 浏览器 15:58] txt `54424e1a…`：save1 saved；save2 期间出现一次 409 并被踢回阅读视图（父进程重启/槽热更新时段），重开两处都在。**待复测**。
- [待核] 库卡片文字摘要、数据库 revision 计数、两档截图、按钮点测。

## 正在做

已交付：`verdicts/W08-delivery.md`（10:2xZ）。

## 复现命令

```bash
cd /root/projects/oceanleo-ui/docs/work-logs/2026-10-23-editor-overhaul
bash harness/mint.sh | OUT_DIR=/tmp/w08-r2-txt THEME=light node harness/run.mjs evidence/W08/scenarios/save-protocol.mjs 54424e1a-ac85-4ec0-82e5-1f85ea7c020f txt offline
```
